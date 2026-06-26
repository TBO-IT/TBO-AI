import { Router } from "express";

import { requireAuth, getAuth } from "@clerk/express";

import { clerkClient } from "@clerk/express";

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/sync-user", requireAuth(), async (req, res) => {
    try {
        const auth = getAuth(req);

        const clerkUserId = auth.userId;

        if (!clerkUserId) {
            return res.status(401).json({
                error: "Unauthorized",
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: {
                clerkUserId,
            },
        });

        if (existingUser) {
            const updatedUser = await prisma.user.update({
                where: {
                    id: existingUser.id,
                },
                data: {
                    lastLoginAt: new Date(),
                },
            });
            return res.json(updatedUser);
        }

        // default role
        const viewerRole = await prisma.userRole.findFirst({
            where: {
                roleName: "viewer",
            },
        });

        if (!viewerRole) {
            return res.status(500).json({
                error: "Viewer role missing",
            });
        }

        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        const fullName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();

        const user = await prisma.user.create({
            data: {
                clerkUserId,
                email,
                fullName,
                roleId: viewerRole.id,
            },
        });

        return res.json(user);
    } catch (error) {
        logger.error({ err: error }, "sync-user failed");

        return res.status(500).json({
            error: "Internal server error",
        });
    }
});

export default router;