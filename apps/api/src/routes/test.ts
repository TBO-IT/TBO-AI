import { Router } from "express";

import {
    buildDatasetContext
} from "../services/schemaService.js";

import {
    buildSemanticLayer
} from "../ai/semanticLayer.js";

import {
    buildPrompt
} from "../ai/promptBuilder.js";

import {
    QuestionValidationError
} from "../ai/questionTypes.js";

import {
    getDataset
} from "../services/datasetService.js";

import {
    downloadDataset
} from "../services/storageService.js";

const router = Router();

router.post(
    "/prompt",

    async (
        req,
        res
    ) => {

        try {

            const {
                datasetId,
                question
            } = req.body;

            if (!datasetId) {

                return res.status(400).json({
                    error:
                        "datasetId is required"
                });

            }

            if (!question) {

                return res.status(400).json({
                    error:
                        "question is required"
                });

            }

            // This route is a developer prompt test; dataset ownership still requires userId.
            const dataset =
                await getDataset(
                    datasetId,
                    (req as any).user?.id
                );

            if (!dataset) {

                return res.status(404).json({
                    error:
                        "Dataset not found"
                });

            }

            if (!dataset.storagePath) {

                return res.status(400).json({
                    error:
                        "Dataset has no storage path"
                });

            }

            const localCsvPath =
                await downloadDataset(
                    dataset.storagePath
                );

            const context =
                await buildDatasetContext(
                    localCsvPath
                );

            const semanticLayer =
                buildSemanticLayer(
                    context.schema
                );

            const { prompt } =
                buildPrompt(
                    question,
                    semanticLayer
                );

            return res.json({

                datasetId,

                datasetType:
                    context.datasetType,

                prompt

            });

        } catch (error) {

            if (error instanceof QuestionValidationError) {
                return res.status(422).json({
                    valid: false,
                    errors: error.validationResult.errors,
                    suggestions: error.validationResult.suggestions
                });
            }

            console.error(
                "PROMPT TEST ERROR:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to build prompt"
            });

        }

    }
);

export default router;