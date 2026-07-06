import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { currentUser } from "../middleware/currentUser.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET /api/usage
router.get("/", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const auth = req.auth;
        if (!auth) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Fetch usage data for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const usageData = await prisma.lLMUsage.findMany({
            where: {
                createdAt: {
                    gte: thirtyDaysAgo
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // Group by day
        const groupedByDay: Record<string, {
            date: string;
            inputTokens: number;
            outputTokens: number;
            estimatedCost: number;
            requests: number;
        }> = {};

        let totalCost = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalRequests = 0;

        for (const record of usageData) {
            // ISO date string e.g. "2026-07-06"
            const dayKey = record.createdAt.toISOString().split("T")[0];
            
            if (!groupedByDay[dayKey]) {
                groupedByDay[dayKey] = {
                    date: dayKey,
                    inputTokens: 0,
                    outputTokens: 0,
                    estimatedCost: 0,
                    requests: 0
                };
            }

            groupedByDay[dayKey].inputTokens += record.inputTokens;
            groupedByDay[dayKey].outputTokens += record.outputTokens;
            groupedByDay[dayKey].estimatedCost += record.estimatedCost;
            groupedByDay[dayKey].requests += 1;

            totalInputTokens += record.inputTokens;
            totalOutputTokens += record.outputTokens;
            totalCost += record.estimatedCost;
            totalRequests += 1;
        }

        // Convert grouped object to array and sort by date
        const timeline = Object.values(groupedByDay).sort((a, b) => a.date.localeCompare(b.date));

        return res.json({
            timeline,
            summary: {
                totalCost,
                totalInputTokens,
                totalOutputTokens,
                totalTokens: totalInputTokens + totalOutputTokens,
                totalRequests
            }
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch LLM usage data");
        return res.status(500).json({ error: "Failed to fetch usage data" });
    }
});

export default router;
