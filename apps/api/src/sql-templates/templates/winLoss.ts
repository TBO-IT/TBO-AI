import { TemplateDefinition, Tier0StructuredResponse, ChartDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

const buildTable = (rows: any[]) => {
    if (!rows || rows.length === 0) return undefined;
    return {
        columns: Object.keys(rows[0]),
        rows: rows
    };
};

export const winLossTemplates: TemplateDefinition[] = [
    // T01. Overall win rate
    {
        id: "t01_overall_win_rate",
        patterns: [
            /what.*s our win rate/,
            /how are we doing overall/,
            /are we winning more than losing/,
            /overall win rate/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE}
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            const r = rows[0];
            return {
                answer: `Overall, we are winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} total offers).`,
                table: buildTable(rows)
            };
        }
    },

    // T02. Win rate by destination
    {
        id: "t02_win_rate_destination",
        patterns: [
            /our win rate in (?<destination>[a-z\s]+)/,
            /win rate in (?<destination>[a-z\s]+)/,
            /winning in (?<destination>[a-z\s]+)/,
            /how are we doing in (?<destination>[a-z\s]+)/,
            /are we winning against competitors in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return { answer: `No matching data found for ${slots.destination}.` };
            return {
                answer: `${slots.destination} is currently winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} matched offers).`,
                table: buildTable(rows)
            };
        }
    },

    // T03. Win rate breakdown — all destinations
    {
        id: "t03_win_rate_breakdown_destinations",
        patterns: [
            /break down win rate by destination/,
            /which destinations are we winning.*losing in/,
            /win rate for all destinations/,
            /show me performance across destinations/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    destination,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> ''
                GROUP BY destination
                ORDER BY total_offers DESC
                LIMIT 50
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No data found.` };
            
            const chartData = rows.slice(0, 10).map((r: any) => ({
                name: r.destination,
                value: Number(r.win_rate.toFixed(1))
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Here is the win rate breakdown across our top destinations.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T04. Best / worst performing destination
    {
        id: "t04_best_worst_destination",
        patterns: [
            /which destination are we winning the most in/,
            /where are we winning the most/,
            /where are we losing the most/,
            /worst performing market/,
            /best performing market/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    destination,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> ''
                GROUP BY destination
                HAVING COUNT(*) > 50
                ORDER BY win_rate DESC
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No statistically significant data found.` };
            const best = rows[0];
            const worst = rows[rows.length - 1];
            
            const chartData = rows.slice(0, 5).concat(rows.slice(-5)).map((r: any) => ({
                name: r.destination,
                value: Number(r.win_rate.toFixed(1))
            }));

            const chart: ChartDefinition = {
                type: "bar",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Our **best performing** market is **${best.destination}** with a win rate of ${best.win_rate.toFixed(1)}%.\nOur **worst performing** market is **${worst.destination}** with a win rate of ${worst.win_rate.toFixed(1)}%.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T05. Win rate vs specific competitor
    {
        id: "t05_win_rate_competitor",
        patterns: [
            /are we beating (?<thirdparty>[a-z\s]+)/,
            /win rate against (?<thirdparty>[a-z\s]+)/,
            /how do we compare to (?<thirdparty>[a-z\s]+)/
        ],
        slots: ["thirdparty"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(thirdparty) = UPPER(?)
            `,
            params: [slots.thirdparty]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return { answer: `No matching data found against ${slots.thirdparty}.` };
            return {
                answer: `Against ${slots.thirdparty}, we are winning ${r.win_rate.toFixed(1)}% of the time (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} comparisons).`,
                table: buildTable(rows)
            };
        }
    },

    // T06. Win rate trend over time
    {
        id: "t06_win_rate_trend",
        patterns: [
            /is our win rate improving/,
            /win rate trend/,
            /are we winning more than last month/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    DATE_TRUNC('month', TRY_CAST(COALESCE(try_strptime(scraped_date, '%m/%d/%Y'), try_strptime(scraped_date, '%d/%m/%Y'), try_strptime(scraped_date, '%Y-%m-%d')) AS DATE)) as month_date,
                    COUNT(*) as total_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND scraped_date IS NOT NULL
                GROUP BY month_date
                ORDER BY month_date ASC
            `,
            params: []
        }),
        formatAnswer: (rows): Tier0StructuredResponse => {
            const validRows = rows.filter(r => r.month_date);
            if (validRows.length === 0) return { answer: `No trend data found based on scraped dates.` };
            
            const chartData = validRows.map((r: any) => ({
                name: new Date(r.month_date).toISOString().substring(0,7),
                value: Number(r.win_rate.toFixed(1))
            }));

            const chart: ChartDefinition = {
                type: "line",
                data: chartData,
                config: { valueLabel: "Win Rate", valueFormat: "percent" }
            };

            return {
                answer: `Here is the win rate trend over time.`,
                chart,
                table: buildTable(rows)
            };
        }
    },

    // T07. Win rate by chain
    {
        id: "t07_win_rate_chain",
        patterns: [
            /which chain is winning the most/,
            /win rate for (?<chain>[a-z\s]+)/,
            /win rate by chain/
        ],
        slots: ["chain"],
        generateSql: (slots) => {
            if (slots.chain) {
                return {
                    query: `
                        SELECT 
                            COUNT(*) as total_offers,
                            COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                            (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                        FROM data_table
                        WHERE ${BASE_WHERE} AND UPPER(tbo_chainname) = UPPER(?)
                    `,
                    params: [slots.chain]
                };
            }
            return {
                query: `
                    SELECT 
                        tbo_chainname as chain,
                        COUNT(*) as total_offers,
                        (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                    FROM data_table
                    WHERE ${BASE_WHERE} AND tbo_chainname IS NOT NULL AND TRIM(tbo_chainname) <> ''
                    GROUP BY tbo_chainname
                    ORDER BY total_offers DESC
                    LIMIT 20
                `,
                params: []
            };
        },
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            if (slots.chain) {
                const r = rows[0];
                if (!r || r.total_offers === 0) return { answer: `No matching data found for the chain ${slots.chain}.` };
                return {
                    answer: `For ${slots.chain}, we are winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} matched offers).`,
                    table: buildTable(rows)
                };
            } else {
                if (rows.length === 0) return { answer: `No chain data found.` };
                const chartData = rows.slice(0, 10).map((r: any) => ({
                    name: r.chain,
                    value: Number(r.win_rate.toFixed(1))
                }));
                return {
                    answer: `Here is the win rate breakdown across our top chains.`,
                    chart: { type: "bar", data: chartData, config: { valueLabel: "Win Rate", valueFormat: "percent" } },
                    table: buildTable(rows)
                };
            }
        }
    },

    // T08. Count of wins/losses
    {
        id: "t08_count_wins",
        patterns: [
            /how many hotels are we winning in (?<destination>[a-z\s]+)/,
            /how many losing comparisons do we have in (?<destination>[a-z\s]+)/
        ],
        slots: ["destination"],
        generateSql: (slots) => ({
            query: `
                SELECT 
                    "Competitive Status" as status,
                    COUNT(*) as count
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(destination) = UPPER(?)
                GROUP BY status
            `,
            params: [slots.destination]
        }),
        formatAnswer: (rows, slots): Tier0StructuredResponse => {
            if (rows.length === 0) return { answer: `No matching data found in ${slots.destination}.` };
            return {
                answer: `In ${slots.destination}:\n` + rows.map((r: any) => `- **${r.status || 'Unknown'}**: ${r.count.toLocaleString('en-US')} comparisons`).join('\n'),
                table: buildTable(rows)
            };
        }
    }
];
