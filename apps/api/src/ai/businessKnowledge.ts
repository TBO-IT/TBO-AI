export const BUSINESS_KNOWLEDGE = {
    domain: "Travel Analytics",
    concepts: {
        destination: {
            description: "Travel destination being analyzed."
        },
        supplier: {
            description: "Supplier providing hotel inventory."
        },
        hotel: {
            description: "Hotel property."
        },
        chain: {
            description: "Hotel chain."
        },
        contracting_manager: {
            description: "The name of the person responsible for managing the contracting relationship for each hotel. Use as a grouping or filtering dimension only — never aggregate it as a metric."
        }
    },
    timeIntelligence: {
        wow: "Week over Week comparison",
        mom: "Month over Month comparison",
        qoq: "Quarter over Quarter comparison",
        yoy: "Year over Year comparison"
    }
};
