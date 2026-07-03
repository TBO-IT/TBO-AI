import { QuestionAnalysis } from "../questionTypes.js";

import { AnalysisContext } from "../core/AnalysisContext.js";
import { AnalysisContextBuilder } from "../core/AnalysisContextBuilder.js";

import { EvidencePlan } from "../evidence/EvidencePlan.js";
import { EvidencePlanner } from "../evidence/EvidencePlanner.js";

export interface AnalysisPipelineResult {

    /**
     * Complete business context for the question.
     */
    context: AnalysisContext;

    /**
     * Evidence required to answer the question.
     */
    evidencePlan: EvidencePlan;
}

export class AnalysisPipeline {

    constructor(
        private readonly contextBuilder: AnalysisContextBuilder,
        private readonly evidencePlanner: EvidencePlanner
    ) { }

    /**
     * Runs the Business Intelligence Pipeline.
     *
     * QuestionAnalysis
     *      ↓
     * AnalysisContext
     *      ↓
     * EvidencePlan
     */
    execute(
        question: QuestionAnalysis
    ): AnalysisPipelineResult {

        // Stage 1
        const context =
            this.contextBuilder.build(question);

        // Stage 2
        const evidencePlan =
            this.evidencePlanner.createPlan(context);

        return {

            context,

            evidencePlan

        };

    }

}