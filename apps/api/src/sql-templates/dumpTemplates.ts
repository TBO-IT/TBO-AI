import { templates } from "./templates.js";

for (const t of templates) {
    console.log(`ID: ${t.id}`);
    console.log(`Patterns:`);
    t.patterns.forEach(p => console.log(`  ${p.source}`));
    console.log();
}
