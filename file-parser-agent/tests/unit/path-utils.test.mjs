import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
    resolveWorkspacePath,
    assertFileReadable,
    readFileStats,
    readBinary,
    readText
} from '../../src/lib/path-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, '../fixtures');

describe('path-utils', () => {
    describe('resolveWorkspacePath', () => {
        it('should resolve absolute paths correctly', () => {
            const absolutePath = '/home/user/documents/file.pdf';
            const result = resolveWorkspacePath(absolutePath);
            assert.strictEqual(result, absolutePath);
        });

        it('should resolve relative paths based on cwd', () => {
            const relativePath = 'documents/file.pdf';
            const cwd = '/home/user';
            const result = resolveWorkspacePath(relativePath, { cwd });
            assert.strictEqual(result, '/home/user/documents/file.pdf');
        });

        it('should resolve relative paths based on workspaceRoot when provided', () => {
            const relativePath = 'documents/file.pdf';
            const workspaceRoot = '/workspace';
            const result = resolveWorkspacePath(relativePath, { workspaceRoot });
            assert.strictEqual(result, '/workspace/documents/file.pdf');
        });

        it('should prefer workspaceRoot over cwd', () => {
            const relativePath = 'file.pdf';
            const workspaceRoot = '/workspace';
            const cwd = '/home/user';
            const result = resolveWorkspacePath(relativePath, { workspaceRoot, cwd });
            assert.strictEqual(result, '/workspace/file.pdf');
        });

        it('should handle Windows-style backslashes', () => {
            const windowsPath = 'C:\\Users\\documents\\file.pdf';
            const result = resolveWorkspacePath(windowsPath);
            assert.strictEqual(result.includes('\\'), false);
            assert.strictEqual(result.includes('/'), true);
        });

        it('should trim whitespace from path', () => {
            const pathWithSpaces = '  documents/file.pdf  ';
            const cwd = '/home/user';
            const result = resolveWorkspacePath(pathWithSpaces, { cwd });
            assert.strictEqual(result, '/home/user/documents/file.pdf');
        });

        it('should throw error for empty path', () => {
            assert.throws(
                () => resolveWorkspacePath(''),
                {
                    name: 'Error',
                    message: /Expected file path to be a non-empty string/
                }
            );
        });

        it('should throw error for non-string path', () => {
            assert.throws(
                () => resolveWorkspacePath(null),
                {
                    name: 'Error',
                    message: /Expected file path to be a non-empty string/
                }
            );
        });

        it('should throw error for whitespace-only path', () => {
            assert.throws(
                () => resolveWorkspacePath('   '),
                {
                    name: 'Error',
                    message: /Expected file path to be a non-empty string/
                }
            );
        });
    });

    describe('assertFileReadable', () => {
        it('should not throw for readable file', async () => {
            const testFile = path.join(fixturesPath, 'sample.txt');
            await assert.doesNotReject(async () => {
                await assertFileReadable(testFile);
            });
        });

        it('should throw error for non-existent file', async () => {
            const nonExistentFile = path.join(fixturesPath, 'non-existent-file.txt');
            await assert.rejects(
                async () => await assertFileReadable(nonExistentFile),
                {
                    name: 'Error',
                    message: /Cannot read file/
                }
            );
        });

        it('should throw error for directory', async () => {
            await assert.rejects(
                async () => await assertFileReadable(fixturesPath),
                {
                    name: 'Error',
                    message: /Cannot read file/
                }
            );
        });
    });

    describe('readFileStats', () => {
        it('should return file statistics', async () => {
            const testFile = path.join(fixturesPath, 'sample.txt');
            const stats = await readFileStats(testFile);

            assert.ok(stats.size);
            assert.ok(typeof stats.size === 'number');
            assert.ok(stats.modified);
            assert.ok(stats.created);
            assert.ok(stats.modified.endsWith('Z')); // ISO format check
            assert.ok(stats.created.endsWith('Z')); // ISO format check
        });

        it('should throw error for non-existent file', async () => {
            const nonExistentFile = path.join(fixturesPath, 'non-existent.txt');
            await assert.rejects(
                async () => await readFileStats(nonExistentFile)
            );
        });
    });

    describe('readText', () => {
        it('should read text file content', async () => {
            const testFile = path.join(fixturesPath, 'sample.txt');
            const content = await readText(testFile);

            assert.ok(typeof content === 'string');
            assert.ok(content.includes('sample text document'));
        });

        it('should return empty string for empty file', async () => {
            const emptyFile = path.join(fixturesPath, 'empty.txt');
            const content = await readText(emptyFile);

            assert.strictEqual(content, '');
        });

        it('should handle UTF-8 encoding', async () => {
            const testFile = path.join(fixturesPath, 'sample.md');
            const content = await readText(testFile);

            assert.ok(content.includes('**markdown**'));
        });
    });

    describe('readBinary', () => {
        it('should read file as Buffer', async () => {
            const testFile = path.join(fixturesPath, 'sample.txt');
            const buffer = await readBinary(testFile);

            assert.ok(Buffer.isBuffer(buffer));
            assert.ok(buffer.length > 0);
        });

        it('should return empty Buffer for empty file', async () => {
            const emptyFile = path.join(fixturesPath, 'empty.txt');
            const buffer = await readBinary(emptyFile);

            assert.ok(Buffer.isBuffer(buffer));
            assert.strictEqual(buffer.length, 0);
        });

        it('should read binary files', async () => {
            const xlsxFile = path.join(fixturesPath, 'sample.xlsx');
            const buffer = await readBinary(xlsxFile);

            assert.ok(Buffer.isBuffer(buffer));
            assert.ok(buffer.length > 0);
            // XLSX files start with PK (zip signature)
            assert.strictEqual(buffer[0], 0x50); // 'P'
            assert.strictEqual(buffer[1], 0x4B); // 'K'
        });
    });
});
