import { Router } from "express";
import fs from "fs/promises";
import { getDataset } from "../services/datasetService.js";
import { downloadDataset } from "../services/storageService.js";
import { getDatasetSchema } from "../services/schemaService.js";
import { buildSemanticLayer } from "../ai/semanticLayer.js";
import { buildPrompt } from "../ai/promptBuilder.js";
import { generateSql, generateNarrative } from "../services/llmservice.js";
import { validateSqlSyntax } from "../ai/sqlValidator.js";
import { executeSql, executeQuery } from "../services/queryExecutionService.js";

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

    try {
        // 1. Download the dataset locally
        tempPath = await downloadDataset(dataset.storagePath);

        // 2. Discover physical schema using DuckDB
        const schema = await getDatasetSchema(tempPath);

        // 3. Build Semantic Layer context
        const semanticLayer = buildSemanticLayer(schema);

        // 4. Formulate the prompt for Claude
        const prompt = buildPrompt(message, semanticLayer);

        // 5. Generate SQL translation using Claude
        const generated = await generateSql(prompt);

        // 6. Validate safety and schema correctness using EXPLAIN
        const validation = await validateSqlSyntax(generated.sql, tempPath);
        if (!validation.valid) {
            return res.status(422).json({
                error: "Generated SQL failed validation.",
                detail: validation.error,
                sql: generated.sql,
                explanation: generated.explanation
            });
        }

        // 7. Execute query against DuckDB (replaces data_table placeholder internally)
        const queryResults = await executeQuery(generated.sql, tempPath);

        // 8. Generate principal insight narrative
        const narrative = await generateNarrative(message, generated.sql, queryResults);

        // 9. Return structured results
        return res.json({
            answer: narrative,
            sql: generated.sql,
            explanation: generated.explanation,
            results: queryResults,
            datasetType: semanticLayer.datasetType
        });

    } catch (error) {
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
