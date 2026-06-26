import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { currentUser } from "../middleware/currentUser.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get(
    "/me",
    currentUser,
    async (req: any, res) => {
        try {
            return res.json({
                id: req.user.id,
                email: req.user.email,
                role: req.user.role.roleName,
            });
        } catch (error) {
            logger.error({ err: error }, "GET /me error");

            return res.status(500).json({
                error: "Internal server error",
            });
        }
    }
);

router.get(
    "/profile",
    currentUser,
    async (req: any, res) => {
        try {
            const userId = req.user.id;

            const datasetCount = await prisma.dataset.count({
                where: { userId },
            });

            return res.json({
                id: req.user.id,
                fullName: req.user.fullName,
                email: req.user.email,
                role: req.user.role.roleName,
                datasetsUploaded: datasetCount,
                queriesRun: 0,
            });
        } catch (error) {
            logger.error({ err: error }, "GET /profile error");

            return res.status(500).json({
                error: "Internal server error",
            });
        }
    }
);

export default router;
