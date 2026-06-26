import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { ValidationError } from "../errors/ValidationError.js";
import {
    getBestMatchingSchema,
    getDisplayHeaderName,
    normalizeHeader,
    resolveDatasetTypeByHeaders,
} from "../config/datasetSchema.js";
import { DatasetType } from "../ai/datasetTypes.js";

const BINARY_SAMPLE_SIZE = 4096;
const MAX_COLUMNS = 500;
const VALIDATION_SAMPLE_ROWS = 250;

export interface CsvValidationMetadata {
    rowEstimate: number;
    columnCount: number;
    headers: string[];
    encoding: "utf-8" | "windows-1252" | "latin1";
}

export class CsvValidationError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = "CsvValidationError";
    }
}

function isLikelyBinary(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, Math.min(buffer.length, BINARY_SAMPLE_SIZE));
    if (sample.length === 0) {
        return false;
    }

    let suspicious = 0;
    for (const byte of sample) {
        if (byte === 0) {
            return true;
        }

        const isAllowedControl = byte === 9 || byte === 10 || byte === 13;
        const isPrintableAscii = byte >= 32 && byte <= 126;
        const isUtf8Lead = byte >= 194 && byte <= 244;
        const isUtf8Continuation = byte >= 128 && byte <= 191;

        if (!isAllowedControl && !isPrintableAscii && !isUtf8Lead && !isUtf8Continuation) {
            suspicious++;
        }
    }

    return suspicious / sample.length > 0.05;
}

function decodeWithFallback(buffer: Buffer): { text: string; encoding: CsvValidationMetadata["encoding"] } {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        const text = new TextDecoder("utf-16le", { fatal: true }).decode(buffer.subarray(2));
        return { text, encoding: "utf-8" };
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        const text = new TextDecoder("utf-16be", { fatal: true }).decode(buffer.subarray(2));
        return { text, encoding: "utf-8" };
    }

    const decoders: Array<{ encoding: CsvValidationMetadata["encoding"]; decoder: TextDecoder }> = [
        { encoding: "utf-8", decoder: new TextDecoder("utf-8", { fatal: true }) },
        { encoding: "windows-1252", decoder: new TextDecoder("windows-1252", { fatal: true }) },
        { encoding: "latin1", decoder: new TextDecoder("latin1", { fatal: true }) },
    ];

    for (const candidate of decoders) {
        try {
            return { text: candidate.decoder.decode(buffer), encoding: candidate.encoding };
        } catch {
            continue;
        }
    }

    throw new CsvValidationError("Unsupported encoding.");
}

function isValidNumeric(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }
    const normalized = trimmed.replace(/,/g, "").replace(/%$/g, "");
    if (!normalized || normalized === "." || normalized === "-") {
        return false;
    }
    return Number.isFinite(Number(normalized));
}

function isValidDate(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }

    const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) {
        const day = Number(dmyMatch[1]);
        const month = Number(dmyMatch[2]);
        const year = Number(dmyMatch[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
        const year = Number(ymdMatch[1]);
        const month = Number(ymdMatch[2]);
        const day = Number(ymdMatch[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed);
}

function ensureConsistentColumns(rows: string[][], columnCount: number): void {
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].length !== columnCount) {
            throw new CsvValidationError(
                `Malformed CSV: row ${i + 1} has ${rows[i].length} columns, expected ${columnCount}.`
            );
        }
    }
}

