import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
    requestId: string;
    userId?: string;
    datasetId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
    context: RequestContext,
    callback: () => T
): T {
    return asyncLocalStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
    return asyncLocalStorage.getStore();
}