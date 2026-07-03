import { AnalysisRegistry } from "./AnalysisRegistry.js";
import { AnalysisSelector } from "./AnalysisSelector.js";

import {
    PerformanceAnalysis,
    ComparisonAnalysis,
    DiagnosisAnalysis,
    TrendAnalysis,
    ForecastAnalysis,
    RiskAnalysis
} from "./data/index.js";

export const analysisRegistry = new AnalysisRegistry();

analysisRegistry.register(PerformanceAnalysis);
analysisRegistry.register(ComparisonAnalysis);
analysisRegistry.register(DiagnosisAnalysis);
analysisRegistry.register(TrendAnalysis);
analysisRegistry.register(ForecastAnalysis);
analysisRegistry.register(RiskAnalysis);

export const analysisSelector =
    new AnalysisSelector(
        analysisRegistry
    );