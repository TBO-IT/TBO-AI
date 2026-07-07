import { globalClassifier } from "./classifier.js";
import { globalSlotResolver } from "./slot-resolver.js";
import { templates } from "./templates.js";
import { Tier0Result } from "./types.js";
import { executeQuery } from "../services/queryExecutionService.js";
import { logger } from "../lib/logger.js";
import { DatasetMetadata } from "../services/metadataService.js";
import { sessionManager } from "./session.js";

// Register all templates on startup
templates.forEach(t => globalClassifier.register(t));

export async function routeTier0Query(
    rawQuestion: string, 
    datasetId: string,
    metadata: DatasetMetadata,
    tempPath: string,
    userId: string
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

        let resolvedSlots: any = {};
        let lowestConfidence = 1.0;
        let failedSlot: string | undefined;

        if (classification.template_id === "T00_UNIVERSAL") {
            const rawFiltersText = classification.slots?.u_raw || "";
            const { filters, confidence: fConf } = globalSlotResolver.extractFiltersFromRaw(rawFiltersText);
            
            // Get session context
            const sessionContext = sessionManager.getContext(userId, datasetId);
            
            let metric = classification.slots?.u_metric;
            let groupBy = classification.slots?.u_groupBy ? classification.slots.u_groupBy.split(",").filter(Boolean) : [];
            let threshold = classification.slots?.u_threshold;
            
            // Context merging
            if (!metric) {
                metric = sessionContext?.metric || "win_rate";
            }
            
            if (groupBy.length === 0 && sessionContext?.groupBy && sessionContext.groupBy.length > 0 && filters.length > 0) {
                // E.g., "what about Phuket?" (where Phuket is a filter, keep the old groupBy)
                groupBy = sessionContext.groupBy;
            }

            // Merge session filters if a new filter doesn't override it
            const finalFilters = [...filters];
            if (sessionContext?.filters) {
                for (const oldF of sessionContext.filters) {
                    if (!finalFilters.some(nf => nf.dimension === oldF.dimension)) {
                        finalFilters.push(oldF);
                    }
                }
            }

            resolvedSlots = {
                metric,
                filters: finalFilters,
                groupBy,
                threshold
            };
            lowestConfidence = fConf;
            
            // Update session
            sessionManager.setContext(userId, datasetId, {
                metric,
                filters: finalFilters,
                groupBy,
                lastQueryType: "T00_UNIVERSAL"
            });
            
        } else {
            const resolution = globalSlotResolver.resolveAll(classification.slots || {});
            resolvedSlots = resolution.resolvedSlots;
            lowestConfidence = resolution.lowestConfidence;
            failedSlot = resolution.failedSlot;
        }

        if (!resolvedSlots || lowestConfidence < 0.85) {
            logger.info({ rawQuestion, failedSlot, lowestConfidence }, "Tier 0 Slot resolution failed. Falling back to LLM.");
            return { handled: false, reason: `Slot resolution failed for ${failedSlot} (confidence: ${lowestConfidence})` };
        }

        const sqlParams = template.generateSql(resolvedSlots);
        
        let finalSql = sqlParams.query;
        sqlParams.params.forEach(param => {
            const safeParam = typeof param === "string" ? `'${param.replace(/'/g, "''")}'` : param;
            finalSql = finalSql.replace("?", String(safeParam));
        });

        const rows = await executeQuery(finalSql, tempPath);
        
        if (classification.template_id !== "T00_UNIVERSAL") {
            // Only update session for specific drill-down capable templates if needed
            // For now, let's store the resolved slots
            sessionManager.setContext(userId, datasetId, {
                lastQueryType: classification.template_id,
                lastResolvedSlots: resolvedSlots
            });
        }

        const formatResult = template.formatAnswer(rows as any[], resolvedSlots);
        
        let answer = "";
        let chart = undefined;
        let table = undefined;

        if (typeof formatResult === "string") {
            answer = formatResult;
        } else {
            answer = formatResult.answer;
            chart = formatResult.chart;
            table = formatResult.table;
        }

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
            chart: chart,
            table: table,
            results: rows,
            template_id: template.id,
            confidence: lowestConfidence,
            latency_ms: latency
        };

    } catch (e: any) {
        logger.error({ err: e, rawQuestion }, "Tier 0 execution failed, falling back to LLM.");
        return { handled: false, reason: "Execution error: " + e.message };
    }
}
