import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { currentUser } from "../middleware/currentUser.js";
import { getDataset } from "../services/datasetService.js";
import { executeQuery } from "../services/queryExecutionService.js";
import { downloadDataset } from "../services/storageService.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET /deep-dives/hotel/:id
router.get("/hotel/:id", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { datasetId } = req.query;

        if (!datasetId) {
            return res.status(400).json({ error: "datasetId is required" });
        }

        let dataset: any = null;
        if (datasetId !== "demo") {
            dataset = await getDataset(datasetId as string);
            if (!dataset) {
                return res.status(404).json({ error: "Dataset not found" });
            }
        }

        const hotelName = decodeURIComponent(id as string);
        let winRateVal = 42.5;
        let volumeShareVal = 3.4;
        let totalQueriesVal = 12500;
        let priceCompVal = -1.2;
        let topSuppliersData = [
            { name: "Expedia", winRate: 45.2, share: 60 },
            { name: "Booking.com", winRate: 38.1, share: 30 },
            { name: "Hotelbeds", winRate: 25.4, share: 10 },
        ];

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await downloadDataset(dataset.storagePath);
            
            // Get total dataset row count for volume share
            const totalRes = await executeQuery<{ total: number }>(
                `SELECT COUNT(*) as total FROM data_table`, 
                localPath
            );
            const totalDatasetRows = Number(totalRes[0]?.total || 1);

            // Hotel overall metrics
            const sql = `
                SELECT 
                    COUNT(*) as totalQueries,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate,
                    AVG(CAST(price_diff_perc AS DOUBLE)) as priceComp
                FROM data_table
                WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
            `;
            const metricsRes = await executeQuery<{ totalQueries: number, winRate: number, priceComp: number }>(sql, localPath);
            const m = metricsRes[0];

            if (m && m.totalQueries > 0) {
                totalQueriesVal = Number(m.totalQueries);
                winRateVal = Number(m.winRate || 0);
                priceCompVal = Number(m.priceComp || 0);
                volumeShareVal = (totalQueriesVal / totalDatasetRows) * 100;
            }

            // Top suppliers for this hotel
            const supplierSql = `
                SELECT 
                    suppliername as name, 
                    COUNT(*) as volume,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
                FROM data_table
                WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
                GROUP BY suppliername
                ORDER BY volume DESC
                LIMIT 5
            `;
            const suppliersRes = await executeQuery<{ name: string, volume: number, winRate: number }>(supplierSql, localPath);
            
            topSuppliersData = suppliersRes.map(s => ({
                name: s.name,
                winRate: Number(Number(s.winRate).toFixed(1)),
                share: Number(((Number(s.volume) / totalQueriesVal) * 100).toFixed(1))
            }));
        }

        return res.json({
            id: hotelName,
            name: hotelName,
            type: "HOTEL",
            metrics: {
                winRate: { value: Number(winRateVal.toFixed(1)), delta: 0, trend: "flat" },
                priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)), delta: 0, trend: "flat" },
                volumeShare: { value: Number(volumeShareVal.toFixed(1)), delta: 0, trend: "flat" },
                totalQueries: { value: totalQueriesVal, delta: 0, trend: "flat" },
            },
            topSuppliers: topSuppliersData,
            riskAssessment: {
                level: "HIGH",
                primaryRisk: "Price competitiveness declining on weekend check-ins against Booking.com.",
            },
            trendData: {
                winRate: [
                    { date: "Apr 6", current: 46, market: 50 },
                    { date: "Apr 13", current: 48, market: 49 },
                    { date: "Apr 20", current: 44, market: 48 },
                    { date: "Apr 27", current: 47, market: 50 },
                    { date: "May 4", current: 43, market: 49 },
                    { date: "May 11", current: 41, market: 47 },
                    { date: "May 18", current: 40, market: 47 },
                    { date: "May 25", current: 42, market: 46 },
                    { date: "Jun 1", current: 39, market: 45 },
                    { date: "Jun 8", current: 41, market: 45 },
                    { date: "Jun 15", current: 44, market: 46 },
                    { date: "Jun 22", current: 43, market: 45 },
                    { date: "Jun 29", current: 38, market: 44 },
                ],
                priceGap: [
                    { date: "Apr 6", current: 8.2, market: 3.1 },
                    { date: "Apr 13", current: 9.1, market: 3.4 },
                    { date: "Apr 20", current: 7.8, market: 3.2 },
                    { date: "Apr 27", current: 8.5, market: 3.5 },
                    { date: "May 4", current: 7.2, market: 3.0 },
                    { date: "May 11", current: 6.9, market: 2.8 },
                    { date: "May 18", current: 7.5, market: 3.1 },
                    { date: "May 25", current: 8.1, market: 3.3 },
                    { date: "Jun 1", current: 6.3, market: 2.5 },
                    { date: "Jun 8", current: 6.8, market: 2.7 },
                    { date: "Jun 15", current: 7.6, market: 2.9 },
                    { date: "Jun 22", current: 7.4, market: 2.8 },
                    { date: "Jun 29", current: 6.1, market: 2.6 },
                ],
                apw: [
                    { date: "Apr 6", d10: 50, d15: 45, d30: 42, d45: 60, d60: 25, d90: 52 },
                    { date: "Apr 13", d10: 48, d15: 46, d30: 40, d45: 55, d60: 22, d90: 48 },
                    { date: "Apr 20", d10: 45, d15: 42, d30: 38, d45: 52, d60: 20, d90: 45 },
                    { date: "Apr 27", d10: 49, d15: 47, d30: 41, d45: 58, d60: 24, d90: 50 },
                    { date: "May 4", d10: 42, d15: 40, d30: 35, d45: 50, d60: 18, d90: 42 },
                    { date: "May 11", d10: 40, d15: 38, d30: 33, d45: 48, d60: 17, d90: 40 },
                    { date: "May 18", d10: 44, d15: 42, d30: 37, d45: 52, d60: 20, d90: 44 },
                    { date: "May 25", d10: 46, d15: 45, d30: 39, d45: 55, d60: 22, d90: 47 },
                    { date: "Jun 1", d10: 41, d15: 39, d30: 34, d45: 49, d60: 18, d90: 41 },
                    { date: "Jun 8", d10: 43, d15: 41, d30: 36, d45: 51, d60: 19, d90: 43 },
                    { date: "Jun 15", d10: 48, d15: 46, d30: 40, d45: 56, d60: 23, d90: 49 },
                    { date: "Jun 22", d10: 45, d15: 43, d30: 38, d45: 54, d60: 21, d90: 46 },
                    { date: "Jun 29", d10: 40, d15: 38, d30: 33, d45: 48, d60: 17, d90: 40 },
                ]
            },
            distribution: {
                winMargin: { avg: 6.2, median: 4.1 },
                lossMargin: { avg: -8.7, median: -6.3 },
                segments: { winHigh: 17, winLow: 28, within: 22, lossLow: 20, lossHigh: 13 }
            },
            insights: [
                "Weekend performance declined by 4.2pp vs previous period",
                "46-60 days APW bucket showing weakest performance (21% win rate)",
                "Average loss margin improved by 1.1pp"
            ]
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch hotel deep dive");
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/supplier/:id
router.get("/supplier/:id", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { datasetId } = req.query;

        if (!datasetId) {
            return res.status(400).json({ error: "datasetId is required" });
        }

        let dataset: any = null;
        if (datasetId !== "demo") {
            dataset = await getDataset(datasetId as string);
            if (!dataset) {
                return res.status(404).json({ error: "Dataset not found" });
            }
        }

        const supplierName = decodeURIComponent(id as string);
        
        let winRateVal = 38.2;
        let volumeShareVal = 25.0;
        let totalQueriesVal = 85000;
        let priceCompVal = -0.8;
        let topHotelsData = [
            { name: "Hilton London", winRate: 55.2, share: 5 },
            { name: "Marriott Paris", winRate: 48.1, share: 4 },
            { name: "Sofitel Rome", winRate: 42.4, share: 3 },
        ];

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await downloadDataset(dataset.storagePath);
            
            // Get total dataset row count for volume share
            const totalRes = await executeQuery<{ total: number }>(
                `SELECT COUNT(*) as total FROM data_table`, 
                localPath
            );
            const totalDatasetRows = Number(totalRes[0]?.total || 1);

            // Supplier overall metrics
            const sql = `
                SELECT 
                    COUNT(*) as totalQueries,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate,
                    AVG(CAST(price_diff_perc AS DOUBLE)) as priceComp
                FROM data_table
                WHERE suppliername ILIKE '%${supplierName.replace(/'/g, "''")}%'
            `;
            const metricsRes = await executeQuery<{ totalQueries: number, winRate: number, priceComp: number }>(sql, localPath);
            const m = metricsRes[0];

            if (m && m.totalQueries > 0) {
                totalQueriesVal = Number(m.totalQueries);
                winRateVal = Number(m.winRate || 0);
                priceCompVal = Number(m.priceComp || 0);
                volumeShareVal = (totalQueriesVal / totalDatasetRows) * 100;
            }

            // Top hotels for this supplier
            const hotelSql = `
                SELECT 
                    tbo_hotelname as name, 
                    COUNT(*) as volume,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
                FROM data_table
                WHERE suppliername ILIKE '%${supplierName.replace(/'/g, "''")}%'
                GROUP BY tbo_hotelname
                ORDER BY volume DESC
                LIMIT 5
            `;
            const hotelsRes = await executeQuery<{ name: string, volume: number, winRate: number }>(hotelSql, localPath);
            
            topHotelsData = hotelsRes.map(h => ({
                name: h.name,
                winRate: Number(Number(h.winRate).toFixed(1)),
                share: Number(((Number(h.volume) / totalQueriesVal) * 100).toFixed(1))
            }));
        }

        return res.json({
            id: supplierName,
            name: supplierName,
            type: "SUPPLIER",
            metrics: {
                winRate: { value: Number(winRateVal.toFixed(1)), delta: 0, trend: "flat" },
                priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)), delta: 0, trend: "flat" },
                volumeShare: { value: Number(volumeShareVal.toFixed(1)), delta: 0, trend: "flat" },
                totalQueries: { value: totalQueriesVal, delta: 0, trend: "flat" },
            },
            topHotels: topHotelsData,
            opportunityAssessment: {
                level: "HIGH",
                primaryOpportunity: "Strong pricing advantage detected in European capitals. Increase marketing spend for these regions.",
            }
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch supplier deep dive");
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/chain/:id
router.get("/chain/:id", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { datasetId } = req.query;

        if (!datasetId) {
            return res.status(400).json({ error: "datasetId is required" });
        }

        let dataset: any = null;
        if (datasetId !== "demo") {
            dataset = await getDataset(datasetId as string);
            if (!dataset) {
                return res.status(404).json({ error: "Dataset not found" });
            }
        }

        const chainName = decodeURIComponent(id as string);
        
        let winRateVal = 40.5;
        let volumeShareVal = 15.0;
        let totalQueriesVal = 45000;
        let priceCompVal = -0.5;
        let topPropertiesData = [
            { name: "Hilton London", winRate: 50.2, share: 8 },
            { name: "Hilton Paris", winRate: 45.1, share: 6 },
            { name: "Hilton Rome", winRate: 40.4, share: 4 },
        ];

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await downloadDataset(dataset.storagePath);
            
            // Get total dataset row count for volume share
            const totalRes = await executeQuery<{ total: number }>(
                `SELECT COUNT(*) as total FROM data_table`, 
                localPath
            );
            const totalDatasetRows = Number(totalRes[0]?.total || 1);

            // Chain overall metrics
            // We use a LIKE clause to approximate chain
            const sql = `
                SELECT 
                    COUNT(*) as totalQueries,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate,
                    AVG(CAST(price_diff_perc AS DOUBLE)) as priceComp
                FROM data_table
                WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
            `;
            const metricsRes = await executeQuery<{ totalQueries: number, winRate: number, priceComp: number }>(sql, localPath);
            const m = metricsRes[0];

            if (m && m.totalQueries > 0) {
                totalQueriesVal = Number(m.totalQueries);
                winRateVal = Number(m.winRate || 0);
                priceCompVal = Number(m.priceComp || 0);
                volumeShareVal = (totalQueriesVal / totalDatasetRows) * 100;
            }

            // Top properties for this chain
            const propSql = `
                SELECT 
                    tbo_hotelname as name, 
                    COUNT(*) as volume,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
                FROM data_table
                WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
                GROUP BY tbo_hotelname
                ORDER BY volume DESC
                LIMIT 5
            `;
            const propsRes = await executeQuery<{ name: string, volume: number, winRate: number }>(propSql, localPath);
            
            topPropertiesData = propsRes.map(p => ({
                name: p.name,
                winRate: Number(Number(p.winRate).toFixed(1)),
                share: Number(((Number(p.volume) / totalQueriesVal) * 100).toFixed(1))
            }));
        }

        return res.json({
            id: chainName,
            name: chainName,
            type: "CHAIN",
            metrics: {
                winRate: { value: Number(winRateVal.toFixed(1)), delta: 0, trend: "flat" },
                priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)), delta: 0, trend: "flat" },
                volumeShare: { value: Number(volumeShareVal.toFixed(1)), delta: 0, trend: "flat" },
                totalQueries: { value: totalQueriesVal, delta: 0, trend: "flat" },
            },
            topProperties: topPropertiesData,
            opportunityAssessment: {
                level: "MEDIUM",
                primaryOpportunity: "Significant growth potential in Dubai market through targeted weekend promotions.",
            },
            trendData: {
                winRate: [
                    { date: "Apr 6", current: 46, market: 50 },
                    { date: "Apr 13", current: 48, market: 49 },
                    { date: "Apr 20", current: 44, market: 48 },
                    { date: "Apr 27", current: 47, market: 50 },
                    { date: "May 4", current: 43, market: 49 },
                    { date: "May 11", current: 41, market: 47 },
                    { date: "May 18", current: 40, market: 47 },
                    { date: "May 25", current: 42, market: 46 },
                    { date: "Jun 1", current: 39, market: 45 },
                    { date: "Jun 8", current: 41, market: 45 },
                    { date: "Jun 15", current: 44, market: 46 },
                    { date: "Jun 22", current: 43, market: 45 },
                    { date: "Jun 29", current: 38, market: 44 },
                ],
                priceGap: [
                    { date: "Apr 6", current: 8.2, market: 3.1 },
                    { date: "Apr 13", current: 9.1, market: 3.4 },
                    { date: "Apr 20", current: 7.8, market: 3.2 },
                    { date: "Apr 27", current: 8.5, market: 3.5 },
                    { date: "May 4", current: 7.2, market: 3.0 },
                    { date: "May 11", current: 6.9, market: 2.8 },
                    { date: "May 18", current: 7.5, market: 3.1 },
                    { date: "May 25", current: 8.1, market: 3.3 },
                    { date: "Jun 1", current: 6.3, market: 2.5 },
                    { date: "Jun 8", current: 6.8, market: 2.7 },
                    { date: "Jun 15", current: 7.6, market: 2.9 },
                    { date: "Jun 22", current: 7.4, market: 2.8 },
                    { date: "Jun 29", current: 6.1, market: 2.6 },
                ],
                apw: [
                    { date: "Apr 6", d10: 50, d15: 45, d30: 42, d45: 60, d60: 25, d90: 52 },
                    { date: "Apr 13", d10: 48, d15: 46, d30: 40, d45: 55, d60: 22, d90: 48 },
                    { date: "Apr 20", d10: 45, d15: 42, d30: 38, d45: 52, d60: 20, d90: 45 },
                    { date: "Apr 27", d10: 49, d15: 47, d30: 41, d45: 58, d60: 24, d90: 50 },
                    { date: "May 4", d10: 42, d15: 40, d30: 35, d45: 50, d60: 18, d90: 42 },
                    { date: "May 11", d10: 40, d15: 38, d30: 33, d45: 48, d60: 17, d90: 40 },
                    { date: "May 18", d10: 44, d15: 42, d30: 37, d45: 52, d60: 20, d90: 44 },
                    { date: "May 25", d10: 46, d15: 45, d30: 39, d45: 55, d60: 22, d90: 47 },
                    { date: "Jun 1", d10: 41, d15: 39, d30: 34, d45: 49, d60: 18, d90: 41 },
                    { date: "Jun 8", d10: 43, d15: 41, d30: 36, d45: 51, d60: 19, d90: 43 },
                    { date: "Jun 15", d10: 48, d15: 46, d30: 40, d45: 56, d60: 23, d90: 49 },
                    { date: "Jun 22", d10: 45, d15: 43, d30: 38, d45: 54, d60: 21, d90: 46 },
                    { date: "Jun 29", d10: 40, d15: 38, d30: 33, d45: 48, d60: 17, d90: 40 },
                ]
            },
            distribution: {
                winMargin: { avg: 6.2, median: 4.1 },
                lossMargin: { avg: -8.7, median: -6.3 },
                segments: { winHigh: 17, winLow: 28, within: 22, lossLow: 20, lossHigh: 13 }
            },
            insights: [
                "Overall chain volume grew by 8.4% month-over-month",
                "Pricing strategy in APAC region showing strong positive returns",
                "Luxury tier properties outperforming mid-scale by 12pp"
            ]
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch chain deep dive");
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

export default router;
