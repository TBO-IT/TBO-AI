import { analysisContextBuilder } from "../core/bootstrap.js";
import { evidencePlanner } from "../evidence/bootstrap.js";

import { AnalysisPipeline } from "./AnalysisPipeline.js";

export const analysisPipeline =
    new AnalysisPipeline(
        analysisContextBuilder,
        evidencePlanner
    );