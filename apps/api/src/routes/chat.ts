import { Router, Request } from "express";
import { ChatOrchestrator } from "../services/chatOrchestrator.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { currentUser } from "../middleware/currentUser.js";
import {getDataset} from "../services/datasetService.js";
const router = Router();

router.post("/", currentUser , async (req: Request & { user?: { id: string } }, res) => {
    const { datasetId, message } = req.body as { datasetId?: string; message?: string };

    if (!datasetId || !message) {
        return res.status(400).json({
            error: "Both datasetId and message are required."
        });
    }

    try {

        const dataset =await getDataset(datasetId , req.user!.id);
        
        if (!dataset) {
            return res.status(404).json({
                error: "Dataset not found or you do not have access to it."
            });
        }

        const response = await ChatOrchestrator.execute(datasetId , req.user!.id , message );
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
            detail: error.stack || error.message || String(error)
        });
    }
});

export default router;
