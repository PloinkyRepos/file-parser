import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { Readable } from 'node:stream';
import { readJsonFromStdin } from '../../src/utils/read-stdin.mjs';

describe('read-stdin', () => {
    describe('readJsonFromStdin', () => {
        it('should parse valid JSON from stdin', async () => {
            const jsonData = { file: 'test.pdf', type: 'pdf' };
            const mockStdin = Readable.from([JSON.stringify(jsonData)]);

            // Mock process.stdin
            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            const result = await readJsonFromStdin();

            // Restore original stdin
            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });

            assert.deepStrictEqual(result, jsonData);
        });

        it('should return null for empty input', async () => {
            const mockStdin = Readable.from(['']);

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            const result = await readJsonFromStdin();

            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });

            assert.strictEqual(result, null);
        });

        it('should return null for whitespace-only input', async () => {
            const mockStdin = Readable.from(['   \n  \t  ']);

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            const result = await readJsonFromStdin();

            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });

            assert.strictEqual(result, null);
        });

        it('should throw error for invalid JSON', async () => {
            const mockStdin = Readable.from(['{ invalid json }']);

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            await assert.rejects(
                async () => await readJsonFromStdin(),
                {
                    name: 'Error',
                    message: /Failed to parse JSON from stdin/
                }
            );

            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });
        });

        it('should handle complex nested JSON objects', async () => {
            const complexJson = {
                file: 'document.pdf',
                options: {
                    maxPreviewChars: 1000,
                    tableSampleRows: 20,
                    nested: {
                        value: true
                    }
                },
                metadata: {
                    timestamp: '2025-01-01T00:00:00Z'
                }
            };
            const mockStdin = Readable.from([JSON.stringify(complexJson)]);

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            const result = await readJsonFromStdin();

            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });

            assert.deepStrictEqual(result, complexJson);
        });

        it('should handle multiple chunks', async () => {
            const jsonData = { file: 'test.pdf', type: 'pdf', data: 'x'.repeat(1000) };
            const jsonString = JSON.stringify(jsonData);
            const chunks = [
                jsonString.slice(0, 100),
                jsonString.slice(100, 500),
                jsonString.slice(500)
            ];
            const mockStdin = Readable.from(chunks);

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                configurable: true
            });

            const result = await readJsonFromStdin();

            Object.defineProperty(process, 'stdin', {
                value: originalStdin,
                configurable: true
            });

            assert.deepStrictEqual(result, jsonData);
        });
    });
});
