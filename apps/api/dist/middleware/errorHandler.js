import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";
export function errorHandler(err, req, res, _next) {
    // ==============================
    // Custom Application Errors
    // ==============================
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                message: err.message,
                status: err.statusCode,
            },
        });
    }
    // ==============================
    // Zod Validation Errors
    // ==============================
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            error: {
                message: "Validation failed",
                issues: err.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            },
        });
    }
    // ==============================
    // Prisma Errors
    // ==============================
    if (err instanceof PrismaClientKnownRequestError) {
        switch (err.code) {
            case "P2002":
                return res.status(409).json({
                    success: false,
                    error: {
                        message: "A record with the same value already exists.",
                    },
                });
            case "P2025":
                return res.status(404).json({
                    success: false,
                    error: {
                        message: "Requested resource was not found.",
                    },
                });
            default:
                break;
        }
    }
    // ==============================
    // Multer Errors
    // ==============================
    if (err.name === "MulterError") {
        return res.status(400).json({
            success: false,
            error: {
                message: err.message,
            },
        });
    }
    // ==============================
    // Unknown Errors
    // ==============================
    logger.error({
        requestId: req.id,
        userId: req.user?.id ?? "anonymous",
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        err,
    }, "Unhandled exception");
    return res.status(500).json({
        success: false,
        error: {
            message: "Internal server error.",
        },
    });
}
