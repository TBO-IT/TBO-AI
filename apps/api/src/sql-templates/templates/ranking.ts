import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

function getMetricSql(metric: string): string {
    if (metric === "price_diff_perc") return "AVG(TRY_CAST(price_diff_perc AS DOUBLE))";
    if (metric === "volume") return "COUNT(*)";
    // default to win_rate
    return "(COUNT(CASE WHEN \"Competitive Status\" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))";
}

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

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
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No ranking data found for destinations by ${slots.metric}.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.destination,
                value: Number(typeof r.metric_val === 'number' ? r.metric_val.toFixed(2) : r.metric_val)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: slots.metric, valueFormat: "number" }
            };

            return {
                answer: `Top ${slots.n} destinations by ${slots.metric}:`,
                chart,
                table: buildTable(rows)
            };
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
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const m = slots.metric || 'win_rate';
            const n = slots.n || 10;
            if (rows.length === 0) return { answer: `No ranking data found for hotels by ${m}.` };
            
            return {
                answer: `Top ${n} hotels by ${m}:`,
                table: buildTable(rows) // No chart for hotels usually
            };
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
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const m = slots.metric || 'win_rate';
            const n = slots.n || 10;
            if (rows.length === 0) return { answer: `No bottom ranking data found.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.tbo_hotelname,
                value: Number(typeof r.metric_val === 'number' ? r.metric_val.toFixed(2) : r.metric_val)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: m, valueFormat: "number" }
            };

            return {
                answer: `Bottom ${n} performers by ${m}:`,
                chart,
                table: buildTable(rows)
            };
        }
    }
];
