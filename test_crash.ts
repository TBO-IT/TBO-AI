import { EnrichedSemanticLayer } from "./apps/api/src/ai/semanticLayer";
import { isTrendQuestion, isContributionQuestion, isRootCauseQuestion } from "./apps/api/src/ai/queryRouter";

const question = undefined as any;

try {
    isTrendQuestion(question, "TREND");
} catch(e: any) {
    console.log("Error in isTrendQuestion:", e.message);
}

try {
    isContributionQuestion(question);
} catch(e: any) {
    console.log("Error in isContributionQuestion:", e.message);
}

