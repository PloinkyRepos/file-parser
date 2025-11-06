#!/usr/bin/env node
import { exit } from "node:process";
import { readJsonFromStdin } from "../utils/read-stdin.mjs";
import { loadDocuments } from "../lib/document-loader.mjs";
import { hasLlmAccess, runStructuredExtraction } from "../lib/llm-runner.mjs";
import { prepareCoralFlowData } from "../lib/profiles/coral-flow.mjs";

function normaliseInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return {};
    }
    if (payload.input && typeof payload.input === "object") {
        return payload.input;
    }
    if (payload.arguments && typeof payload.arguments === "object") {
        return payload.arguments;
    }
    if (payload.args && typeof payload.args === "object") {
        return payload.args;
    }
    const clone = { ...payload };
    delete clone.tool;
    delete clone.metadata;
    return clone;
}

function extractFiles(input) {
    if (!input) return [];
    if (Array.isArray(input.files)) return input.files;
    if (Array.isArray(input.documents)) return input.documents;
    if (Array.isArray(input.paths)) return input.paths;
    return [];
}

function resolveOptions(inputOptions = {}) {
    if (!inputOptions || typeof inputOptions !== "object") {
        return {};
    }
    const options = { ...inputOptions };
    if (typeof options.maxPreviewChars === "number") {
        options.previewLimit = Math.max(500, options.maxPreviewChars);
    }
    if (typeof options.tableSampleRows === "number") {
        options.tableSampleRows = Math.max(
            1,
            Math.floor(options.tableSampleRows),
        );
    }
    if (typeof options.profile === "string") {
        options.profile = options.profile.trim().toLowerCase();
    }
    return options;
}

function projectDocuments(documents, { includeRaw = false } = {}) {
    return documents.map((doc) => ({
        path: doc.path,
        label: doc.label,
        type: doc.type,
        checksum: doc.checksum,
        stats: doc.stats,
        summary: doc.summary,
        tables: doc.tables,
        rawText: includeRaw ? doc.text : undefined,
    }));
}

function guessProvider() {
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.OPENROUTER_API_KEY) return "openrouter";
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    if (process.env.GEMINI_API_KEY) return "gemini";
    if (process.env.MISTRAL_API_KEY) return "mistral";
    if (process.env.DEEPSEEK_API_KEY) return "deepseek";
    if (process.env.LLM_API_KEY) return "generic";
    return null;
}

function normalizeProfile(value) {
    if (!value || typeof value !== "string") {
        return null;
    }
    const lowered = value.trim().toLowerCase();
    if (!lowered) {
        return null;
    }
    return lowered;
}

async function main() {
    try {
        const payload = await readJsonFromStdin();
        const input = normaliseInput(payload || {});
        const files = extractFiles(input);

        if (!files.length) {
            throw new Error(
                'process_documents requires a non-empty "files" array.',
            );
        }

        const options = resolveOptions(input.options);
        const profile = normalizeProfile(input.profile || options.profile);
        const { documents, warnings } = await loadDocuments(files, {
            workspaceRoot: input.workspaceRoot,
            tableSampleRows: options.tableSampleRows,
            previewLimit: options.previewLimit,
        });

        const includeRaw = Boolean(options.includeRaw);
        const prompt = typeof input.prompt === "string" ? input.prompt : null;
        const mode =
            (typeof input.mode === "string"
                ? input.mode.toLowerCase()
                : "extract") === "update"
                ? "update"
                : "extract";

        const execution = {
            status: "fallback",
            llm: { used: false, provider: null },
            data: null,
            raw: null,
            warnings: [...warnings],
            profile: null,
        };

        if (hasLlmAccess()) {
            try {
                const llmResult = await runStructuredExtraction({
                    documents,
                    prompt,
                    schema: input.schema,
                    schemaString: input.schemaString,
                    existingData: input.existingData,
                    mode,
                    options: { includeRaw, profile },
                });
                execution.status = "ok";
                execution.llm = { used: true, provider: guessProvider() };
                execution.data = llmResult.json;
                execution.raw = includeRaw ? llmResult.raw : undefined;
                if (profile === "coralflow") {
                    const coralFlow = prepareCoralFlowData(llmResult.json, {
                        documents,
                    });
                    execution.profile = {
                        name: "coralFlow",
                        ...coralFlow,
                    };
                    if (
                        Array.isArray(coralFlow.warnings) &&
                        coralFlow.warnings.length
                    ) {
                        coralFlow.warnings.forEach((warning) => {
                            execution.warnings.push({
                                message: warning,
                                detail: "coralFlow profile normalisation",
                            });
                        });
                    }
                }
            } catch (error) {
                execution.status = "degraded";
                execution.llm = {
                    used: true,
                    provider: guessProvider(),
                    error:
                        error instanceof Error ? error.message : String(error),
                };
                execution.warnings.push({
                    message:
                        "LLM processing failed; returning document previews only.",
                    detail: execution.llm.error,
                });
            }
        } else {
            execution.warnings.push({
                message:
                    "No LLM credentials detected; returning document previews only.",
                detail: "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or compatible credentials to enable structured extraction.",
            });
        }

        const result = {
            status: execution.status,
            generatedAt: new Date().toISOString(),
            mode,
            prompt,
            provider: execution.llm.provider,
            documents: projectDocuments(documents, { includeRaw }),
            data: execution.data,
            raw: execution.raw,
            warnings: execution.warnings,
            profile: execution.profile
                ? execution.profile.name
                : profile
                  ? "coralFlow"
                  : null,
            persistoOperations: execution.profile?.operations || [],
            profileResult: execution.profile || undefined,
        };

        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        exit(1);
    }
}

await main();
