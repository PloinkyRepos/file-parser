import path from "node:path";
import { slugify, pruneObject, toNumber, isoDate } from "../text-utils.mjs";

export const CORAL_FLOW_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        job: {
            type: "object",
            description:
                "Single job/order record. Treat order and job as the same concept.",
            properties: {
                job_id: {
                    type: "string",
                    description:
                        "Primary job identifier (accepts order numbers).",
                },
                job_name: { type: "string", optional: true },
                client_name: { type: "string", optional: true },
                status: { type: "string", optional: true },
                created_at: { type: "string", optional: true },
                notes: { type: "string", optional: true },
            },
            required: ["job_id"],
            additionalProperties: true,
        },
        materials: {
            type: "array",
            description: "Materials required for the job/order.",
            items: {
                type: "object",
                properties: {
                    material_id: { type: "string", optional: true },
                    job_id: { type: "string", optional: true },
                    name: { type: "string" },
                    generic_name: { type: "string", optional: true },
                    category: { type: "string", optional: true },
                    manufacturer: { type: "string", optional: true },
                    quantity: { type: "number", optional: true },
                    unit: { type: "string", optional: true },
                    status: { type: "string", optional: true },
                    notes: { type: "string", optional: true },
                    source_excerpt: { type: "string", optional: true },
                },
                required: ["name"],
            },
        },
        summary: { type: "string", optional: true },
        assumptions: {
            type: "array",
            items: { type: "string" },
            optional: true,
        },
        references: {
            type: "array",
            description:
                "Link each material to the text fragment or table row it came from.",
            items: {
                type: "object",
                properties: {
                    index: { type: "number", optional: true },
                    document: { type: "string", optional: true },
                    excerpt: { type: "string", optional: true },
                },
            },
            optional: true,
        },
    },
    required: ["job"],
    additionalProperties: true,
};

export function coralFlowInstructions() {
    return `Prepare data for CoralFlow Persisto import. Treat "job" and "order" as synonyms. 
Provide a JSON object with:
- job: include job_id (string), job_name, client_name, created_at (ISO date), status (default "Pending" if missing), and optional notes summarising the order.
- materials: array of items where each element includes name, quantity (numeric), unit, and any category/manufacturer notes. Always attach the job_id to each material. Generate a material_id using a safe slug when the source does not provide one.
- summary: one paragraph describing what was found.
- assumptions: list any assumptions or ambiguities.
- references: optional array containing document names and excerpts that justify each material (use indexes aligned with the materials array).
If a field is unknown, use null rather than inventing data. Avoid enclosing explanations outside JSON.`;
}

const MATERIAL_DEFAULT_STATUS = "Pending";
const JOB_DEFAULT_STATUS = "Pending";

function normalizeJob(rawJob = {}, { documentNames = [] } = {}) {
    const candidates = rawJob || {};
    const jobId = (
        candidates.job_id ||
        candidates.order_id ||
        candidates.id ||
        candidates.jobNumber ||
        candidates.orderNumber ||
        candidates.reference ||
        ""
    ).trim();

    const jobName =
        candidates.job_name ||
        candidates.jobName ||
        candidates.name ||
        candidates.title ||
        "";

    const clientName =
        candidates.client_name ||
        candidates.clientName ||
        candidates.customer ||
        candidates.account ||
        "";

    const status = candidates.status || JOB_DEFAULT_STATUS;
    const created =
        candidates.created_at ||
        candidates.createdAt ||
        candidates.date ||
        null;
    const notes =
        candidates.notes || candidates.description || candidates.summary || "";

    const job = pruneObject({
        job_id: jobId,
        job_name: jobName,
        client_name: clientName,
        status,
        created_at: created || isoDate().split("T")[0],
        notes:
            notes ||
            (documentNames.length
                ? `Parsed from: ${documentNames.join(", ")}`
                : undefined),
    });

    return job;
}

function normalizeMaterial(
    rawMaterial = {},
    { jobId, index, documentNames = [] },
) {
    const material = pruneObject({
        material_id:
            rawMaterial.material_id ||
            rawMaterial.id ||
            rawMaterial.sku ||
            rawMaterial.reference,
        job_id: rawMaterial.job_id || jobId || "",
        name:
            rawMaterial.name ||
            rawMaterial.material_name ||
            rawMaterial.item ||
            rawMaterial.description ||
            "",
        generic_name: rawMaterial.generic_name || rawMaterial.genericName || "",
        category: rawMaterial.category || rawMaterial.type || "",
        manufacturer: rawMaterial.manufacturer || rawMaterial.brand || "",
        unit: rawMaterial.unit || rawMaterial.units || "",
        status: rawMaterial.status || MATERIAL_DEFAULT_STATUS,
        notes: rawMaterial.notes || rawMaterial.comment || rawMaterial.remarks,
        source_excerpt: rawMaterial.source_excerpt || rawMaterial.source || "",
    });

    const quantity = toNumber(
        rawMaterial.quantity ?? rawMaterial.qty ?? rawMaterial.count,
    );
    if (quantity !== null) {
        material.quantity = quantity;
    }

    if (!material.material_id) {
        const slugSource = material.name || `material-${index + 1}`;
        const safeSlug = slugify(slugSource, {
            fallback: `material-${index + 1}`,
        });
        const safeJob = slugify(jobId || "job");
        material.material_id = `${safeJob}-${safeSlug}-${index + 1}`;
    }

    if (!material.job_id && jobId) {
        material.job_id = jobId;
    }

    if (!material.unit && /\bkg\b|kilogram/i.test(material.name || "")) {
        material.unit = "kg";
    }

    if (!material.unit && /\blitre|liter|l\b/i.test(material.name || "")) {
        material.unit = "L";
    }

    if (!material.source_excerpt && documentNames.length) {
        material.source_excerpt = `Derived from ${documentNames.join(", ")}`;
    }

    return pruneObject(material);
}

export function prepareCoralFlowData(json = {}, { documents = [] } = {}) {
    const warnings = [];
    const documentNames = documents
        .map(
            (doc) =>
                doc.label ||
                path.basename(doc.path || "", path.extname(doc.path || "")) ||
                doc.path,
        )
        .filter(Boolean);

    const job = normalizeJob(json.job || {}, { documentNames });
    if (!job.job_id) {
        warnings.push("Job ID was not detected in the source material.");
    }

    const rawMaterials = Array.isArray(json.materials)
        ? json.materials
        : Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.records)
            ? json.records
            : [];

    const materials = [];
    rawMaterials.forEach((raw, index) => {
        const normalized = normalizeMaterial(raw, {
            jobId: job.job_id,
            index,
            documentNames,
        });
        if (!normalized.name) {
            warnings.push(
                `Material entry ${index + 1} is missing a name and was skipped.`,
            );
            return;
        }
        if (!normalized.job_id) {
            warnings.push(`Material "${normalized.name}" is missing a job_id.`);
        }
        materials.push(normalized);
    });

    const summary = typeof json.summary === "string" ? json.summary.trim() : "";
    const assumptions = Array.isArray(json.assumptions)
        ? json.assumptions.map((entry) => String(entry).trim()).filter(Boolean)
        : [];
    const references = Array.isArray(json.references) ? json.references : [];

    const operations = [];
    if (job.job_id) {
        operations.push({ method: "createJob", payload: job });
    }
    for (const material of materials) {
        operations.push({ method: "createMaterial", payload: material });
    }

    return {
        job,
        materials,
        summary,
        assumptions,
        references,
        operations,
        warnings,
    };
}
