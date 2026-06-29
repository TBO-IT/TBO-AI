import path from "path";
import { analyzeCsv } from "../services/duckdbService.js";
async function main() {
    const filePath = path.resolve("uploads", "testdata.csv");
    const result = await analyzeCsv(filePath);
    console.dir(result, {
        depth: null,
    });
}
main();
