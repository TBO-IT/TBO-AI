import { AppError } from "./AppError.js";

export class InternalServerError extends AppError {
    constructor(message = "Internal Server Error") {
        super(message, 500, false);
    }
}