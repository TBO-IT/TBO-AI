import { generateContributionSql } from "./services/contributionEngine.js";

const analysis: any = {
    intent: "ROOT_CAUSE",
    metrics: ["win_rate"],
    dimensions: [],
    filters: [
        { dimension: "month", operator: "=", value: 4 },
        { dimension: "month", operator: "=", value: 5 }
    ]
};

const semanticLayer: any = {
    datasetType: "tbo",
    allColumns: [{ column_name: "hotel" }, { column_name: "scraped_date" }],
    metrics: [{ name: "Win Rate", formula: "AVG(win_rate)" }],
    metricKeys: ["win_rate"],
    dimensions: ["hotel"],
    primaryTimeDimension: "scraped_date"
};

const result = generateContributionSql(analysis, semanticLayer, "hotel");
console.log(result?.sql);
