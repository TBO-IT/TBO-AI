import { Router } from "express";
import { currentUser } from "../middleware/currentUser.js";
import { createDataset } from "../services/datasetService.js";
import { analyzeCsv } from "../services/duckdbService.js";
import { redis } from "../lib/redis.js";
import { markCompleted } from "../services/datasetService.js";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import fs from "fs/promises";

const router = Router();

const upload = multer({
    dest: "uploads/",

    fileFilter(req, file, cb) {
        if (!file.originalname.endsWith(".csv")) {
            return cb(new Error("Only CSV files allowed"));
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

            await fs.unlink(
                req.file.path
            );

            return res.json({
                datasetId: dataset.id,
            });

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                error: "Upload failed",
            });
        }
    }
);

export default router;