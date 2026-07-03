import { AnalysisContext } from "./AnalysisContext.js";

import { QuestionAnalysis } from "../questionTypes.js";

import { AnalysisSelector } from "../analysis/AnalysisSelector.js";

import { AnalysisDefinition } from "../analysis/AnalysisDefinition.js";

export class AnalysisContextBuilder {

    constructor(
        private readonly selector: AnalysisSelector
    ) { }

    build(
        question: QuestionAnalysis
    ): AnalysisContext {

        const analysis: AnalysisDefinition =
            this.selector.select(question);

        return {

            originalQuestion:
                question.originalQuestion,

            question,

            analysis,

            concepts: []

        };
    }

}