import { Router } from "express";
import { getMetrics } from "../services/analyticsMetrics.js";
import { getCostDashboard } from "../services/claudeCostTracker.js";
const router = Router();
/**
 * GET /api/metrics
 *
 * Returns analytics platform metrics + Claude cost dashboard.
 */
router.get("/", (_req, res) => {
    const metrics = getMetrics();
    const claudeCosts = getCostDashboard();
    return res.json({
        analytics: metrics,
        claudeCosts,
        timestamp: new Date().toISOString()
    });
});
export default router;
