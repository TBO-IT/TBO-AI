import { AppError } from "./AppError.js";
export class NotFoundError extends AppError {
    constructor(message = "Not Found") {
        super(message, 404);
    }
}
