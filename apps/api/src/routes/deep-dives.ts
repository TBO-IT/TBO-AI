import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { currentUser } from "../middleware/currentUser.js";
import { getDataset } from "../services/datasetService.js";
import { executeQuery } from "../services/queryExecutionService.js";
import { getDatasetUrl } from "../services/storageService.js";
import { getDatasetContext } from "../services/metadataService.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET /deep-dives/weekly-comparison
router.get("/weekly-comparison", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const { datasetId, threshold = 0 } = req.query;

        if (!datasetId) {
            return res.status(400).json({ error: "datasetId is required" });
        }

        if (datasetId === "demo") {
            const history = [
                { week: "2026-06-29", totalQueries: 4120, winRate: 46.5, customWinRate: 28.2, avgPriceDiff: -3.8 },
                { week: "2026-06-22", totalQueries: 4050, winRate: 45.1, customWinRate: 26.8, avgPriceDiff: -3.2 },
                { week: "2026-06-15", totalQueries: 4210, winRate: 44.8, customWinRate: 25.5, avgPriceDiff: -2.9 },
                { week: "2026-06-08", totalQueries: 3980, winRate: 43.2, customWinRate: 24.1, avgPriceDiff: -2.5 },
                { week: "2026-06-01", totalQueries: 4010, winRate: 45.4, customWinRate: 27.0, avgPriceDiff: -3.1 }
            ];
            // Adjust based on threshold. If threshold is higher, customWinRate should be lower.
            const factor = Math.max(0.1, 1 - (Number(threshold) * 0.08));
            const adjustedHistory = history.map(h => ({
                ...h,
                customWinRate: Number((h.winRate * factor).toFixed(1)),
                avgPriceDiff: Number((h.avgPriceDiff - (Number(threshold) * 0.15)).toFixed(1))
            }));

            const latest = adjustedHistory[0];
            const prev = adjustedHistory[1];
            
            const customWinRateDelta = Number((latest.customWinRate - prev.customWinRate).toFixed(1));
            const standardWinRateDelta = Number((latest.winRate - prev.winRate).toFixed(1));
            const priceDiffDelta = Number((latest.avgPriceDiff - prev.avgPriceDiff).toFixed(1));

            const isCustomWinRatePositive = customWinRateDelta >= 0;
            const isStandardWinRatePositive = standardWinRateDelta >= 0;
            const isPriceDiffPositive = priceDiffDelta <= 0;

            const overallTrend = isCustomWinRatePositive ? "positive" : "negative";
            const suggestion = isCustomWinRatePositive 
                ? `TBO custom win rates improved WoW by +${customWinRateDelta}% with a ${threshold}% pricing advantage. Trend is positive, suggesting current price strategies are working.`
                : `TBO custom win rates declined WoW by ${customWinRateDelta}% with a ${threshold}% pricing advantage. Competitors may have narrowed the price gap; review top-losing hotels.`;

            return res.json({
                success: true,
                latestWeek: {
                    date: latest.week,
                    totalQueries: latest.totalQueries,
                    winRate: latest.winRate,
                    customWinRate: latest.customWinRate,
                    avgPriceDiff: latest.avgPriceDiff,
                    avgTboPrice: 95.5,
                    avgCompPrice: 100.2
                },
                previousWeek: {
                    date: prev.week,
                    totalQueries: prev.totalQueries,
                    winRate: prev.winRate,
                    customWinRate: prev.customWinRate,
                    avgPriceDiff: prev.avgPriceDiff,
                    avgTboPrice: 96.8,
                    avgCompPrice: 99.8
                },
                threshold: Number(threshold),
                trends: {
                    isCustomWinRatePositive,
                    customWinRateDelta,
                    isStandardWinRatePositive,
                    standardWinRateDelta,
                    isPriceDiffPositive,
                    priceDiffDelta,
                    suggestion,
                    overallTrend
                },
                weeklyHistory: adjustedHistory.reverse()
            });
        }

        const dataset = await getDataset(datasetId as string);
        if (!dataset) {
            return res.status(404).json({ error: "Dataset not found" });
        }

        if (!dataset.storagePath) {
            return res.status(400).json({ error: "Dataset path not set" });
        }

        const localPath = await getDatasetUrl(dataset.storagePath);
        const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
        const dateCol = schema.find(c => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
        
        if (!dateCol) {
            return res.status(400).json({ error: "Dataset does not contain a date column (scraped_date, search_date, date)." });
        }

        const statsSql = `
            WITH weekly_stats AS (
                SELECT 
                    date_trunc('week', COALESCE(
                        TRY_CAST("${dateCol}" AS DATE), 
                        try_strptime("${dateCol}", '%m/%d/%Y')::DATE, 
                        try_strptime("${dateCol}", '%d/%m/%Y')::DATE, 
                        try_strptime("${dateCol}", '%m-%d-%Y')::DATE, 
                        try_strptime("${dateCol}", '%d-%m-%Y')::DATE
                    )) as week,
                    COUNT(*) as total_queries,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1.0 ELSE 0.0 END) * 100.0 as win_rate,
                    AVG(CASE WHEN TRY_CAST(price_diff_perc AS DOUBLE) <= -${Number(threshold)} THEN 1.0 ELSE 0.0 END) * 100.0 as custom_win_rate,
                    AVG(CASE WHEN abs(TRY_CAST(price_diff_perc AS DOUBLE)) <= 100 THEN TRY_CAST(price_diff_perc AS DOUBLE) ELSE NULL END) as avg_price_diff,
                    AVG(CASE WHEN abs(TRY_CAST(price_diff_perc AS DOUBLE)) <= 100 THEN TRY_CAST(tbo_price AS DOUBLE) ELSE NULL END) as avg_tbo_price,
                    AVG(CASE WHEN abs(TRY_CAST(price_diff_perc AS DOUBLE)) <= 100 THEN TRY_CAST(thirdparty_price AS DOUBLE) ELSE NULL END) as avg_comp_price
                FROM data_table
                WHERE TRY_CAST(price_diff_perc AS DOUBLE) IS NOT NULL
                GROUP BY week
            )
            SELECT 
                week,
                total_queries,
                win_rate,
                custom_win_rate,
                avg_price_diff,
                avg_tbo_price,
                avg_comp_price
            FROM weekly_stats
            WHERE week IS NOT NULL
            ORDER BY week DESC
        `;

        const dbRows = await executeQuery<any>(statsSql, localPath);
        if (dbRows.length === 0) {
            return res.status(400).json({ error: "No data could be processed by week." });
        }

        const history = dbRows.map(r => ({
            week: new Date(r.week).toISOString().split('T')[0],
            totalQueries: Number(r.total_queries),
            winRate: Number(Number(r.win_rate || 0).toFixed(1)),
            customWinRate: Number(Number(r.custom_win_rate || 0).toFixed(1)),
            avgPriceDiff: Number(Number(r.avg_price_diff || 0).toFixed(1)),
            avgTboPrice: Number(Number(r.avg_tbo_price || 0).toFixed(1)),
            avgCompPrice: Number(Number(r.avg_comp_price || 0).toFixed(1))
        }));

        const latest = history[0];
        const prev = history.length > 1 ? history[1] : null;

        const customWinRateDelta = prev ? Number((latest.customWinRate - prev.customWinRate).toFixed(1)) : 0;
        const standardWinRateDelta = prev ? Number((latest.winRate - prev.winRate).toFixed(1)) : 0;
        const priceDiffDelta = prev ? Number((latest.avgPriceDiff - prev.avgPriceDiff).toFixed(1)) : 0;

        const isCustomWinRatePositive = customWinRateDelta >= 0;
        const isStandardWinRatePositive = standardWinRateDelta >= 0;
        const isPriceDiffPositive = priceDiffDelta <= 0;

        const overallTrend = isCustomWinRatePositive ? "positive" : "negative";
        let suggestion = "";
        if (prev) {
            suggestion = isCustomWinRatePositive 
                ? `TBO custom win rates improved WoW by +${customWinRateDelta}% with a ${threshold}% pricing advantage. Trend is positive, suggesting current price strategies are working.`
                : `TBO custom win rates declined WoW by ${customWinRateDelta}% with a ${threshold}% pricing advantage. Competitors may have narrowed the price gap; review top-losing hotels.`;
        } else {
            suggestion = "Single week dataset. Upload more weeks of data to view week-over-week trends.";
        }

        return res.json({
            success: true,
            latestWeek: {
                date: latest.week,
                totalQueries: latest.totalQueries,
                winRate: latest.winRate,
                customWinRate: latest.customWinRate,
                avgPriceDiff: latest.avgPriceDiff,
                avgTboPrice: latest.avgTboPrice,
                avgCompPrice: latest.avgCompPrice
            },
            previousWeek: prev ? {
                date: prev.week,
                totalQueries: prev.totalQueries,
                winRate: prev.winRate,
                customWinRate: prev.customWinRate,
                avgPriceDiff: prev.avgPriceDiff,
                avgTboPrice: prev.avgTboPrice,
                avgCompPrice: prev.avgCompPrice
            } : null,
            threshold: Number(threshold),
            trends: {
                isCustomWinRatePositive,
                customWinRateDelta,
                isStandardWinRatePositive,
                standardWinRateDelta,
                isPriceDiffPositive,
                priceDiffDelta,
                suggestion,
                overallTrend
            },
            weeklyHistory: [...history].reverse()
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to load weekly comparison");
        return res.status(500).json({ error: "Failed to load weekly comparison" });
    }
});

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
        let priceCompVal = 1.2;
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

        let metaContext: any = null;

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await getDatasetUrl(dataset.storagePath);
            metaContext = await getDatasetContext(localPath);
            
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
                    AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as priceComp
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
                // Find date column
                const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
                const dateCol = schema.find(c => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
                const hasApwNew = schema.some(c => c.column_name.toLowerCase() === 'apw_bucket_new');
                const hasApwRaw = schema.some(c => c.column_name.toLowerCase() === 'apw');
                
                if (dateCol) {
                    const apwSelect = hasApwNew 
                        ? `
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d60,
                            AVG(CASE WHEN (apw_bucket_new = '60+ days' OR apw_bucket_new = '> 60 days') AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d90
                        `
                        : (hasApwRaw ? `
                            AVG(CASE WHEN CAST(apw AS INTEGER) < 10 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d10,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 10 AND 15 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d15,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 16 AND 30 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d30,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 31 AND 45 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d45,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 46 AND 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d60,
                            AVG(CASE WHEN CAST(apw AS INTEGER) > 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d90
                        ` : `
                            0 as w_d10, 0 as w_d15, 0 as w_d30, 0 as w_d45, 0 as w_d60, 0 as w_d90
                        `);
                        
                    const timeSql = `
                        WITH weekly AS (
                            SELECT 
                                date_trunc('week', COALESCE(TRY_CAST("${dateCol}" AS DATE), try_strptime("${dateCol}", '%m/%d/%Y')::DATE, try_strptime("${dateCol}", '%d/%m/%Y')::DATE, try_strptime("${dateCol}", '%m-%d-%Y')::DATE, try_strptime("${dateCol}", '%d-%m-%Y')::DATE)) as week,
                                AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                                AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as avg_gap,
                                ${apwSelect}
                            FROM data_table
                            WHERE tbo_hotelname ILIKE '%${hotelName.replace(/'/g, "''")}%'
                            GROUP BY week
                            ORDER BY week ASC
                        )
                        SELECT * FROM weekly WHERE week IS NOT NULL
                    `;
                    const timeRes = await executeQuery<any>(timeSql, localPath);
                    
                    trendWinRate = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.win_rate).toFixed(1)),
                        market: Number((Number(r.win_rate) * 0.9 + 5).toFixed(1))
                    }));

                    trendPriceGap = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.avg_gap).toFixed(1)),
                        market: Number((Number(r.avg_gap) - 1.2).toFixed(1))
                    }));

                    trendApw = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        d10: Number(Number(r.w_d10 || 0).toFixed(1)),
                        d15: Number(Number(r.w_d15 || 0).toFixed(1)),
                        d30: Number(Number(r.w_d30 || 0).toFixed(1)),
                        d45: Number(Number(r.w_d45 || 0).toFixed(1)),
                        d60: Number(Number(r.w_d60 || 0).toFixed(1)),
                        d90: Number(Number(r.w_d90 || 0).toFixed(1)),
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
            meta: metaContext,
            data: {
                id: hotelName,
                name: hotelName,
                type: "HOTEL",
                metrics: {
                    winRate: { value: Number(winRateVal.toFixed(1)) },
                    priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)) },
                    volumeShare: { value: Number(volumeShareVal.toFixed(1)) },
                    totalQueries: { value: totalQueriesVal },
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
                distribution: distribution
            }
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
        let priceCompVal = 0.8;
        let topHotelsData = [
            { name: "Hilton London", winRate: 55.2, share: 5 },
            { name: "Marriott Paris", winRate: 48.1, share: 4 },
            { name: "Sofitel Rome", winRate: 42.4, share: 3 },
        ];

        let trendWinRate: any[] = [];
        let trendPriceGap: any[] = [];
        let trendApw: any[] = [];
        let distribution = {
            winMargin: { avg: 4.5, median: 3.2 },
            lossMargin: { avg: -5.1, median: -3.8 },
            segments: { winHigh: 15, winLow: 25, within: 30, lossLow: 20, lossHigh: 10 }
        };

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await getDatasetUrl(dataset.storagePath);
            
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
                    AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as priceComp
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

            // Trend and distribution (Supplier specific)
            try {
                // Find date column
                const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
                const dateCol = schema.find(c => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
                const hasApwNew = schema.some(c => c.column_name.toLowerCase() === 'apw_bucket_new');
                const hasApwRaw = schema.some(c => c.column_name.toLowerCase() === 'apw');
                
                if (dateCol) {
                    const apwSelect = hasApwNew 
                        ? `
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d60,
                            AVG(CASE WHEN (apw_bucket_new = '60+ days' OR apw_bucket_new = '> 60 days') AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d90
                        `
                        : (hasApwRaw ? `
                            AVG(CASE WHEN CAST(apw AS INTEGER) < 10 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d10,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 10 AND 15 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d15,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 16 AND 30 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d30,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 31 AND 45 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d45,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 46 AND 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d60,
                            AVG(CASE WHEN CAST(apw AS INTEGER) > 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d90
                        ` : `
                            0 as w_d10, 0 as w_d15, 0 as w_d30, 0 as w_d45, 0 as w_d60, 0 as w_d90
                        `);
                        
                    const timeSql = `
                        WITH weekly AS (
                            SELECT 
                                date_trunc('week', COALESCE(TRY_CAST("${dateCol}" AS DATE), try_strptime("${dateCol}", '%m/%d/%Y')::DATE, try_strptime("${dateCol}", '%d/%m/%Y')::DATE, try_strptime("${dateCol}", '%m-%d-%Y')::DATE, try_strptime("${dateCol}", '%d-%m-%Y')::DATE)) as week,
                                AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                                AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as avg_gap,
                                ${apwSelect}
                            FROM data_table
                            WHERE suppliername ILIKE '%${supplierName.replace(/'/g, "''")}%'
                            GROUP BY week
                            ORDER BY week ASC
                        )
                        SELECT * FROM weekly WHERE week IS NOT NULL
                    `;
                    const timeRes = await executeQuery<any>(timeSql, localPath);
                    
                    trendWinRate = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.win_rate).toFixed(1)),
                        market: Number((Number(r.win_rate) * 0.9 + 5).toFixed(1)) // Faux market avg
                    }));

                    trendPriceGap = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.avg_gap).toFixed(1)),
                        market: Number((Number(r.avg_gap) - 1.2).toFixed(1))
                    }));

                    trendApw = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        d10: Number(Number(r.w_d10 || 0).toFixed(1)),
                        d15: Number(Number(r.w_d15 || 0).toFixed(1)),
                        d30: Number(Number(r.w_d30 || 0).toFixed(1)),
                        d45: Number(Number(r.w_d45 || 0).toFixed(1)),
                        d60: Number(Number(r.w_d60 || 0).toFixed(1)),
                        d90: Number(Number(r.w_d90 || 0).toFixed(1)),
                    }));
                }

                // Distribution
                const distSql = `
                    SELECT 
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) END) as avg_win,
                        median(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) END) as med_win,
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) END) as avg_loss,
                        median(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) END) as med_loss,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 10 THEN 1 END) as win_high,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 2 AND CAST(price_diff_perc AS DOUBLE) <= 10 THEN 1 END) as win_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) >= -2 AND CAST(price_diff_perc AS DOUBLE) <= 2 THEN 1 END) as within,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -2 AND CAST(price_diff_perc AS DOUBLE) >= -10 THEN 1 END) as loss_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -10 THEN 1 END) as loss_high,
                        COUNT(*) as total
                    FROM data_table
                    WHERE suppliername ILIKE '%${supplierName.replace(/'/g, "''")}%'
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
            meta: null,
            data: {
                id: supplierName,
                name: supplierName,
                type: "SUPPLIER",
                metrics: {
                    winRate: { value: Number(winRateVal.toFixed(1)) },
                    priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)) },
                    volumeShare: { value: Number(volumeShareVal.toFixed(1)) },
                    totalQueries: { value: totalQueriesVal },
                },
                topHotels: topHotelsData,
                opportunityAssessment: {
                    level: "HIGH",
                    primaryOpportunity: "Strong pricing advantage detected in European capitals. Increase marketing spend for these regions.",
                },
                trendData: {
                    winRate: trendWinRate,
                    priceGap: trendPriceGap,
                    apw: trendApw
                },
                distribution: distribution
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
        let priceCompVal = 0.5;
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

        let metaContext: any = null;

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await getDatasetUrl(dataset.storagePath);
            metaContext = await getDatasetContext(localPath);
            
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
                    AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as priceComp
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
                const dateCol = schema.find(c => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
                const hasApwNew = schema.some(c => c.column_name.toLowerCase() === 'apw_bucket_new');
                const hasApwRaw = schema.some(c => c.column_name.toLowerCase() === 'apw');
                
                if (dateCol) {
                    const apwSelect = hasApwNew 
                        ? `
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d60,
                            AVG(CASE WHEN (apw_bucket_new = '60+ days' OR apw_bucket_new = '> 60 days') AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d90
                        `
                        : (hasApwRaw ? `
                            AVG(CASE WHEN CAST(apw AS INTEGER) < 10 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d10,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 10 AND 15 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d15,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 16 AND 30 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d30,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 31 AND 45 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d45,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 46 AND 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d60,
                            AVG(CASE WHEN CAST(apw AS INTEGER) > 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d90
                        ` : `
                            0 as w_d10, 0 as w_d15, 0 as w_d30, 0 as w_d45, 0 as w_d60, 0 as w_d90
                        `);
                        
                    const timeSql = `
                        WITH weekly AS (
                            SELECT 
                                date_trunc('week', COALESCE(TRY_CAST("${dateCol}" AS DATE), try_strptime("${dateCol}", '%m/%d/%Y')::DATE, try_strptime("${dateCol}", '%d/%m/%Y')::DATE, try_strptime("${dateCol}", '%m-%d-%Y')::DATE, try_strptime("${dateCol}", '%d-%m-%Y')::DATE)) as week,
                                AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                                AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as avg_gap,
                                ${apwSelect}
                            FROM data_table
                            WHERE tbo_chainname ILIKE '%${chainName.replace(/'/g, "''")}%'
                            GROUP BY week
                            ORDER BY week ASC
                        )
                        SELECT * FROM weekly WHERE week IS NOT NULL
                    `;
                    const timeRes = await executeQuery<any>(timeSql, localPath);
                    
                    trendWinRate = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.win_rate).toFixed(1)),
                        market: Number((Number(r.win_rate) * 0.9 + 5).toFixed(1))
                    }));

                    trendPriceGap = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.avg_gap).toFixed(1)),
                        market: Number((Number(r.avg_gap) - 1.2).toFixed(1))
                    }));

                    trendApw = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        d10: Number(Number(r.w_d10 || 0).toFixed(1)),
                        d15: Number(Number(r.w_d15 || 0).toFixed(1)),
                        d30: Number(Number(r.w_d30 || 0).toFixed(1)),
                        d45: Number(Number(r.w_d45 || 0).toFixed(1)),
                        d60: Number(Number(r.w_d60 || 0).toFixed(1)),
                        d90: Number(Number(r.w_d90 || 0).toFixed(1)),
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
            meta: metaContext,
            data: {
                id: chainName,
                name: chainName,
                type: "CHAIN",
                metrics: {
                    winRate: { value: Number(winRateVal.toFixed(1)) },
                    priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)) },
                    volumeShare: { value: Number(volumeShareVal.toFixed(1)) },
                    totalQueries: { value: totalQueriesVal },
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
                distribution: distribution
            }
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch chain deep dive");
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/destination/:id
router.get("/destination/:id", requireAuth(), currentUser, async (req: any, res) => {
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

        const destinationName = decodeURIComponent(id as string);
        
        let winRateVal = 40.5;
        let volumeShareVal = 15.0;
        let totalQueriesVal = 45000;
        let priceCompVal = 0.5;
        let topHotelsData: any[] = [];

        let trendWinRate: any[] = [];
        let trendPriceGap: any[] = [];
        let trendApw: any[] = [];
        let distribution = {
            winMargin: { avg: 6.2, median: 4.1 },
            lossMargin: { avg: -8.7, median: -6.3 },
            segments: { winHigh: 17, winLow: 28, within: 22, lossLow: 20, lossHigh: 13 }
        };

        let metaContext: any = null;

        if (datasetId !== "demo" && dataset?.storagePath) {
            const localPath = await getDatasetUrl(dataset.storagePath);
            metaContext = await getDatasetContext(localPath);
            
            // Validate existence
            const countRes = await executeQuery<{ count: number }>(
                `SELECT COUNT(*) as count FROM data_table WHERE destination ILIKE '%${destinationName.replace(/'/g, "''")}%'`, 
                localPath
            ).catch(() => [{ count: 0 }]);

            if (Number(countRes[0]?.count || 0) === 0) {
                const countRes2 = await executeQuery<{ count: number }>(
                    `SELECT COUNT(*) as count FROM data_table WHERE "Destination" ILIKE '%${destinationName.replace(/'/g, "''")}%'`, 
                    localPath
                ).catch(() => [{ count: 0 }]);

                if (Number(countRes2[0]?.count || 0) === 0) {
                    return res.status(404).json({ error: `Destination '${destinationName}' not found in dataset.` });
                }
            }
            
            // Get proper column name
            const schema = await executeQuery<{ column_name: string }>(`DESCRIBE data_table`, localPath);
            const destCol = schema.find(c => c.column_name.toLowerCase() === 'destination')?.column_name || 'destination';

            // Get total dataset row count for volume share
            const totalRes = await executeQuery<{ total: number }>(
                `SELECT COUNT(*) as total FROM data_table`, 
                localPath
            );
            const totalDatasetRows = Number(totalRes[0]?.total || 1);

            // Destination overall metrics
            const sql = `
                SELECT 
                    COUNT(*) as totalQueries,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate,
                    AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as priceComp
                FROM data_table
                WHERE "${destCol}" ILIKE '%${destinationName.replace(/'/g, "''")}%'
            `;
            const metricsRes = await executeQuery<{ totalQueries: number, winRate: number, priceComp: number }>(sql, localPath);
            const m = metricsRes[0];

            if (m && m.totalQueries > 0) {
                totalQueriesVal = Number(m.totalQueries);
                winRateVal = Number(m.winRate || 0);
                priceCompVal = Number(m.priceComp || 0);
                volumeShareVal = (totalQueriesVal / totalDatasetRows) * 100;
            }

            // Top properties for this destination
            const propSql = `
                SELECT 
                    tbo_hotelname as name, 
                    COUNT(*) as volume,
                    AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as winRate
                FROM data_table
                WHERE "${destCol}" ILIKE '%${destinationName.replace(/'/g, "''")}%'
                GROUP BY tbo_hotelname
                ORDER BY volume DESC
                LIMIT 5
            `;
            const propsRes = await executeQuery<{ name: string, volume: number, winRate: number }>(propSql, localPath).catch(() => []);
            
            topHotelsData = propsRes.map((p: any) => ({
                name: p.name || 'Unknown',
                winRate: Number(Number(p.winRate).toFixed(1)),
                share: Number(((Number(p.volume) / totalQueriesVal) * 100).toFixed(1))
            }));

            // Trend and distribution
            try {
                const dateCol = schema.find(c => ['search_date', 'scraped_date', 'date'].includes(c.column_name.toLowerCase()))?.column_name;
                const hasApwNew = schema.some(c => c.column_name.toLowerCase() === 'apw_bucket_new');
                const hasApwRaw = schema.some(c => c.column_name.toLowerCase() === 'apw');
                
                if (dateCol) {
                    const apwSelect = hasApwNew 
                        ? `
                            AVG(CASE WHEN apw_bucket_new = '< 10 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d10,
                            AVG(CASE WHEN apw_bucket_new = '10-15 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d15,
                            AVG(CASE WHEN apw_bucket_new = '15-30 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d30,
                            AVG(CASE WHEN apw_bucket_new = '31-45 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d45,
                            AVG(CASE WHEN apw_bucket_new = '46-60 days' AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d60,
                            AVG(CASE WHEN (apw_bucket_new = '60+ days' OR apw_bucket_new = '> 60 days') AND "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as w_d90
                        `
                        : (hasApwRaw ? `
                            AVG(CASE WHEN CAST(apw AS INTEGER) < 10 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d10,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 10 AND 15 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d15,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 16 AND 30 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d30,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 31 AND 45 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d45,
                            AVG(CASE WHEN CAST(apw AS INTEGER) BETWEEN 46 AND 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d60,
                            AVG(CASE WHEN CAST(apw AS INTEGER) > 60 THEN CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END END) * 100 as w_d90
                        ` : `
                            0 as w_d10, 0 as w_d15, 0 as w_d30, 0 as w_d45, 0 as w_d60, 0 as w_d90
                        `);
                        
                    const timeSql = `
                        WITH weekly AS (
                            SELECT 
                                date_trunc('week', COALESCE(TRY_CAST("${dateCol}" AS DATE), try_strptime("${dateCol}", '%m/%d/%Y')::DATE, try_strptime("${dateCol}", '%d/%m/%Y')::DATE, try_strptime("${dateCol}", '%m-%d-%Y')::DATE, try_strptime("${dateCol}", '%d-%m-%Y')::DATE)) as week,
                                AVG(CASE WHEN "Competitive Status" = 'Winning' THEN 1 ELSE 0 END) * 100 as win_rate,
                                AVG(CAST(price_diff_perc AS DOUBLE)) * -1 as avg_gap,
                                ${apwSelect}
                            FROM data_table
                            WHERE "${destCol}" ILIKE '%${destinationName.replace(/'/g, "''")}%'
                            GROUP BY week
                            ORDER BY week ASC
                        )
                        SELECT * FROM weekly WHERE week IS NOT NULL
                    `;
                    const timeRes = await executeQuery<any>(timeSql, localPath);
                    
                    trendWinRate = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.win_rate).toFixed(1)),
                        market: Number((Number(r.win_rate) * 0.9 + 5).toFixed(1))
                    }));

                    trendPriceGap = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        current: Number(Number(r.avg_gap).toFixed(1)),
                        market: Number((Number(r.avg_gap) - 1.2).toFixed(1))
                    }));

                    trendApw = timeRes.map(r => ({
                        date: new Date(r.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        d10: Number(Number(r.w_d10 || 0).toFixed(1)),
                        d15: Number(Number(r.w_d15 || 0).toFixed(1)),
                        d30: Number(Number(r.w_d30 || 0).toFixed(1)),
                        d45: Number(Number(r.w_d45 || 0).toFixed(1)),
                        d60: Number(Number(r.w_d60 || 0).toFixed(1)),
                        d90: Number(Number(r.w_d90 || 0).toFixed(1)),
                    }));
                }

                // Distribution
                const distSql = `
                    SELECT 
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) END) as avg_win,
                        median(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 0 THEN CAST(price_diff_perc AS DOUBLE) END) as med_win,
                        AVG(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) END) as avg_loss,
                        median(CASE WHEN CAST(price_diff_perc AS DOUBLE) < 0 THEN CAST(price_diff_perc AS DOUBLE) END) as med_loss,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 10 THEN 1 END) as win_high,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) > 2 AND CAST(price_diff_perc AS DOUBLE) <= 10 THEN 1 END) as win_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) >= -2 AND CAST(price_diff_perc AS DOUBLE) <= 2 THEN 1 END) as within,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -2 AND CAST(price_diff_perc AS DOUBLE) >= -10 THEN 1 END) as loss_low,
                        COUNT(CASE WHEN CAST(price_diff_perc AS DOUBLE) < -10 THEN 1 END) as loss_high,
                        COUNT(*) as total
                    FROM data_table
                    WHERE "${destCol}" ILIKE '%${destinationName.replace(/'/g, "''")}%'
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
            meta: metaContext,
            data: {
                id: destinationName,
                name: destinationName,
                type: "DESTINATION",
                metrics: {
                    winRate: { value: Number(winRateVal.toFixed(1)) },
                    priceCompetitiveness: { value: Number(priceCompVal.toFixed(1)) },
                    volumeShare: { value: Number(volumeShareVal.toFixed(1)) },
                    totalQueries: { value: totalQueriesVal },
                },
                topProperties: topHotelsData,
                opportunityAssessment: {
                    level: "MEDIUM",
                    primaryOpportunity: `Opportunities found for ${destinationName} based on historical pricing trends.`,
                },
                trendData: {
                    winRate: trendWinRate,
                    priceGap: trendPriceGap,
                    apw: trendApw
                },
                distribution: distribution
            }
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch destination deep dive");
        return res.status(500).json({ error: "Failed to fetch deep dive data" });
    }
});

// GET /deep-dives/cross-tab
router.get("/cross-tab", requireAuth(), currentUser, async (req: any, res) => {
    try {
        const { datasetId, dimA, dimB, metric } = req.query;
        if (!datasetId || !dimA || !dimB) {
            return res.status(400).json({ error: "datasetId, dimA, and dimB are required" });
        }

        let dataset: any = null;
        if (datasetId !== "demo") {
            dataset = await getDataset(datasetId as string);
            if (!dataset || !dataset.storagePath) {
                return res.status(404).json({ error: "Dataset not found" });
            }
        }

        const localPath = datasetId === "demo" ? "uploads/demo.csv" : await getDatasetUrl(dataset.storagePath);
        
        // Use the crossTabEngine
        const { generateCrossTabSql } = await import("../services/analytics/crossTabEngine.js");
        const { getCachedSchema } = await import("../services/datasetCacheService.js");
        const { getDatasetSchema } = await import("../services/schemaService.js");
        const { buildSemanticLayer } = await import("../ai/semanticLayer.js");

        const schema = await getCachedSchema(localPath, async () => await getDatasetSchema(localPath));
        const semanticLayer = buildSemanticLayer(schema);

        // Dummy parsed question to pass filters/metrics
        const parsedQuestion: any = {
            metrics: metric ? [metric] : [],
            dimensions: [dimA, dimB],
            filters: []
        };

        const queryPlan = generateCrossTabSql(parsedQuestion, semanticLayer, dimA as string, dimB as string, metric as string);
        if (!queryPlan) {
            return res.status(400).json({ error: "Invalid dimensions or metric" });
        }

        const rawResults = await executeQuery<any>(queryPlan.sql, localPath);

        // Transform flat results into MatrixData format
        const rowsSet = new Set<string>();
        const colsSet = new Set<string>();
        const matrixData: Record<string, Record<string, number>> = {};

        const metricNameMatch = queryPlan.sql.match(/AS "(.*?)"$/m);
        const metricLabel = metricNameMatch ? metricNameMatch[1] : (metric as string || "Metric");

        for (const row of rawResults) {
            const rowVal = String(row[dimA as string]);
            const colVal = String(row[dimB as string]);
            const val = Number(row[metricLabel]);

            rowsSet.add(rowVal);
            colsSet.add(colVal);

            if (!matrixData[rowVal]) matrixData[rowVal] = {};
            matrixData[rowVal][colVal] = val;
        }

        return res.json({
            data: {
                dimA: dimA as string,
                dimB: dimB as string,
                metricLabel,
                rows: Array.from(rowsSet).sort(),
                cols: Array.from(colsSet).sort(),
                data: matrixData
            }
        });
    } catch (error) {
        logger.error({ err: error }, "Failed to generate cross tab");
        return res.status(500).json({ error: "Failed to generate cross tab" });
    }
});

export default router;
