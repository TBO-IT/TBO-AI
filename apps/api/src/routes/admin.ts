import { Router, Request, Response } from "express";
import { requireAuth } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { currentUser } from "../middleware/currentUser.js";
import { requirePermission } from "../middleware/requirePermission.js";

const router = Router();

router.get(
    "/users",
    requireAuth(),
    currentUser,
    requirePermission("canManageUsers"),
    async (req: Request, res: Response) => {
        try {
            const users = await prisma.user.findMany({
                include: { role: true },
                orderBy: { createdAt: 'desc' }
            });
            
            const mappedUsers = users.map(user => ({
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role.roleName,
                isActive: user.isActive,
                joinedDate: user.createdAt.toISOString()
            }));
            
            res.json(mappedUsers);
        } catch (err) {
            console.error("[ADMIN_USERS]", err);
            res.status(500).json({ error: "Failed to fetch users" });
        }
    }
);

router.post(
    "/users/:id/role",
    requireAuth(),
    currentUser,
    requirePermission("canManageUsers"),
    async (req: Request, res: Response) => {
        try {
            const id = req.params.id as string;
            const role = req.body.role as string;
            
            if (!['viewer', 'analyst', 'admin'].includes(role)) {
                return res.status(400).json({ error: "Invalid role specified" });
            }
            
            const targetUser = await prisma.user.findUnique({
                where: { id },
                include: { role: true }
            }) as any;
            
            if (!targetUser) {
                return res.status(404).json({ error: "User not found" });
            }
            
            if (targetUser.role?.roleName === 'admin' && role !== 'admin') {
                return res.status(403).json({ error: "Cannot demote an admin user" });
            }
            
            const newRole = await prisma.userRole.findFirst({
                where: { roleName: role as any }
            });
            
            if (!newRole) {
                return res.status(500).json({ error: "Role not found in database" });
            }
            
            const updatedUser = await prisma.user.update({
                where: { id },
                data: { roleId: newRole.id },
                include: { role: true }
            }) as any;
            
            res.json({
                id: updatedUser.id,
                role: updatedUser.role?.roleName
            });
        } catch (err) {
            console.error("[ADMIN_UPDATE_ROLE]", err);
            res.status(500).json({ error: "Failed to update user role" });
        }
    }
);

export default router;