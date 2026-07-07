import { TemplateDefinition } from "./types.js";

// Common business rules baked into every template:
// - fuzzy_score >= 90
// - tbo_hotelcode != 0
const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const templates: TemplateDefinition[] = [
    // A. Win/Loss rate
    {
        id: "win_rate_destination",
        patterns: [
            /our win rate in (?<destination>[a-z\s]+)/,
            /win rate in (?<destination>[a-z\s]+)/,
            /winning in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / COUNT(*)) as win_rate
                FROM rate_scrapes
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots) => {
            const row = rows[0];
            if (!row || row.total_offers === 0) return `No matching data found for ${slots.destination}.`;
            return `${slots.destination} is currently winning ${row.win_rate.toFixed(1)}% of comparisons (${row.winning_offers} of ${row.total_offers} matched offers).`;
        }
    },

    // B. Price comparison
    {
        id: "avg_price_diff_destination",
        patterns: [
            /average price difference in (?<destination>[a-z\s]+)/,
            /price gap in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT AVG(price_diff_perc) as avg_diff, COUNT(*) as volume
                FROM rate_scrapes
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots) => {
            const row = rows[0];
            if (!row || row.volume === 0) return `No matching data found for ${slots.destination}.`;
            return `The average price difference in ${slots.destination} is ${row.avg_diff.toFixed(2)}% (based on ${row.volume} offers).`;
        }
    },

    // C. Volume / counts
    {
        id: "hotel_count_destination",
        patterns: [
            /how many hotels .* in (?<destination>[a-z\s]+)/,
            /hotel count in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT COUNT(DISTINCT tbo_hotelcode) as hotel_count
                FROM rate_scrapes
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots) => {
            const row = rows[0];
            return `We have scraped ${row.hotel_count} unique hotels in ${slots.destination}.`;
        }
    },

    // D. Breakdown by dimension
    {
        id: "breakdown_apw_destination",
        patterns: [
            /break down performance by apw in (?<destination>[a-z\s]+)/,
            /breakdown by apw bucket in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    apw_bucket_new,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM rate_scrapes
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
                GROUP BY apw_bucket_new
                ORDER BY total_offers DESC
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No APW breakdown data found for ${slots.destination}.`;
            const lines = rows.map((r: any) => `- ${r.apw_bucket_new || 'Unknown'}: ${r.win_rate ? r.win_rate.toFixed(1) : 0}% win rate (${r.total_offers} offers)`).join("\\n");
            return `Performance breakdown by APW in ${slots.destination}:\\n${lines}`;
        }
    },

    // E. Ranking / Top-N
    {
        id: "top_losing_hotels_destination",
        patterns: [
            /top (?<limit>\d+) hotels where we.*losing.* in (?<destination>[a-z\s]+)/,
            /top (?<limit>\d+) losing hotels in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination", "limit"],
        generateSql: (slots) => ({
            query: `
                SELECT tbo_hotelname, AVG(price_diff_perc) as avg_diff
                FROM rate_scrapes
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND "Competitive Status" = 'Losing'
                GROUP BY tbo_hotelname
                ORDER BY avg_diff ASC
                LIMIT ?
            `,
            params: [slots.destination, parseInt(slots.limit)]
        }),
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No losing hotels found in ${slots.destination}.`;
            const list = rows.map((r: any, i: number) => `${i + 1}. ${r.tbo_hotelname} (${r.avg_diff.toFixed(2)}%)`).join("\\n");
            return `Top ${rows.length} losing hotels in ${slots.destination} by average price difference:\\n${list}`;
        }
    }
];
