import { LLMAgent } from "ploinky-agent-lib";
import {
    CORAL_FLOW_OUTPUT_SCHEMA,
    coralFlowInstructions,
} from "./profiles/coral-flow.mjs";

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

function ensurePlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}

export function parseSchemaInput(schema, schemaString) {
    if (ensurePlainObject(schema)) {
        return schema;
    }
    if (schemaString && typeof schemaString === "string") {
        try {
            const parsed = JSON.parse(schemaString);
            return ensurePlainObject(parsed) || null;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse schemaString: ${message}`);
        }
    }
    return null;
}

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

function buildTaskDescription({
    mode,
    prompt,
    existingData,
    profileInstructions = "",
}) {
    const parts = [
        prompt && prompt.trim()
            ? prompt.trim()
            : "Extract structured information that satisfies typical data analysis needs.",
        mode === "update"
            ? "Update the existing JSON data to satisfy the prompt while keeping consistent structure."
            : "Produce new structured JSON data guided by the prompt.",
        "Respond strictly with JSON and do not include commentary outside of JSON syntax.",
    ];

    if (existingData && Object.keys(existingData).length) {
        parts.push(
            `Existing data to revise: ${JSON.stringify(existingData, null, 2)}`,
        );
    }
    if (profileInstructions) {
        parts.push(profileInstructions);
    }
    return parts.filter(Boolean).join("\n\n");
}

export async function runStructuredExtraction({
    documents,
    prompt,
    schema,
    schemaString,
    existingData,
    mode = "extract",
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

    const profile =
        typeof options.profile === "string"
            ? options.profile.trim().toLowerCase()
            : null;

    const llmAgent = new LLMAgent({ name: "FileParserAgent" });
    const documentContext = buildDocumentContext(documents, options);
    const taskDescription = buildTaskDescription({
        mode,
        prompt,
        existingData,
        profileInstructions:
            profile === "coralflow" ? coralFlowInstructions() : "",
    });

    let outputSchema;
    try {
        if (profile === "coralflow") {
            outputSchema = CORAL_FLOW_OUTPUT_SCHEMA;
        } else {
            outputSchema =
                parseSchemaInput(schema, schemaString) || DEFAULT_OUTPUT_SCHEMA;
        }
    } catch (error) {
        throw new Error(
            `Schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const response = await llmAgent.doTask(
        {
            prompt,
            mode,
            documents: documentContext,
            existingData,
        },
        taskDescription,
        {
            outputSchema,
        },
    );

    let json;
    try {
        json = llmAgent.responseToJSON(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`LLM response was not valid JSON: ${message}`);
    }

    return { raw: response, json, profile };
}
