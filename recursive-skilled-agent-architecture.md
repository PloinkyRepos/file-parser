# RecursiveSkilledAgent — Architecture Reference

## Overview

The `RecursiveSkilledAgent` is the central orchestration engine in achillesAgentLib. It acts as a **facade** coordinating skill discovery, registration, selection, and execution through five specialized services. It supports both single-session (CLI) and multi-session (webchat) modes.

---

## Architecture Components

### 1. RecursiveSkilledAgent (Facade)

**File:** `RecursiveSkilledAgents/RecursiveSkilledAgent.mjs`

The main entry point. Coordinates all services, manages session memory, and exposes the public API. Consumers interact exclusively with this class.

**Constructor Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `llmAgent` | `LLMAgent` | `null` | Pre-configured LLM agent |
| `llmAgentOptions` | `Object` | `{}` | Options for creating a new LLM agent |
| `startDir` | `string` | `process.cwd()` | Starting directory for skill discovery |
| `searchUpwards` | `boolean` | `true` | Search parent directories for skills |
| `skillFilter` | `Function` | `null` | Filter function for skill inclusion |
| `logger` | `Object` | `console` | Logger instance |
| `dbAdapter` | `Object` | `null` | Database adapter for DBTableSkillsSubsystem |
| `additionalSkillRoots` | `string[]` | `[]` | Extra directories to scan for skills |
| `sessionConfig` | `Object` | `{}` | TTL, maxSessions, cleanupInterval |
| `inputReader` | `Object` | `null` | InputReader for user input |
| `outputWriter` | `Object` | `null` | OutputWriter for output |

---

### 2. SkillRegistry

**File:** `services/SkillRegistry.mjs`

In-memory catalog of registered skills with multi-alias resolution.

- **`catalog`** (`Map`) — Canonical skill name → SkillRecord
- **`aliases`** (`Map`) — All aliases (normalized via `Sanitiser`) → SkillRecord
- **`skillToSubsystem`** (`Map`) — Alias → skill type string

Each skill is stored under multiple aliases (canonical name, sanitized name, short name) so consumers can look up skills flexibly.

**Key methods:** `register(skillRecord)`, `get(identifier)`, `listByType(type)`, `getAll()`, `getUserSkills(builtInRoot)`, `clear()`

---

### 3. SkillDiscoveryService

**File:** `services/SkillDiscoveryService.mjs`

Filesystem scanner that locates skill definitions using two strategies:

| Strategy | When | Behavior |
|----------|------|----------|
| **Upward search** | CLI mode (`searchUpwards: true`) | Walks parent directories looking for `/skills` subdirs |
| **Downward search** | Ploinky-style repos | Finds `repos/` directory, then walks down for `/skills` subdirs |

**Discovery process:**
1. `findRoots(startDirs, additionalRoots)` → locates root directories containing skills
2. `discoverFromRoot(rootDir)` → scans immediate subdirectories for descriptor files
3. `discoverFromDirectory(skillDir)` → checks for known skill filenames or recurses

**Skill file types** (from `constants/skillFileTypes.mjs`):

| Filename | Type | Subsystem |
|----------|------|-----------|
| `SKILL.md` | `claude` | ClaudeSkillsSubsystem |
| `dcgskill.md` | `dynamic-code-generation` | DynamicCodeGenerationSubsystem |
| `cskill.md` | `cskill` | CodeSkillsSubsystem |
| `mskill.md` | `mcp` | MCPSkillsSubsystem |
| `oskill.md` | `orchestrator` | OrchestratorSkillsSubsystem |
| `tskill.md` | `dbtable` | DBTableSkillsSubsystem |

---

### 4. SkillSelector

**File:** `services/SkillSelector.mjs`

Chooses the best skill for a task using a three-tier selection strategy:

1. **FlexSearch** — Full-text index over orchestrator names and content (forward tokenization). Disabled via `ACHILLES_DISABLE_FLEXSEARCH=1`.
2. **Token-based heuristic** — Case-insensitive substring matching on skill name + descriptor content. Scores candidates by token hits.
3. **LLM-based selection** — Sends candidate list to LLM, expects exact skill name or `"none"`. Falls back to heuristic on failure.

