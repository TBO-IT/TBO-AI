import { analysisSelector } from "../analysis/bootstrap.js";

import { AnalysisContextBuilder } from "./AnalysisContextBuilder.js";

export const analysisContextBuilder =
    new AnalysisContextBuilder(
        analysisSelector
    );