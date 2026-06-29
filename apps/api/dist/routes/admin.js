import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { currentUser } from "../middleware/currentUser.js";
import { requirePermission } from "../middleware/requirePermission.js";
const router = Router();
router.get("/users", currentUser, requirePermission("canManageUsers"), async (req, res) => {
    const users = await prisma.user.findMany({
        include: {
            role: true,
        },
    });
    res.json(users);
});
export default router;
