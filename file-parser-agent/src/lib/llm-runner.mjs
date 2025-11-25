let LLMAgent = null;
try {
    const achillesAgentLib = await import("achillesAgentLib");
    LLMAgent = achillesAgentLib.LLMAgent;
} catch (error) {
    // achillesAgentLib is optional - LLM features will be unavailable without it
}

const DEFAULT_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        summary: {
            type: "string",
            description:
                "High-level summary of the documents relevant to the prompt.",
        },
        extractedRecords: {
            type: "array",
            description:
                "Collection of structured facts, table rows, or key-value objects derived from the documents.",
            items: {
                type: "object",
                additionalProperties: true,
            },
        },
        decisions: {
            type: "array",
            description:
                "List of recommendations or updates requested by the prompt.",
            items: {
                type: "object",
                additionalProperties: true,
            },
        },
        sourceMap: {
            type: "array",
            description:
                "Traceability metadata pointing back to document names, sections, or rows.",
            items: {
                type: "object",
                properties: {
                    document: { type: "string" },
                    location: { type: "string", optional: true },
                    notes: { type: "string", optional: true },
                },
                additionalProperties: true,
            },
        },
    },
    additionalProperties: true,
};

export function hasLlmAccess() {
    return Boolean(
        process.env.OPENAI_API_KEY ||
            process.env.ANTHROPIC_API_KEY ||
            process.env.GEMINI_API_KEY ||
            process.env.MISTRAL_API_KEY ||
            process.env.DEEPSEEK_API_KEY ||
            process.env.OPENROUTER_API_KEY ||
            process.env.LLM_API_KEY,
    );
}

function buildDocumentContext(documents, { includeRaw = false } = {}) {
    return documents
        .map((doc, index) => {
            const header = `Document ${index + 1}: ${doc.label || doc.path}`;
            const meta = [
                `Type: ${doc.type}`,
                `Path: ${doc.path}`,
                `Size: ${doc.stats.size} bytes`,
                `Words: ${doc.summary.wordCount}`,
            ].join(" | ");

            const tables =
                Array.isArray(doc.tables) && doc.tables.length
                    ? doc.tables
                          .map((table) => {
                              const sample = table.sampleRows?.length
                                  ? JSON.stringify(table.sampleRows, null, 2)
                                  : "(no sample rows)";
                              return `Table: ${table.name} (rows: ${table.totalRows})\n${sample}`;
                          })
                          .join("\n\n")
                    : null;

            const sections = [header, meta];
            if (tables) {
                sections.push(tables);
            }
            if (doc.summary.preview && (includeRaw || doc.type !== "xlsx")) {
                sections.push(`Preview:\n${doc.summary.preview}`);
            }
            return sections.filter(Boolean).join("\n\n");
        })
        .join("\n\n---\n\n");
}

const DEFAULT_TASK_DESCRIPTION = `Extract structured data from the provided document previews.

- Summarise key points relevant to project operations.
- Capture tabular or list-based facts under extractedRecords.
- Record any recommendations under decisions.
- Provide traceability in sourceMap linking back to document names/sections.

Respond with a single string that contains only the structured data and no additional commentary.`;

export async function runStructuredExtraction({
    documents,
    options = {},
}) {
    if (!Array.isArray(documents) || !documents.length) {
        throw new Error(
            "runStructuredExtraction requires at least one document.",
        );
    }

    if (!hasLlmAccess()) {
        throw new Error(
            "No LLM provider credentials detected. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or another supported key.",
        );
    }

    if (!LLMAgent) {
        throw new Error(
            "LLM functionality requires the 'achillesAgentLib' package to be installed.",
        );
    }

    const llmAgent = new LLMAgent({ name: "FileParserAgent" });
    const documentContext = buildDocumentContext(documents, {
        includeRaw: Boolean(options?.includeRaw),
    });

    const response = await llmAgent.doTask(
        {
            documents: documentContext,
        },
        DEFAULT_TASK_DESCRIPTION,
        {
            outputSchema: DEFAULT_OUTPUT_SCHEMA,
        },
    );

    let json;
    try {
        json = llmAgent.responseToJSON(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`LLM response was not valid JSON: ${message}`);
    }

    return { raw: response, json };
}