**Key methods:** `selectOrchestrator(taskDescription, orchestrators)`, `chooseByHeuristic(taskDescription, candidates)`, `chooseWithLLM(taskDescription, candidates)`

---

### 5. SkillExecutor

**File:** `services/SkillExecutor.mjs`

The execution engine. Routes tasks to the correct subsystem, manages pending preparations, and emits lifecycle callbacks.

**Key responsibilities:**
- Await all `pendingPreparations` (async skill registrations, code generation) before first execution
- Resolve skill name → registry lookup → subsystem dispatch
- Track top-level execution state (`_isProcessing` flag)
- Invoke lifecycle callbacks (`onBegin`, `onProgress`, `onEnd`)
- Manage internal skill definitions (mirror-code-generator, ask-user)

**Review modes:** `'none'`, `'llm'`, `'human'` — passed through to subsystems.

---

### 6. SubsystemFactory

**File:** `services/SubsystemFactory.mjs`

Registry and factory for subsystem types. Lazy instantiation with singleton caching per type.

**Registered subsystems:**

| Type | Class | Constructor Args |
|------|-------|-----------------|
| `dynamic-code-generation` | DynamicCodeGenerationSubsystem | `llmAgent` |
| `cskill` | CodeSkillsSubsystem | `llmAgent` |
| `mcp` | MCPSkillsSubsystem | `llmAgent` |
| `orchestrator` | OrchestratorSkillsSubsystem | `llmAgent` |
| `dbtable` | DBTableSkillsSubsystem | `llmAgent`, `dbAdapter` |
| `claude` | ClaudeSkillsSubsystem | _(none)_ |

Extensible via `SubsystemFactory.register(type, SubsystemClass)`.

---

## Agentic Session Engines

The subsystems don't talk to the LLM directly — they delegate to two **session engine** classes that live in `LLMAgents/`. These are the actual execution runtimes that run agentic loops.

### LoopAgentSession

**File:** `LLMAgents/AgenticSession.mjs`

A **multi-turn, tool-calling agentic loop**. The LLM acts as a planner: on each step it picks a tool and a prompt, the engine executes it, and the loop continues until a terminal tool (`final_answer` or `cannot_complete`) is called or limits are hit.

**How it works:**
1. Receives a `tools` object where each key is a tool name mapping to `{ handler, description }`
2. Injects two reserved tools: `final_answer` (return result) and `cannot_complete` (abort)
3. On `newPrompt(userPrompt)`:
   - Optionally runs **preparation** (a sub-session that gathers context first)
   - Enters a step loop (up to `maxStepsPerTurn`, default 8):
     - Calls `_requestDecision()` → asks the LLM which tool to call and with what prompt
     - The LLM returns JSON: `{ tool, toolPrompt, reason }`
     - Executes the tool via `_executeTool(toolName, toolPrompt)`
     - Checks for terminal conditions (final_answer, cannot_complete, interactive result, loop detection)
   - Returns the final answer string

**Key behaviors:**
- **Pending input resumption:** If a previous tool returned `{ requiresConfirmation: true }` or `{ requiresInput: true }`, the next `newPrompt()` routes directly back to that tool instead of re-planning
- **Tool variable references:** Tool results are stored as `$$toolName-res-N` variables that can be referenced in subsequent tool prompts
- **Loop detection:** If the same tool+prompt+result repeats 3 times, the loop auto-terminates with that result
- **Validation retries:** If `options.expected` is set, mismatches trigger retries up to `maxRetriesPerTurn` (default 3)
- **Status tracking:** `SESSION_STATUS_IDLE` → `RUNNING` → `ACTIVE` / `AWAITING_INPUT` / `FAILED` / `DONE`

**Used by:** OrchestratorSkillsSubsystem (session type `loop`), ClaudeSkillsSubsystem

---

### SOPAgenticSession

**File:** `LLMAgents/SOPAgenticSession.mjs`

