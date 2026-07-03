import { QuestionFilter } from "../questionTypes.js";

export enum BusinessTaskType {
    PERFORMANCE,
    TREND,
    ROOT_CAUSE,
    CONTRIBUTION,
    COMPARISON,
    COMPETITOR,
    DESTINATION,
    HOTEL,
    CHAIN,
    SUPPLIER,
    APW,
    CONTRACTING_MANAGER,
    WOW,
    MOM
}

export interface BusinessTask {
    type: BusinessTaskType;

    purpose: string;

    filters?: QuestionFilter[];

    entities?: string[];

    metrics?: string[];

    dimensions?: string[];

    priority: number;
}