import { AnalysisPlanner } from "./AnalysisPlanner.js";
import { analysisRegistry } from "../analysis/bootstrap.js";

export const analysisPlanner = new AnalysisPlanner(analysisRegistry);
