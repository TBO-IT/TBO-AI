import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

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
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.hotel_count === 0) return `No data found for ${slots.destination}.`;
            return `We have scraped ${r.hotel_count.toLocaleString('en-US')} unique hotels across ${r.offer_count.toLocaleString('en-US')} offers in ${slots.destination}.`;
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No coverage data found.`;
            return `Here is our data coverage across top destinations:\n\n` +
                   `| Destination | Unique Hotels | Total Offers |\n` +
                   `|---|---|---|\n` +
                   rows.slice(0, 10).map((r: any) => `| **${r.destination}** | ${r.hotel_count.toLocaleString('en-US')} | ${r.offer_count.toLocaleString('en-US')} |`).join("\n");
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No competitor coverage data found.`;
            return `Coverage breakdown by competitor:\n\n` +
                   `| Competitor | Unique Hotels | Total Offers |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.thirdparty}** | ${r.hotel_count.toLocaleString('en-US')} | ${r.offer_count.toLocaleString('en-US')} |`).join("\n");
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No chain coverage data found.`;
            return `Chain coverage breakdown:\n\n` +
                   `| Chain / Type | Unique Hotels | Total Offers |\n` +
                   `|---|---|---|\n` +
                   rows.map((r: any) => `| **${r.chain_type}** | ${r.hotel_count.toLocaleString('en-US')} | ${r.offer_count.toLocaleString('en-US')} |`).join("\n");
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No fuzzy matching score data found.`;
            return `Fuzzy match quality distribution:\n\n` +
                   `| Quality Bucket | Volume |\n` +
                   `|---|---|\n` +
                   rows.map((r: any) => `| **${r.match_quality}** | ${r.volume.toLocaleString('en-US')} |`).join("\n");
        }
    }
];
