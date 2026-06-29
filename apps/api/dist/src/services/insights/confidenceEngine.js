// ─── Confidence Engine ────────────────────────────────────────────────────────
//
// Assesses overall analytical confidence based on:
//   - Volume (data size)
//   - Volume share coverage
//   - Magnitude of movements
//   - Number of observations / drivers
//
// Deterministic. Claude does NOT generate these.
// ───────────────────────────────────────────────────────────────────────────────
export function assessConfidence(drivers, totalRows) {
    let score = 0;
    const reasons = [];
    // ─── Factor 1: Data volume ──────────────────────────────────────────────
    if (totalRows >= 20) {
        score += 2;
        reasons.push("Large dataset");
    }
    else if (totalRows >= 5) {
        score += 1;
        reasons.push("Moderate dataset");
    }
    else {
        reasons.push("Small sample size");
    }
    // ─── Factor 2: Volume share coverage ────────────────────────────────────
    const totalVolumeShare = drivers.reduce((sum, d) => sum + d.volumeSharePct, 0);
    if (totalVolumeShare >= 50) {
        score += 2;
        reasons.push("High volume coverage");
    }
    else if (totalVolumeShare >= 20) {
        score += 1;
        reasons.push("Moderate volume coverage");
    }
    else {
        reasons.push("Limited volume coverage");
    }
    // ─── Factor 3: Magnitude of movement ────────────────────────────────────
    const hasLargeMovement = drivers.some(d => Math.abs(d.metricDelta) >= 5);
    const hasVeryLargeMovement = drivers.some(d => Math.abs(d.metricDelta) >= 10);
    if (hasVeryLargeMovement) {
        score += 2;
        reasons.push("Large movement magnitude");
    }
    else if (hasLargeMovement) {
        score += 1;
        reasons.push("Moderate movement magnitude");
    }
    else {
        reasons.push("Limited movement magnitude");
    }
    // ─── Factor 4: Number of consistent signals ─────────────────────────────
    const directionalCount = drivers.length;
    if (directionalCount >= 5) {
        score += 2;
        reasons.push("Multiple consistent signals");
    }
    else if (directionalCount >= 3) {
        score += 1;
        reasons.push("Some directional signals");
    }
    else {
        reasons.push("Few observations");
    }
    // ─── Determine confidence level ─────────────────────────────────────────
    let confidence;
    if (score >= 6) {
        confidence = "HIGH";
    }
    else if (score >= 3) {
        confidence = "MEDIUM";
    }
    else {
        confidence = "LOW";
    }
    return {
        confidence,
        rationale: `${confidence} CONFIDENCE: ${reasons.join(". ")}.`
    };
}
