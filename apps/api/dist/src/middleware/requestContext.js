import { runWithRequestContext } from "../lib/requestContext.js";
export function requestContext(req, res, next) {
    runWithRequestContext({
        requestId: String(req.id),
    }, next);
}
