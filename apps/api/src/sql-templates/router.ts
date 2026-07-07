import { globalClassifier } from "./classifier.js";
import { globalSlotResolver } from "./slot-resolver.js";
import { templates } from "./templates.js";
import { Tier0Result } from "./types.js";
import { executeQuery } from "../services/queryExecutionService.js";
import { logger } from "../lib/logger.js";

import { DatasetMetadata } from "../services/metadataService.js";

// Register all templates on startup
templates.forEach(t => globalClassifier.register(t));

export async function routeTier0Query(
    rawQuestion: string, 
    datasetId: string,
    metadata: DatasetMetadata,
    tempPath: string
): Promise<Tier0Result> {
    const startTime = performance.now();
    
    globalSlotResolver.updateMetadata(metadata);
    
    try {
        const classification = globalClassifier.classify(rawQuestion);

        if (!classification.matched || !classification.template_id) {
            return { handled: false, reason: classification.reason };
        }

        const template = templates.find(t => t.id === classification.template_id);
        if (!template) {
            return { handled: false, reason: "Template definition missing." };
        }

        const { resolvedSlots, lowestConfidence, failedSlot } = globalSlotResolver.resolveAll(classification.slots || {});

        if (!resolvedSlots || lowestConfidence < 0.85) {
            logger.info({ rawQuestion, failedSlot, lowestConfidence }, "Tier 0 Slot resolution failed. Falling back to LLM.");
            return { handled: false, reason: `Slot resolution failed for ${failedSlot} (confidence: ${lowestConfidence})` };
        }

        // We have a strict match and all slots resolved perfectly
        const sqlParams = template.generateSql(resolvedSlots);
        
        // Execute against DuckDB
        // executeQuery takes (datasetId, query, params)
        // Wait, executeQuery is typically `await executeQuery(datasetId, sql)`
        // Does our duckdbService support parameterized queries? Let's assume yes, or we can inline them safely since we validated the slots heavily.
        // For the sake of safety, let's assume `executeQuery` takes parameters, or we use a helper.
        // Actually, TBO-AI's duckdbService executeQuery(sql) might not take params.
        // Let's manually inject the params safely since we know they are resolved and safe.
        let finalSql = sqlParams.query;
        sqlParams.params.forEach(param => {
            const safeParam = typeof param === "string" ? `'${param.replace(/'/g, "''")}'` : param;
            finalSql = finalSql.replace("?", String(safeParam));
        });

        const rows = await executeQuery(finalSql, tempPath);
        
        const answer = template.formatAnswer(rows as any[], resolvedSlots);

        const latency = performance.now() - startTime;
        
        logger.info({ 
            source: "TIER_0", 
            template_id: template.id, 
            latency_ms: latency, 
            confidence: lowestConfidence 
        }, "Tier 0 Match Successful");

        return {
            handled: true,
            response: answer,
            template_id: template.id,
            confidence: lowestConfidence,
            latency_ms: latency
        };

    } catch (e: any) {
        logger.error({ err: e, rawQuestion }, "Tier 0 execution failed, falling back to LLM.");
        return { handled: false, reason: "Execution error: " + e.message };
    }
}
