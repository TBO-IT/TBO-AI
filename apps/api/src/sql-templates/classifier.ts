import { TemplateDefinition, ClassifierResult } from "./types.js";

const FILLER_WORDS = [
    "please", "can you", "tell me", "show me", "what is", "whats", "what's", "are we", "is there", "do we", "give me", "i want to know"
];

const REJECTION_KEYWORDS = [
    "why", "cause", "reason", "but", "only", "excluding", "except", "compare", "vs", "versus", "should", "recommend", "how to"
];

export class Classifier {
    private templates: TemplateDefinition[] = [];

    register(template: TemplateDefinition) {
        this.templates.push(template);
    }

    private normalize(text: string): string {
        let normalized = text.toLowerCase().trim();
        // Remove punctuation
        normalized = normalized.replace(/[?.,!]/g, "");
        
        // Remove common fillers from the start
        for (const filler of FILLER_WORDS) {
            if (normalized.startsWith(filler)) {
                normalized = normalized.replace(filler, "").trim();
            }
        }
        return normalized;
    }

    private hasRejectionKeywords(text: string): boolean {
        const words = text.split(/\s+/);
        return REJECTION_KEYWORDS.some(kw => words.includes(kw));
    }

    classify(rawQuestion: string): ClassifierResult {
        const normalized = this.normalize(rawQuestion);

        if (this.hasRejectionKeywords(normalized)) {
            return { matched: false, reason: "Contains rejection keywords (e.g. why, compare, etc.)" };
        }

        for (const template of this.templates) {
            for (const pattern of template.patterns) {
                const match = normalized.match(pattern);
                
                if (match) {
                    // Extract named capture groups
                    const slots = match.groups || {};
                    
                    // Leftover check
                    const matchedString = match[0];
                    const leftover = normalized.replace(matchedString, "").trim();
                    
                    if (leftover.length > 0 && leftover.split(/\s+/).length > 2) {
                        return { matched: false, reason: `Leftover words detected: "${leftover}"` };
                    }

                    return {
                        matched: true,
                        template_id: template.id,
                        slots,
                        confidence: 1.0 // Regex match is confident, slot-resolver will lower it if needed
                    };
                }
            }
        }

        return { matched: false, reason: "No template patterns matched." };
    }
}

export const globalClassifier = new Classifier();
