# file-parser

Ploinky MCP agent that ingests PDFs, plain text, Word documents, and Excel workbooks, then returns structured JSON guided by a natural-language prompt or caller-supplied schema. The agent ships with a `process_documents` tool that can be invoked through the Ploinky router (`/mcps/<agent>/mcp`) or directly from the container.

## Quick Start

```bash
npm install
npm test
# enable inside a workspace
ploinky enable repo file-parser
ploinky enable agent file-parser
ploinky start
```

The container image uses Node 22. Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, or another supported credential before launching the agent if you want LLM-backed structuring.

## Helper Scripts

- `scripts/installPrerequisites.sh` installs native helpers such as `antiword` that the `.doc` loader relies on; run it before building custom containers or local Node images.
- `scripts/startFileParserDevel.sh` registers the repo with Ploinky, enables the `file-parser` agent, syncs any present LLM keys from your shell, and starts the container.
- `scripts/startFileParser.sh <payload.json|->` loads `.ploinky/.secrets` variables (when available) and pipes a payload into `process_documents` for quick local reproduction of router calls.

## MCP Tool: `process_documents`

Send a POST request to the router once the workspace is running:

```bash
curl http://127.0.0.1:8080/mcps/file-parser/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": "demo",
    "method": "tools/call",
    "params": {
      "name": "process_documents",
      "arguments": {
        "files": [
          {"path": "docs/quarterly-summary.pdf"},
          {"path": "data/pipeline.xlsx", "type": "xlsx"}
        ],
        "prompt": "Produce a revenue summary and list blockers.",
        "schemaString": "{\"type\":\"object\",\"properties\":{\"revenue\":{\"type\":\"string\"},\"blockers\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}}"
      }
    }
  }'
```

If no LLM credentials are present the agent still returns per-document previews, sample table rows, and warnings that indicate why structured output was skipped.

### Input options

- `files` *(required)* — array of string paths or `{ path, label, type }` objects. Supported types: `pdf`, `txt`, `doc`, `docx`, `xlsx`, `xls`.
- `prompt` *(optional)* — directs extraction or update behaviour.
- `schema` / `schemaString` *(optional)* — JSON schema guiding the response payload.
- `mode` *(optional)* — `"extract"` (default) or `"update"` when revising `existingData`.
- `options.includeRaw` *(optional)* — include truncated plaintext in the response.
- `options.tableSampleRows` *(optional)* — number of rows per sheet added to the prompt (default 15).
- `options.profile` *(optional)* — pass `"coralFlow"` to emit job/material objects plus `persistoOperations` suited to coral-agent imports.

### Architecture Overview

```
┌────────────────────────────┐          ┌────────────────────────────────────┐
│ Client (curl / SDK / UI)   │  HTTP    │  ploinky/cli/server/RoutingServer │
│ calls /mcps/file-parser/mcp├─────────►│  (auth, routing, JSON-RPC proxy)  │
└────────────────────────────┘          └────────────────────┬───────────────┘
                                                             │
                                                             │ JSON-RPC tool call
                                                             ▼
                                        ┌────────────────────────────┐
                                        │ file-parser agent container│
                                        │ - manifest.json            │
                                        │ - mcp-config.json          │
                                        │ - process_documents tool   │
                                        └──────────┬─────────────────┘
                                                   │
                                                   │ reads/ingests files
                                                   ▼
                                 ┌────────────────────────────────────┐
                                 │ Workspace docs & shared volumes    │
                                 └────────────────────────────────────┘
                                                   │
                                                   │ optional LLM request
                                                   ▼
                                 ┌────────────────────────────────────┐
                                 │ External LLM provider (OpenAI etc.)│
                                 └────────────────────────────────────┘
                                                   │
                                                   ▼
                                     Structured JSON / profile payload
                                                   │
                                                   ▼
┌────────────────────────────┐          ┌───────────┴─────────────────┐
│ Persisto-ready operations  │◄─────────┤   RoutingServer sends back  │
│ (profileResult + data)     │          │   MCP response to the client│
└────────────────────────────┘          └─────────────────────────────┘
```

### Access Examples

**Direct curl call via router**

```bash
curl http://127.0.0.1:8080/mcps/file-parser/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": "prompt-1",
    "method": "tools/call",
    "params": {
      "name": "process_documents",
      "arguments": {
        "profile": "coralFlow",
        "files": [
          {"path": "/home/apparatus/Documents/coral docs/Angel materials - 16.04.25.docx"}
        ],
        "prompt": "Extract job/order identifiers and material requirements."
      }
    }
  }'
```

**CLI helper (from within agent container)**

```bash
node src/tools/process-documents.mjs <<'EOF'
{
  "profile": "coralFlow",
  "files": [
    {"path": "docs/quarterly-summary.pdf"},
    {"path": "data/order-lines.xlsx"}
  ],
  "prompt": "Summarise orders and required materials.",
  "options": {
    "includeRaw": false,
    "tableSampleRows": 5
  }
}
EOF
```

**Ploinky WebChat / Dashboard**

1. Enable and start the agent (`ploinky enable agent file-parser`, `ploinky start`).
2. Open the dashboard (`http://127.0.0.1:8080/dashboard`) and locate the *file-parser* entry.
3. Issue a `tools/call` request through the MCP console with the same JSON payload as shown above.

Setting `options.profile: "coralFlow"` (or top-level `profile: "coralFlow"`) instructs the tool to emit:

- `profileResult.job` – normalised order/job payload (`job_id`, `job_name`, `client_name`, `created_at`, ...).
- `profileResult.materials` – array of materials with generated `material_id`, numeric `quantity`, and inherited `job_id`.
- `persistoOperations` – ordered calls (`createJob`, `createMaterial`, …) ready to pipe into coralFlow automation.

If the LLM cannot run, the response falls back to document previews while still indicating `profile: "coralFlow"` so downstream scripts can branch gracefully.

## Development

- Source lives in `src/` (`lib` utilities plus `tools/process-documents.mjs` entrypoint).
- `tests/process-documents.test.mjs` covers loader behaviour and CLI fallbacks. Run `npm test`.
- `manifest.json` configures the container runtime; `mcp-config.json` describes the MCP surface exposed by the default `AgentServer`.

Use `npm update --omit=dev` to refresh dependencies inside the container, and keep large fixtures out of the repository—tests use lightweight generated spreadsheets under `tests/fixtures/`.***
