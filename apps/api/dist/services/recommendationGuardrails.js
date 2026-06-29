const MIN_VOLUME_SHARE = 1;
const MIN_CONFIDENCE_SCORE = 0;
/**
 * Validates that a pack has sufficient signal before generating recommendations.
 */
export function validateRecommendationGuardrails(executivePack, options) {
    const requirePrimaryTarget = options?.requirePrimaryTarget ?? true;
    const requireRecommendations = options?.requireRecommendations ?? false;
    if (!executivePack) {
        return {
            allowed: false,
            reason: "NO_EXECUTIVE_PACK",
            safeExplanation: "Insufficient analytical signal to generate recommendations. Try narrowing your question to a specific segment or metric."
        };
    }
    if (requirePrimaryTarget && !executivePack.primaryTarget) {
        return {
            allowed: false,
            reason: "NO_PRIMARY_TARGET",
            safeExplanation: "No actionable primary target could be identified from the current data. Try querying a segment with more volume or a different dimension."
        };
    }
    const target = executivePack.primaryTarget;
    if (target && target.volumeShare < MIN_VOLUME_SHARE) {
        return {
            allowed: false,
            reason: "LOW_VOLUME",
            safeExplanation: `The identified target "${target.name}" has insufficient volume (${target.volumeShare.toFixed(1)}% share) to support a confident recommendation.`
        };
    }
    if (target && Math.abs(target.actionabilityScore) <= MIN_CONFIDENCE_SCORE) {
        return {
            allowed: false,
            reason: "LOW_CONFIDENCE",
            safeExplanation: "The analytical signal is too weak to generate a confident recommendation. Consider broadening the query scope."
        };
    }
    if (requireRecommendations && (!executivePack.recommendations || executivePack.recommendations.length === 0)) {
        return {
            allowed: false,
            reason: "NO_RECOMMENDATIONS",
            safeExplanation: "No actionable targets could be identified from the current data to form a strategic recommendation."
        };
    }
    return { allowed: true };
}
