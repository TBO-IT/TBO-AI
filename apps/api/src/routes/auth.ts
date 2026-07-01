import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { currentUser } from "../middleware/currentUser.js";

const router = Router();

router.post("/sync-user", currentUser, async (req: any, res: any) => {
    try {
        const user = req.user;

        const updatedUser = await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                lastLoginAt: new Date(),
            },
        });

        return res.json(updatedUser);
    } catch (error) {
        logger.error({ err: error }, "sync-user failed");

        return res.status(500).json({
            error: "Internal server error",
        });
    }
});

export default router;