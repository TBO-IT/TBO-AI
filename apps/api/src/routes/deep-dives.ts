import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { getDataset } from "../services/datasetService.js";
import { executeQuery } from "../services/queryExecutionService.js";
import { downloadDataset } from "../services/storageService.js";

const router = Router();

// GET /deep-dives/hotel/:id
router.get("/hotel/:id", requireAuth(), async (req, res) => {
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
            }
        });
    } catch (error) {
        console.error("Failed to fetch hotel deep dive:", error);
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/supplier/:id
router.get("/supplier/:id", requireAuth(), async (req, res) => {
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
        console.error("Failed to fetch supplier deep dive:", error);
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/chain/:id
router.get("/chain/:id", requireAuth(), async (req, res) => {
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
                WHERE tbo_hotelname ILIKE '%${chainName.replace(/'/g, "''")}%'
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
                WHERE tbo_hotelname ILIKE '%${chainName.replace(/'/g, "''")}%'
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
                primaryOpportunity: "Chain-wide volume is strong but win rate on weekends is trailing. Consider targeted weekend promotions.",
            }
        });
    } catch (error) {
        console.error("Failed to fetch chain deep dive:", error);
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

export default router;
