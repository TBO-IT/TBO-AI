import fs from "fs";

const lines = fs
    .readFileSync("uploads/testdata.csv", "utf8")
    .split(/\r?\n/);

const expectedColumns =
    lines[0].split(",").length;

let shown = 0;

for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) continue;

    const actualColumns =
        line.split(",").length;

    if (actualColumns !== expectedColumns) {

        console.log(
            `\nRow ${i + 1}`
        );

        console.log(
            `Columns: ${actualColumns}`
        );

        console.log(line);

        shown++;

        if (shown >= 20) {
            break;
        }
    }
}