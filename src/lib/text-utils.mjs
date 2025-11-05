export function slugify(value, { separator = "-", fallback = "item" } = {}) {
    const text = typeof value === "string" ? value : String(value || "");
    const normalized = text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, separator)
        .replace(new RegExp(`${separator}{2,}`, "g"), separator)
        .replace(new RegExp(`^${separator}|${separator}$`, "g"), "");
    return normalized || fallback;
}

export function pruneObject(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {};
    }
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
                continue;
            }
            output[key] = trimmed;
            continue;
        }
        output[key] = value;
    }
    return output;
}

export function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const parsed = Number(String(value || "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

export function isoDate(value = new Date()) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.valueOf())) {
        return new Date().toISOString();
    }
    return parsed.toISOString();
}
