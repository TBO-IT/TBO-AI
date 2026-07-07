import { TemplateDefinition } from "../types.js";

const BASE_WHERE = `fuzzy_score >= 90 AND tbo_hotelcode != 0`;

export const dataMetaTemplates: TemplateDefinition[] = [
    // T34. Data freshness
    {
        id: "t34_data_freshness",
        patterns: [
            /when was this last updated/,
            /what.*s the most recent scrape date/,
            /how current is this data/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT MAX(scraped_date) as last_scraped
                FROM data_table
                WHERE scraped_date IS NOT NULL
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            const r = rows[0];
            if (!r || !r.last_scraped) return `I couldn't determine the most recent scrape date.`;
            return `The most recent scrape date in this dataset is **${r.last_scraped}**.`;
        }
    },

    // T35. Available destinations / filters
    {
        id: "t35_available_destinations",
        patterns: [
            /what destinations do we track/,
            /what markets are covered/,
            /list all destinations/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT destination, COUNT(*) as volume
                FROM data_table
                WHERE ${BASE_WHERE} AND destination IS NOT NULL AND TRIM(destination) <> ''
                GROUP BY destination
                ORDER BY volume DESC
                LIMIT 100
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            if (rows.length === 0) return `No destinations found in the dataset.`;
            return `We currently track ${rows.length} top destinations. Here are some of the most tracked:\n\n` +
                   rows.slice(0, 15).map((r: any) => `- **${r.destination}** (${r.volume.toLocaleString('en-US')} offers)`).join("\n");
        }
    },

    // T36. Date range of available data
    {
        id: "t36_date_range",
        patterns: [
            /what date range does this cover/,
            /how far back does the data go/,
            /what checkin dates do we have/
        ],
        slots: [],
        generateSql: () => ({
            query: `
                SELECT 
                    MIN(checkin) as first_checkin,
                    MAX(checkin) as last_checkin,
                    MIN(scraped_date) as first_scraped,
                    MAX(scraped_date) as last_scraped
                FROM data_table
            `,
            params: []
        }),
        formatAnswer: (rows) => {
            const r = rows[0];
            if (!r) return `I couldn't determine the date ranges.`;
            return `**Dataset Date Ranges**:\n` +
                   `- **Check-in dates**: From ${r.first_checkin || 'Unknown'} to ${r.last_checkin || 'Unknown'}\n` +
                   `- **Scraped dates**: From ${r.first_scraped || 'Unknown'} to ${r.last_scraped || 'Unknown'}`;
        }
    }
];
