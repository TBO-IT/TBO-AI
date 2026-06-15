import { Router } from "express";
import fs from "fs/promises";
import { getDataset } from "../services/datasetService.js";
import { downloadDataset } from "../services/storageService.js";
import { getDatasetSchema } from "../services/schemaService.js";
import { buildSemanticLayer, EnrichedSemanticLayer } from "../ai/semanticLayer.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { generateSql, generateNarrative } from "../services/llmservice.js";
import { validateSqlSyntax } from "../ai/sqlValidator.js";
import { executeQuery } from "../services/queryExecutionService.js";

async function safeUnlink(tempPath: string) {
    for (let i = 0; i < 50; i++) {
        try {
            await fs.unlink(tempPath);
            break;
        } catch (err: any) {
            if (err.code === "EBUSY" && i < 49) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            } else {
                throw err;
            }
        }
    }
}

const router = Router();

router.post("/", async (req, res) => {
    const { datasetId, message } = req.body;

    if (!datasetId || !message) {
        return res.status(400).json({
            error: "Both datasetId and message are required."
        });
    }

    const dataset = await getDataset(datasetId);

    if (!dataset || !dataset.storagePath) {
        return res.status(404).json({
            error: "Dataset not found or does not have a storage path."
        });
    }

    let tempPath: string | null = null;
    let semanticLayer: EnrichedSemanticLayer | null = null;

    try {
        // 1. Download the dataset locally
        tempPath = await downloadDataset(dataset.storagePath);

        // 2. Discover physical schema using DuckDB
        const schema = await getDatasetSchema(tempPath);

        // 3. Build Semantic Layer
        semanticLayer = buildSemanticLayer(schema);

        // ── QUESTION INTELLIGENCE GATE & PROMPT BUILDING ──────────────────────
        
        // 4. Build token-efficient prompt. This internally runs the 
        //    Question Analyzer and Validator, throwing QuestionValidationError if invalid.
        const { prompt, parsedQuestion } = buildPrompt(message, semanticLayer);

        console.log(`[chat] Parsed question:`, {
            intent:    parsedQuestion.intent,
            metrics:   parsedQuestion.metrics,
            dimensions: parsedQuestion.dimensions,
            filters:   parsedQuestion.filters,
            timeRefs:  parsedQuestion.timeReferences
        });

        // ── CLAUDE PIPELINE ───────────────────────────────────────────────────

        // 5. Generate SQL via Claude
        const generated = await generateSql(prompt);

        // 6. Validate SQL safety + DuckDB EXPLAIN syntax check
        const sqlValidation = await validateSqlSyntax(generated.sql, tempPath);
        if (!sqlValidation.valid) {
            return res.status(422).json({
                error: "Generated SQL failed validation.",
                detail: sqlValidation.error,
                sql: generated.sql,
                explanation: generated.explanation
            });
        }

        // 7. Execute query against DuckDB
        const queryResults = await executeQuery(generated.sql, tempPath);

        // 8. Generate executive narrative
        const narrative = await generateNarrative(message, generated.sql, queryResults);

        // 9. Return structured response
        return res.json({
            answer: narrative,
            sql: generated.sql,
            explanation: generated.explanation,
            results: queryResults,
            datasetType: semanticLayer.datasetType,
            parsedQuestion: {
                intent: parsedQuestion.intent,
                metrics: parsedQuestion.metrics,
                dimensions: parsedQuestion.dimensions,
                timeReferences: parsedQuestion.timeReferences
            }
        });

    } catch (error) {
        if (error instanceof QuestionValidationError) {
            console.log(`[chat] Question rejected:`, error.validationResult.errors);
            return res.status(422).json({
                valid: false,
                errors: error.validationResult.errors,
                suggestions: error.validationResult.suggestions,
                datasetType: semanticLayer?.datasetType
            });
        }
        console.error("Error in chat execution pipeline:", error);
        return res.status(500).json({
            error: "An error occurred while processing your query.",
            detail: error instanceof Error ? error.message : String(error)
        });
    } finally {
        if (tempPath) {
            try {
                await safeUnlink(tempPath);
            } catch (unlinkError) {
                console.error("Failed to delete temp file:", tempPath, unlinkError);
            }
        }
    }
});

export default router;
