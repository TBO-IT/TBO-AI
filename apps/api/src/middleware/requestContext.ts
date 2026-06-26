import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../lib/requestContext.js";

export function requestContext(
    req: Request,
    res: Response,
    next: NextFunction
) {
    runWithRequestContext(
        {
            requestId: String(req.id),
        },
        next
    );
}