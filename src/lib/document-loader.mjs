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
    return { type: "docx", text: value || "" };
}

async function loadDoc(filePath) {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(filePath);
    const text = extracted.getBody ? extracted.getBody() : "";
    return { type: "doc", text };
}

async function loadXlsx(filePath, { tableSampleRows = 15 } = {}) {
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
