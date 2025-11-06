import { stdin } from "node:process";

export async function readJsonFromStdin() {
    const chunks = [];
    for await (const chunk of stdin) {
        chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown JSON parse error";
        throw new Error(`Failed to parse JSON from stdin: ${message}`);
    }
}
