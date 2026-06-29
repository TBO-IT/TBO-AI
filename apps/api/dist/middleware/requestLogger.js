import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
export const requestLogger = pinoHttp({
    logger,
    genReqId(req, _res) {
        const existing = req.headers["x-request-id"];
        if (typeof existing === "string" &&
            existing.length > 0) {
            return existing;
        }
        return randomUUID();
    },
    customLogLevel(req, res, err) {
        if (err || res.statusCode >= 500)
            return "error";
        if (res.statusCode >= 400)
            return "warn";
        return "info";
    },
    customSuccessMessage(req, res, _responseTime) {
        return `${req.method} ${req.url} completed`;
    },
    customErrorMessage(req, res, _error) {
        return `${req.method} ${req.url} failed`;
    },
    serializers: {
        req(req) {
            return {
                id: req.id,
                method: req.method,
                url: req.url,
            };
        },
    },
});
