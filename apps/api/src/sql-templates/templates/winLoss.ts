import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

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
        formatAnswer: (rows) => {
            const r = rows[0];
            return `Overall, we are winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} total offers).`;
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
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return `No matching data found for ${slots.destination}.`;
            return `${slots.destination} is currently winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} matched offers).`;
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No data found.`;
            return `Here is the win rate breakdown across our top destinations:\n\n` +
                   `| Destination | Win Rate | Total Offers |\n` +
                   `|---|---|---|\n` +
                   rows.slice(0, 10).map((r: any) => `| **${r.destination}** | ${r.win_rate.toFixed(1)}% | ${r.total_offers.toLocaleString('en-US')} |`).join("\n");
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No statistically significant data found.`;
            const best = rows[0];
            const worst = rows[rows.length - 1];
            return `Our **best performing** market is **${best.destination}** with a win rate of ${best.win_rate.toFixed(1)}%.\n` +
                   `Our **worst performing** market is **${worst.destination}** with a win rate of ${worst.win_rate.toFixed(1)}%.`;
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
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return `No matching data found against ${slots.thirdparty}.`;
            return `Against ${slots.thirdparty}, we are winning ${r.win_rate.toFixed(1)}% of the time (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} comparisons).`;
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
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No trend data found based on scraped dates.`;
            let answer = `Here is the win rate trend over time:\n\n`;
            answer += `| Month | Win Rate | Volume |\n`;
            answer += `|---|---|---|\n`;
            rows.forEach((r: any) => {
                if(!r.month_date) return;
                const dateStr = new Date(r.month_date).toISOString().substring(0,7);
                answer += `| ${dateStr} | ${r.win_rate.toFixed(1)}% | ${r.total_offers.toLocaleString('en-US')} |\n`;
            });
            return answer;
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
        generateSql: (slots) => ({
            query: `
                SELECT 
                    COUNT(*) as total_offers,
                    COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) as winning_offers,
                    (COUNT(CASE WHEN "Competitive Status" = 'Winning' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as win_rate
                FROM data_table
                WHERE ${BASE_WHERE} AND UPPER(tbo_chainname) = UPPER(?)
            `,
            params: [slots.chain]
        }),
        formatAnswer: (rows, slots) => {
            const r = rows[0];
            if (!r || r.total_offers === 0) return `No matching data found for the chain ${slots.chain}.`;
            return `For ${slots.chain}, we are winning ${r.win_rate.toFixed(1)}% of comparisons (${r.winning_offers.toLocaleString('en-US')} wins out of ${r.total_offers.toLocaleString('en-US')} matched offers).`;
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
        formatAnswer: (rows, slots) => {
            if (rows.length === 0) return `No matching data found in ${slots.destination}.`;
            return `In ${slots.destination}:\n` + rows.map((r: any) => `- **${r.status || 'Unknown'}**: ${r.count.toLocaleString('en-US')} comparisons`).join('\n');
        }
    }
];
