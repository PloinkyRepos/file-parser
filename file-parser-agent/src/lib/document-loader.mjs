import path from "node:path";
import crypto from "node:crypto";
import * as pdfParseModule from "pdf-parse";
import * as mammothModule from "mammoth";
import * as WordExtractorModule from "word-extractor";
import * as xlsxModule from "xlsx";
import {
    resolveWorkspacePath,
    assertFileReadable,
    readBinary,
    readText,
    readFileStats,
} from "./path-utils.mjs";

const pdfParse = pdfParseModule.default || pdfParseModule;
const mammothLib = mammothModule.default || mammothModule;
const WordExtractor = WordExtractorModule.default || WordExtractorModule;
const xlsxLib = xlsxModule.default || xlsxModule;

const SUPPORTED_TYPES = new Map([
    [".pdf", "pdf"],
    [".txt", "txt"],
    [".text", "txt"],
    [".log", "txt"],
    [".md", "txt"],
    [".docx", "docx"],
    [".doc", "doc"],
    [".xlsx", "xlsx"],
    [".xls", "xlsx"],
]);

const DEFAULT_PREVIEW_LIMIT = 6000;
const DEFAULT_MAX_REQUEST_ITEMS = 500;

function truncate(value, limit = DEFAULT_PREVIEW_LIMIT) {
    if (!value) {
        return "";
    }
    const text = String(value);
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, limit)}…`;
}

function normaliseLine(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalisedKey(value) {
    return normaliseLine(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function extractDocxHeaderValue(lines, variants) {
    const candidateKeys = new Set(variants.map((variant) => normalisedKey(variant)));

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const normalized = normalisedKey(line);
        if (!normalized) {
            continue;
        }

        for (const key of candidateKeys) {
            if (!normalized.startsWith(key)) {
                continue;
            }

            const raw = String(line || "");
            const inlineMatch = raw.match(/^[^:]+:\s*(.+)$/);
            if (inlineMatch && inlineMatch[1]) {
                return normaliseLine(inlineMatch[1]);
            }

            if (normalized === key && i + 1 < lines.length) {
                const next = normaliseLine(lines[i + 1]);
                if (next && !candidateKeys.has(normalisedKey(next))) {
                    return next;
                }
            }
        }
    }

    return "";
}

function parseNumberToken(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const text = normaliseLine(value);
    if (!text) {
        return null;
    }
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
        return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function extractDocxRequestHeader(lines) {
    const orderNumber = extractDocxHeaderValue(lines, [
        "Order Number",
        "Job Number",
        "Job ID",
        "Order ID",
    ]);
    const requestedBy = extractDocxHeaderValue(lines, [
        "Order Requested by",
        "Requested By",
        "Ordered By",
        "Client",
    ]);
    const project = extractDocxHeaderValue(lines, ["Project", "Job Name"]);
    const site = extractDocxHeaderValue(lines, ["Site", "Location"]);
    const dateOrdered = extractDocxHeaderValue(lines, [
        "Date Ordered",
        "Created",
        "Date",
    ]);
    const dateRequired = extractDocxHeaderValue(lines, [
        "Date Required",
        "Required Date",
        "Need By",
    ]);

    const payload = {
        "Order Number": orderNumber,
        "Order Requested by": requestedBy,
        Project: project,
        Site: site,
        "Date Ordered": dateOrdered,
        "Date Required": dateRequired,
    };

    const hasAnyValue = Object.values(payload).some((value) => normaliseLine(value));
    return hasAnyValue ? payload : null;
}

function buildDocxNoiseSet() {
    return new Set([
        "metadata",
        "content",
        "stores use only",
        "stores use",
        "no",
        "material plant description",
        "material",
        "plant description",
        "quantity",
        "required",
        "quantity required",
        "quantity issued",
        "issued",
        "quantity short",
        "short",
        "quantity returned",
        "returned",
        "ccl no",
        "order number",
        "order requested by",
        "date ordered",
        "project",
        "date required",
        "site",
    ]);
}

function isDocxNoiseLine(line, noiseSet) {
    const text = normaliseLine(line);
    if (!text) {
        return true;
    }
    if (/^[-–—:]+$/.test(text)) {
        return true;
    }
    const normalized = normalisedKey(text);
    if (!normalized) {
        return true;
    }
    if (noiseSet.has(normalized)) {
        return true;
    }
    if (normalized.startsWith("quantity ") || normalized.startsWith("order ")) {
        return true;
    }
    return false;
}

function extractDocxRequestItems(lines) {
    const noiseSet = buildDocxNoiseSet();
    const endSectionMarkers = [
        "signed by",
        "issue by",
        "issued by",
        "received by",
        "returned by",
        "storeman",
    ];

    const storesMarkerIndex = lines.findIndex(
        (line) => normalisedKey(line).includes("stores use"),
    );
    const quantityHeaderIndex = lines.findIndex(
        (line) => normalisedKey(line) === "quantity required",
    );

    const startIndex =
        storesMarkerIndex >= 0
            ? storesMarkerIndex + 1
            : quantityHeaderIndex >= 0
                ? quantityHeaderIndex + 1
                : 0;

    const endIndexExclusive = (() => {
        const index = lines.findIndex((line, i) => {
            if (i <= startIndex) {
                return false;
            }
            const normalized = normalisedKey(line);
            return endSectionMarkers.some((marker) => normalized.includes(marker));
        });
        return index >= 0 ? index : lines.length;
    })();

    const scopedLines = lines.slice(startIndex, endIndexExclusive);
    const rows = [];
    let cursor = 0;

    while (cursor < scopedLines.length && rows.length < DEFAULT_MAX_REQUEST_ITEMS) {
        const candidate = scopedLines[cursor];
        const lineNo = parseNumberToken(candidate);
        const lineNoInt = Number.isFinite(lineNo) ? Math.trunc(lineNo) : null;
        if (
            !lineNoInt ||
            lineNoInt <= 0 ||
            lineNoInt > DEFAULT_MAX_REQUEST_ITEMS ||
            !/^\d+$/.test(normaliseLine(candidate))
        ) {
            cursor += 1;
            continue;
        }

        let descriptionIndex = cursor + 1;
        while (
            descriptionIndex < scopedLines.length &&
            isDocxNoiseLine(scopedLines[descriptionIndex], noiseSet)
        ) {
            descriptionIndex += 1;
        }
        if (descriptionIndex >= scopedLines.length) {
            break;
        }

        const description = normaliseLine(scopedLines[descriptionIndex]);
        if (
            !description ||
            /^\d+$/.test(description) ||
            isDocxNoiseLine(description, noiseSet)
        ) {
            cursor += 1;
            continue;
        }

        let quantityIndex = descriptionIndex + 1;
        while (
            quantityIndex < scopedLines.length &&
            isDocxNoiseLine(scopedLines[quantityIndex], noiseSet)
        ) {
            quantityIndex += 1;
        }
        if (quantityIndex >= scopedLines.length) {
            break;
        }

        const quantityRaw = normaliseLine(scopedLines[quantityIndex]);
        const quantityNumber = parseNumberToken(quantityRaw);
        if (!Number.isFinite(quantityNumber)) {
            cursor = descriptionIndex + 1;
            continue;
        }

        rows.push({
            "No.": lineNoInt,
            "Material/Plant Description": description,
            "Quantity Required": quantityRaw,
        });

        cursor = quantityIndex + 1;
    }

    return rows;
}

export function parseDocxTextToTables(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((line) => normaliseLine(line))
        .filter(Boolean);

    if (!lines.length) {
        return [];
    }

    const tables = [];
    const headerRow = extractDocxRequestHeader(lines);
    if (headerRow) {
        tables.push({
            name: "Request Header",
            totalRows: 1,
            sampleRows: [headerRow],
        });
    }

    const requestItems = extractDocxRequestItems(lines);
    if (requestItems.length) {
        tables.push({
            name: "Request Items",
            totalRows: requestItems.length,
            sampleRows: requestItems,
        });
    }

    return tables;
}

function normaliseType(inputType, filePath) {
    if (inputType && typeof inputType === "string") {
        const lowered = inputType.toLowerCase();
        if (Array.from(SUPPORTED_TYPES.values()).includes(lowered)) {
            return lowered;
        }
    }
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_TYPES.get(ext) || null;
}

function checksum(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function loadPdf(filePath, buffer) {
    const data = await pdfParse(buffer);
    const text = data.text ? data.text.trim() : "";
    return {
        type: "pdf",
        text,
        metadata: { pageCount: data.numpages || undefined },
    };
}

async function loadTxt(filePath) {
    const text = await readText(filePath);
    return { type: "txt", text };
}

async function loadDocx(filePath) {
    const { value } = await mammothLib.extractRawText({ path: filePath });
    const text = value || "";
    const tables = parseDocxTextToTables(text);
    return { type: "docx", text, tables };
}

async function loadDoc(filePath) {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    const text = extracted.getBody ? extracted.getBody() : "";
    return { type: "doc", text };
}

async function loadXlsx(filePath, { tableSampleRows = 10000 } = {}) {
    const workbook = xlsxLib.readFile(filePath, { cellDates: true });
    const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const rows = xlsxLib.utils.sheet_to_json(sheet, { defval: null });
        const sample = rows.slice(0, tableSampleRows);
        return {
            name,
            totalRows: rows.length,
            sampleRows: sample,
        };
    });

    const text = sheets
        .map((sheet) => {
            const sampleString = sheet.sampleRows.length
                ? JSON.stringify(sheet.sampleRows, null, 2)
                : "(empty sheet)";
            return `Sheet: ${sheet.name} (rows: ${sheet.totalRows})\n${sampleString}`;
        })
        .join("\n\n");

    return {
        type: "xlsx",
        text,
        tables: sheets,
    };
}

function createDocumentSummary(doc, previewLimit = DEFAULT_PREVIEW_LIMIT) {
    const text = doc.text || "";
    const tableCount = Array.isArray(doc.tables) ? doc.tables.length : 0;
    return {
        charCount: text.length,
        wordCount: text.trim().split(/\s+/).filter(Boolean).length,
        tableCount,
        preview: truncate(text, previewLimit),
    };
}

export async function loadDocuments(fileEntries, options = {}) {
    if (!Array.isArray(fileEntries) || fileEntries.length === 0) {
        throw new Error("Input must include at least one document.");
    }

    const workspaceRoot =
        options.workspaceRoot || process.env.WORKSPACE_PATH || process.cwd();
    const tableSampleRows = options.tableSampleRows;
    const previewLimit = options.previewLimit || DEFAULT_PREVIEW_LIMIT;
    const documents = [];
    const warnings = [];

    for (const entry of fileEntries) {
        let descriptor = entry;
        if (typeof entry === "string") {
            descriptor = { path: entry };
        }
        if (!descriptor || typeof descriptor !== "object") {
            warnings.push({
                message: "Skipping invalid document descriptor",
                detail: String(entry),
            });
            continue;
        }

        const {
            path: rawPath,
            label = null,
            type: explicitType = null,
        } = descriptor;
        if (!rawPath || typeof rawPath !== "string") {
            warnings.push({
                message: "Skipping document with missing path",
                detail: descriptor,
            });
            continue;
        }

        const resolvedPath = resolveWorkspacePath(rawPath, { workspaceRoot });
        try {
            await assertFileReadable(resolvedPath);
            const stats = await readFileStats(resolvedPath);
            const extType = normaliseType(explicitType, resolvedPath);
            if (!extType) {
                warnings.push({
                    message: "Unsupported file type",
                    detail: resolvedPath,
                });
                continue;
            }

            let parsed;
            let buffer;
            try {
                if (extType === "txt") {
                    parsed = await loadTxt(resolvedPath);
                } else if (extType === "pdf") {
                    buffer = await readBinary(resolvedPath);
                    parsed = await loadPdf(resolvedPath, buffer);
                } else if (extType === "docx") {
                    parsed = await loadDocx(resolvedPath);
                } else if (extType === "doc") {
                    parsed = await loadDoc(resolvedPath);
                    buffer = await readBinary(resolvedPath);
                } else if (extType === "xlsx") {
                    parsed = await loadXlsx(resolvedPath, { tableSampleRows });
                } else {
                    warnings.push({
                        message: "Unsupported file extension",
                        detail: resolvedPath,
                    });
                    continue;
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                warnings.push({
                    message: `Failed to parse ${resolvedPath}`,
                    detail: message,
                });
                continue;
            }

            const binary =
                buffer ||
                (extType === "txt"
                    ? Buffer.from(parsed.text ?? "", "utf8")
                    : await readBinary(resolvedPath));
            const summary = createDocumentSummary(parsed, previewLimit);
            documents.push({
                path: resolvedPath,
                label,
                type: parsed.type,
                text: parsed.text,
                tables: parsed.tables || [],
                checksum: checksum(binary),
                stats,
                summary,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            warnings.push({
                message: `Unable to access ${resolvedPath}`,
                detail: message,
            });
        }
    }

    if (!documents.length) {
        throw new Error("No readable documents were provided.");
    }

    return { documents, warnings };
}
