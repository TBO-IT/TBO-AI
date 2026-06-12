import { getDataset } from "../services/datasetService.js"
import { redis } from "../lib/redis.js";
import fs from "fs/promises";
import { Router } from "express";

import {
    downloadDataset
}
    from "../services/storageService.js";

import {
    getTopWinningHotels,
    getBestHotels,
    getWorstHotels,
    getHighestVolumeHotels,
    getTopSuppliersByVolume,
    getBestSuppliers,
    getWorstSuppliers,
    getBestChains,
    getWorstChains,
    getHighestVolumeChains,
    getOverallWinRate,
    getOverallVolume,
    getTopDestinations,
    getBestDestinations,
    getWorstDestinations,
    HotelWinMetric
}
    from "../services/queryService.js";

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

    const isDuckDbQuery = 
        (lower.includes("hotel") && (lower.includes("top") || lower.includes("best") || lower.includes("worst") || lower.includes("volume"))) ||
        (lower.includes("supplier") && (lower.includes("top") || lower.includes("best") || lower.includes("worst") || lower.includes("volume"))) ||
        (lower.includes("chain") && (lower.includes("top") || lower.includes("best") || lower.includes("worst") || lower.includes("volume"))) ||
        (lower.includes("destination") && (lower.includes("top") || lower.includes("best") || lower.includes("worst") || lower.includes("volume") || lower.includes("most"))) ||
        (lower.includes("overall") && (lower.includes("win rate") || lower.includes("volume") || lower.includes("row") || lower.includes("record") || lower.includes("total")));

    if (isDuckDbQuery) {
        const tempPath = await downloadDataset(dataset.storagePath!);
        try {
            if (lower.includes("top") && lower.includes("winning") && lower.includes("hotel")) {
                const data = await getTopWinningHotels(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.hotel} (${item.wins.toLocaleString()} wins)`).join("\n");
                return res.json({ answer: `Top 5 winning hotels:\n\n${list}` });
            }
            if (lower.includes("best") && lower.includes("hotel")) {
                const data = await getBestHotels(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.hotel} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Best hotels by win rate (min 20 rows):\n\n${list}` });
            }
            if (lower.includes("worst") && lower.includes("hotel")) {
                const data = await getWorstHotels(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.hotel} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Worst hotels by win rate (min 20 rows):\n\n${list}` });
            }
            if ((lower.includes("highest volume") || lower.includes("top volume") || lower.includes("most volume") || (lower.includes("volume") && !lower.includes("win"))) && lower.includes("hotel")) {
                const data = await getHighestVolumeHotels(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.hotel} (${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Highest volume hotels:\n\n${list}` });
            }
            if (lower.includes("best") && lower.includes("supplier")) {
                const data = await getBestSuppliers(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.supplier} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Best suppliers by win rate (min 20 rows):\n\n${list}` });
            }
            if (lower.includes("worst") && lower.includes("supplier")) {
                const data = await getWorstSuppliers(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.supplier} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Worst suppliers by win rate (min 20 rows):\n\n${list}` });
            }
            if (lower.includes("supplier") && (lower.includes("volume") || lower.includes("highest") || lower.includes("top"))) {
                const data = await getTopSuppliersByVolume(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.supplier} (${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Top suppliers by volume:\n\n${list}` });
            }
            if (lower.includes("best") && lower.includes("chain")) {
                const data = await getBestChains(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.chain} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Best chains by win rate (min 20 rows):\n\n${list}` });
            }
            if (lower.includes("worst") && lower.includes("chain")) {
                const data = await getWorstChains(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.chain} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Worst chains by win rate (min 20 rows):\n\n${list}` });
            }
            if ((lower.includes("highest volume") || lower.includes("top volume") || lower.includes("most volume") || (lower.includes("volume") && !lower.includes("win"))) && lower.includes("chain")) {
                const data = await getHighestVolumeChains(tempPath);
                const list = data.map((item, index) => `${index + 1}. ${item.chain} (${item.volume.toLocaleString()} rows)`).join("\n");
                return res.json({ answer: `Highest volume chains:\n\n${list}` });
            }
            if (lower.includes("overall") && lower.includes("win rate")) {
                const rate = await getOverallWinRate(tempPath);
                return res.json({ answer: `Overall win rate is ${rate.toFixed(1)}%.` });
            }
            if (lower.includes("overall") && (lower.includes("volume") || lower.includes("row") || lower.includes("record") || lower.includes("total"))) {
                const volume = await getOverallVolume(tempPath);
                return res.json({ answer: `This dataset contains ${volume.toLocaleString()} rows.` });
            }
            if (lower.includes("best") && lower.includes("destination")) {
                const data = await getBestDestinations(tempPath);
                if (data.length === 0) {
                    return res.json({ answer: `Destination column not found in this dataset.` });
                } else {
                    const list = data.map((item, index) => `${index + 1}. ${item.destination} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                    return res.json({ answer: `Best destinations by win rate (min 20 rows):\n\n${list}` });
                }
            }
            if (lower.includes("worst") && lower.includes("destination")) {
                const data = await getWorstDestinations(tempPath);
                if (data.length === 0) {
                    return res.json({ answer: `Destination column not found in this dataset.` });
                } else {
                    const list = data.map((item, index) => `${index + 1}. ${item.destination} (${item.winRate.toFixed(1)}%, ${item.volume.toLocaleString()} rows)`).join("\n");
                    return res.json({ answer: `Worst destinations by win rate (min 20 rows):\n\n${list}` });
                }
            }
            if (lower.includes("destination") && (lower.includes("top") || lower.includes("volume") || lower.includes("highest") || lower.includes("most"))) {
                const data = await getTopDestinations(tempPath);
                if (data.length === 0) {
                    return res.json({ answer: `Destination column not found in this dataset.` });
                } else {
                    const list = data.map((item, index) => `${index + 1}. ${item.destination} (${item.volume.toLocaleString()} rows)`).join("\n");
                    return res.json({ answer: `Top destinations by volume:\n\n${list}` });
                }
            }
        } finally {
            await safeUnlink(tempPath);
        }
    }

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
