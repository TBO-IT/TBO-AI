import { QuestionAnalysis } from "../questionTypes.js";
import { AnalysisDefinition } from "../analysis/AnalysisDefinition.js";
import { BusinessConcept } from "../ontology/BusinessConcept.js";

export interface AnalysisContext {

    /**
     * Original user question.
     */
    originalQuestion: string;

    /**
     * NLP output.
     */
    question: QuestionAnalysis;

    /**
     * Selected consulting framework.
     */
    analysis: AnalysisDefinition;

    /**
     * Resolved business concepts.
     *
     * Example:
     * Marriott -> Chain
     * London -> Destination
     */
    concepts: BusinessConcept[];

}