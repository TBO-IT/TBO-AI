import { Router } from "express";
import { anthropic } from "../lib/claude.js";

const router = Router();

router.get(
    "/claude-test",
    async (req, res) => {

        const response =
            await anthropic.messages.create({

                model:
                    "claude-sonnet-4-20250514",

                max_tokens:
                    50,

                messages: [
                    {
                        role: "user",
                        content:
                            "Reply with: Claude is working"
                    }
                ]

            });

        const text =
            response.content.find(
                block =>
                    block.type === "text"
            );

        return res.json({
            answer:
                text?.text
            ,
        });

    }
);

export default router;