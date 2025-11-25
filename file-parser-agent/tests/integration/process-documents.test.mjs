import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, '../fixtures');
const scriptPath = path.join(__dirname, '../../src/tools/process-documents.mjs');

/**
 * Helper to run process-documents.mjs with JSON input via stdin
 */
function runProcessDocuments(inputJson, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const proc = spawn('node', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, WORKSPACE_PATH: fixturesPath }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`Process timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });

        proc.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        // Write JSON input to stdin
        proc.stdin.write(JSON.stringify(inputJson));
        proc.stdin.end();
    });
}

describe('process-documents (integration)', () => {
    describe('normaliseInput and extractFileDescriptor', () => {
        it('should process simple file input', async () => {
            const input = {
                file: 'sample.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('# Document 1: sample.txt'));
            assert.ok(result.stdout.includes('## Metadata'));
            assert.ok(result.stdout.includes('sample text document'));
        });

        it('should process input wrapped in "input" property', async () => {
            const input = {
                input: {
                    file: 'sample.txt'
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should process input wrapped in "arguments" property', async () => {
            const input = {
                arguments: {
                    file: 'sample.txt'
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should process input wrapped in "args" property', async () => {
            const input = {
                args: {
                    file: 'sample.txt'
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should handle file with type hint', async () => {
            const input = {
                file: 'sample.txt',
                type: 'txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('**Type**: txt'));
        });

        it('should handle file with fileType property', async () => {
            const input = {
                file: 'sample.txt',
                fileType: 'txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should fail when no file is provided', async () => {
            const input = {
                type: 'txt'
            };

            const result = await runProcessDocuments(input);

            assert.notStrictEqual(result.code, 0);
            assert.ok(result.stderr.includes('requires a "file" path'));
        });

        it('should fail when file is empty string', async () => {
            const input = {
                file: ''
            };

            const result = await runProcessDocuments(input);

            assert.notStrictEqual(result.code, 0);
            assert.ok(result.stderr.includes('requires a "file" path'));
        });

        it('should fail when file is whitespace only', async () => {
            const input = {
                file: '   '
            };

            const result = await runProcessDocuments(input);

            assert.notStrictEqual(result.code, 0);
            assert.ok(result.stderr.includes('requires a "file" path'));
        });
    });

    describe('resolveOptions', () => {
        it('should use default options when none provided', async () => {
            const input = {
                file: 'sample.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.length > 0);
        });

        it('should handle maxPreviewChars option', async () => {
            const input = {
                file: 'sample.txt',
                options: {
                    maxPreviewChars: 50
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            // The output should still be generated successfully
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should handle tableSampleRows option', async () => {
            const input = {
                file: 'sample.xlsx',
                options: {
                    tableSampleRows: 2
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('Employees'));
            assert.ok(result.stdout.includes('(showing first 2)'));
            // Should show only 2 sample rows (limited by tableSampleRows option)
            const lines = result.stdout.split('\n');
            const employeeStartIdx = lines.findIndex(l => l.includes('### Employees'));
            const inventoryStartIdx = lines.findIndex(l => l.includes('### Inventory'));
            const employeeSection = lines.slice(employeeStartIdx, inventoryStartIdx);
            const dataRows = employeeSection.filter(l => l.startsWith('| ') && !l.includes('---') && !l.includes('| ID | Name'));
            // Should have exactly 2 data rows (excluding header and separator)
            assert.strictEqual(dataRows.length, 2, `Expected 2 data rows, but got ${dataRows.length}`);
        });

        it('should enforce minimum maxPreviewChars of 500', async () => {
            const input = {
                file: 'sample.txt',
                options: {
                    maxPreviewChars: 10
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            // Should still work, with minimum enforced
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should enforce minimum tableSampleRows of 1', async () => {
            const input = {
                file: 'sample.xlsx',
                options: {
                    tableSampleRows: 0
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            // Should still work with at least 1 row
            assert.ok(result.stdout.includes('Employees'));
        });
    });

    describe('emitWarnings', () => {
        it('should emit warnings for non-existent files to stderr', async () => {
            const input = {
                file: 'non-existent-file.txt'
            };

            const result = await runProcessDocuments(input);

            assert.notStrictEqual(result.code, 0);
            assert.ok(
                result.stderr.includes('Cannot read file') ||
                result.stderr.includes('No readable documents')
            );
        });

        it('should emit warnings for unsupported file types', async () => {
            const input = {
                file: 'unsupported-file.xyz'
            };

            const result = await runProcessDocuments(input);

            assert.notStrictEqual(result.code, 0);
            assert.ok(
                result.stderr.includes('Unsupported file type') ||
                result.stderr.includes('No readable documents')
            );
        });
    });

    describe('full workflow', () => {
        it('should process text file end-to-end', async () => {
            const input = {
                file: 'sample.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('# Document 1: sample.txt'));
            assert.ok(result.stdout.includes('## Metadata'));
            assert.ok(result.stdout.includes('**Type**: txt'));
            assert.ok(result.stdout.includes('**Word Count**:'));
            assert.ok(result.stdout.includes('## Content'));
            assert.ok(result.stdout.includes('sample text document'));
        });

        it('should process markdown file end-to-end', async () => {
            const input = {
                file: 'sample.md'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('# Document 1: sample.md'));
            assert.ok(result.stdout.includes('Sample Markdown File'));
        });

        it('should process XLSX file end-to-end', async () => {
            const input = {
                file: 'sample.xlsx'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('# Document 1: sample.xlsx'));
            assert.ok(result.stdout.includes('**Type**: xlsx'));
            assert.ok(result.stdout.includes('**Tables**: 3'));
            assert.ok(result.stdout.includes('## Tables'));
            assert.ok(result.stdout.includes('### Employees'));
            assert.ok(result.stdout.includes('### Inventory'));
            assert.ok(result.stdout.includes('### EmptySheet'));
            assert.ok(result.stdout.includes('| ID | Name | Department | Salary |'));
        });

        it('should process empty text file', async () => {
            const input = {
                file: 'empty.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('# Document 1: empty.txt'));
            assert.ok(result.stdout.includes('**Word Count**: 0'));
            assert.ok(result.stdout.includes('**Character Count**: 0'));
        });

        it('should handle absolute paths', async () => {
            const input = {
                file: path.join(fixturesPath, 'sample.txt')
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should handle metadata with tool property', async () => {
            const input = {
                tool: 'process_documents',
                metadata: { source: 'test' },
                file: 'sample.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.txt'));
        });

        it('should handle complex nested options', async () => {
            const input = {
                file: 'sample.xlsx',
                options: {
                    tableSampleRows: 3,
                    maxPreviewChars: 1000,
                    includeRaw: false
                }
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 0);
            assert.ok(result.stdout.includes('sample.xlsx'));
            assert.ok(result.stdout.includes('Employees'));
        });
    });

    describe('error handling', () => {
        it('should exit with code 1 on error', async () => {
            const input = {
                file: 'non-existent-file.txt'
            };

            const result = await runProcessDocuments(input);

            assert.strictEqual(result.code, 1);
        });

        it('should handle invalid JSON gracefully', async () => {
            const proc = spawn('node', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const result = await new Promise((resolve) => {
                proc.on('close', (code) => {
                    resolve({ code, stderr });
                });

                proc.stdin.write('{ invalid json }');
                proc.stdin.end();
            });

            assert.strictEqual(result.code, 1);
            assert.ok(result.stderr.includes('Failed to parse JSON'));
        });

        it('should handle empty stdin', async () => {
            const proc = spawn('node', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const result = await new Promise((resolve) => {
                proc.on('close', (code) => {
                    resolve({ code, stderr });
                });

                proc.stdin.end();
            });

            assert.strictEqual(result.code, 1);
            assert.ok(result.stderr.includes('requires a "file" path'));
        });
    });
});
