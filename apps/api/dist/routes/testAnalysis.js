import { Router } from "express";
import path from "path";
import { analyzeCsv } from "../services/duckdbService.js";
const router = Router();
router.get("/", async (req, res) => {
    try {
        const filePath = path.resolve("uploads", "testdata.csv");
        const result = await analyzeCsv(filePath);
        return res.json(result);
    }
    catch (error) {
        console.error("TEST ANALYSIS ERROR:");
        console.error(error);
        return res.status(500).json({
            error: error instanceof Error
                ? error.message
                : "Analysis failed",
        });
    }
});
export default router;