A **plan-then-execute** engine using **LightSOPLang** (a custom scripting language). The LLM generates a LightSOPLang plan, which is then executed deterministically by the interpreter.

**How it works:**
1. Receives a `skillsDescription` object (tool name → description text) and a `commandsRegistry` (executeCommand/listCommands)
2. On `newPrompt(userPrompt)`:
   - Optionally runs **preparation** (a sub-SOPAgenticSession that gathers context)
   - Enters a plan-generate-execute loop (up to `maxPlanAttempts`, default 3):
     - Builds instructions (system prompt + context + user prompt + any failure feedback)
     - Calls `_generatePlanFromEnglish()` → sends `#!english` instructions to LightSOPLangInterpreter in `generateOnly` mode → LLM produces LightSOPLang code
     - Calls `_runPlan()` → creates a new LightSOPLangInterpreter to execute the generated plan
     - If execution has failures → feeds error feedback back and retries
   - Extracts the last answer from interpreter variables (looks for `lastAnswer`, `result`, `final`, `answer`, `domain`)

**Key behaviors:**
- **Two-phase execution:** Plan generation (LLM writes code) → Plan execution (interpreter runs code deterministically)
- **Plan retry on failure:** If execution fails, error feedback is appended and the LLM generates a new plan
- **Commands registry wrapping:** The engine wraps the real registry to intercept `final_answer`/`cannot_complete` calls and log all tool invocations
- **No session persistence:** Unlike LoopAgentSession, SOP sessions are stateless (no storage in sessionMemory across calls), except for pending-input routing

**Used by:** OrchestratorSkillsSubsystem (default session type), MCPSkillsSubsystem

---

### LLMAgent — Session Factory

**File:** `LLMAgents/LLMAgent.mjs`

The `LLMAgent` class provides factory methods that subsystems call to create sessions:

- **`startLoopAgentSession(tools, initialPrompt, options)`** → Creates a `LoopAgentSession`, calls `newPrompt(initialPrompt)`, returns the session object
- **`startSOPLangAgentSession(skillsDescription, initialPrompt, options)`** → Creates a `SOPAgenticSession`, calls `newPrompt(initialPrompt)`, returns the session object

These methods are called by `OrchestratorSkillsSubsystem.executeLoopAgentSession()` and `executeSOPAgentSession()` respectively.

---

## Subsystem Details

### OrchestratorSkillsSubsystem (`oskill.md`)

**File:** `OrchestratorSkillsSubsystem/OrchestratorSkillsSubsystem.mjs`

Orchestrators coordinate other skills. The `executeSkillPrompt()` method checks `skillRecord.preparedConfig.sessionType` and dispatches to one of two agentic sessions:

```
executeSkillPrompt()
    │
    ├─ sessionType === 'loop'  →  executeLoopAgentSession()
    │                                 │
    │                                 ├─ Check sessionMemory for existing session in AWAITING_INPUT state
    │                                 ├─ If exists → session.newPrompt(promptText) (resume)
    │                                 ├─ Else → llmAgent.startLoopAgentSession(tools, prompt, options)
    │                                 └─ Store/clear session in sessionMemory based on final status
    │
    └─ sessionType !== 'loop'  →  executeSOPAgentSession()  (default)
                                      │
                                      └─ llmAgent.startSOPLangAgentSession(descriptions, prompt, options)
```

**Tool building** — The recursive mechanism:
```javascript
// For each allowed skill, an async tool function is created:
tools[skillName] = async (agent, promptText) => {
    const result = await recursiveAgent.executePrompt(promptText, {
        skillName: skillRecord.name,
        context: forwardedContext,
    });
    return result?.result;
};
```
This means when the LLM (inside LoopAgentSession or SOPAgenticSession) calls a tool, it re-enters the full `RecursiveSkilledAgent.executePrompt()` flow — which can in turn trigger another subsystem, another orchestrator, etc.

**Preparation phase:** If the skill descriptor has a `preparation` section, a sub-session runs first using `allowed-prep-skills` (or all allowed skills as fallback) to gather context before the main execution.

**Descriptor sections:** `instructions`, `preparation`, `allowed-skills`, `allowed-prep-skills`, `description`, `session-type`

