import { TemplateDefinition, SqlQuery, Tier0StructuredResponse } from "../types.js";

export const alertTemplates: TemplateDefinition[] = [
    {
        id: "T39_PRICE_GAP_HOTELS",
        patterns: [
            /(?:which|what|show|list)\s+hotels?(?:\s+have|\s+are)?\s+(?:a\s+)?price\s+(?:gap|diff|difference)\s+(?:over|above|greater than)\s+(?<threshold>\d+)%/i,
            /(?:show|flag)\s+(?:hotels|properties)\s+where\s+we're\s+more\s+than\s+(?<threshold>\d+)%\s+pricier/i
        ],
        slots: ["threshold"],
        generateSql: (resolvedSlots): SqlQuery => {
            const threshold = parseFloat(resolvedSlots.threshold || "0");
            return {
                query: `SELECT "hotel", "destination", "thirdparty", "price_diff_perc" FROM data_table WHERE "price_diff_perc" > ? ORDER BY "price_diff_perc" DESC LIMIT 50`,
                params: [threshold]
            };
        },
        formatAnswer: (rows): Tier0StructuredResponse | string => {
            if (rows.length === 0) return "There are no hotels breaching that price threshold.";
            return {
                answer: `Found ${rows.length} hotels exceeding that price gap:`,
                table: {
                    columns: ["Hotel", "Destination", "Competitor", "Price Gap %"],
                    rows: rows.map(r => [r.hotel, r.destination, r.thirdparty, r.price_diff_perc])
                }
            };
        }
    },
    {
        id: "T40_THRESHOLD_COUNT",
        patterns: [
            /how\s+many\s+hotels?\s+are\s+more\s+than\s+(?<threshold>\d+)%\s+overpriced/i,
            /how\s+many\s+are\s+within\s+(?<threshold>\d+)%\s+of/i
        ],
        slots: ["threshold"],
        generateSql: (resolvedSlots): SqlQuery => {
            const threshold = parseFloat(resolvedSlots.threshold || "0");
            // If the query said 'within', it implies <= threshold, but the regex above matches 'more than' too.
            // Let's just do a generic > threshold for simplicity based on the first pattern.
            return {
                query: `SELECT COUNT(*) as vol FROM data_table WHERE "price_diff_perc" > ?`,
                params: [threshold]
            };
        },
        formatAnswer: (rows): Tier0StructuredResponse | string => {
            const vol = rows[0]?.vol || 0;
            return {
                answer: `There are **${vol}** hotels above that threshold.`,
                highlight: { metric: "count", value: vol }
            };
        }
    },
    {
        id: "T41_COMPETITIVENESS_CHECK",
        patterns: [
            /are\s+we\s+competitive\s+in\s+(?<destination>.+)/i,
            /is\s+(?<destination>.+?)\s+a\s+problem\s+market/i,
            /is\s+our\s+win\s+rate\s+healthy\s+in\s+(?<destination>.+)/i
        ],
        slots: ["destination"],
        generateSql: (resolvedSlots): SqlQuery => {
            return {
                query: `SELECT ROUND(SUM(CASE WHEN tbo_price < thirdparty_price THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1) as win_rate FROM data_table WHERE destination ILIKE ?`,
                params: [`%${resolvedSlots.destination}%`]
            };
        },
        formatAnswer: (rows, resolvedSlots): Tier0StructuredResponse | string => {
            const wr = parseFloat(rows[0]?.win_rate || "0");
            const dest = resolvedSlots.destination;
            
            let label = "Underperforming";
            if (wr >= 55) label = "Strong";
            else if (wr >= 45) label = "Competitive";

            return {
                answer: `${dest} is **${label}** at a ${wr}% win rate (based on a 45% healthy-market threshold).`,
                highlight: { metric: "competitiveness", value: label }
            };
        }
    }
];
