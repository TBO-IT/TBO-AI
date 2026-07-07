import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const bookingWindowTemplates: TemplateDefinition[] = [
    // T21. Performance by booking window
    {
        id: "t21_performance_apw",
        patterns: [
            /how do we perform on last-minute bookings/,
            /win rate for bookings under 10 days out/,
            /performance by apw bucket/,
            /break down performance by apw/,
            /breakdown by apw bucket/
        ],
        slots: [], // Note: Destination or explicit apw bucket could be optional
        generateSql: () => ({
            query: `
                SELECT 
                    apw_bucket_new,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND apw_bucket_new IS NOT NULL
                GROUP BY apw_bucket_new
                ORDER BY total_offers DESC
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No APW performance data found.`;
            return `Performance breakdown by booking window (APW):\n\n` +
                   `| APW Bucket | Win Rate | Total Offers |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.apw_bucket_new}** | ${r.win_rate !== null ? r.win_rate.toFixed(1) : 0}% | ${r.total_offers.toLocaleString('en-US')} |`).join("\n");
        }
    },

    // T22. Best/worst booking window
    {
        id: "t22_best_worst_apw",
        patterns: [
            /which booking window do we perform best in/,
            /are we more competitive on early or late bookings/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    apw_bucket_new,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND apw_bucket_new IS NOT NULL
                GROUP BY apw_bucket_new
                HAVING COUNT(*) > 50
                ORDER BY win_rate DESC
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No statistically significant APW performance data found.`;
            const best = rows[0];
            const worst = rows[rows.length - 1];
            return `We perform **best** in the **${best.apw_bucket_new}** booking window with a win rate of ${best.win_rate.toFixed(1)}%.\n` +
                   `We perform **worst** in the **${worst.apw_bucket_new}** booking window with a win rate of ${worst.win_rate.toFixed(1)}%.`;
        }
    }
];
