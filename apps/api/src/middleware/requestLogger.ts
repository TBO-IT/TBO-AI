import { pinoHttp } from "pino-http";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

export const requestLogger = pinoHttp({
    logger,

    genReqId(req: Request, _res: Response) {
        const existing = req.headers["x-request-id"];

        if (
            typeof existing === "string" &&
            existing.length > 0
        ) {
            return existing;
        }

        return randomUUID();
    },

    customLogLevel(req: Request, res: Response, err?: Error) {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },

    customSuccessMessage(req: Request, res: Response, _responseTime: number) {
        return `${req.method} ${req.url} completed`;
    },

    customErrorMessage(req: Request, res: Response, _error: Error) {
        return `${req.method} ${req.url} failed`;
    },

    serializers: {
        req(req: Request & { id?: string }) {
            return {
                id: req.id,
                method: req.method,
                url: req.url,
            };
        },
    },
});