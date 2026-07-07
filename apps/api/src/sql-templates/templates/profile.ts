import { TemplateDefinition, SqlQuery, Tier0StructuredResponse } from "../types.js";

export const profileTemplates: TemplateDefinition[] = [
    {
        id: "T38_DESTINATION_PROFILE",
        patterns: [
            /give\s+me\s+a\s+summary\s+of\s+(?<destination>.+)/i,
            /how\s+is\s+(?<destination>.+?)\s+doing\s+overall/i,
            /(?<destination>.+?)\s+snapshot/i
        ],
        slots: ["destination"],
        generateSql: (resolvedSlots): SqlQuery => {
            const dest = `%${resolvedSlots.destination}%`;
            // DuckDB CTE to fetch stats and top 3 losers
            const query = `
                WITH stats AS (
                    SELECT 
                        destination,
                        COUNT(*) as vol,
                        ROUND(SUM(CASE WHEN tbo_price < thirdparty_price THEN 1 ELSE 0 END)*100.0/NULLIF(COUNT(*),0),1) as wr,
                        ROUND(AVG(price_diff_perc),1) as pd
                    FROM data_table
                    WHERE destination ILIKE ?
                    GROUP BY destination
                ),
                top_losers AS (
                    SELECT hotel, price_diff_perc
                    FROM data_table
                    WHERE destination ILIKE ? AND "Competitive Status" = 'Losing'
                    ORDER BY price_diff_perc DESC
                    LIMIT 3
                )
                SELECT 
                    s.vol, 
                    s.wr, 
                    s.pd,
                    (SELECT list(json_object('hotel', t.hotel, 'pd', t.price_diff_perc)) FROM top_losers t) as losers
                FROM stats s
            `;
            return {
                query,
                params: [dest, dest] 
            };
        },
        formatAnswer: (rows, resolvedSlots): Tier0StructuredResponse | string => {
            const row = rows[0];
            if (!row) return "No data found for this destination.";
            
            const losersList = typeof row.losers === "string" ? JSON.parse(row.losers) : row.losers;
            let losersText = "";
            if (losersList && losersList.length > 0) {
                losersText = `\n\n**Top hotels losing on price:**\n` + losersList.map((l: any) => `- **${l.hotel}** (${Number(l.pd).toFixed(1)}% gap)`).join('\n');
            }

            return {
                answer: `**${resolvedSlots.destination} Snapshot**\n- **Win Rate:** ${row.wr}%\n- **Average Price Gap:** ${row.pd}%\n- **Total Volume:** ${row.vol}${losersText}`,
                highlight: { metric: "win_rate", value: row.wr }
            };
        }
    }
];
