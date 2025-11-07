# file-parser

Ploinky MCP agent that ingests PDFs, plain text, Word documents, and Excel workbooks, then returns structured JSON using a fixed extraction prompt. The agent ships with a `process_documents` tool that can be invoked through the Ploinky router (`/mcps/<agent>/mcp`) or directly from the container.

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
        "file": "docs/quarterly-summary.pdf"
      }
    }
  }'
```

If no LLM credentials are present the agent still returns per-document previews, sample table rows, and warnings that indicate why structured output was skipped.

### Input options

- `file` *(required)* — string path to the single document to parse (absolute or relative to the agent workspace). Supported types: `pdf`, `txt`, `doc`, `docx`, `xlsx`, `xls`.

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
                                     Structured JSON string payload
                                                   │
                                                   ▼
┌────────────────────────────┐          ┌───────────┴─────────────────┐
│ Structured JSON string     │◄─────────┤   RoutingServer sends back  │
│ (built-in schema)          │          │   MCP response to the client│
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
        "file": "/home/apparatus/Documents/coral docs/Angel materials - 16.04.25.docx"
      }
    }
  }'
```

**CLI helper (from within agent container)**

```bash
node src/tools/process-documents.mjs <<'EOF'
{
  "file": "docs/quarterly-summary.pdf"
}
EOF
```

**Ploinky WebChat / Dashboard**

1. Enable and start the agent (`ploinky enable agent file-parser`, `ploinky start`).
2. Open the dashboard (`http://127.0.0.1:8080/dashboard`) and locate the *file-parser* entry.
3. Issue a `tools/call` request through the MCP console with the same JSON payload as shown above.

The tool responds with a single text block containing structured JSON that matches the built-in extraction schema. Downstream automations (e.g., the coral agent) should parse that string and perform any domain-specific transformations.

If no supported LLM credential is configured, `process_documents` exits with an error so callers can retry after fixing configuration.

## Development

- Source lives in `src/` (`lib` utilities plus `tools/process-documents.mjs` entrypoint).
- `tests/process-documents.test.mjs` covers loader behaviour and CLI fallbacks. Run `npm test`.
- `manifest.json` configures the container runtime; `mcp-config.json` describes the MCP surface exposed by the default `AgentServer`.

Use `npm update --omit=dev` to refresh dependencies inside the container, and keep large fixtures out of the repository—tests use lightweight generated spreadsheets under `tests/fixtures/`.***