### CodeSkillsSubsystem (`cskill.md`)

Dynamically generated Node.js code skills.

1. Load specifications from descriptor sections
2. Resolve entry: `src/index.mjs` or `src/index.js`
3. Dynamic `import(modulePath)`
4. Call `module.action({ promptText, llmAgent, recursiveAgent, context, sessionMemory, user, attachments })`

Code is generated by the `mirror-code-generator` internal skill at registration time.

### ClaudeSkillsSubsystem (`SKILL.md`)

Direct Claude orchestration with file access and script execution tools. Uses `LoopAgentSession` with built-in tools. Supports multi-turn via sessionMemory.

**Descriptor sections:** `scripts` (relative paths), `resources` (relative paths)

### DynamicCodeGenerationSubsystem (`dcgskill.md`)

Generates code from Formal Dependency Specifications (FDS). Supports timeout via `ACHILLES_SKILL_TIMEOUT` env var (default 60s).

### MCPSkillsSubsystem (`mskill.md`)

Model Context Protocol skills with remote tool access. Uses `SOPAgenticSession` / `LightSOPLangInterpreter` with MCP tools.

**Descriptor sections:** `instructions`, `allowed-tools`, `light-sop-lang` (script)

### DBTableSkillsSubsystem (`tskill.md`)

Database table access skills. Requires `dbAdapter` passed through SubsystemFactory.

---

## Session & Context Management

### Session Memory

```
┌─────────────────────────────────────────────┐
│         RecursiveSkilledAgent               │
│                                             │
│  _sessions: Map<sessionId, Map>             │
│  _sessionMeta: Map<sessionId, {             │
│      createdAt, lastAccessTime              │
│  }>                                         │
│                                             │
│  CLI mode:  getSessionMemory()              │
│             → uses '__default__' key        │
│                                             │
│  Web mode:  getSessionMemory(sessionId)     │
│             → isolated per user/session     │
└─────────────────────────────────────────────┘
```

**Session configuration** (`constants/sessionConfig.mjs`):

| Setting | Default | Description |
|---------|---------|-------------|
| `maxSessions` | `1000` | Max sessions before LRU eviction (0 = unlimited) |
| `sessionTTL` | `7,200,000` (2h) | Idle timeout before expiry (0 = never) |
| `cleanupInterval` | `300,000` (5m) | Periodic cleanup sweep interval |

**Presets:** `NEVER` (no expiry), `SHORT` (15m), `MEDIUM` (1h), `LONG` (2h), `DAY` (24h)

**Cleanup mechanisms:**
- **TTL-based:** Sessions idle longer than `sessionTTL` are removed
- **LRU eviction:** When `maxSessions` exceeded, oldest-accessed sessions are evicted
- **Periodic timer:** Runs every `cleanupInterval`, calls `cleanupSessions()`

### Context Auto-Injection

When `executeWithReviewMode()` is called, the agent auto-injects:

1. **sessionMemory** — Resolved from `options.context.sessionId`, `options.context.user.sessionId`, `options.context.user.sessionToken`, or default session
2. **I/O services** — `inputReader` and `outputWriter` if configured on the agent and not already in context

---

## Internal Skills

Registered asynchronously as pending preparations during initialization.

| Name | Type | Entry Point | Purpose |
|------|------|-------------|---------|
| `mirror-code-generator` | `cskill` | `mirror-code-generator/src/index.mjs` | Generates Node.js code from specifications |
| `ask-user` | `cskill` | `ask-user/src/index.mjs` | Interactive user prompts |

Internal skills must export: `shortName`, `skillType`, `action(context)`, and have a corresponding descriptor file.

---

## Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `Sanitiser` | `utils/Sanitiser.mjs` | Normalizes identifiers: `trim → lowercase → replace non-alphanum with dash → strip edge dashes` |
| `fileUtils` | `utils/fileUtils.mjs` | `isReadableFile(path)`, `isDirectory(path)` — sync filesystem checks |
| `DebugLogger` | `utils/DebugLogger.mjs` | Conditional file-based logging. Enabled via `ACHILLES_DEBUG=true\|1`. Output: `debuglogs/debug-{PID}.log` |

