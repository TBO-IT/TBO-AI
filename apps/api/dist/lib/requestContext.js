import { AsyncLocalStorage } from "node:async_hooks";
const asyncLocalStorage = new AsyncLocalStorage();
export function runWithRequestContext(context, callback) {
    return asyncLocalStorage.run(context, callback);
}
export function getRequestContext() {
    return asyncLocalStorage.getStore();
}
