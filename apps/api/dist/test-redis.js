import dotenv from "dotenv";
import { Redis } from "@upstash/redis";
dotenv.config();
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
async function main() {
    await redis.set("hello", "world");
    const value = await redis.get("hello");
    console.log(value);
}
main();
