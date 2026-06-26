import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { validateCsv, CsvValidationError } from "../services/csvValidator.js";
import { duckdbAnalytics } from "../services/duckdbService.js";

async function writeTempFile(name: string, content: Buffer | string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "csv-validator-"));
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, content);
    return filePath;
}

describe("csvValidator", () => {
    it("accepts a valid CSV", async () => {
        const filePath = await writeTempFile(
            "valid.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                "Winning,12.5,high,chain-a,supplier-a,100,90,2026-01-15",
                "Losing,-4.2,low,chain-b,supplier-b,120,130,2026-02-01",
            ].join("\n")
        );

        const meta = await validateCsv(filePath);
        assert.equal(meta.rowEstimate, 2);
        assert.equal(meta.columnCount, 8);
        assert.deepEqual(meta.headers, [
            "Competitive Status",
            "price_diff_perc",
            "apw_bucket_new",
            "tbo_chainname",
            "suppliername",
            "thirdparty_price",
            "tbo_price",
            "scraped_date",
        ]);
    });

    it("rejects missing columns", async () => {
        const filePath = await writeTempFile(
            "missing-column.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,thirdparty_price,tbo_price,scraped_date",
                "Winning,12.5,high,chain-a,100,90,2026-01-15",
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Missing columns/);
            assert.match((error as Error).message, /suppliername/i);
            return true;
        });
    });

    it("rejects duplicate headers", async () => {
        const filePath = await writeTempFile(
            "duplicate-header.csv",
            [
                "destination,destination,suppliername",
                "goa,goa,supplier-a",
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Duplicate header/);
            return true;
        });
    });

    it("rejects binary files", async () => {
        const filePath = await writeTempFile("binary.csv", Buffer.from([0x00, 0x01, 0x02, 0x03]));

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Binary file detected/);
            return true;
        });
    });

    it("rejects invalid dates", async () => {
        const filePath = await writeTempFile(
            "bad-date.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                "Winning,12.5,high,chain-a,supplier-a,100,90,2026-13-01",
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Invalid date value/);
            return true;
        });
    });

    it("rejects invalid numeric values", async () => {
        const filePath = await writeTempFile(
            "bad-number.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                "Winning,not-a-number,high,chain-a,supplier-a,100,90,2026-01-15",
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Invalid numeric value/);
            return true;
        });
    });

    it("rejects invalid enum values", async () => {
        const filePath = await writeTempFile(
            "bad-enum.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                "Unknown,12.5,high,chain-a,supplier-a,100,90,2026-01-15",
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Invalid enum value/);
            return true;
        });
    });

    it("rejects empty files", async () => {
        const filePath = await writeTempFile("empty.csv", "");

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /CSV is empty/);
            return true;
        });
    });

    it("rejects malformed CSV", async () => {
        const filePath = await writeTempFile(
            "malformed.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                'Winning,12.5,"bad quote,chain-a,supplier-a,100,90,2026-01-15',
            ].join("\n")
        );

        await assert.rejects(validateCsv(filePath), (error: unknown) => {
            assert.ok(error instanceof CsvValidationError);
            assert.match((error as Error).message, /Malformed CSV/);
            return true;
        });
    });
});

describe("upload gate", () => {
    it("does not call DuckDB for invalid CSVs", async () => {
        const filePath = await writeTempFile(
            "invalid.csv",
            [
                "Competitive Status,price_diff_perc,apw_bucket_new,tbo_chainname,suppliername,thirdparty_price,tbo_price,scraped_date",
                "Unknown,12.5,high,chain-a,supplier-a,100,90,2026-01-15",
            ].join("\n")
        );

        const analyzeSpy = mock.method(duckdbAnalytics, "analyzeCsv", async () => {
            throw new Error("DuckDB should not be reached");
        });

        await assert.rejects(validateCsv(filePath));
        assert.equal(analyzeSpy.mock.calls.length, 0);
        analyzeSpy.mock.restore();
    });
});
