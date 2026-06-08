import fs from "fs";
import { parse } from "csv-parse";

let count = 0;

fs.createReadStream("uploads/testdata.csv")
    .pipe(
        parse({
            columns: true,
            skip_empty_lines: true,
        })
    )
    .on("data", () => {
        count++;
    })
    .on("error", (err) => {
        console.error("CSV ERROR");
        console.error(err);
    })
    .on("end", () => {
        console.log(
            `Parsed ${count} rows successfully`
        );
    });