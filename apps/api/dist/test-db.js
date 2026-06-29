import { Client } from "pg";
import dotenv from "dotenv";
dotenv.config();
console.log(process.env.DATABASE_URL);
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});
async function main() {
    await client.connect();
    const result = await client.query("SELECT NOW()");
    console.log(result.rows);
    await client.end();
}
main();
