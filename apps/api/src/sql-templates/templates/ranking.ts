import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

function getMetricSql(metric: string): string {
    if (metric === "price_diff_perc") return "AVG(TRY_CAST(price_diff_perc AS DOUBLE))";
    if (metric === "volume") return "COUNT(*)";
    // default to win_rate
    return "(COUNT(CASE WHEN \"Competitive Status\" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))";
}

export const rankingTemplates: TemplateDefinition[] = [
    // T26. Top-N destinations by any metric
    {
        id: "t26_top_n_destinations",
        patterns: [
            /top (?<n>\d+) destinations by (?<metric>.+)/,
            /top (?<n>\d+) markets by (?<metric>.+)/
        ],
        slots: ["n", "metric"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    destination,
                    ${getMetricSql(slots.metric)} as metric_val,
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> ''
                GROUP BY destination
                HAVING COUNT(*) > 20
                ORDER BY metric_val DESC
                LIMIT ?
            `,
            params: [slots.n]
        }),
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No ranking data found for destinations by ${slots.metric}.`;
            return `Top ${slots.n} destinations by ${slots.metric}:\n\n` +
                   `| Destination | ${slots.metric} | Volume |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.destination}** | ${typeof r.metric_val === 'number' ? r.metric_val.toFixed(2) : r.metric_val} | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    },

    // T27. Top-N hotels by any metric
    {
        id: "t27_top_n_hotels",
        patterns: [
            /top (?<n>\d+) hotels overall by (?<metric>.+)/,
            /top (?<n>\d+) hotels by (?<metric>.+)/,
            /which hotels are winning the most/
        ],
        slots: ["n", "metric"],
        generateSql: (slots) => {
            const m = slots.metric || 'win_rate';
            return {
                query: `
                    SELECT 
                        tbo_hotelname,
                        ${getMetricSql(m)} as metric_val,
                        COUNT(*) as volume
                    FROM data_table
                    WHERE ${BASE_WHERE} AND tbo_hotelname IS NOT NULL
                    GROUP BY tbo_hotelname
                    HAVING COUNT(*) > 5
                    ORDER BY metric_val DESC
                    LIMIT ?
                `,
                params: [slots.n || 10]
            };
        },
        formatAnswer: (rows, slots) => {
            const m = slots.metric || 'win_rate';
            const n = slots.n || 10;
            if (rows.length === 0) return `No ranking data found for hotels by ${m}.`;
            return `Top ${n} hotels by ${m}:\n\n` +
                   `| Hotel | ${m} | Volume |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.tbo_hotelname}** | ${typeof r.metric_val === 'number' ? r.metric_val.toFixed(2) : r.metric_val} | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    },

    // T28. Bottom-N (worst performers)
    {
        id: "t28_bottom_n_hotels",
        patterns: [
            /worst (?<n>\d+) hotels by (?<metric>.+)/,
            /worst (?<n>\d+) hotels/,
            /bottom (?<n>\d+) performing destinations/
        ],
        slots: ["n"], // metric optional, default win_rate
        generateSql: (slots) => {
            const m = slots.metric || 'win_rate';
            // Determine if destination or hotel based on raw slot or fallback? We'll just do hotel for now if destination isn't matched
            return {
                query: `
                    SELECT 
                        tbo_hotelname,
                        ${getMetricSql(m)} as metric_val,
                        COUNT(*) as volume
                    FROM data_table
                    WHERE ${BASE_WHERE} AND tbo_hotelname IS NOT NULL
                    GROUP BY tbo_hotelname
                    HAVING COUNT(*) > 5
                    ORDER BY metric_val ASC
                    LIMIT ?
                `,
                params: [slots.n || 10]
            };
        },
        formatAnswer: (rows, slots) => {
            const m = slots.metric || 'win_rate';
            const n = slots.n || 10;
            if (rows.length === 0) return `No bottom ranking data found.`;
            return `Bottom ${n} hotels by ${m}:\n\n` +
                   `| Hotel | ${m} | Volume |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.tbo_hotelname}** | ${typeof r.metric_val === 'number' ? r.metric_val.toFixed(2) : r.metric_val} | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    }
];
