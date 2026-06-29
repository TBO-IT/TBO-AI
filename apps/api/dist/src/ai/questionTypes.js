/**
 * Custom error thrown when validation fails before Claude generation.
 */
export class QuestionValidationError extends Error {
    validationResult;
    constructor(result) {
        super("Question failed analytical validation: " + result.errors.join("; "));
        this.name = "QuestionValidationError";
        this.validationResult = result;
    }
}
