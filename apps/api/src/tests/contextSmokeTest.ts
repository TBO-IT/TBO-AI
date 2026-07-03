import { analyzeQuestion } from "../ai/questionAnalyzer.js";

import { analysisContextBuilder }
    from "../ai/core/bootstrap.js";

const question =
    analyzeQuestion(
        "How is Marriott performing in London?"
    );

const context =
    analysisContextBuilder.build(
        question
    );

console.dir(
    context,
    { depth: null }
);