---

## Flow Diagram: User Input → Output

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              USER INPUT                                      │
│                  agent.executePrompt(taskDescription, options)                │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              RecursiveSkilledAgent.executeWithReviewMode()                    │
│                                                                              │
│  1. Resolve sessionId from options.context                                   │
│  2. Auto-inject sessionMemory (Map) into options.context                     │
│  3. Auto-inject I/O services (inputReader, outputWriter) if configured       │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     SkillExecutor.execute()                                   │
│                                                                              │
│  1. If top-level call: await all pendingPreparations                         │
│  2. Invoke onBegin() callback                                                │
│  3. Route based on whether skillName is provided                             │
└──────────┬──────────────────────────────────┬────────────────────────────────┘
           │                                  │
           │ skillName provided               │ no skillName
           ▼                                  ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────────┐
│  SkillRegistry.get() │    │  SkillExecutor.executeWithoutExplicitSkill()     │
│  Lookup by name or   │    │                                                  │
│  alias (normalized)  │    │  Step 1: Try orchestrator selection               │
└──────────┬───────────┘    │    registry.listByType('orchestrator')            │
           │                │    selector.selectOrchestrator(task, orchestrators)│
           │                │      ├─ FlexSearch full-text index                │
           │                │      └─ Token-based scoring fallback              │
           │                │                                                   │
           │                │  If orchestrator found:                            │
           │                │    → subsystem.executeSkillPrompt() directly       │
           │                │    (bypasses re-entering execute())                │
           │                │                                                   │
           │                │  If NO orchestrator found:                         │
           │                │    Step 2: LLM picks from ALL skills (any type)    │
           │                │    selector.chooseWithLLM(task, registry.getAll()) │
           │                │      └─ Falls back to chooseByHeuristic()          │
           │                │                                                   │
           │                │    If LLM picks a skill:                           │
           │                │      → re-enters execute() with that skillName     │
           │                │      (skill can be cskill, claude, mcp, etc.)      │
           │                │                                                   │
           │                │    If nothing selected:                             │
           │                │      → throws Error("Unable to determine an        │
           │                │        appropriate skill for the request.")         │
           │                └────────────────────┬─────────────────────────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SubsystemFactory.get(skillRecord.type)                     │
│                                                                              │
│  Returns cached subsystem instance (lazy singleton per type)                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              subsystem.executeSkillPrompt({                                   │
│                  skillRecord, recursiveAgent, promptText, options             │
│              })                                                              │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────────────┘
       │          │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼          ▼
┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│Orchestr- ││ Code-    ││ Claude   ││ Dynamic  ││  MCP     ││ DBTable  │
│ator      ││ Skills   ││ Skills   ││ CodeGen  ││ Skills   ││ Skills   │
│(oskill)  ││(cskill)  ││(SKILL)   ││(dcgskill)││(mskill)  ││(tskill)  │
├──────────┤├──────────┤├──────────┤├──────────┤├──────────┤├──────────┤
│          ││          ││          ││          ││          ││          │
│sessionTyp││ dynamic  ││ LoopAgent││ LLM code ││SOPAgenti-││ DB      │
│e=loop:   ││ import   ││ Session  ││ gen from ││cSession +││ queries │
│ LoopAgent││ module   ││ with     ││ specs    ││ MCP      ││ via     │
│ Session  ││ .action()││ file/    ││          ││ tools    ││ adapter │
│          ││          ││ script   ││          ││          ││          │
│default:  ││          ││ tools    ││          ││          ││          │
│SOPAgenti-││          ││          ││          ││          ││          │
│cSession  ││          ││          ││          ││          ││          │
└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘
     │           │           │           │           │           │
     │     ┌─────┴───────────┘           │           │           │
     │     │  These three use agentic    │           │           │
     │     │  session engines            │           │           │
     │     └─────┬───────────┐           │           │           │
     │           │           │           │           │           │
     └───────────┴───────────┴───────────┴───────────┴───────────┘
                               │
                               │  ┌─────────────────────────────────────┐
                               │  │      RECURSIVE EXECUTION            │
                               ├──│  Orchestrators build tools that     │
                               │  │  call recursiveAgent.executePrompt()│
                               │  │  → re-enters this flow for each    │
                               │  │    allowed sub-skill                │
                               │  └─────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SkillExecutor — Post-Processing                       │
│                                                                              │
│  1. Wrap primitive results in { result: value }                              │
│  2. Attach metadata: { ...execution, reviewMode, subsystem: skillType }      │
│  3. Invoke onEnd() callback                                                  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              OUTPUT                                          │
│                  { result, reviewMode, subsystem, ... }                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Initialization Sequence

```
new RecursiveSkilledAgent(options)
    │
    ├─ 1. Validate/create LLMAgent
    │
    ├─ 2. _initializeServices()
    │      ├─ Create SkillRegistry (with optional skillFilter)
    │      ├─ Create SubsystemFactory (with llmAgent, dbAdapter)
    │      ├─ Create SkillDiscoveryService (with searchUpwards config)
    │      ├─ Create SkillSelector (with llmAgent)
    │      ├─ Create SkillExecutor (with registry, factory, selector, callbacks)
    │      └─ _exposeInternalSkills() → async, queued as pending preparation
    │
    ├─ 3. Configure session memory (TTL, maxSessions, cleanup timer)
    │
    └─ 4. _discoverAndRegister()
           ├─ findRoots([startDir, cwd()], additionalSkillRoots)
           └─ For each root:
               └─ discoverFromRoot(root) → skillRecords[]
                   └─ For each skillRecord:
                       ├─ subsystem.parseSkillDescriptor()
                       ├─ Sanitise & set canonical name
                       ├─ registry.register(skillRecord)
                       ├─ If cskill: queue mirror-code-generator
                       └─ subsystem.prepareSkill() (may be async → pending)
```

---

## Skill Record Structure

```javascript
{
  name: 'my-skill-orchestrator',        // Canonical (sanitized name + type)
  shortName: 'my-skill',                // Directory name
  type: 'orchestrator',                 // Subsystem type
  skillDir: '/path/to/skills/my-skill', // Skill root directory
  filePath: '/path/to/skills/my-skill/oskill.md', // Descriptor file
  descriptor: {
    name: 'My Skill',                   // Human-readable name from descriptor
    rawContent: '...',                  // Full descriptor text
    sections: {                         // Parsed markdown sections
      instructions: '...',
      'allowed-skills': '...',
      // ... subsystem-specific sections
    },
  },
  preparedConfig: {                     // Subsystem-specific prepared state
    type: 'orchestrator',
    instructions: '...',
    allowedSkills: ['skill-a', 'skill-b'],
    // ... varies by subsystem
  },
}
```

---

## Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Facade** | RecursiveSkilledAgent | Single entry point hiding service complexity |
| **Factory + Singleton** | SubsystemFactory | Lazy instantiation, one instance per type |
| **Registry** | SkillRegistry | Catalog with multi-alias lookup |
| **Strategy** | SkillSelector | FlexSearch → token heuristic → LLM fallback |
| **Observer** | Lifecycle callbacks | onBegin/onProgress/onEnd hooks |
| **Lazy Init** | pendingPreparations | Async work queued at construction, awaited at execution |
| **Recursive Composition** | Orchestrator tools | Skills invoke other skills via `recursiveAgent.executePrompt()` |

---

## Key Environment Variables

| Variable | Effect |
|----------|--------|
| `ACHILLES_DEBUG=true\|1` | Enable debug logging to `debuglogs/debug-{PID}.log` |
| `ACHILLES_DISABLE_FLEXSEARCH=1` | Disable FlexSearch indexing in SkillSelector |
| `ACHILLES_SKILL_TIMEOUT` | Timeout for DynamicCodeGeneration skills (default 60s) |
| `SOUL_GATEWAY_API_KEY` | Routes LLM calls through Soul Gateway |
| `AGENT_NAME` | Injected as `X-Soul-Agent` header on LLM calls |
