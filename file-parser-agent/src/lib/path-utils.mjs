import path from "node:path";
import { promises as fs } from "node:fs";

function sanitizePath(targetPath) {
    return targetPath.replace(/\\/g, "/");
}

export function resolveWorkspacePath(
    filePath,
    { workspaceRoot = null, cwd = process.cwd() } = {},
) {
    if (!filePath || typeof filePath !== "string") {
        throw new Error("Expected file path to be a non-empty string.");
    }
    const trimmed = filePath.trim();
    const baseRoot =
        workspaceRoot && workspaceRoot.trim() ? workspaceRoot.trim() : cwd;
    const candidate = path.isAbsolute(trimmed)
        ? trimmed
        : path.resolve(baseRoot, trimmed);
    return sanitizePath(candidate);
}

export async function assertFileReadable(filePath) {
    try {
        await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot read file '${filePath}': ${message}`);
    }
}

export async function readFileStats(filePath) {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        modified: stats.mtime.toISOString(),
        created: stats.ctime.toISOString(),
    };
}

export async function readBinary(filePath) {
    return fs.readFile(filePath);
}

export async function readText(filePath) {
    return fs.readFile(filePath, "utf8");
}
