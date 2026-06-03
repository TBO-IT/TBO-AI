import { Router } from "express";

import { redis } from "../lib/redis.js";

const router = Router();

router.get("/redis-test", async (_, res) => {
    await redis.set("message", "hello from redis");

    const value = await redis.get("message");

    return res.json({
        redisValue: value,
    });
});

export default router;