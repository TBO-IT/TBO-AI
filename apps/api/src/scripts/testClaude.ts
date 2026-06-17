import Anthropic from "@anthropic-ai/sdk";

async function main() {

    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response =
        await anthropic.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 20,
            messages: [
                {
                    role: "user",
                    content:
                        "Reply with exactly: CLAUDE_CONNECTION_OK"
                }
            ]
        });

    console.log(
        JSON.stringify(response, null, 2)
    );
}

main().catch(console.error);