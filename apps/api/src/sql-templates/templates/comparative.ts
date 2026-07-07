import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const comparativeTemplates: TemplateDefinition[] = [
    // T29. Destination vs destination
    {
        id: "t29_compare_destinations",
        patterns: [
            /(?<destination_a>[a-z\s]+) vs (?<destination_b>[a-z\s]+) destination/,
            /compare (?<destination_a>[a-z\s]+) and (?<destination_b>[a-z\s]+)/
        ],
        slots: ["destination_a", "destination_b"], // Requires new slot logic or just let destination matching happen (might need 2 slots)
        // Wait, SlotResolver might not easily support destination_a and destination_b unless defined. 
        // We will just do a simple IN query.
        generateSql: (slots) => ({
            query: `
                SELECT 
                    destination,
                    COUNT(*) as volume,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff
                FROM data_table
                WHERE ${BASE_WHERE} AND (UPPER(destination) = UPPER(?) OR UPPER(destination) = UPPER(?))
                GROUP BY destination
            `,
            params: [slots.destination_a, slots.destination_b]
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No comparison data found.`;
            return `Here is the comparison:\n\n` +
                   `| Destination | Win Rate | Avg Price Diff | Volume |\n` +
                   `|---|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.destination}** | ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}% | ${r.avg_diff !== null ? r.avg_diff.toFixed(2) : 0}% | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    },

    // T30. Chain vs chain
    {
        id: "t30_compare_chains",
        patterns: [
            /(?<chain_a>[a-z\s]+) vs (?<chain_b>[a-z\s]+) chain/
        ],
        slots: ["chain_a", "chain_b"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    tbo_chainname,
                    COUNT(*) as volume,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff
                FROM data_table
                WHERE ${BASE_WHERE} AND (UPPER(tbo_chainname) = UPPER(?) OR UPPER(tbo_chainname) = UPPER(?))
                GROUP BY tbo_chainname
            `,
            params: [slots.chain_a, slots.chain_b]
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No comparison data found for these chains.`;
            return `Here is the comparison:\n\n` +
                   `| Chain | Win Rate | Avg Price Diff | Volume |\n` +
                   `|---|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.tbo_chainname}** | ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}% | ${r.avg_diff !== null ? r.avg_diff.toFixed(2) : 0}% | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    },

    // T31. Thirdparty vs thirdparty
    {
        id: "t31_compare_thirdparty",
        patterns: [
            /(?<thirdparty_a>[a-z\s]+) vs (?<thirdparty_b>[a-z\s]+) thirdparty/,
            /which ota are we more competitive against/
        ],
        slots: [], // if not explicitly provided, we just group by all thirdparties
        generateSql: () => ({
            query: `
                SELECT 
                    thirdparty,
                    COUNT(*) as volume,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff
                FROM data_table
                WHERE ${BASE_WHERE} AND thirdparty IS NOT NULL
                GROUP BY thirdparty
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No competitor comparison data found.`;
            return `Competitor Comparison:\n\n` +
                   `| Competitor | Win Rate | Avg Price Diff | Volume |\n` +
                   `|---|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.thirdparty}** | ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}% | ${r.avg_diff !== null ? r.avg_diff.toFixed(2) : 0}% | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    }
];
