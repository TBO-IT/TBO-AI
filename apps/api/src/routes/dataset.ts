import { Router } from "express";
import { redis } from "../lib/redis.js";
import { getDataset } from "../services/datasetService.js";

const router = Router();

router.get("/:id", async (req, res) => {

    const dataset = await getDataset(
        req.params.id
    );

    if (!dataset) {
        return res.status(404).json({
            error: "Dataset not found",
        });
    }

    if (!dataset.redisKey) {
        return res.status(404).json({
            error: "No analysis found",
        });
    }

    const summary = await redis.get(
        dataset.redisKey
    );

    if (!summary) {
        return res.status(404).json({
            error: "Analysis cache not found",
        });
    }

    return res.json(summary);

});

export default router;