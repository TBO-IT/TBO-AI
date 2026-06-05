import { getAuth } from "@clerk/express";
import { prisma } from "../lib/prisma.js";

export async function currentUser(req: any, res: any, next: any) {
    const auth = getAuth(req);

    if (!auth.userId) {
        return res.status(401).json({
            error: "Unauthorized",
        });
    }

    const user = await prisma.user.findUnique({
        where: {
            clerkUserId: auth.userId,
        },
        include: {
            role: true,
        },
    });

    if (!user) {
        return res.status(404).json({
            error: "User not found",
        });
    }

    req.user = user;

    next();
}