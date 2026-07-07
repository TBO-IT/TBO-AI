import { TemplateDefinition } from "./types.js";
import { winLossTemplates } from "./templates/winLoss.js";
import { priceComparisonTemplates } from "./templates/priceComparison.js";
import { volumeCoverageTemplates } from "./templates/volumeCoverage.js";
import { bookingWindowTemplates } from "./templates/bookingWindow.js";
import { timeTrendTemplates } from "./templates/timeTrend.js";
import { rankingTemplates } from "./templates/ranking.js";
import { comparativeTemplates } from "./templates/comparative.js";
import { entityLookupTemplates } from "./templates/entityLookup.js";
import { dataMetaTemplates } from "./templates/dataMeta.js";

// Combine all 36 templates from the sub-modules
export const templates: TemplateDefinition[] = [
    ...winLossTemplates,
    ...priceComparisonTemplates,
    ...volumeCoverageTemplates,
    ...bookingWindowTemplates,
    ...timeTrendTemplates,
    ...rankingTemplates,
    ...comparativeTemplates,
    ...entityLookupTemplates,
    ...dataMetaTemplates
];
