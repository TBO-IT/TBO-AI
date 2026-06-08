import { Router } from "express";
import { currentUser } from "../middleware/currentUser.js";
import { createDataset } from "../services/datasetService.js";
import multer from "multer";

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

            const dataset = await createDataset(
                (req as any).user.id,
                req.file.originalname
            );

            console.log(req.file);

            return res.json({
                datasetId: dataset.id,
                filename: dataset.filename,
                status: dataset.status,
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