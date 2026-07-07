import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

export const priceComparisonTemplates: TemplateDefinition[] = [
    // T13. Median / distribution of price difference
    {
        id: "t13_median_price_diff",
        patterns: [
            /what.*s the typical price gap in (?<destination>[a-z\s]+)/,
            /median price difference in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    median(TRY_CAST(price_diff_perc AS DOUBLE)) as median_diff, 
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND price_diff_perc IS NOT NULL
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.volume === 0 || r.median_diff === null) return { answer: `No median price gap data found for ${slots.destination}.` };
            return {
                answer: `The median price difference in ${slots.destination} is ${r.median_diff.toFixed(2)}% (based on ${r.volume.toLocaleString('en-US')} offers).`,
                table: buildTable(rows)
            };
        }
    },

    // T09. Average price difference
    {
        id: "t09_avg_price_diff",
        patterns: [
            /average price difference in (?<destination>[a-z\s]+)/,
            /how much cheaper.*are we.*in (?<destination>[a-z\s]+)/,
            /how much pricier.*are we.*in (?<destination>[a-z\s]+)/,
            /price gap in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff, COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND price_diff_perc IS NOT NULL
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.volume === 0 || r.avg_diff === null) return { answer: `No price gap data found for ${slots.destination}.` };
            return {
                answer: `The average price difference in ${slots.destination} is ${r.avg_diff.toFixed(2)}% (based on ${r.volume.toLocaleString('en-US')} offers).`,
                table: buildTable(rows)
            };
        }
    },

    // T10. Price difference by destination (breakdown)
    {
        id: "t10_price_diff_breakdown_destination",
        patterns: [
            /price difference by destination/,
            /where are we most overpriced/,
            /where are we most underpriced/,
            /show price gaps across markets/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    destination,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff,
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> '' AND price_diff_perc IS NOT NULL
                GROUP BY destination
                HAVING COUNT(*) > 20
                ORDER BY avg_diff DESC
                LIMIT 50
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No statistically significant price gap data found.` };

            const chartData = rows.slice(0, 10).map((r: any) => ({
                name: r.destination,
                value: Number(r.avg_diff.toFixed(2))
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Avg Price Diff", valueFormat: "percent" }
            };

            return {
                answer: `Here is the average price gap across our top destinations.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T11. Top-N hotels by price gap
    {
        id: "t11_top_hotels_price_gap",
        patterns: [
            /top (?<n>\d+) hotels where we.*overpriced in (?<destination>[a-z\s]+)/,
            /top (?<n>\d+) hotels where we.*underpriced in (?<destination>[a-z\s]+)/,
            /top (?<n>\d+) hotels where we.*losing.* in (?<destination>[a-z\s]+)/,
            /top (?<n>\d+) losing hotels in (?<destination>[a-z\s]+)/,
            /biggest price gaps in (?<destination>[a-z\s]+)/,
            /worst priced hotels in (?<destination>[a-z\s]+)/,
            /best priced hotels in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination", "n"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    tbo_hotelname, 
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff,
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND price_diff_perc IS NOT NULL
                GROUP BY tbo_hotelname
                HAVING COUNT(*) >= 5
                ORDER BY avg_diff DESC
                LIMIT ?
            `,
            params: [slots.destination, slots.n]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No hotels with significant data found in ${slots.destination}.` };
            const list = rows.map((r: any, i: number) => `| ${i + 1}. **${r.tbo_hotelname}** | ${r.avg_diff.toFixed(2)}% | ${r.volume} |`).join("\n");
            return {
                answer: `Top hotels in ${slots.destination} by average price difference:\n\n| Hotel | Avg Price Diff (%) | Volume |\n|---|---|---|\n${list}`,
                table: buildTable(rows)
            };
        }
    },

    // T12. Price comparison vs specific competitor
    {
        id: "t12_price_comp_competitor",
        patterns: [
            /how do our prices compare to (?<thirdparty>[a-z\s]+) in (?<destination>[a-z\s]+)/,
            /(?<thirdparty>[a-z\s]+) vs us in (?<destination>[a-z\s]+)/
        ],
        slots: ["thirdparty", "destination"],
        generateSql: (slots) => ({
            query: `
                SELECT AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff, COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(thirdparty) = UPPER(?) AND UPPER(destination) = UPPER(?) AND price_diff_perc IS NOT NULL
            `,
            params: [slots.thirdparty, slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.volume === 0 || r.avg_diff === null) return { answer: `No price gap data found against ${slots.thirdparty} in ${slots.destination}.` };
            return {
                answer: `Against ${slots.thirdparty} in ${slots.destination}, our average price difference is ${r.avg_diff.toFixed(2)}% (based on ${r.volume.toLocaleString('en-US')} offers).`,
                table: buildTable(rows)
            };
        }
    },

    // T14. Price difference by booking window (APW)
    {
        id: "t14_price_diff_apw",
        patterns: [
            /does our pricing get worse the closer to check-in in (?<destination>[a-z\s]+)/,
            /price gap by booking window in (?<destination>[a-z\s]+)/,
            /apw price comparison in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    apw_bucket_new, 
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff, 
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?) AND price_diff_perc IS NOT NULL
                GROUP BY apw_bucket_new
                ORDER BY volume DESC
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No APW price data found for ${slots.destination}.` };

            // Optionally, we could map APW buckets to sort them naturally here, but using the DB sort is fine.
            const chartData = rows.map((r: any) => ({
                name: r.apw_bucket_new || 'Unknown',
                value: Number(r.avg_diff.toFixed(2))
            }));

            const chart: ChartDefinition = {
                type: "line",
                data: chartData,
                config: { valueLabel: "Avg Price Diff", valueFormat: "percent" }
            };

            return {
                answer: `Price difference by booking window (APW) in ${slots.destination}.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T15. Specific hotel price lookup
    {
        id: "t15_specific_hotel_price",
        patterns: [
            /what.*s the price for (?<hotel>[a-z\s0-9\-]+)/,
            /show me (?<hotel>[a-z\s0-9\-]+).*s pricing/,
            /compare price for (?<hotel>[a-z\s0-9\-]+)/
        ],
        slots: ["hotel"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    tbo_hotelname,
                    AVG(TRY_CAST(tbo_price AS DOUBLE)) as avg_tbo_price,
                    AVG(TRY_CAST(thirdparty_price AS DOUBLE)) as avg_tp_price,
                    AVG(TRY_CAST(price_diff_perc AS DOUBLE)) as avg_diff,
                    COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(tbo_hotelname) = UPPER(?) AND tbo_price IS NOT NULL
                GROUP BY tbo_hotelname
            `,
            params: [slots.hotel]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.volume === 0) return { answer: `No pricing data found for hotel: ${slots.hotel}.` };
            return {
                answer: `Pricing for **${r.tbo_hotelname}**:\n` +
                    `- **Avg TBO Price**: $${r.avg_tbo_price.toFixed(2)}\n` +
                    `- **Avg Competitor Price**: $${r.avg_tp_price.toFixed(2)}\n` +
                    `- **Avg Price Difference**: ${r.avg_diff.toFixed(2)}%\n` +
                    `- **Offers Compared**: ${r.volume.toLocaleString('en-US')}`,
                table: buildTable(rows)
            };
        }
    }
];
