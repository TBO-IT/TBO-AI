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
import { universalTemplate } from "./templates/universal.js";
import { profileTemplates } from "./templates/profile.js";
import { alertTemplates } from "./templates/alerts.js";
import { staticTemplates } from "./templates/static.js";

// Combine all 36 templates from the sub-modules
export const templates: TemplateDefinition[] = [
    universalTemplate,
    ...profileTemplates,
    ...alertTemplates,
    ...staticTemplates,
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
