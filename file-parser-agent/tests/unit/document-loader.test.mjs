import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadDocuments, parseDocxTextToTables } from '../../src/lib/document-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, '../fixtures');

describe('document-loader', () => {
    describe('parseDocxTextToTables', () => {
        it('should extract request header and item rows from workflow text', () => {
            const rawText = [
                'Order Number',
                '001-1699',
                'Order Requested by',
                'Ahmed Shaik',
                'Project',
                'PA install',
                'Date Required',
                '16/04/25',
                'Site',
                'Angel',
                'Stores use Only',
                'No.',
                'Material/Plant Description',
                'Quantity Required',
                '1',
                '25mm conduits',
                '8',
                '2',
                '25mm conduit besa boxes and fixings',
                '5',
                '3',
                '25mm couplers and nipples',
                '10',
                'Signed by',
                'Storeman',
            ].join('\n');

            const tables = parseDocxTextToTables(rawText);
            assert.ok(Array.isArray(tables));
            assert.strictEqual(tables.length, 2);

            const headerTable = tables.find((table) => table.name === 'Request Header');
            assert.ok(headerTable);
            assert.strictEqual(headerTable.totalRows, 1);
            assert.strictEqual(headerTable.sampleRows[0]['Order Number'], '001-1699');
            assert.strictEqual(headerTable.sampleRows[0]['Order Requested by'], 'Ahmed Shaik');
            assert.strictEqual(headerTable.sampleRows[0].Project, 'PA install');

            const itemsTable = tables.find((table) => table.name === 'Request Items');
            assert.ok(itemsTable);
            assert.strictEqual(itemsTable.totalRows, 3);
            assert.deepStrictEqual(itemsTable.sampleRows[0], {
                'No.': 1,
                'Material/Plant Description': '25mm conduits',
                'Quantity Required': '8',
            });
            assert.deepStrictEqual(itemsTable.sampleRows[2], {
                'No.': 3,
                'Material/Plant Description': '25mm couplers and nipples',
                'Quantity Required': '10',
            });
        });

        it('should return no tables for unrelated text', () => {
            const tables = parseDocxTextToTables('Random note\nNo structured request here.');
            assert.deepStrictEqual(tables, []);
        });
    });

    describe('loadDocuments', () => {
        it('should load a text file', async () => {
            const entries = [path.join(fixturesPath, 'sample.txt')];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(warnings.length, 0);

            const doc = documents[0];
            assert.strictEqual(doc.type, 'txt');
            assert.ok(doc.text.includes('sample text document'));
            assert.ok(doc.path.endsWith('sample.txt'));
            assert.ok(doc.checksum);
            assert.ok(doc.stats.size > 0);
            assert.ok(doc.summary.charCount > 0);
            assert.ok(doc.summary.wordCount > 0);
            assert.strictEqual(doc.summary.tableCount, 0);
        });

        it('should load a markdown file as text', async () => {
            const entries = [path.join(fixturesPath, 'sample.md')];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(warnings.length, 0);

            const doc = documents[0];
            assert.strictEqual(doc.type, 'txt');
            assert.ok(doc.text.includes('Sample Markdown File'));
        });

        it('should load an empty text file', async () => {
            const entries = [path.join(fixturesPath, 'empty.txt')];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            const doc = documents[0];
            assert.strictEqual(doc.type, 'txt');
            assert.strictEqual(doc.text, '');
            assert.strictEqual(doc.summary.charCount, 0);
            assert.strictEqual(doc.summary.wordCount, 0);
        });

        it('should load an XLSX file with tables', async () => {
            const entries = [path.join(fixturesPath, 'sample.xlsx')];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(warnings.length, 0);

            const doc = documents[0];
            assert.strictEqual(doc.type, 'xlsx');
            assert.ok(Array.isArray(doc.tables));
            assert.ok(doc.tables.length >= 2);

            const employeeSheet = doc.tables.find(t => t.name === 'Employees');
            assert.ok(employeeSheet);
            assert.strictEqual(employeeSheet.totalRows, 5);
            assert.ok(Array.isArray(employeeSheet.sampleRows));
            assert.ok(employeeSheet.sampleRows.length > 0);
            assert.ok(employeeSheet.sampleRows[0].Name);

            const inventorySheet = doc.tables.find(t => t.name === 'Inventory');
            assert.ok(inventorySheet);
            assert.strictEqual(inventorySheet.totalRows, 3);
        });

        it('should respect tableSampleRows option', async () => {
            const entries = [path.join(fixturesPath, 'sample.xlsx')];
            const { documents } = await loadDocuments(entries, { tableSampleRows: 2 });

            const doc = documents[0];
            const employeeSheet = doc.tables.find(t => t.name === 'Employees');
            assert.strictEqual(employeeSheet.sampleRows.length, 2);
        });

        it('should handle XLSX with empty sheet', async () => {
            const entries = [path.join(fixturesPath, 'sample.xlsx')];
            const { documents } = await loadDocuments(entries);

            const doc = documents[0];
            const emptySheet = doc.tables.find(t => t.name === 'EmptySheet');
            assert.ok(emptySheet);
            assert.strictEqual(emptySheet.totalRows, 0);
            assert.strictEqual(emptySheet.sampleRows.length, 0);
        });

        it('should load multiple documents', async () => {
            const entries = [
                path.join(fixturesPath, 'sample.txt'),
                path.join(fixturesPath, 'sample.md'),
                path.join(fixturesPath, 'sample.xlsx')
            ];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 3);
            assert.strictEqual(warnings.length, 0);

            assert.strictEqual(documents[0].type, 'txt');
            assert.strictEqual(documents[1].type, 'txt');
            assert.strictEqual(documents[2].type, 'xlsx');
        });

        it('should accept file descriptors with path property', async () => {
            const entries = [
                { path: path.join(fixturesPath, 'sample.txt') }
            ];
            const { documents } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
        });

        it('should accept file descriptors with label', async () => {
            const entries = [
                { path: path.join(fixturesPath, 'sample.txt'), label: 'My Document' }
            ];
            const { documents } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(documents[0].label, 'My Document');
        });

        it('should accept file descriptor with type hint', async () => {
            const txtFile = path.join(fixturesPath, 'sample.txt');
            const entries = [
                { path: txtFile, type: 'txt' }
            ];
            const { documents } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(documents[0].type, 'txt');
        });

        it('should use type hint when extension is missing', async () => {
            const txtFile = path.join(fixturesPath, 'sample.txt');
            // Read the file and create a copy without extension
            const fs = await import('node:fs/promises');
            const content = await fs.readFile(txtFile);
            const noExtFile = path.join(fixturesPath, 'no-ext-test-file');
            await fs.writeFile(noExtFile, content);

            const entries = [
                { path: noExtFile, type: 'txt' }
            ];
            const { documents } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.strictEqual(documents[0].type, 'txt');

            // Cleanup
            await fs.unlink(noExtFile);
        });

        it('should warn about unsupported file types', async () => {
            const fs = await import('node:fs/promises');
            const unsupportedFile = path.join(fixturesPath, 'unsupported.xyz');
            await fs.writeFile(unsupportedFile, 'test content');

            const entries = [unsupportedFile];

            await assert.rejects(
                async () => await loadDocuments(entries),
                {
                    message: /No readable documents were provided/
                }
            );

            // Cleanup
            await fs.unlink(unsupportedFile);
        });

        it('should warn about non-existent files but continue processing', async () => {
            const entries = [
                path.join(fixturesPath, 'non-existent.txt'),
                path.join(fixturesPath, 'sample.txt')
            ];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.ok(warnings.length > 0);
            assert.ok(warnings.some(w => w.message.includes('Unable to access')));
        });

        it('should throw error when no files can be loaded', async () => {
            const entries = [path.join(fixturesPath, 'non-existent.txt')];

            await assert.rejects(
                async () => await loadDocuments(entries),
                {
                    message: /No readable documents were provided/
                }
            );
        });

        it('should throw error for empty file array', async () => {
            await assert.rejects(
                async () => await loadDocuments([]),
                {
                    message: /must include at least one document/
                }
            );
        });

        it('should throw error for non-array input', async () => {
            await assert.rejects(
                async () => await loadDocuments(null),
                {
                    message: /must include at least one document/
                }
            );
        });

        it('should resolve relative paths with workspaceRoot', async () => {
            const entries = ['sample.txt'];
            const { documents } = await loadDocuments(entries, { workspaceRoot: fixturesPath });

            assert.strictEqual(documents.length, 1);
            assert.ok(documents[0].path.includes('sample.txt'));
        });

        it('should use WORKSPACE_PATH env variable if workspaceRoot not provided', async () => {
            const originalWorkspacePath = process.env.WORKSPACE_PATH;
            process.env.WORKSPACE_PATH = fixturesPath;

            const entries = ['sample.txt'];
            const { documents } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);

            // Restore original value
            if (originalWorkspacePath) {
                process.env.WORKSPACE_PATH = originalWorkspacePath;
            } else {
                delete process.env.WORKSPACE_PATH;
            }
        });

        it('should truncate preview text to previewLimit', async () => {
            const entries = [path.join(fixturesPath, 'sample.txt')];
            const { documents } = await loadDocuments(entries, { previewLimit: 50 });

            const doc = documents[0];
            assert.ok(doc.summary.preview.length <= 51); // 50 + ellipsis
            if (doc.text.length > 50) {
                assert.ok(doc.summary.preview.endsWith('…'));
            }
        });

        it('should calculate correct word count', async () => {
            const entries = [path.join(fixturesPath, 'sample.txt')];
            const { documents } = await loadDocuments(entries);

            const doc = documents[0];
            const words = doc.text.trim().split(/\s+/).filter(Boolean);
            assert.strictEqual(doc.summary.wordCount, words.length);
        });

        it('should generate different checksums for different files', async () => {
            const entries = [
                path.join(fixturesPath, 'sample.txt'),
                path.join(fixturesPath, 'sample.md')
            ];
            const { documents } = await loadDocuments(entries);

            assert.notStrictEqual(documents[0].checksum, documents[1].checksum);
        });

        it('should warn about invalid descriptors', async () => {
            const entries = [
                null,
                { path: path.join(fixturesPath, 'sample.txt') }
            ];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.ok(warnings.some(w => w.message.includes('invalid document descriptor')));
        });

        it('should warn about descriptors with missing path', async () => {
            const entries = [
                { label: 'No Path' },
                { path: path.join(fixturesPath, 'sample.txt') }
            ];
            const { documents, warnings } = await loadDocuments(entries);

            assert.strictEqual(documents.length, 1);
            assert.ok(warnings.some(w => w.message.includes('missing path')));
        });
    });
});
