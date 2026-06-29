export const ClaudeOutputSchemas = {
    generatedQuery: {
        name: "GeneratedQuery",
        description: "The syntactically correct DuckDB SQL query and brief explanation.",
        input_schema: {
            type: "object",
            properties: {
                sql: {
                    type: "string",
                    description: "The complete DuckDB SQL query string. Do NOT include markdown code blocks or semicolons."
                },
                explanation: {
                    type: "string",
                    description: "One sentence explaining how the query answers the question."
                }
            },
            required: ["sql", "explanation"]
        }
    },
    executiveNarrative: {
        name: "ExecutiveNarrative",
        description: "The executive narrative analyzing the data.",
        input_schema: {
            type: "object",
            properties: {
                narrative: {
                    type: "string",
                    description: "The comprehensive narrative response explaining the findings."
                }
            },
            required: ["narrative"]
        }
    }
};
