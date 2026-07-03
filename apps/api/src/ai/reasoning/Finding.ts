export interface Finding {

    title: string;

    description: string;

    severity: "LOW" | "MEDIUM" | "HIGH";

    supportingEvidence: string[];

}