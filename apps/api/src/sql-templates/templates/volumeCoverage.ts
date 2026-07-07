import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

export const volumeCoverageTemplates: TemplateDefinition[] = [
    // T16. Total hotels/offers scraped
    {
        id: "t16_total_hotels_scraped",
        patterns: [
            /how many hotels do we have data for in (?<destination>[a-z\s]+)/,
            /how many hotels were scraped in (?<destination>[a-z\s]+)/,
            /how many offers were scraped in (?<destination>[a-z\s]+)/,
            /total comparisons available in (?<destination>[a-z\s]+)/,
            /hotel count in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT COUNT(DISTINCT tbo_hotelcode) as hotel_count, COUNT(*) as offer_count
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.hotel_count === 0) return { answer: `No data found for ${slots.destination}.` };
            return {
                answer: `We have scraped ${r.hotel_count.toLocaleString('en-US')} unique hotels across ${r.offer_count.toLocaleString('en-US')} offers in ${slots.destination}.`,
                table: buildTable(rows)
            };
        }
    },

    // T17. Coverage by destination
    {
        id: "t17_coverage_destination",
        patterns: [
            /how much coverage do we have per destination/,
            /which destinations have the most data/,
            /data volume by market/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT destination, COUNT(DISTINCT tbo_hotelcode) as hotel_count, COUNT(*) as offer_count
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> ''
                GROUP BY destination
                ORDER BY offer_count DESC
                LIMIT 50
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No coverage data found.` };
            
            const chartData = rows.slice(0, 10).map((r: any) => ({
                name: r.destination,
                value: Number(r.offer_count)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Total Offers", valueFormat: "number" }
            };

            return {
                answer: `Here is our data coverage across top destinations.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T18. Coverage by competitor (thirdparty)
    {
        id: "t18_coverage_competitor",
        patterns: [
            /how many comparisons do we have against (?<thirdparty>[a-z\s]+)/,
            /(?<thirdparty_a>[a-z\s]+) vs (?<thirdparty_b>[a-z\s]+) coverage/
        ],
        slots: [], // no strict slots since we list them all
        generateSql: () => ({
            query: `
                SELECT thirdparty, COUNT(DISTINCT tbo_hotelcode) as hotel_count, COUNT(*) as offer_count
                FROM data_table
                WHERE ${BASE_WHERE} AND thirdparty IS NOT NULL
                GROUP BY thirdparty
                ORDER BY offer_count DESC
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No competitor coverage data found.` };
            return {
                answer: `Coverage breakdown by competitor:\n\n` +
                       `| Competitor | Unique Hotels | Total Offers |\n` +
                       `|---|---|---|\n` +
                       rows.map((r: any) => `| **${r.thirdparty}** | ${r.hotel_count.toLocaleString('en-US')} | ${r.offer_count.toLocaleString('en-US')} |`).join("\n"),
                table: buildTable(rows)
            };
        }
    },

    // T19. Coverage by chain
    {
        id: "t19_coverage_chain",
        patterns: [
            /how many independent hotels vs branded chains do we track/,
            /chain coverage breakdown/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    COALESCE(NULLIF(TRIM(tbo_chainname), ''), 'Independent/Unbranded') as chain_type, 
                    COUNT(DISTINCT tbo_hotelcode) as hotel_count, 
                    COUNT(*) as offer_count
                FROM data_table
                WHERE ${BASE_WHERE}
                GROUP BY chain_type
                ORDER BY offer_count DESC
                LIMIT 20
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No chain coverage data found.` };
            
            // Pie chart logic: > 6 slices gets collapsed into "Other"
            let chartData: any[] = [];
            if (rows.length <= 6) {
                chartData = rows.map((r: any) => ({ name: r.chain_type, value: Number(r.offer_count) }));
            } else {
                chartData = rows.slice(0, 5).map((r: any) => ({ name: r.chain_type, value: Number(r.offer_count) }));
                const otherValue = rows.slice(5).reduce((sum: number, r: any) => sum + Number(r.offer_count), 0);
                chartData.push({ name: "Other", value: otherValue });
            }

            const chart: ChartDefinition = {
                type: "pie",
                data: chartData,
                config: { valueLabel: "Total Offers", valueFormat: "number" }
            };

            return {
                answer: `Chain coverage breakdown:\n\n` +
                       `| Chain / Type | Unique Hotels | Total Offers |\n` +
                       `|---|---|---|\n` +
                       rows.map((r: any) => `| **${r.chain_type}** | ${r.hotel_count.toLocaleString('en-US')} | ${r.offer_count.toLocaleString('en-US')} |`).join("\n"),
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T20. Fuzzy match quality check
    {
        id: "t20_fuzzy_match_quality",
        patterns: [
            /how many matches have low confidence/,
            /how reliable is our matching/,
            /fuzzy score distribution/
        ],
        slots: [],
        // NOTE: explicitly drops fuzzy_score >= 90 from BASE_WHERE
        generateSql: () => ({
            query: `
                SELECT 
                    CASE 
                        WHEN fuzzy_score >= 95 THEN '95-100 (Excellent)'
                        WHEN fuzzy_score >= 90 THEN '90-94 (Good)'
                        WHEN fuzzy_score >= 80 THEN '80-89 (Fair)'
                        ELSE 'Below 80 (Poor)'
                    END as match_quality,
                    COUNT(*) as volume
                FROM data_table
                WHERE tbo_hotelcode != 0 AND fuzzy_score IS NOT NULL
                GROUP BY match_quality
                ORDER BY match_quality DESC
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No fuzzy matching score data found.` };
            
            const chartData = rows.map((r: any) => ({
                name: r.match_quality,
                value: Number(r.volume)
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Volume", valueFormat: "number" }
            };

            return {
                answer: `Fuzzy match quality distribution.`,
                chart,
                table: buildTable(rows)
            };
        }
    }
];
