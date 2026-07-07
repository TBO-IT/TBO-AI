import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const entityLookupTemplates: TemplateDefinition[] = [
    // T32. Single hotel full profile
    {
        id: "t32_single_hotel_profile",
        patterns: [
            /tell me about (?<hotel>[a-z\s0-9\-]+)/,
            /show (?<hotel>[a-z\s0-9\-]+).*s stats/
        ],
        slots: ["hotel"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    tbo_hotelname,
                    MAX(tbo_chainname) as chain,
                    COUNT(*) as volume,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff,
                    MAX(scraped_date) as last_scraped
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(tbo_hotelname) = UPPER(?)
                GROUP BY tbo_hotelname
            `,
            params: [slots.hotel]
        }),
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.volume === 0) return `No profile data found for hotel: ${slots.hotel}.`;
            return `**Profile for ${r.tbo_hotelname}**:\n` +
                   `- **Chain**: ${r.chain || 'Independent'}\n` +
                   `- **Win Rate**: ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}%\n` +
                   `- **Avg Price Diff**: ${r.avg_diff !== null ? r.avg_diff.toFixed(2) : 0}%\n` +
                   `- **Total Comparisons**: ${r.volume.toLocaleString('en-US')}\n` +
                   `- **Last Scraped**: ${r.last_scraped || 'Unknown'}`;
        }
    },

    // T33. Hotels matching a filter combination
    {
        id: "t33_hotels_by_filter",
        patterns: [
            /show me all (?<status>[a-z]+) hotels in (?<destination>[a-z\s]+) for (?<chain>[a-z\s]+)/,
            /(?<status>[a-z]+) (?<chain>[a-z\s]+) hotels in (?<destination>[a-z\s]+)/
        ],
        slots: ["status", "destination", "chain"],
        generateSql: (slots) => {
            let statusFilter = "";
            if (slots.status === "Winning") statusFilter = ` AND "Competitive Status" = 'Winning'`;
            if (slots.status === "Losing") statusFilter = ` AND "Competitive Status" = 'Losing'`;
            
            return {
                query: `
                    SELECT 
                        tbo_hotelname,
                        COUNT(*) as volume
                    FROM data_table
                    WHERE ${BASE_WHERE} 
                      AND UPPER(destination) = UPPER(?) 
                      AND UPPER(tbo_chainname) = UPPER(?)
                      ${statusFilter}
                    GROUP BY tbo_hotelname
                    ORDER BY volume DESC
                    LIMIT 20
                `,
                params: [slots.destination, slots.chain]
            };
        },
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No ${slots.status || 'matching'} ${slots.chain} hotels found in ${slots.destination}.`;
            return `Matching hotels:\n\n` +
                   `| Hotel | Volume |\n` +
                   `|---|---|\n` +
                   rows.map((r: any) => `| **${r.tbo_hotelname}** | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    }
];
