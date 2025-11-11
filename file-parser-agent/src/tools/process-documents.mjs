#!/usr/bin/env node
import { exit } from "node:process";
import { readJsonFromStdin } from "../utils/read-stdin.mjs";
import { loadDocuments } from "../lib/document-loader.mjs";
import { documentsToMarkdown } from "../lib/markdown-formatter.mjs";

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

function extractFileDescriptor(input) {
    if (!input || typeof input !== "object") {
        return null;
    }

    if (typeof input.file === "string" && input.file.trim()) {
        return {
            path: input.file.trim(),
            label:
                typeof input.fileLabel === "string"
                    ? input.fileLabel.trim()
                    : typeof input.label === "string"
                      ? input.label.trim()
                      : undefined,
        };
    }

    const legacyLists = input.files || input.documents || input.paths;
    if (Array.isArray(legacyLists)) {
        if (legacyLists.length !== 1) {
            throw new Error(
                "process_documents now accepts exactly one file entry.",
            );
        }
        const entry = legacyLists[0];
        if (typeof entry === "string" && entry.trim()) {
            return { path: entry.trim() };
        }
        if (entry && typeof entry === "object" && typeof entry.path === "string") {
            const descriptor = { path: entry.path };
            if (typeof entry.label === "string") {
                descriptor.label = entry.label;
            }
            if (typeof entry.type === "string") {
                descriptor.type = entry.type;
            }
            return descriptor;
        }
        throw new Error(
            "Invalid file descriptor. Provide a path string or { path } object.",
        );
    }

    return null;
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
    return options;
}

function emitWarnings(warnings = []) {
    warnings.forEach((warning) => {
        if (!warning) {
            return;
        }
        if (typeof warning === "object") {
            const message = warning.message || JSON.stringify(warning);
            const detail = warning.detail ? ` (${warning.detail})` : "";
            console.error(`Warning: ${message}${detail}`);
            return;
        }
        console.error(`Warning: ${warning}`);
    });
}

async function main() {
    try {
        const payload = await readJsonFromStdin();
        const input = normaliseInput(payload || {});
        const descriptor = extractFileDescriptor(input);
        if (!descriptor) {
            throw new Error(
                'process_documents requires a "file" path to parse.',
            );
        }

        const options = resolveOptions(input.options);
        const { documents, warnings } = await loadDocuments([descriptor], {
            tableSampleRows: options.tableSampleRows,
            previewLimit: options.previewLimit,
        });

        if (warnings.length) {
            emitWarnings(warnings);
        }

        const markdown = documentsToMarkdown(documents, {
            includeRaw: Boolean(options.includeRaw),
        });

        console.log(markdown);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        exit(1);
    }
}

await main();
