import { redis } from "../lib/redis.js";
async function main() {
    const value = await redis.get("PASTE_REDIS_KEY_HERE");
    console.log(value);
}
main();
