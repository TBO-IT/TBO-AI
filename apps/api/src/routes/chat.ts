import { Router } from "express";
import { ChatOrchestrator } from "../services/chatOrchestrator.js";
import { QuestionValidationError } from "../ai/questionTypes.js";

const router = Router();

router.post("/", async (req, res) => {
    const { datasetId, message } = req.body;

    if (!datasetId || !message) {
        return res.status(400).json({
            error: "Both datasetId and message are required."
        });
    }

    try {
        const response = await ChatOrchestrator.execute(datasetId, message);
        return res.json(response);
    } catch (error: any) {
        if (error instanceof QuestionValidationError) {
            console.log(`[chat] Question rejected:`, error.validationResult.errors);
            return res.status(422).json({
                valid: false,
                errors: error.validationResult.errors,
                suggestions: error.validationResult.suggestions,
                // DatasetType is intentionally omitted here to simplify, or could be passed up via custom error
            });
        }
        console.error("Error in chat execution pipeline:", error);
        return res.status(500).json({
            error: "An error occurred while processing your query.",
            detail: error.message || String(error)
        });
    }
});

export default router;
