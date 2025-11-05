import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadDocuments } from "../src/lib/document-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

before(() => {
    process.env.WORKSPACE_PATH = repoRoot;
});

test("loadDocuments extracts plain text content", async () => {
    const { documents, warnings } = await loadDocuments([
        path.relative(
            repoRoot,
            path.join(repoRoot, "tests/fixtures/summary.txt"),
        ),
    ]);
    assert.equal(warnings.length, 0);
    assert.equal(documents.length, 1);
    assert.equal(documents[0].type, "txt");
    assert.ok(documents[0].summary.wordCount > 0);
});

test("loadDocuments extracts spreadsheet sample rows", async () => {
    const { documents } = await loadDocuments(
        [
            path.relative(
                repoRoot,
                path.join(repoRoot, "tests/fixtures/projects.xlsx"),
            ),
        ],
        { tableSampleRows: 1 },
    );
    assert.equal(documents.length, 1);
    assert.equal(documents[0].type, "xlsx");
    assert.equal(documents[0].tables.length, 1);
    assert.equal(documents[0].tables[0].sampleRows.length, 1);
});

test("CLI falls back when no LLM credentials are present", async () => {
    delete process.env.OPENAI_API_KEY;
    const proc = spawn(process.execPath, ["src/tools/process-documents.mjs"], {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
    });

    const payload = {
        input: {
            files: [
                "tests/fixtures/summary.txt",
                "tests/fixtures/projects.xlsx",
            ],
            prompt: "Summarise the financial outlook.",
            options: {
                includeRaw: false,
                tableSampleRows: 1,
                profile: "coralFlow",
            },
        },
    };

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    const chunks = [];
    for await (const chunk of proc.stdout) {
        chunks.push(chunk);
    }
    const stdout = Buffer.concat(chunks).toString("utf8");
    const result = JSON.parse(stdout);
    assert.equal(result.status, "fallback");
    assert.ok(Array.isArray(result.documents));
    assert.equal(result.documents.length, 2);
    assert.ok(Array.isArray(result.warnings));
    assert.ok(
        result.warnings.some((w) => /No LLM credentials/i.test(w.message)),
    );
    assert.equal(result.profile, "coralFlow");
    assert.ok(Array.isArray(result.persistoOperations));
    assert.ok(result.persistoOperations.length === 0);
});
