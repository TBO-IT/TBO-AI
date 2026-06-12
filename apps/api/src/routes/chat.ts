import { getDataset } from "../services/datasetService.js"
import { redis } from "../lib/redis.js";

import { Router } from "express";

const router = Router();

router.post("/", async (req, res) => {

    const { datasetId, message } =
        req.body;

    const dataset =
        await getDataset(
            datasetId
        );

    if (!dataset?.redisKey) {

        return res.status(404).json({
            error:
                "Dataset not found",
        });

    }

    const summary =
        await redis.get(
            dataset.redisKey
        );

    if (!summary) {

        return res.status(404).json({
            error:
                "Analysis cache not found",
        });

    }

    const lower = message.toLowerCase();

    if (
        lower.includes("win rate")
    ) {
        return res.json({
            answer: `Overall win rate is ${(summary as any).winRate.toFixed(1)}%.`
        });
    }

    if (
        lower.includes("row") || lower.includes("record")
    ) {
        return res.json({
            answer: `This dataset contains ${(summary as any).rowCount.toLocaleString()} rows.`
        })
    }

    if (
        lower.includes("median") || lower.includes("price diff")
    ) {
        return res.json({
            answer: `Median price difference is ${(summary as any).medianPriceDiff.toFixed(2)} %.`
        })
    }

    if (
        lower.includes("best apw")
        ||
        lower.includes("strongest apw")
        ||
        lower.includes("apw bucket")
    ) {
        const best =
            [...(summary as any).apwBreakdown]
                .filter(x => x.name)
                .sort(
                    (a, b) => b.winRate - a.winRate
                )[0];
        return res.json({
            answer: `${best.name} is the strongest APW bucket with a ${best.winRate.toFixed(1)} % win rate across ${best.volume} observations.`
        })
    }

    if (
        lower.includes("worst apw")
        ||
        lower.includes("losing apw")
    ) {
        const worst =
            [...(summary as any).apwBreakdown]
                .filter(x => x.name)
                .sort(
                    (a, b) => a.winRate - b.winRate
                )[0];
        return res.json({
            answer: `${worst.name} is the worst APW bucket with a ${worst.winRate.toFixed(1)} % win rate across ${worst.volume} observations.`
        })
    }

    if (
        lower.includes("best supplier")
    ) {
        const best =
            [...(summary as any).supplierPerformance]
                .filter(x => x.name)
                .sort(
                    (a, b) => b.winRate - a.winRate
                )[0];
        return res.json({
            answer: `${best.name} is the best supplier with a ${best.winRate.toFixed(1)} % win rate across ${best.volume} observations.`
        })
    }

    if (
        lower.includes("worst supplier")
        ||
        lower.includes("hurting us")
    ) {
        const worst = [
            ...(summary as any).supplierPerformance
        ].filter(x => x.volume > 10)
            .sort(
                (a, b) => a.winRate - b.winRate
            )[0];
        return res.json({
            answer: `${worst.name} is the worst supplier with a ${worst.winRate.toFixed(1)} % win rate across ${worst.volume} observations.`
        })
    }

    if (
        lower.includes("best chain")
    ) {
        const best = [
            ...(summary as any).chainPerformance
        ].filter(x => x.name)
            .sort(
                (a, b) => b.winRate - a.winRate
            )[0];
        return res.json({
            answer: `${best.name} is the best chain with a ${best.winRate.toFixed(1)} % win rate across ${best.volume} observations.`
        })
    }

    if (
        lower.includes("worst chain")
        ||
        lower.includes("hurting us")
    ) {
        const worst = [
            ...(summary as any).chainPerformance
        ].filter(x => x.volume > 5)
            .sort(
                (a, b) => a.winRate - b.winRate
            )[0];
        return res.json({
            answer: `${worst.name} is the worst chain with a ${worst.winRate.toFixed(1)} % win rate across ${worst.volume} observations.`
        })
    }

    return res.json({
        answer: "I don't understand that question yet."
    })

});

export default router;
