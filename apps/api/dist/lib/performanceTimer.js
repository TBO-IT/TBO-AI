import { logger } from "./logger.js";
export class PerformanceTimer {
    requestName;
    start = performance.now();
    lastCheckpoint = this.start;
    stages = [];
    constructor(requestName) {
        this.requestName = requestName;
    }
    checkpoint(stage) {
        const now = performance.now();
        this.stages.push({
            stage,
            durationMs: Math.round(now - this.lastCheckpoint),
        });
        this.lastCheckpoint = now;
    }
    finish() {
        const total = Math.round(performance.now() - this.start);
        logger.info({
            request: this.requestName,
            totalMs: total,
            stages: this.stages,
        }, "Performance Profile");
    }
}
