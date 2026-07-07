import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

export const comparativeTemplates: TemplateDefinition[] = [
    // T29. Destination vs destination
    {
        id: "t29_compare_destinations",
        patterns: [
            /(?<destination_a>[a-z\s]+) vs (?<destination_b>[a-z\s]+) destination/,
            /compare (?<destination_a>[a-z\s]+) and (?<destination_b>[a-z\s]+)/
        ],
        slots: ["destination_a", "destination_b"], // Requires new slot logic or just let destination matching happen (might need 2 slots)
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
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No comparison data found.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.destination,
                value: Number(r.win_rate !== null ? r.win_rate.toFixed(1) : 0)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Here is the comparison:`,
                chart,
                table: buildTable(rows)
            };
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
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No comparison data found for these chains.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.tbo_chainname,
                value: Number(r.win_rate !== null ? r.win_rate.toFixed(1) : 0)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Here is the comparison:`,
                chart,
                table: buildTable(rows)
            };
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
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No competitor comparison data found.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.thirdparty,
                value: Number(r.win_rate !== null ? r.win_rate.toFixed(1) : 0)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Competitor Comparison:`,
                chart,
                table: buildTable(rows)
            };
        }
    }
];
