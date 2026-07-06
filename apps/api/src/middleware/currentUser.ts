import { getAuth, clerkClient } from "@clerk/express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export async function currentUser(req: any, res: any, next: any) {
    const auth = getAuth(req);

    if (!auth.userId) {
        console.error("Auth failed:", {
            authObject: auth,
            authHeader: req.headers.authorization ? "Present" : "Missing",
            clerkSecretExists: !!process.env.CLERK_SECRET_KEY
        });
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

            // Strict Domain Validation for TBO.com
            const domain = email.split("@")[1]?.toLowerCase() || "";
            const allowedDomainsEnv = process.env.ALLOWED_EMAIL_DOMAINS || "tbo.com";
            const allowedDomains = allowedDomainsEnv.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

            if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
                logger.info({
                    email,
                    reason: "INVALID_DOMAIN"
                }, "[AUTH]");
                return res.status(403).json({
                    error: "Access is restricted to authorized @tbo.com employees.",
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
        // Strict Domain Validation for existing users (in case they were provisioned earlier)
        const domain = user.email.split("@")[1]?.toLowerCase() || "";
        const allowedDomainsEnv = process.env.ALLOWED_EMAIL_DOMAINS || "tbo.com";
        const allowedDomains = allowedDomainsEnv.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);

        if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
            logger.info({
                email: user.email,
                reason: "INVALID_DOMAIN_RETROACTIVE"
            }, "[AUTH]");
            return res.status(403).json({
                error: "Access is restricted to authorized @tbo.com employees.",
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