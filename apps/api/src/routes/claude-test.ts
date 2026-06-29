import { Router } from "express";
import { getAnthropicClient } from "../lib/claude.js";

const router = Router();

router.get(
    "/claude-test",
    async (req, res) => {

        const response =
            await getAnthropicClient().messages.create({

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
                (block: any) =>
                    block.type === "text"
            ) as any;

        return res.json({
            answer:
                text?.text
            ,
        });

    }
);

export default router;