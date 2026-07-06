import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export async function currentUser(req: any, res: any, next: any) {
    const auth = getAuth(req);

    if (!auth.userId) {
        return res.status(401).json({
            error: "Unauthorized",
        });
    }

    let user = await prisma.user.findUnique({
        where: {
            clerkUserId: auth.userId,
        },
        include: {
            role: true,
        },
    });

    if (!user) {
        // Auto-provisioning flow
        try {
            const clerkUser = await clerkClient.users.getUser(auth.userId);
            const email = clerkUser.emailAddresses[0]?.emailAddress;
            const fullName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();

            if (!email) {
                 return res.status(500).json({ error: "Unable to complete authentication." });
            }

            // Domain validation
            const domain = email.split("@")[1]?.toLowerCase() || "";
            const allowedDomainsEnv = process.env.ALLOWED_EMAIL_DOMAINS || "";
            const allowedDomains = allowedDomainsEnv.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

            if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
                logger.info({
                    email,
                    reason: "INVALID_DOMAIN"
                }, "[AUTH]");
                return res.status(403).json({
                    error: "Access is restricted to authorized company employees.",
                });
            }

            const viewerRole = await prisma.userRole.findFirst({
                where: {
                    roleName: "viewer",
                },
            });

            if (!viewerRole) {
                return res.status(500).json({ error: "Unable to complete authentication." });
            }

            user = await prisma.user.create({
                data: {
                    clerkUserId: auth.userId,
                    email,
                    fullName,
                    roleId: viewerRole.id,
                    isActive: true
                },
                include: {
                    role: true,
                }
            });

            logger.info({
                email,
                autoProvisioned: true,
                assignedRole: "viewer"
            }, "[AUTH]");

        } catch (error) {
            console.error("Auto-provisioning error:", error);
            return res.status(500).json({ error: "Unable to complete authentication." });
        }
    } else {
        // user exists
        if (!user.isActive) {
             logger.info({
                email: user.email,
                reason: "ACCOUNT_DISABLED"
             }, "[AUTH]");
             return res.status(403).json({
                 error: "Your account has been disabled. Please contact your administrator.",
             });
        }
        
        logger.info({
            email: user.email,
            domain: user.email.split("@")[1]?.toLowerCase() || "",
            autoProvisioned: false,
            role: user.role.roleName
        }, "[AUTH]");
    }

    req.user = user;

    next();
}