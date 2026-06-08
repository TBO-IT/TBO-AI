import { redis } from "../lib/redis.js";

async function main() {

    console.log("Writing...");

    await redis.set(
        "test:key",
        {
            message: "redis works",
        },
        {
            ex: 10,
        }
    );

    console.log("Reading...");

    const value =
        await redis.get("test:key");

    console.log(value);
}

main().catch(console.error);