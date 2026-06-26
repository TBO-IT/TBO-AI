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
import { CsvValidationError, validateCsv } from "../services/csvValidator.js";

const router = Router();

// Retry unlink because DuckDB may hold a Windows file lock briefly after closing
async function safeUnlink(filePath: string) {
    for (let i = 0; i < 15; i++) {
        try {
            await fs.unlink(filePath);
            return;
        } catch (err: any) {
            if (err.code === 'EBUSY' && i < 14) {
                await new Promise(r => setTimeout(r, 200));
            } else {
                // Log but don't throw — the upload already succeeded
                console.warn(`[upload] Could not delete temp file ${filePath}:`, err.message);
                return;
            }
        }
    }
}

function logUploadValidationFailure(params: { filename: string; userId: string; timestamp: string; failure: string }) {
    console.warn(
        `[upload] validation failed | filename=${params.filename} | userId=${params.userId} | timestamp=${params.timestamp} | failure=${params.failure}`
    );
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
    limits : {
        fileSize: 10 * 1024 * 1024, // 10 MB
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
    async (req: any, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "File required",
                });
            }

            try {
                await validateCsv(req.file.path);
            } catch (error) {
                const message = error instanceof CsvValidationError
                    ? error.message
                    : "CSV validation failed.";
                logUploadValidationFailure({
                    filename: req.file.originalname,
                    userId: req.user.id,
                    timestamp: new Date().toISOString(),
                    failure: message,
                });
                await safeUnlink(req.file.path);
                return res.status(400).json({ error: message });
            }

            const storagePath =
                `${crypto.randomUUID()}-${req.file.originalname}`;

            console.log(storagePath);

            const dataset = await createDataset(
                req.user.id,
                req.file.originalname,
                storagePath
            );


            const fileBuffer =
                await fs.readFile(
                    req.file.path
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
                throw uploadError;
            }

            const summary = await analyzeCsv(
                req.file.path
            );

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

            await safeUnlink(req.file.path);

            return res.json({
                datasetId: dataset.id,
            });

        } catch (error) {
            console.error(error);

            if (req?.file?.path) {
                await safeUnlink(req.file.path);
            }

            return res.status(500).json({
                error: "Upload failed",
            });
        }
    }
);

export default router;