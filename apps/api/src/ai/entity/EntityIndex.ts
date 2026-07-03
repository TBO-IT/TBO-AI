export interface EntityIndex {
    chain: string[];
    destination: string[];
    supplier: string[];
    hotel: string[];
    city: string[];
    country: string[];
    apw: string[];
    competitor: string[];
    contractingManager: string[];
}

export const EMPTY_ENTITY_INDEX: EntityIndex = {
    chain: [],
    destination: [],
    supplier: [],
    hotel: [],
    city: [],
    country: [],
    apw: [],
    competitor: [],
    contractingManager: []
};