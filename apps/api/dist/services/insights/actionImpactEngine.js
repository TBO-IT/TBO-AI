// ─── Action Impact Engine ─────────────────────────────────────────────────────
//
// Generates expected-impact statements with confidence levels
// for every recommended executive action.
//
// Deterministic. Claude does NOT generate these.
// ───────────────────────────────────────────────────────────────────────────────
export function generateActionImpacts(actions, risks, opportunities) {
    const impacts = [];
    for (const action of actions.slice(0, 3)) {
        // Try to match against a risk first
        const matchedRisk = risks.find(r => r.affectedEntity === action.relatedEntity);
        const matchedOpp = opportunities.find(o => o.affectedEntity === action.relatedEntity);
        let expectedImpact;
        let confidence;
        if (matchedRisk) {
            // Risk-based action: mitigate headwind
            const isHighVolume = matchedRisk.impactScore >= 100;
            const isHighSeverity = matchedRisk.severity === "HIGH";
            expectedImpact = `Remove the largest ${matchedRisk.category === "CONCENTRATION" ? "concentration exposure" : "performance headwind"} from ${action.relatedEntity}.`;
            // Confidence based on volume + severity signal strength
            if (isHighVolume && isHighSeverity) {
                confidence = "HIGH";
            }
            else if (isHighVolume || isHighSeverity) {
                confidence = "MEDIUM";
            }
            else {
                confidence = "LOW";
            }
        }
        else if (matchedOpp) {
            // Opportunity-based action: scale upside
            const isHighImpact = matchedOpp.impactScore >= 50;
            const isHighSeverity = matchedOpp.severity === "HIGH";
            expectedImpact = `Increase exposure to the strongest positive contributor and accelerate ${action.relatedEntity} growth.`;
            if (isHighImpact && isHighSeverity) {
                confidence = "HIGH";
            }
            else if (isHighImpact || isHighSeverity) {
                confidence = "MEDIUM";
            }
            else {
                confidence = "LOW";
            }
        }
        else {
            // Generic fallback
            expectedImpact = `Address strategic priority related to ${action.relatedEntity}.`;
            confidence = "MEDIUM";
        }
        impacts.push({
            action: action.action,
            expectedImpact,
            confidence
        });
    }
    return impacts;
}
