import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

export const timeTrendTemplates: TemplateDefinition[] = [
    // T24. Trend over date range
    {
        id: "t24_trend_date_range",
        patterns: [
            /show me the trend for (?<destination>[a-z\s]+) between (?<date1>.+) and (?<date2>.+)/,
            /how has win rate changed since (?<date1>.+)/
        ],
        slots: [], // slots are dynamic
        generateSql: (slots) => {
            const hasDest = !!slots.destination;
            const destClause = hasDest ? ` AND UPPER(destination) = UPPER(?)` : ``;
            
            let dateClause = ``;
            const params: any[] = [];
            
            if (hasDest) {
                params.push(slots.destination);
            }
            
            if (slots.date1 && slots.date2) {
                dateClause = ` AND TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE) BETWEEN TRY_CAST(? AS DATE) AND TRY_CAST(? AS DATE)`;
                params.push(slots.date1, slots.date2);
            } else if (slots.date1) {
                dateClause = ` AND TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE) >= TRY_CAST(? AS DATE)`;
                params.push(slots.date1);
            }

            return {
                query: `
                    SELECT 
                        DATE_TRUNC('day', TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE)) as day_date,
                        COUNT(*) as total_offers,
                        (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                    FROM data_table
                    WHERE ${BASE_WHERE} AND scraped_date IS NOT NULL${destClause}${dateClause}
                    GROUP BY day_date
                    ORDER BY day_date ASC
                `,
                params
            };
        },
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const validRows = rows.filter(r => r.day_date);
            const context = slots.destination ? slots.destination : "overall";
            if (validRows.length === 0) return { answer: `No trend data found for ${context}.` };
            
            const chartData = validRows.map((r: any) => ({
                name: new Date(r.day_date).toISOString().substring(0,10),
                value: Number(r.win_rate !== null ? r.win_rate.toFixed(1) : 0)
            }));

            const chart: ChartDefinition = {
                type: "line",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Here is the daily win rate trend for ${context}:`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T25. Snapshot as of a specific scrape date
    {
        id: "t25_snapshot_date",
        patterns: [
            /what did things look like on (?<date>.+)/,
            /as of (?<date>[0-9\-\/]+)/
        ],
        slots: ["date"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND scraped_date LIKE ?
            `,
            params: [`%${slots.date}%`]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return { answer: `No data found for the date ${slots.date}.` };
            return {
                answer: `As of ${slots.date}, our overall win rate was ${r.win_rate.toFixed(1)}% (based on ${r.total_offers.toLocaleString('en-US')} offers).`,
                table: buildTable(rows)
            };
        }
    }
];
