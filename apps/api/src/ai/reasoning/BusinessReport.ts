import { Recommendation } from "../../services/recommendationGenerator.js";
import { Finding } from "./Finding.js";

export interface BusinessReport {

    executiveSummary: string;

    findings: Finding[];

    risks: Finding[];

    opportunities: Finding[];

    recommendations: Recommendation[];

}