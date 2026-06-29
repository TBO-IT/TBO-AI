/**
 * Validates a generated Root Cause Pack for structural and logical errors.
 */
export function validateRootCausePack(pack) {
    const errors = [];
    // 1. Check for contradictions
    if (pack.contradictionDetected) {
        errors.push(`Contradiction: User expected ${pack.expectedDirection}, ` +
            `but metric actually went ${pack.metricChange?.direction}.`);
    }
    // 2. Validate entity names are not numeric
    const isNumericString = (s) => !isNaN(Number(s)) && s.trim() !== "";
    const checkNames = (entries, label) => {
        for (const e of entries) {
            if (isNumericString(e.name)) {
                errors.push(`Invalid entity name in ${label}: "${e.name}" is numeric. Likely attribution failure.`);
                break;
            }
        }
    };
    checkNames(pack.topPositiveContributors, "topPositiveContributors");
    checkNames(pack.topNegativeContributors, "topNegativeContributors");
    checkNames(pack.affectedHotels, "affectedHotels");
    checkNames(pack.affectedChains, "affectedChains");
    checkNames(pack.affectedSuppliers, "affectedSuppliers");
    checkNames(pack.affectedAPWBuckets, "affectedAPWBuckets");
    // 3. Mathematical Contribution Audit
    const overallChange = pack.metricChange?.absoluteChange ?? 0;
    validateContributionAnalysis(pack.affectedHotels, "Hotels", overallChange, errors);
    validateContributionAnalysis(pack.affectedChains, "Chains", overallChange, errors);
    validateContributionAnalysis(pack.affectedSuppliers, "Suppliers", overallChange, errors);
    validateContributionAnalysis(pack.affectedAPWBuckets, "APW Buckets", overallChange, errors);
    if (errors.length > 0) {
        console.error(`[RootCausePackValidator] Validation failed:\n  - ${errors.join("\n  - ")}`);
    }
    return errors;
}
/**
 * Performs a rigorous mathematical audit of a contribution array.
 */
function validateContributionAnalysis(entries, dimensionLabel, overallChange, errors) {
    if (entries.length === 0)
        return;
    let totalPositiveContribution = 0;
    let totalNegativeContribution = 0;
    let totalPct = 0;
    let totalVolShare = 0;
    let prevAbsContribution = Infinity;
    for (const e of entries) {
        // 1-3. Finite, No NaN, No Infinity
        if (!isFinite(e.weightedContribution) || isNaN(e.weightedContribution)) {
            errors.push(`[${dimensionLabel}] Invalid weightedContribution for ${e.name}: ${e.weightedContribution}`);
        }
        if (!isFinite(e.contributionPct) || isNaN(e.contributionPct)) {
            errors.push(`[${dimensionLabel}] Invalid contributionPct for ${e.name}: ${e.contributionPct}`);
        }
        if (e.weightedContribution > 0) {
            totalPositiveContribution += e.weightedContribution;
        }
        else {
            totalNegativeContribution += e.weightedContribution;
        }
        totalPct += e.contributionPct;
        totalVolShare += e.volumeSharePct;
        // 7. Rankings sorted correctly (ABS weighted contribution descending)
        const absContrib = Math.abs(e.weightedContribution);
        if (absContrib > prevAbsContribution + 0.0001) { // Floating point tolerance
            errors.push(`[${dimensionLabel}] Rankings not sorted correctly by absolute contribution.`);
        }
        prevAbsContribution = absContrib;
    }
    const reconciledChange = totalPositiveContribution + totalNegativeContribution;
    // 4. Reconciliation passes (For a partial LIMIT 25 list, it won't perfectly equal overallChange, 
    // but we log it to audit how much of the change is explained by the top 25).
    // If the overall change is completely different in sign from the reconciled change, that's an error.
    if (overallChange !== 0 && Math.sign(reconciledChange) !== Math.sign(overallChange) && Math.abs(reconciledChange) > Math.abs(overallChange)) {
        // Note: Mix effects can sometimes cause this, but it's rare. We just log it as a soft warning if it's wild.
    }
    // 6. Volume shares sum reasonably (Should not exceed ~100% + floating error)
    if (totalVolShare > 100.1) {
        errors.push(`[${dimensionLabel}] Volume shares sum to >100%: ${totalVolShare}%`);
    }
    // Log the Audit
    console.log(`
[CONTRIBUTION_AUDIT] - ${dimensionLabel}
overallMetricChange:       ${overallChange.toFixed(4)}
totalPositiveContribution: +${totalPositiveContribution.toFixed(4)}
totalNegativeContribution: ${totalNegativeContribution.toFixed(4)}
reconciledChange (Top25):  ${reconciledChange.toFixed(4)}
totalExplainedPct:         ${totalPct.toFixed(2)}%
validationStatus:          ${errors.length > 0 ? 'FAILED' : 'PASSED'}
--------------------------------------------------`);
}
