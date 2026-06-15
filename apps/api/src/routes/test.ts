import { Router } from "express";

import {
    buildDatasetContext
}
    from "../services/schemaService.js";

import {
    buildPrompt
}
    from "../ai/promptBuilder.js";

const router = Router();

router.post(
    "/prompt",

    async (
        req,
        res
    ) => {

        try {

            const {
                csvPath,
                question
            } = req.body;

            const context =
                await buildDatasetContext(
                    csvPath
                );

            const prompt =
                buildPrompt(
                    question,
                    context
                );

            return res.json({
                prompt
            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({
                error:
                    "Failed to build prompt"
            });

        }

    }
);

export default router;