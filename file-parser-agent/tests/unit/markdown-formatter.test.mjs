import { describe, it } from 'node:test';
import assert from 'node:assert';
import { documentsToMarkdown } from '../../src/lib/markdown-formatter.mjs';

describe('markdown-formatter', () => {
    describe('documentsToMarkdown', () => {
        it('should format a single text document', () => {
            const documents = [{
                path: '/workspace/sample.txt',
                label: null,
                type: 'txt',
                text: 'This is sample text content.',
                tables: [],
                checksum: 'abc123',
                stats: {
                    size: 1024,
                    modified: '2025-01-01T00:00:00Z',
                    created: '2025-01-01T00:00:00Z'
                },
                summary: {
                    charCount: 28,
                    wordCount: 5,
                    tableCount: 0,
                    preview: 'This is sample text content.'
                }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('# Document 1: sample.txt'));
            assert.ok(markdown.includes('## Metadata'));
            assert.ok(markdown.includes('**Type**: txt'));
            assert.ok(markdown.includes('**Path**: /workspace/sample.txt'));
            assert.ok(markdown.includes('**Size**: 1024 bytes'));
            assert.ok(markdown.includes('**Word Count**: 5'));
            assert.ok(markdown.includes('**Character Count**: 28'));
            assert.ok(markdown.includes('## Content'));
            assert.ok(markdown.includes('This is sample text content.'));
        });

        it('should use label if provided', () => {
            const documents = [{
                path: '/workspace/sample.txt',
                label: 'My Test Document',
                type: 'txt',
                text: 'Sample content',
                tables: [],
                checksum: 'abc123',
                stats: { size: 100, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 14, wordCount: 2, tableCount: 0, preview: 'Sample content' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('# Document 1: My Test Document'));
        });

        it('should format PDF metadata with page count', () => {
            const documents = [{
                path: '/workspace/sample.pdf',
                label: null,
                type: 'pdf',
                text: 'PDF content',
                tables: [],
                checksum: 'def456',
                metadata: { pageCount: 10 },
                stats: { size: 5000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 11, wordCount: 2, tableCount: 0, preview: 'PDF content' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('**Pages**: 10'));
        });

        it('should format spreadsheet with tables', () => {
            const documents = [{
                path: '/workspace/sample.xlsx',
                label: null,
                type: 'xlsx',
                text: 'Sheet: Employees (rows: 5)',
                tables: [
                    {
                        name: 'Employees',
                        totalRows: 5,
                        sampleRows: [
                            { ID: 1, Name: 'Alice', Department: 'Engineering' },
                            { ID: 2, Name: 'Bob', Department: 'Sales' }
                        ]
                    }
                ],
                checksum: 'ghi789',
                stats: { size: 10000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 27, wordCount: 5, tableCount: 1, preview: 'Sheet: Employees (rows: 5)' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('## Tables'));
            assert.ok(markdown.includes('### Employees'));
            assert.ok(markdown.includes('*Total rows: 5 (showing first 2)*'));
            assert.ok(markdown.includes('| ID | Name | Department |'));
            assert.ok(markdown.includes('| --- | --- | --- |'));
            assert.ok(markdown.includes('| 1 | Alice | Engineering |'));
            assert.ok(markdown.includes('| 2 | Bob | Sales |'));
            assert.ok(!markdown.includes('## Content')); // XLSX should not include text content
        });

        it('should format empty spreadsheet sheet', () => {
            const documents = [{
                path: '/workspace/sample.xlsx',
                label: null,
                type: 'xlsx',
                text: '',
                tables: [
                    {
                        name: 'EmptySheet',
                        totalRows: 0,
                        sampleRows: []
                    }
                ],
                checksum: 'jkl012',
                stats: { size: 5000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 0, wordCount: 0, tableCount: 1, preview: '' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('### EmptySheet'));
            assert.ok(markdown.includes('*Empty sheet*'));
        });

        it('should escape pipe characters in table cells', () => {
            const documents = [{
                path: '/workspace/sample.xlsx',
                label: null,
                type: 'xlsx',
                text: '',
                tables: [
                    {
                        name: 'TestSheet',
                        totalRows: 1,
                        sampleRows: [
                            { Column: 'value | with | pipes' }
                        ]
                    }
                ],
                checksum: 'mno345',
                stats: { size: 1000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 0, wordCount: 0, tableCount: 1, preview: '' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('value \\| with \\| pipes'));
        });

        it('should handle null and undefined values in tables', () => {
            const documents = [{
                path: '/workspace/sample.xlsx',
                label: null,
                type: 'xlsx',
                text: '',
                tables: [
                    {
                        name: 'TestSheet',
                        totalRows: 2,
                        sampleRows: [
                            { A: 'value', B: null, C: undefined },
                            { A: 'another', B: '', C: 0 }
                        ]
                    }
                ],
                checksum: 'pqr678',
                stats: { size: 1000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 0, wordCount: 0, tableCount: 1, preview: '' }
            }];

            const markdown = documentsToMarkdown(documents);

            const lines = markdown.split('\n');
            const dataRow1 = lines.find(line => line.includes('value'));
            const dataRow2 = lines.find(line => line.includes('another'));

            assert.ok(dataRow1);
            assert.ok(dataRow2);
            // null and undefined should be empty cells
            assert.ok(dataRow1.includes('| value |  |  |'));
        });

        it('should format multiple documents with separator', () => {
            const documents = [
                {
                    path: '/workspace/doc1.txt',
                    label: null,
                    type: 'txt',
                    text: 'First document',
                    tables: [],
                    checksum: 'aaa111',
                    stats: { size: 100, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                    summary: { charCount: 14, wordCount: 2, tableCount: 0, preview: 'First document' }
                },
                {
                    path: '/workspace/doc2.txt',
                    label: null,
                    type: 'txt',
                    text: 'Second document',
                    tables: [],
                    checksum: 'bbb222',
                    stats: { size: 200, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                    summary: { charCount: 15, wordCount: 2, tableCount: 0, preview: 'Second document' }
                }
            ];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('# Document 1: doc1.txt'));
            assert.ok(markdown.includes('# Document 2: doc2.txt'));
            assert.ok(markdown.includes('\n---\n\n'));
        });

        it('should throw error for empty documents array', () => {
            assert.throws(
                () => documentsToMarkdown([]),
                {
                    name: 'Error',
                    message: /requires at least one document/
                }
            );
        });

        it('should throw error for non-array input', () => {
            assert.throws(
                () => documentsToMarkdown(null),
                {
                    name: 'Error',
                    message: /requires at least one document/
                }
            );
        });

        it('should handle document with no text content', () => {
            const documents = [{
                path: '/workspace/empty.txt',
                label: null,
                type: 'txt',
                text: '',
                tables: [],
                checksum: 'xyz789',
                stats: { size: 0, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 0, wordCount: 0, tableCount: 0, preview: '' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('# Document 1: empty.txt'));
            assert.ok(markdown.includes('## Metadata'));
            assert.ok(!markdown.includes('## Content')); // Empty content should not show content section
        });

        it('should include Tables count in metadata when present', () => {
            const documents = [{
                path: '/workspace/sample.xlsx',
                label: null,
                type: 'xlsx',
                text: '',
                tables: [
                    { name: 'Sheet1', totalRows: 10, sampleRows: [] },
                    { name: 'Sheet2', totalRows: 20, sampleRows: [] }
                ],
                checksum: 'tbl123',
                stats: { size: 5000, modified: '2025-01-01T00:00:00Z', created: '2025-01-01T00:00:00Z' },
                summary: { charCount: 0, wordCount: 0, tableCount: 2, preview: '' }
            }];

            const markdown = documentsToMarkdown(documents);

            assert.ok(markdown.includes('**Tables**: 2'));
        });
    });
});
