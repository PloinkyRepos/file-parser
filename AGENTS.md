# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` and `mcp-config.json` define the agent container and the exposed `process_documents` MCP tool. Keep schema changes synchronized across both files.
- `src/lib/` hosts focused utilities: document ingestion (`document-loader.mjs`), path helpers, LLM orchestration (`llm-runner.mjs`), and profile-specific normalisers under `src/lib/profiles/` (e.g., `coral-flow.mjs` prepares Persisto operations).
- `src/tools/process-documents.mjs` is the only executable entrypoint; it wires payload validation, ingestion, and structured extraction.
- `tests/` contains Node’s built-in test runner suites plus lightweight fixtures under `tests/fixtures/` (avoid committing large binaries).

## Build, Test, and Development Commands
- `npm install` resolves the local dependency set, including the vendored `ploinky-agent-lib` used for LLM access.
- `npm test` runs `node --test` against `tests/**/*.test.mjs`; add regression coverage here for every new file type or output mode.
- `node src/tools/process-documents.mjs < payload.json` is the quickest way to debug outside the container—pipe JSON on stdin and inspect the response (`profile: "coralFlow"` emits job/material records plus `persistoOperations`).

## Coding Style & Naming Conventions
- Stay with ES modules (`type: module`) and prefer small, pure helpers over large scripts. Use descriptive camelCase filenames beneath `src/lib/`.
- When extending the ingestion pipeline, surface new knobs via the `options` object so callers reach them through the MCP schema.
- Prefer async/await, early returns, and detailed warning objects (`{ message, detail }`) for user-facing errors.
### Code Formatting

#### Indentation
- **4 spaces** (not tabs)
- Consistent across all files

#### Trailing Commas
- Always use trailing commas in multi-line objects and arrays
- Improves git diffs and reduces merge conflicts

#### Quotes
- Single quotes for strings (except template literals)
- Template literals for string interpolation

#### Semicolons
- Always use semicolons at statement ends
- Prevents ASI (Automatic Semicolon Insertion) issues

## Testing Guidelines
- Each parser path needs a targeted unit test plus an integration expectation on the CLI fallback behaviour. Reuse the fixture directory; generate spreadsheets programmatically so Git stays lean.
- Run `npm test` before every pull request. CI is expected to execute the same command so keep tests hermetic—no external network or API access.
- When adding LLM-dependent flows, stub providers in tests and assert on warning text, not external output.

## Commit & Pull Request Guidelines
- Use imperative commit titles (`Add xlsx summariser`, `Document MCP request shape`) and keep behaviour, docs, and fixtures grouped logically.
- Pull requests must mention the LLM credentials they rely on, attach sample `process_documents` invocations, and describe schema updates. Include screenshots or captured JSON when the response shape changes.
- Flag breaking schema changes in the description and update both `README.md` and `mcp-config.json` in the same PR to prevent runtime drift.
