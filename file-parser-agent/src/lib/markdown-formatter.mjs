/**
 * Converts parsed document data to Markdown format
 */

/**
 * Converts a table/sheet to Markdown table format
 */
function tableToMarkdown(table) {
    if (!table.sampleRows || table.sampleRows.length === 0) {
        return `### ${table.name}\n\n*Empty sheet*\n`;
    }

    const rows = table.sampleRows;
    const headers = Object.keys(rows[0]);

    if (headers.length === 0) {
        return `### ${table.name}\n\n*No data*\n`;
    }

    // Build header row
    const headerRow = `| ${headers.join(' | ')} |`;

    // Build separator row
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;

    // Build data rows
    const dataRows = rows.map(row => {
        const cells = headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) {
                return '';
            }
            // Escape pipe characters and convert to string
            return String(value).replace(/\|/g, '\\|');
        });
        return `| ${cells.join(' | ')} |`;
    });

    const tableMarkdown = [
        `### ${table.name}`,
        '',
        `*Total rows: ${table.totalRows}${table.totalRows > rows.length ? ` (showing first ${rows.length})` : ''}*`,
        '',
        headerRow,
        separator,
        ...dataRows,
        ''
    ].join('\n');

    return tableMarkdown;
}

/**
 * Formats a single document as Markdown
 */
function formatDocument(doc, index) {
    const parts = [];

    // Document header
    const title = doc.label || doc.path.split('/').pop();
    parts.push(`# Document ${index + 1}: ${title}`);
    parts.push('');

    // Metadata
    parts.push('## Metadata');
    parts.push('');
    parts.push(`- **Type**: ${doc.type}`);
    parts.push(`- **Path**: ${doc.path}`);
    parts.push(`- **Size**: ${doc.stats.size} bytes`);
    parts.push(`- **Word Count**: ${doc.summary.wordCount}`);
    parts.push(`- **Character Count**: ${doc.summary.charCount}`);

    if (doc.metadata?.pageCount) {
        parts.push(`- **Pages**: ${doc.metadata.pageCount}`);
    }

    if (doc.summary.tableCount > 0) {
        parts.push(`- **Tables**: ${doc.summary.tableCount}`);
    }

    parts.push('');

    // Tables (for spreadsheets)
    if (Array.isArray(doc.tables) && doc.tables.length > 0) {
        parts.push('## Tables');
        parts.push('');

        for (const table of doc.tables) {
            parts.push(tableToMarkdown(table));
        }
    }

    // Text content (for non-spreadsheet documents or if explicitly requested)
    if (doc.text && doc.text.trim() && doc.type !== 'xlsx') {
        parts.push('## Content');
        parts.push('');
        parts.push(doc.text.trim());
        parts.push('');
    }

    return parts.join('\n');
}

/**
 * Converts array of parsed documents to Markdown
 * @param {Array} documents - Array of parsed document objects from loadDocuments()
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeRaw - Include raw text for spreadsheets
 * @returns {string} Markdown formatted string
 */
export function documentsToMarkdown(documents, options = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
        throw new Error('documentsToMarkdown requires at least one document.');
    }

    const formattedDocs = documents.map((doc, index) => formatDocument(doc, index));

    return formattedDocs.join('\n---\n\n');
}
