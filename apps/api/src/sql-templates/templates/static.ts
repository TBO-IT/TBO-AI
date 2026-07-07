import { TemplateDefinition, SqlQuery, Tier0StructuredResponse } from "../types.js";

export const staticTemplates: TemplateDefinition[] = [
    {
        id: "T57_GLOSSARY_LOOKUP",
        patterns: [
            /what\s+is\s+(?<term>win\s+rate|price\s+gap|volume|apw|booking\s+window|los|length\s+of\s+stay|status|competitive\s+status)/i,
            /define\s+(?<term>win\s+rate|price\s+gap|volume|apw|booking\s+window|los|length\s+of\s+stay|status|competitive\s+status)/i,
            /how\s+do\s+you\s+calculate\s+(?<term>win\s+rate|price\s+gap|volume|apw|booking\s+window|los|length\s+of\s+stay|status|competitive\s+status)/i
        ],
        slots: ["term"],
        generateSql: (): SqlQuery => {
            // No SQL needed for static lookups. 
            // We just return a dummy query that yields 1 row, 
            // since router.ts executes whatever query is returned.
            return { query: `SELECT 1 as dummy`, params: [] };
        },
        formatAnswer: (_, resolvedSlots): Tier0StructuredResponse | string => {
            const term = resolvedSlots.term?.toLowerCase().replace(/\s+/g, "_") || "";
            
            switch (term) {
                case "win_rate":
                    return "**Win Rate**: The percentage of times TBO's price is strictly lower than the competitor's price for the exact same hotel, date, and stay parameters.";
                case "price_gap":
                    return "**Price Gap**: The percentage difference between the competitor's price and TBO's price. Positive values mean we are cheaper (winning), negative means we are more expensive.";
                case "volume":
                    return "**Volume**: The total number of competitive queries/comparisons evaluated in the given dataset or slice.";
                case "apw":
                case "booking_window":
                    return "**APW (Advance Purchase Window)**: The number of days between the date the search was performed and the check-in date.";
                case "los":
                case "length_of_stay":
                    return "**Length of Stay**: The number of nights requested in the query.";
                case "status":
                case "competitive_status":
                    return "**Competitive Status**: Categorizes the offer as 'Winning' (we are cheaper) or 'Losing' (competitor is cheaper or equal).";
                default:
                    return `I'm not sure how to define "${resolvedSlots.term}". Try asking about win rate, price gap, or volume.`;
            }
        }
    },
    {
        id: "T58_CAPABILITIES_HELP",
        patterns: [
            /what\s+can\s+you\s+do/i,
            /what\s+are\s+your\s+capabilities/i,
            /^help$/i,
            /how\s+does\s+this\s+work/i
        ],
        slots: [],
        generateSql: (): SqlQuery => ({ query: `SELECT 1 as dummy`, params: [] }),
        formatAnswer: (): Tier0StructuredResponse | string => {
            return `I can help you analyze TBO's competitive performance data! Here are some things you can ask me:

- **Metrics**: "What is our win rate?" or "What is the average price gap in Dubai?"
- **Breakdowns**: "Show win rate by destination and chain"
- **Trends**: "How has win rate changed over time?"
- **Drill-downs**: Start with "win rate by destination", then ask "what about Marriott?"
- **Alerts**: "Are we competitive in Phuket?" or "Which hotels have a price gap over 10%?"
- **Profiles**: "Give me a summary of Dubai"`;
        }
    }
];
