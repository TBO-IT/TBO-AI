import { Router, Request } from "express";
import { ChatOrchestrator } from "../services/chatOrchestrator.js";
import { currentUser } from "../middleware/currentUser.js";
import { getDataset } from "../services/datasetService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { NotFoundError } from "../errors/NotFoundError.js";
const router = Router();

function sseSend(res: any, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post(
    "/",
    currentUser,
    asyncHandler(async (req: Request & { user?: { id: string } }, res) => {
        const { datasetId, message } = req.body as { datasetId?: string; message?: string };

        if (!datasetId || !message) {
            return res.status(400).json({
                error: "Both datasetId and message are required."
            });
        }

        const dataset = await getDataset(datasetId, req.user!.id);
        if (!dataset) {
            throw new NotFoundError("Dataset not found.");
        }

        // SSE headers
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        // Express typically supports flushHeaders at runtime; ignore TS typing here.
        (res as any).flushHeaders?.();

        const abortController = new AbortController();
        let clientGone = false;

        const onClientClose = () => {
            clientGone = true;
            abortController.abort();
        };

        req.on("close", onClientClose);

        try {
            sseSend(res, "status", { stage: "Analyzing dataset..." });

            let lastChunkAt = Date.now();
            const onToken = (textChunk: string) => {
                // Avoid sending empty chunks
                if (!textChunk) return;

                lastChunkAt = Date.now();
                sseSend(res, "token", { text: textChunk });
            };

            // Keep heartbeat to avoid idle timeouts
            const heartbeat = setInterval(() => {
                if (clientGone) return;
                // 20–30s heartbeat
                if (Date.now() - lastChunkAt >= 20000) {
                    try {
                        sseSend(res, "heartbeat", { now: new Date().toISOString() });
                    } catch {
                        // ignore
                    }
                }
            }, 10000);

            // Stream via token callback (final metadata sent only once at completion)
            const response = await ChatOrchestrator.execute(
                datasetId,
                req.user!.id,
                message,
                {
                    onClaudeToken: onToken,
                    abortSignal: abortController.signal
                }
            );

            clearInterval(heartbeat);

            sseSend(res, "complete", { success: true, response });
            res.end();
        } catch (err: any) {
            const msg = err?.message ?? "Claude streaming failed";
            sseSend(res, "error", { message: msg });
            res.end();
        } finally {
            req.off("close", onClientClose);
        }
    })
);

export default router;
