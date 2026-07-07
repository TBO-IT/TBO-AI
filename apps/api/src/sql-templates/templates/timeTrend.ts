import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const timeTrendTemplates: TemplateDefinition[] = [
    // T24. Trend over date range
    {
        id: "t24_trend_date_range",
        patterns: [
            /show me the trend for (?<destination>[a-z\s]+) between (?<date1>.+) and (?<date2>.+)/,
            /how has win rate changed since (?<date1>.+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    DATE_TRUNC('day', TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE)) as day_date,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND scraped_date IS NOT NULL
                GROUP BY day_date
                ORDER BY day_date ASC
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No trend data found for ${slots.destination}.`;
            return `Here is the daily win rate trend for ${slots.destination}:\n\n` +
                   `| Date | Win Rate | Volume |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => {
                       const d = r.day_date ? new Date(r.day_date).toISOString().substring(0,10) : 'Unknown';
                       return `| ${d} | ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}% | ${r.total_offers.toLocaleString('en-US')} |`;
                   }).join("\n");
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
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return `No data found for the date ${slots.date}.`;
            return `As of ${slots.date}, our overall win rate was ${r.win_rate.toFixed(1)}% (based on ${r.total_offers.toLocaleString('en-US')} offers).`;
        }
    }
];
