import { TemplateDefinition, ClassifierResult } from "./types.js";

const REJECTION_KEYWORDS = [
    "why", "cause", "reason", "but", "only", "excluding", "except", "should", "recommend", "how to"
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

        const FILLER_WORDS_FOR_LEFTOVERS = [
            "please", "can you", "tell me", "show me", "what is", "whats", "what's", "are we", "is there", "do we", "give me", "i want to know", "the", "a", "an", "for", "in", "of", "on", "about", "to", "see", "look", "at"
        ];

        let lastReason = "No template patterns matched.";

        for (const template of this.templates) {
            for (const pattern of template.patterns) {
                const match = normalized.match(pattern);
                
                if (match) {
                    const slots = match.groups || {};
                    const matchedString = match[0];
                    const leftover = normalized.replace(matchedString, "").trim();
                    
                    let cleanedLeftover = leftover;
                    for (const filler of FILLER_WORDS_FOR_LEFTOVERS) {
                        cleanedLeftover = cleanedLeftover.replace(new RegExp(`\\b${filler}\\b`, 'gi'), "").trim();
                    }
                    cleanedLeftover = cleanedLeftover.replace(/\s+/g, ' ').trim();

                    if (cleanedLeftover.length > 0 && cleanedLeftover.split(/\s+/).length > 2) {
                        lastReason = `Leftover words detected: "${leftover}" (cleaned: "${cleanedLeftover}")`;
                        continue; // try other patterns
                    }

                    return {
                        matched: true,
                        template_id: template.id,
                        slots,
                        confidence: 1.0
                    };
                }
            }
        }

        return { matched: false, reason: lastReason };
    }
}

export const globalClassifier = new Classifier();
