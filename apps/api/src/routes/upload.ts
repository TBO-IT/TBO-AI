import { Router } from "express";
import { currentUser } from "../middleware/currentUser.js";
import { createDataset } from "../services/datasetService.js";
import { analyzeCsv } from "../services/duckdbService.js";
import { redis } from "../lib/redis.js";
import { markCompleted } from "../services/datasetService.js";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { validateCsv } from "../services/csvValidator.js";
import { ValidationError } from "../errors/ValidationError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../lib/logger.js";
import { buildEntityIndex } from "../ai/entity/EntityIndexBuilder.js";

const router = Router();

// Retry unlink because DuckDB may hold a Windows file lock briefly after closing
async function safeUnlink(filePath?: string) {
    if (!filePath) {
        return;
    }

    for (let i = 0; i < 15; i++) {
        try {
            await fs.unlink(filePath);
            return;
        } catch (err: any) {
            if (err.code === 'EBUSY' && i < 14) {
                await new Promise(r => setTimeout(r, 200));
            } else {
                // Log but don't throw — the upload already succeeded
                logger.warn({ filePath, err }, "Could not delete temp file");
                return;
            }
        }
    }
}

function logUploadValidationFailure(params: { filename: string; userId: string; timestamp: string; failure: string }) {
    logger.warn(params, "Upload validation failed");
}

const ALLOWED_EXTENSIONS = new Set([
    ".csv",
]);

const ALLOWED_MIME_TYPES = new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
]);

const upload = multer({
    dest: "uploads/",
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
    },

    fileFilter(req, file, cb) {
        const extension = path.extname(file.originalname).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(extension)) {
            return cb(new Error("Invalid file extension. Only CSV files are allowed."));
        }

        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new Error("Invalid file type. Only CSV files are allowed."));
        }

        cb(null, true);
    },
});

router.post(
    "/",
    upload.single("file"),
    currentUser,
    asyncHandler(async (req: any, res) => {
        if (!req.file) {
            throw new ValidationError("File required");
        }

        const filePath = req.file.path;
        let storagePath: string | undefined;

        try {
            await validateCsv(filePath);

            storagePath = `${crypto.randomUUID()}-${req.file.originalname}`;

            logger.info({ storagePath }, "Upload storage path generated");

            const dataset = await createDataset(
                req.user.id,
                req.file.originalname,
                storagePath
            );


            const fileBuffer =
                await fs.readFile(
                    filePath
                );

            const { error: uploadError } =
                await supabase.storage
                    .from("datasets")
                    .upload(
                        storagePath,
                        fileBuffer,
                        {
                            contentType:
                                "text/csv",
                        }
                    );

            if (uploadError) {
                logger.error({ uploadError }, "Supabase upload failed (Make sure the 'datasets' bucket exists!)");
                throw uploadError;
            }

            const summary = await analyzeCsv(
                filePath
            );

            const entityIndex =
                await buildEntityIndex(filePath);

            const redisKey = `dataset:${dataset.id}`;

            await redis.set(
                redisKey,
                summary
            );

            await markCompleted(
                dataset.id,
                summary.rowCount,
                redisKey
            );

            return res.json({
                datasetId: dataset.id,
            });
        } finally {
            await safeUnlink(filePath);
        }
    }
    ));

export default router;