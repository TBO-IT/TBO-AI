import { logger } from "./logger.js";

export class PerformanceTimer {
    private readonly start = performance.now();
    private lastCheckpoint = this.start;
    private readonly stages: {
        stage: string;
        durationMs: number;
    }[] = [];

    constructor(private readonly requestName: string) {}

    checkpoint(stage: string) {
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