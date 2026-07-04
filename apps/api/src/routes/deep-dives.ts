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

        let trendWinRate: any[] = [];
        let trendPriceGap: any[] = [];
        let trendApw: any[] = [];
        let distribution = {
            winMargin: { avg: 6.2, median: 4.1 },
            lossMargin: { avg: -8.7, median: -6.3 },
            segments: { winHigh: 17, winLow: 28, within: 22, lossLow: 20, lossHigh: 13 }
        };

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await downloadDataset(dataset.storagePath);
            
            // Validate existence
            const countRes = await executeQuery<{ count: number }>(
                `SELECT COUNT(*) as count FROM data_table WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'`, 
                localPath
            );
            if (Number(countRes[0]?.count || 0) === 0) {
                return res.status(404).json({ error: `Hotel '${hotelName}' not found in dataset.` });
            }

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

            try {
                // Check if scraped_date exists
                const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
                const hasDate = schema.some(c => c.column_name.toLowerCase() === 'scraped_date');
                
                if (hasDate) {
                    const trendSql = `
                        SELECT 
                            scraped_date as date,
                            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as current,
                            AVG(CAST(price_diff_perc AS DOUBLE)) as gap
                        FROM data_table
                        WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
                        GROUP BY scraped_date
                        ORDER BY scraped_date ASC
                    `;
                    const trendRes = await executeQuery<any>(trendSql, localPath);
                    trendRes.forEach(r => {
                        trendWinRate.push({ date: r.date, current: Number(Number(r.current).toFixed(1)), market: 50 });
                        trendPriceGap.push({ date: r.date, current: Number(Number(r.gap).toFixed(1)), market: 3.0 });
                    });
                    
                    const apwSql = `
                        SELECT 
                            scraped_date as date,
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d60,
                            AVG(CASE WHEN apw_bucket_new = '60+ days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d90
                        FROM data_table
                        WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
                        GROUP BY scraped_date
                        ORDER BY scraped_date ASC
                    `;
                    const apwRes = await executeQuery<any>(apwSql, localPath);
                    trendApw = apwRes.map(r => ({
                        date: r.date,
                        d10: Number(Number(r.d10).toFixed(1)),
                        d15: Number(Number(r.d15).toFixed(1)),
                        d30: Number(Number(r.d30).toFixed(1)),
                        d45: Number(Number(r.d45).toFixed(1)),
                        d60: Number(Number(r.d60).toFixed(1)),
                        d90: Number(Number(r.d90).toFixed(1))
                    }));
                }
            } catch (e) {
                logger.error({ err: e }, "Trend data error:");
            }

            try {
                const distSql = `
                    SELECT 
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as avg_win,
                        MEDIAN(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as med_win,
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as avg_loss,
                        MEDIAN(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as med_loss,
                        
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 10 THEN 1 END) as win_high,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 2 AND CAST(price_diff_perc AS DOUBLE) <= 10 THEN 1 END) as win_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) >= -2 AND CAST(price_diff_perc AS DOUBLE) <= 2 THEN 1 END) as within,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -2 AND CAST(price_diff_perc AS DOUBLE) >= -10 THEN 1 END) as loss_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -10 THEN 1 END) as loss_high,
                        COUNT(*) as total
                    FROM data_table
                    WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
                `;
                const distRes = await executeQuery<any>(distSql, localPath);
                if (distRes.length > 0 && distRes[0].total > 0) {
                    const r = distRes[0];
                    const t = Number(r.total);
                    distribution = {
                        winMargin: { avg: Number(Number(r.avg_win || 0).toFixed(1)), median: Number(Number(r.med_win || 0).toFixed(1)) },
                        lossMargin: { avg: Number(Number(r.avg_loss || 0).toFixed(1)), median: Number(Number(r.med_loss || 0).toFixed(1)) },
                        segments: {
                            winHigh: Math.round((Number(r.win_high) / t) * 100),
                            winLow: Math.round((Number(r.win_low) / t) * 100),
                            within: Math.round((Number(r.within) / t) * 100),
                            lossLow: Math.round((Number(r.loss_low) / t) * 100),
                            lossHigh: Math.round((Number(r.loss_high) / t) * 100),
                        }
                    };
                }
            } catch (e) {
                logger.error({ err: e }, "Distribution error:");
            }
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
                    winRate: trendWinRate,
                    priceGap: trendPriceGap,
                    apw: trendApw
                },
                distribution: distribution,
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

        let trendWinRate: any[] = [];
        let trendPriceGap: any[] = [];
        let trendApw: any[] = [];
        let distribution = {
            winMargin: { avg: 6.2, median: 4.1 },
            lossMargin: { avg: -8.7, median: -6.3 },
            segments: { winHigh: 17, winLow: 28, within: 22, lossLow: 20, lossHigh: 13 }
        };

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await downloadDataset(dataset.storagePath);
            
            // Validate existence
            const countRes = await executeQuery<{ count: number }>(
                `SELECT COUNT(*) as count FROM data_table WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'`, 
                localPath
            );
            if (Number(countRes[0]?.count || 0) === 0) {
                return res.status(404).json({ error: `Chain '${chainName}' not found in dataset.` });
            }

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
            
            topPropertiesData = propsRes.map((p: any) => ({
                name: p.name,
                winRate: Number(Number(p.winRate).toFixed(1)),
                share: Number(((Number(p.volume) / totalQueriesVal) * 100).toFixed(1))
            }));

            try {
                // Check if scraped_date exists
                const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
                const hasDate = schema.some(c => c.column_name.toLowerCase() === 'scraped_date');
                
                if (hasDate) {
                    const trendSql = `
                        SELECT 
                            scraped_date as date,
                            AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as current,
                            AVG(CAST(price_diff_perc AS DOUBLE)) as gap
                        FROM data_table
                        WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
                        GROUP BY scraped_date
                        ORDER BY scraped_date ASC
                    `;
                    const trendRes = await executeQuery<any>(trendSql, localPath);
                    trendRes.forEach(r => {
                        trendWinRate.push({ date: r.date, current: Number(Number(r.current).toFixed(1)), market: 50 });
                        trendPriceGap.push({ date: r.date, current: Number(Number(r.gap).toFixed(1)), market: 3.0 });
                    });
                    
                    const apwSql = `
                        SELECT 
                            scraped_date as date,
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d60,
                            AVG(CASE WHEN apw_bucket_new = '60+ days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as d90
                        FROM data_table
                        WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
                        GROUP BY scraped_date
                        ORDER BY scraped_date ASC
                    `;
                    const apwRes = await executeQuery<any>(apwSql, localPath);
                    trendApw = apwRes.map(r => ({
                        date: r.date,
                        d10: Number(Number(r.d10).toFixed(1)),
                        d15: Number(Number(r.d15).toFixed(1)),
                        d30: Number(Number(r.d30).toFixed(1)),
                        d45: Number(Number(r.d45).toFixed(1)),
                        d60: Number(Number(r.d60).toFixed(1)),
                        d90: Number(Number(r.d90).toFixed(1))
                    }));
                }
            } catch (e) {
                logger.error({ err: e }, "Trend data error:");
            }

            try {
                const distSql = `
                    SELECT 
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as avg_win,
                        MEDIAN(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as med_win,
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as avg_loss,
                        MEDIAN(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as med_loss,
                        
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 10 THEN 1 END) as win_high,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 2 AND CAST(price_diff_perc AS DOUBLE) <= 10 THEN 1 END) as win_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) >= -2 AND CAST(price_diff_perc AS DOUBLE) <= 2 THEN 1 END) as within,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -2 AND CAST(price_diff_perc AS DOUBLE) >= -10 THEN 1 END) as loss_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -10 THEN 1 END) as loss_high,
                        COUNT(*) as total
                    FROM data_table
                    WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
                `;
                const distRes = await executeQuery<any>(distSql, localPath);
                if (distRes.length > 0 && distRes[0].total > 0) {
                    const r = distRes[0];
                    const t = Number(r.total);
                    distribution = {
                        winMargin: { avg: Number(Number(r.avg_win || 0).toFixed(1)), median: Number(Number(r.med_win || 0).toFixed(1)) },
                        lossMargin: { avg: Number(Number(r.avg_loss || 0).toFixed(1)), median: Number(Number(r.med_loss || 0).toFixed(1)) },
                        segments: {
                            winHigh: Math.round((Number(r.win_high) / t) * 100),
                            winLow: Math.round((Number(r.win_low) / t) * 100),
                            within: Math.round((Number(r.within) / t) * 100),
                            lossLow: Math.round((Number(r.loss_low) / t) * 100),
                            lossHigh: Math.round((Number(r.loss_high) / t) * 100),
                        }
                    };
                }
            } catch (e) {
                logger.error({ err: e }, "Distribution error:");
            }
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
                winRate: trendWinRate,
                priceGap: trendPriceGap,
                apw: trendApw
            },
            distribution: distribution,
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
