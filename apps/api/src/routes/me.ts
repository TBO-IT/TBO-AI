import { Router } from "express";

import { currentUser } from "../middleware/currentUser.js";

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
            console.error("GET /me error:", error);

            return res.status(500).json({
                error: "Internal server error",
            });
        }
    }
);

export default router;