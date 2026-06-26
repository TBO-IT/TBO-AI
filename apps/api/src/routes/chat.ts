import { Router, Request } from "express";
import { ChatOrchestrator } from "../services/chatOrchestrator.js";
import { QuestionValidationError } from "../ai/questionTypes.js";
import { currentUser } from "../middleware/currentUser.js";
import {getDataset} from "../services/datasetService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { NotFoundError } from "../errors/NotFoundError.js";
const router = Router();

router.post("/", currentUser , asyncHandler(async (req: Request & { user?: { id: string } }, res) => {
    const { datasetId, message } = req.body as { datasetId?: string; message?: string };

    if (!datasetId || !message) {
        return res.status(400).json({
            error: "Both datasetId and message are required."
        });
    }


        const dataset =await getDataset(datasetId , req.user!.id);

         if(!dataset){

            throw new NotFoundError(
                "Dataset not found."
            );

         }

        const response = await ChatOrchestrator.execute(datasetId , req.user!.id , message );
        return res.json(response);
         
}));

export default router;
