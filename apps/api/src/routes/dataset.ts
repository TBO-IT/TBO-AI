import { Router, Request } from "express";
import { redis } from "../lib/redis.js";
import { getDataset, getDatasets } from "../services/datasetService.js";
import {currentUser} from "../middleware/currentUser.js";

const router = Router();

router.get(
    "/",
    currentUser,
    async (req: Request & { user?: { id: string } }, res) => {
        try {
            const datasets = await getDatasets(req.user!.id);
            return res.json(datasets);
        } catch (error) {
            console.error("GET DATASETS ERROR:", error);
            return res.status(500).json({
                error: "Failed to retrieve datasets",
            });
        }
    }
);

router.get(
    "/:id",
    currentUser,
    async (req: Request & { user?: { id: string } }, res) => {
        const datasetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const dataset = await getDataset(datasetId , req.user!.id);

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