export async function validateCsv(filePath: string): Promise<CsvValidationMetadata> {
    let stat;
    try {
        stat = await fs.stat(filePath);
    } catch {
        throw new CsvValidationError("CSV file is missing.");
    }

    if (!stat.isFile()) {
        throw new CsvValidationError("CSV file is missing.");
    }

    if (stat.size === 0) {
        throw new CsvValidationError("CSV is empty.");
    }

    let rawBuffer: Buffer;
    try {
        rawBuffer = await fs.readFile(filePath);
    } catch {
        throw new CsvValidationError("CSV file is unreadable.");
    }

    if (rawBuffer.length === 0) {
        throw new CsvValidationError("CSV is empty.");
    }

    if (isLikelyBinary(rawBuffer)) {
        throw new CsvValidationError("Binary file detected. CSV required.");
    }

    const decodedResult = decodeWithFallback(rawBuffer);
    const decoded = decodedResult.text;
    if (!decoded.trim()) {
        throw new CsvValidationError("CSV is empty.");
    }

    let rows: string[][];
    try {
        rows = parse(decoded, {
            skip_empty_lines: true,
            relax_quotes: false,
            relax_column_count: false,
            bom: true,
        }) as string[][];
    } catch {
        throw new CsvValidationError("Malformed CSV.");
    }

    if (!rows.length) {
        throw new CsvValidationError("CSV is empty.");
    }

    const headerRow = rows[0];
    if (!headerRow || headerRow.length === 0 || headerRow.every(h => !String(h ?? "").trim())) {
        throw new CsvValidationError("Missing header row.");
    }

    if (headerRow.length > MAX_COLUMNS) {
        throw new CsvValidationError(`Absurd number of columns: ${headerRow.length}.`);
    }

    const normalizedHeaderToOriginal = new Map<string, string>();
    for (const rawHeader of headerRow) {
        const displayHeader = getDisplayHeaderName(String(rawHeader ?? ""));
        const normalized = normalizeHeader(displayHeader);
        if (normalizedHeaderToOriginal.has(normalized)) {
            throw new CsvValidationError(`Duplicate header:\n\n${displayHeader}`);
        }
        normalizedHeaderToOriginal.set(normalized, displayHeader);
    }

    ensureConsistentColumns(rows, headerRow.length);

    const headers = Array.from(normalizedHeaderToOriginal.values());
    const { schema } = getBestMatchingSchema(headers);
    const normalizedHeaderSet = new Set(Array.from(normalizedHeaderToOriginal.keys()));

    const missingRequired = schema.REQUIRED_COLUMNS
        .filter(required => !normalizedHeaderSet.has(normalizeHeader(required)));

    if (missingRequired.length > 0) {
        const pretty = missingRequired.map(getDisplayHeaderName).join("\n");
        throw new CsvValidationError(`Missing columns:\n\n${pretty}`);
    }

    const datasetType = resolveDatasetTypeByHeaders(headers);
    if (datasetType === DatasetType.UNKNOWN) {
        throw new CsvValidationError("Missing columns:\n\nCould not identify dataset schema.");
    }

    const numericColumns = schema.NUMERIC_COLUMNS
        .filter(col => normalizedHeaderSet.has(normalizeHeader(col)));
    const dateColumns = schema.DATE_COLUMNS
        .filter(col => normalizedHeaderSet.has(normalizeHeader(col)));
    const enumColumns = Object.entries(schema.ENUM_COLUMNS)
        .filter(([col]) => normalizedHeaderSet.has(normalizeHeader(col)));

    const headerIndexByNormalized = new Map<string, number>();
    headerRow.forEach((raw, idx) => {
        const normalized = normalizeHeader(getDisplayHeaderName(String(raw ?? "")));
        headerIndexByNormalized.set(normalized, idx);
    });

    const maxRow = Math.min(rows.length - 1, VALIDATION_SAMPLE_ROWS);
    for (let i = 1; i <= maxRow; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        for (const col of numericColumns) {
            const index = headerIndexByNormalized.get(normalizeHeader(col));
            if (index == null) continue;
            const value = String(row[index] ?? "");
            if (!isValidNumeric(value)) {
                throw new CsvValidationError(`Invalid numeric value in ${getDisplayHeaderName(col)} at row ${rowNum}.`);
            }
        }

        for (const col of dateColumns) {
            const index = headerIndexByNormalized.get(normalizeHeader(col));
            if (index == null) continue;
            const value = String(row[index] ?? "");
            if (!isValidDate(value)) {
                throw new CsvValidationError(`Invalid date value in ${getDisplayHeaderName(col)} at row ${rowNum}.`);
            }
        }

        for (const [col, allowedValues] of enumColumns) {
            const index = headerIndexByNormalized.get(normalizeHeader(col));
            if (index == null) continue;
            const value = String(row[index] ?? "").trim();
            if (!value) continue;

            const isAllowed = allowedValues.some(v => v.toLowerCase() === value.toLowerCase());
            if (!isAllowed) {
                throw new CsvValidationError(
                    `Invalid enum value in ${getDisplayHeaderName(col)} at row ${rowNum}. Allowed: ${allowedValues.join(", ")}.`
                );
            }
        }
    }

    return {
        rowEstimate: Math.max(0, rows.length - 1),
        columnCount: headers.length,
        headers,
        encoding: decodedResult.encoding,
    };
}