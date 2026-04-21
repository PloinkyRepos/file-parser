# Plan: Documentation Claude Skills via skill-manager-cli

## Context

**Problem:** You want to create `claude` type skills (SKILL.md) for documentation generation — scientific articles, EU deliverables, technical docs, books — and manage them via skill-manager-cli. The `claude` skill type already provides the right execution model (loop session + ask-user + run-script + get-resource), but:

1. The current `claude` template is generic — no doc-specific guidance
2. `/write` only creates SKILL.md — doesn't scaffold `resources/` (structure profiles, style guides) or `scripts/` (pandoc, citation tools)
3. No doc-specific templates exist for `/template`

**Solution:** Enhance skill-manager-cli with doc-focused scaffolding. No GAMPSkills changes needed.

**Why `claude` skill type:** ClaudeSkillsSubsystem (SKILL.md) now has **up to 10 tools**:

**8 core tools (always available):**
- `ask-user` → interactive review, asking clarifications (requires internal `ask-user` skill to be registered)
- `read` → read any file
- `write` → write/create files
- `edit` → edit existing files
- `glob` → find files by pattern
- `grep` → search file contents
- `bash` → run shell commands (pandoc, LaTeX, etc.)
- `webfetch` → fetch URLs (DOI lookup, reference fetching)

**2 conditional tools (if directories exist in skill folder):**
- `run-script` → execute scripts from `scripts/` directory (path-sandboxed via `isSafeChildPath`)
- `get-resource` → read files from `resources/` directory (path-sandboxed via `isSafeChildPath`)

**Plus:** SKILL.md content → system prompt, loop agent session for iterative work, session memory for multi-turn state.

This means doc skills can directly read/write files, search codebases, run pandoc via bash, fetch DOIs via webfetch, and ask clarifying questions — all without needing separate cskill/oskill infrastructure. The `resources/` dir holds structure profiles; `scripts/` holds export tooling.

**Important:** Use uppercase `SKILL.md`. achillesAgentLib runtime discovers `SKILL.md` (see `skillFileTypes.mjs`), even though some Achilles docs still mention lowercase `skill.md`.

---

## How achillesAgentLib Discovers and Executes Skills

### Skill file types (6 recognized)

**File:** `achillesAgentLib/RecursiveSkilledAgents/constants/skillFileTypes.mjs` (lines 5-12)

| File | Type | Subsystem |
|------|------|-----------|
| `SKILL.md` | `claude` | ClaudeSkillsSubsystem |
| `dcgskill.md` | `dynamic-code-generation` | DynamicCodeGenerationSubsystem |
| `cskill.md` | `cskill` | CodeSkillsSubsystem |
| `mskill.md` | `mcp` | MCPSkillsSubsystem |
| `oskill.md` | `orchestrator` | OrchestratorSkillsSubsystem |
| `tskill.md` | `dbtable` | DBTableSkillsSubsystem |

**NOT in SKILL_FILE_TYPES (will not be discovered):**
- `cgskill.md` — was renamed to `dcgskill.md` in achillesAgentLib. All 16 built-in skills in skill-manager-cli still use `cgskill.md`.
- `iskill.md` — no subsystem exists.

### Discovery → Registration → Execution chain

1. **Discovery** — `SkillDiscoveryService.discoverFromDirectory()` (line 268) iterates **only** `SKILL_FILE_TYPES` entries. Files not in this list are invisible.
2. **Registration** — `SkillRegistry.register()` creates aliases (canonical name, short name, sanitized variants). Skills must be registered to be executable.
3. **Execution** — `SkillExecutor.execute()` (line 237) calls `this.registry.get(skillName)`. If skill not found → **throws error** (line 238-239). No fallback.
4. **Subsystem dispatch** — `SubsystemFactory.get(type)` (line 248) routes to the correct subsystem. 6 subsystems registered in `SUBSYSTEM_REGISTRY`.

### How DynamicCodeGenerationSubsystem executes skills

**File:** `achillesAgentLib/DynamicCodeGenerationSubsystem/DynamicCodeGenerationSubsystem.mjs`

`prepareSkill()` (lines 275-327) resolves hand-written modules by **directory-name convention**:
- Folder: `skills/my-skill/`
- Descriptor: `skills/my-skill/dcgskill.md` (must be in SKILL_FILE_TYPES to be discovered)
- Module: `skills/my-skill/my-skill.mjs` (must match folder name, `.mjs` preferred over `.js`)
- Module must export `action(payload)` where payload includes `{ llmAgent, recursiveAgent, input, promptText, context, sessionMemory }`

If module exists → calls `action()` directly. If not → sends prompt to LLM for text/code generation.

### How ClaudeSkillsSubsystem executes skills

**File:** `achillesAgentLib/ClaudeSkillsSubsystem/ClaudeSkillsSubsystem.mjs`

`executeSkillPrompt()` (lines 67-120):
- Builds all tools via `buildClaudeTools()` (8 core + up to 2 conditional)
- Uses SKILL.md `rawContent` as `systemPrompt` (line 101)
- Creates loop session: `this.llmAgent.startLoopAgentSession(tools, promptText, sessionOptions)` (line 103)
- Supports session resumption via `SESSION_STATUS_AWAITING_INPUT` (line 95-96)
- `ask-user` tool depends on `resolveInternalSkillRecord(internalSkills, 'ask-user')` in `buildTools.mjs` (line 65) — requires `ask-user` to be registered as an internal skill

### Internal skills (separate from discovery)

**File:** `achillesAgentLib/RecursiveSkilledAgents/services/SkillExecutor.mjs` (lines 10-14)

Two hardcoded internal skills bypass discovery entirely:
```javascript
const INTERNAL_SKILLS = {
    'mirror-code-generator': '../mirror-code-generator/src/index.mjs',
    'ask-user': '../ask-user/src/index.mjs',
};
```

Registered via `RecursiveSkilledAgent._exposeInternalSkills()` (lines 202-250).

### Key methods on RecursiveSkilledAgent

| Method | Lines | Purpose |
|--------|-------|---------|
| `getSkillsDir()` | 714-716 | Returns `path.join(this.startDir, 'skills')` |
| `reloadSkills()` | 774-778 | Clears registry, re-runs discovery, returns count |
| `findSkillFile(skillDir)` | 731-749 | Iterates SKILL_FILE_TYPES — will NOT find cgskill.md |
| `executePrompt()` | 916-918 | Entry point → `executeWithReviewMode()` → `executor.execute()` |

---

## Critical Finding: cgskill.md Built-in Skills Are Not Discovered

### The problem

skill-manager-cli's 16 built-in skills all use `cgskill.md` descriptors. But `cgskill.md` is NOT in achillesAgentLib's `SKILL_FILE_TYPES`. This means:

1. `SkillDiscoveryService.discoverFromDirectory()` will **not** find them
2. They are **not** registered in `SkillRegistry`
3. `SkillExecutor.execute()` would **throw** if called with their name

### Resolution: skill-manager-cli uses a different achillesAgentLib version

**Evidence from `skill-manager-cli/CLAUDE.md`:**
- Dependency declaration: `achilles-agent-lib (linked locally via file:../AchillesAgentLib)` — a **separate copy**, not ploinky's `node_modules/achillesAgentLib`
- Documents `CodeGenerationSkillsSubsystem` for cgskill and `InteractiveSkillsSubsystem` for iskill — subsystem names that **do not exist** in ploinky's current achillesAgentLib (which has `DynamicCodeGenerationSubsystem` and no Interactive subsystem)
- Discovery process documentation explicitly says: *"Looks for recognized skill files (tskill.md, cgskill.md, cskill.md, etc.)"*

**Conclusion:** skill-manager-cli's achillesAgentLib is an older/different version that still has `cgskill.md` in its `SKILL_FILE_TYPES`. The 16 built-in skills are discovered and registered normally through this version. The analysis in the sections above (SKILL_FILE_TYPES, SkillDiscoveryService, SkillExecutor) describes ploinky's copy, not skill-manager-cli's.

**Execution flow (confirmed working):**
1. `SlashCommandHandler.mjs` has a static `COMMANDS` map (lines 19-142) mapping slash commands to skill names
2. `REPLSession._executeSkill(skillName, input)` (lines 168-175) calls `agent.executePrompt(input, { skillName })`
3. `executePrompt` → `SkillExecutor.execute()` → `registry.get(skillName)` — succeeds because skill-manager-cli's achillesAgentLib **does** discover and register cgskill.md files

### Implications for this plan

- **Phase 1:** Use `cgskill.md` for `scaffold-doc-skill` — same pattern as all existing built-ins. Don't diverge from the working pattern.
- **Phase 2:** Rename all `cgskill.md` → `dcgskill.md` to align with current achillesAgentLib. This may actually be a **critical fix**, not just cleanup.

---

## Security / Scope

The 8 core tools (`read`, `write`, `edit`, `bash`, `glob`, `grep`, `webfetch`, `ask-user`) are **not scoped to the skill folder** — they operate on the entire workspace. Only `run-script` and `get-resource` are sandboxed to `scripts/` and `resources/` respectively (via `isSafeChildPath()` checks in `buildTools.mjs`).

This means doc skills are effectively general-purpose workspace agents with doc-oriented system prompts. The safety model is **prompt-level guidance, not hard sandboxing**.

Each scaffold template should include these guardrails in its Guidelines:
- Prefer `resources/` for templates and guidance files
- Only edit user-requested files — ask before overwriting existing deliverables
- Prefer `run-script` over ad-hoc `bash` when packaged scripts exist
- Do not modify files outside the document working directory unless explicitly asked

---

## Phased Implementation

- **Phase 1:** Doc scaffolding — `DOC_SCAFFOLDS`, `scaffold-doc-skill`, `/scaffold` command, `/template` integration
- **Phase 2:** Legacy type migration — `cgskill`→`dcgskill` rename (16 built-in skills), `iskill` removal, test updates

Phase 2 is a broader compatibility cleanup. See the full scope at the end of this document.

---

## Phase 1: Changes to skill-manager-cli

### 1. Add `DOC_SCAFFOLDS` to skillSchemas.mjs

**File:** `skill-manager-cli/skill-manager/src/schemas/skillSchemas.mjs`

Add a new export `DOC_SCAFFOLDS` after `SKILL_TEMPLATES` (after line 370, before the default export at line 737). Each scaffold defines a full directory structure for a doc skill type:

```javascript
export const DOC_SCAFFOLDS = {
  'doc-scientific': {
    skillType: 'claude',
    description: 'Scientific article generator (IEEE, APA, ACM)',
    template: `# Scientific Article Writer

You are an expert scientific article writer...
[detailed system prompt with citation handling, section generation, review instructions]

## Guidelines
- Generate one section at a time when asked
- Use get-resource to load the structure profile (resources/structure.md) and citation style guides
- Use ask-user to clarify methodology, scope, or data questions
- Use write to save generated sections to files
- Use read to load previously written sections for cross-reference context
- Use webfetch to look up DOIs and fetch citation metadata
- Use bash to run pandoc for format conversion (MD → PDF, LaTeX, DOCX)
- Use grep/glob to search existing content for consistency checks
- Only edit user-requested files — ask before overwriting existing deliverables
- Do not modify files outside the document working directory unless explicitly asked

## Resources
- resources/structure.md — article section structure and requirements
- resources/citation-styles/ — citation format guides (IEEE, APA, etc.)
`,
    resources: {
      'structure.md': `# Scientific Article Structure Profile

## Abstract
Concise summary (150-300 words): problem, methods, key findings, conclusion.

## 1. Introduction
Background, problem statement, research gap, objectives, paper organization.

## 2. Related Work / Literature Review
Critical survey of prior work, positioning of this contribution.

## 3. Methodology
Approach, experimental setup, data, algorithms, formal definitions.

## 4. Results
Findings with figures/tables, statistical analysis.

## 5. Discussion
Interpretation, implications, comparison with prior work, limitations.

## 6. Conclusion
Summary, contributions, future work.

## References
Use specified citation style. Number references in order of appearance (IEEE)
or author-year (APA).
`,
      'citation-styles/ieee.md': `# IEEE Citation Style
- Numbered references: [1], [2], [3]
- Reference list ordered by first citation
- Format: [N] Author(s), "Title," Journal, vol. X, no. Y, pp. Z-Z, Month Year.
`,
      'citation-styles/apa.md': `# APA Citation Style
- Author-year in text: (Author, Year)
- Reference list alphabetical by first author
- Format: Author, A. B. (Year). Title. Journal, Volume(Issue), Pages. DOI
`,
    },
    scripts: {},
  },

  'doc-eu-deliverable': {
    skillType: 'claude',
    description: 'EU Horizon Europe project deliverable (200+ pages)',
    template: `# EU Project Deliverable Writer

You are an expert in writing EU Horizon Europe project deliverables...
[detailed system prompt for EU deliverable structure, compliance, multi-section generation]

## Guidelines
- Use get-resource to load the structure profile and dissemination level definitions
- Generate sections one at a time to handle 200+ page documents
- Use write to save each section to a separate file, use read to load previous sections for context
- Track progress by maintaining a state file (JSON) — read/write it between sections
- Use ask-user to clarify work package scope, partner contributions, technical details
- Use bash to run pandoc for document assembly and export
- Use webfetch to fetch project references and deliverable templates
- Only edit user-requested files — ask before overwriting existing deliverables
- Do not modify files outside the document working directory unless explicitly asked

## Resources
- resources/structure.md — Horizon Europe deliverable structure
- resources/dissemination-levels.md — PU, SEN, CI definitions
`,
    resources: {
      'structure.md': `# EU Horizon Europe Deliverable Structure

## Cover Page
Project acronym, grant number, deliverable number, title, due date,
submission date, dissemination level, lead beneficiary, version.

## Version History
Table: Version | Date | Author | Description of changes

## Executive Summary
1-2 page overview for non-experts. Problem, approach, key results.

## Table of Contents
Auto-generated.

## List of Abbreviations
Alphabetical table of all acronyms used.

## 1. Introduction
Project context, deliverable scope, relationship to WP/tasks,
document structure overview.

## 2. Objectives
Link to DoA objectives. What this deliverable achieves.

## 3-N. Technical Sections
Work package aligned. Methods, implementation, results per task.

## N+1. Conclusions and Next Steps
Summary of achievements, deviations from DoA, impact on project timeline.

## References
Academic and technical references.

## Annexes
Supporting material, raw data, detailed technical specifications.
`,
      'dissemination-levels.md': `# Dissemination Levels
- **PU** — Public
- **SEN** — Sensitive (EU restricted under conditions in Grant Agreement)
- **CI** — Classified (EU CONFIDENTIEL, RESTREINT UE, SECRET UE)
`,
    },
    scripts: {},
  },

  'doc-technical': {
    skillType: 'claude',
    description: 'Technical documentation (API docs, architecture docs, runbooks)',
    template: `# Technical Documentation Writer

You are an expert technical writer...
[system prompt for technical docs with code examples, architecture diagrams, API reference]

## Guidelines
- Use get-resource to load the structure profile
- Use read/glob to scan existing codebase for API signatures, config files
- Use grep to find implementation details to document
- Include code examples with proper formatting
- Use mermaid syntax for diagrams where applicable
- Use ask-user to clarify architecture decisions, API contracts, deployment specifics
- Use write to save generated documentation sections
- Only edit user-requested files — ask before overwriting
- Prefer run-script over ad-hoc bash when packaged scripts exist

## Resources
- resources/structure.md — technical doc structure and conventions
`,
    resources: {
      'structure.md': `# Technical Documentation Structure

## Overview
Purpose, audience, prerequisites, quick start.

## Architecture
System components, data flow, design decisions, diagrams (mermaid).

## API Reference
Endpoints/methods with parameters, return types, examples, error codes.

## Configuration
Environment variables, config files, feature flags.

## Deployment
Requirements, installation steps, infrastructure setup.

## Operations
Monitoring, logging, troubleshooting, runbooks.

## Changelog
Version history with breaking changes highlighted.
`,
    },
    scripts: {},
  },

  'doc-book': {
    skillType: 'claude',
    description: 'Book/manual writer (non-fiction, textbooks, manuals)',
    template: `# Book Writer

You are an expert book writer and editor...
[system prompt for chapter-based generation, narrative flow, front/back matter]

## Guidelines
- Generate chapter by chapter
- Maintain consistent voice and style throughout
- Use get-resource for structure profile
- Use read to load previous chapters for cross-reference and voice consistency
- Use write to save each chapter
- Use ask-user to discuss chapter direction, target audience, depth
- Only edit user-requested files — ask before overwriting

## Resources
- resources/structure.md — book structure conventions
`,
    resources: {
      'structure.md': `# Book Structure

## Front Matter
Title page, copyright, dedication, table of contents, preface/foreword, acknowledgments.

## Part Structure (optional)
Group related chapters into parts with part introductions.

## Chapter Structure
- Opening hook or scenario
- Main content with subsections (3-5 per chapter)
- Examples, case studies, or exercises
- Chapter summary / key takeaways

## Back Matter
Appendices, glossary, bibliography/references, index, about the author.
`,
    },
    scripts: {},
  },

  'doc-review': {
    skillType: 'claude',
    description: 'Interactive document reviewer — coherence, style, completeness analysis',
    template: `# Document Reviewer

You are a meticulous document reviewer and editor. Your task is to deeply analyze documents for quality, coherence, completeness, and style.

## Review Process
1. Use glob to find all document sections, use read to load them
2. Analyze for: factual consistency, logical flow, terminology consistency, citation correctness, tone, completeness
3. Use grep to check terminology consistency across all sections
4. Present findings organized by severity (critical, major, minor)
5. Use ask-user to:
   - Clarify ambiguous passages with the author
   - Confirm intended meaning before suggesting changes
   - Discuss structural reorganization proposals
   - Get approval before making substantive edits
6. Propose specific improvements with before/after examples
7. After approval, use edit to apply changes directly to document files

## Review Checklist
- Cross-reference validity (do section references match?)
- Terminology: same concept = same term throughout
- Acronyms defined before first use
- Figures/tables numbered and referenced in text
- Citations complete and consistently formatted
- Logical flow between paragraphs and sections
- No contradictions between sections
- Completeness: all promised content delivered

## Guidelines
- Be specific: cite exact passages, not vague observations
- Prioritize: critical issues first
- Preserve the author's voice — fix errors, don't rewrite style
- For large documents, review section by section
- Always ask before making content changes (grammar/typo fixes are OK without asking)
- Use webfetch to verify external references and citations if needed
- Only edit user-requested files — ask before overwriting
`,
    resources: {},
    scripts: {},
  },
};
```

### 2. New built-in skill: `scaffold-doc-skill`

**Location:** `skill-manager-cli/skill-manager/src/skills/scaffold-doc-skill/`

**Files:**
- `cgskill.md` — descriptor (matches existing built-in pattern; rename to `dcgskill.md` in Phase 2)
- `scaffold-doc-skill.mjs` — hand-written module (must match folder name)

**What it does:**
1. Takes `<doc-type> <skill-name>` as input (e.g., `doc-scientific my-paper`)
2. Looks up `DOC_SCAFFOLDS[docType]`
3. Creates the full directory structure:
   ```
   skills/<skill-name>/
   ├── SKILL.md                    # From scaffold template
   ├── resources/
   │   ├── structure.md            # From scaffold resources
   │   └── citation-styles/        # If defined in scaffold
   │       ├── ieee.md
   │       └── apa.md
   └── scripts/                    # Empty, ready for user to add pandoc etc.
   ```
4. Calls `agent.reloadSkills()` to make it immediately available
5. Returns summary of created files

**Implementation** (follows `write-skill/write-skill.mjs` pattern — uses `getSkillsDir()` at line 10, `reloadSkills()` at lines 65-72):
```javascript
import fs from 'node:fs';
import path from 'node:path';
import { DOC_SCAFFOLDS } from '../../schemas/skillSchemas.mjs';

export async function action(recursiveSkilledAgent, prompt) {
    const skillsDir = recursiveSkilledAgent?.getSkillsDir?.();
    if (!skillsDir) return 'Error: skillsDir not available';

    // Parse: doc-type skill-name
    const parts = String(prompt || '').trim().split(/\s+/);
    const docType = parts[0];
    const skillName = parts[1];

    if (!docType || !skillName) {
        const types = Object.keys(DOC_SCAFFOLDS).join(', ');
        return `Usage: scaffold <doc-type> <skill-name>\nAvailable types: ${types}`;
    }

    const scaffold = DOC_SCAFFOLDS[docType];
    if (!scaffold) {
        const types = Object.keys(DOC_SCAFFOLDS).join(', ');
        return `Unknown doc type "${docType}". Available: ${types}`;
    }

    const skillDir = path.join(skillsDir, skillName);
    const created = [];

    // Create SKILL.md
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), scaffold.template, 'utf8');
    created.push('SKILL.md');

    // Create resources/
    if (scaffold.resources && Object.keys(scaffold.resources).length > 0) {
        for (const [relPath, content] of Object.entries(scaffold.resources)) {
            const fullPath = path.join(skillDir, 'resources', relPath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, 'utf8');
            created.push(`resources/${relPath}`);
        }
    } else {
        fs.mkdirSync(path.join(skillDir, 'resources'), { recursive: true });
    }

    // Create scripts/
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    if (scaffold.scripts) {
        for (const [relPath, content] of Object.entries(scaffold.scripts)) {
            const fullPath = path.join(skillDir, 'scripts', relPath);
            fs.writeFileSync(fullPath, content, 'utf8');
            created.push(`scripts/${relPath}`);
        }
    }

    // Reload skills
    let reloadMsg = '';
    if (typeof recursiveSkilledAgent.reloadSkills === 'function') {
        try {
            const count = recursiveSkilledAgent.reloadSkills();
            reloadMsg = `\nSkills reloaded (${count} registered).`;
        } catch (e) {
            reloadMsg = '\nNote: Could not auto-reload.';
        }
    }

    return `Scaffolded "${skillName}" (${docType}):\n${created.map(f => `  ${skillName}/${f}`).join('\n')}${reloadMsg}`;
}

export default action;
```

### 3. New slash command: `/scaffold`

**File:** `skill-manager-cli/skill-manager/src/repl/SlashCommandHandler.mjs`

Add to `COMMANDS` dict (after line 141):
```javascript
'scaffold': {
    skill: BUILT_IN_SKILLS.SCAFFOLD_DOC,
    usage: '/scaffold <doc-type> <skill-name>',
    description: 'Create a documentation skill with full structure (SKILL.md + resources/ + scripts/)',
    args: 'required',
    needsSkillArg: false,
},
```

### 4. Update `/template` and `/scaffold` completions

**File:** `skill-manager-cli/skill-manager/src/repl/SlashCommandHandler.mjs`

At line 386, add doc types to `/template` completions:
```javascript
if (command === 'template') {
    const types = ['tskill', 'cskill', 'cgskill', 'iskill', 'oskill', 'mskill', 'claude',
                   'doc-scientific', 'doc-eu-deliverable', 'doc-technical', 'doc-book', 'doc-review'];
    ...
}
```

Add new completions block for `/scaffold` (must match existing API: uses `argPrefix`, returns `[array, line]` tuple):
```javascript
if (command === 'scaffold') {
    const types = ['doc-scientific', 'doc-eu-deliverable', 'doc-technical', 'doc-book', 'doc-review'];
    const matchingTypes = types
        .filter(t => t.startsWith(argPrefix))
        .map(t => `/${command} ${t}`);
    return [matchingTypes, line];
}
```

### 5. Update get-template to serve doc scaffolds

**File:** `skill-manager-cli/skill-manager/src/skills/get-template/get-template.mjs`

Import `DOC_SCAFFOLDS` and check doc types before falling back to `SKILL_TEMPLATES`:
```javascript
import { SKILL_TYPES, SKILL_TEMPLATES, DOC_SCAFFOLDS } from '../../schemas/skillSchemas.mjs';

export async function action(recursiveSkilledAgent, prompt) {
    // ... existing parsing ...

    // Check doc scaffolds first
    const scaffold = DOC_SCAFFOLDS[skillType];
    if (scaffold) {
        const output = [];
        output.push(`=== Doc Scaffold: ${skillType} (SKILL.md) ===`);
        output.push(`Description: ${scaffold.description}`);
        output.push(`Tip: Use /scaffold ${skillType} <name> to create with full directory structure`);
        output.push('');
        output.push('--- TEMPLATE START ---');
        output.push(scaffold.template);
        output.push('--- TEMPLATE END ---');
        if (Object.keys(scaffold.resources).length > 0) {
            output.push('\n--- INCLUDED RESOURCES ---');
            for (const [file] of Object.entries(scaffold.resources)) {
                output.push(`  resources/${file}`);
            }
        }
        return output.join('\n');
    }

    // ... existing skill template handling ...
}
```

### 6. Register `scaffold-doc-skill` as built-in

**File:** `skill-manager-cli/skill-manager/src/lib/constants.mjs`

Add to `BUILT_IN_SKILLS` dict (after line 38, alongside existing 17 entries):
```javascript
SCAFFOLD_DOC: 'scaffold-doc-skill',
```

### 7. Update skills-orchestrator

**File:** `skill-manager-cli/skill-manager/src/skills/skills-orchestrator/oskill.md`

Add doc-related intent examples (in the operations list at lines 11-26, and examples at lines 60-75):
```
- "scaffold a scientific article skill" → scaffold-doc-skill
- "create a doc reviewer" → scaffold-doc-skill with doc-review type
- "template for EU deliverable" → get-template with doc-eu-deliverable
```

Add `scaffold` to the Intents section (lines 269-286).

---

## User Workflow After Changes

```bash
# See available doc types
/template doc-scientific

# Scaffold a full doc skill with structure profiles
/scaffold doc-scientific my-ml-paper

# Customize the SKILL.md, add resources, add scripts
/read my-ml-paper
/update my-ml-paper "Guidelines" "Focus on deep learning..."

# Add a pandoc export script
# (manually add scripts/export.sh)

# Execute the skill
/exec my-ml-paper "Write the abstract for a paper about transformer architectures"

# Create a reviewer skill
/scaffold doc-review my-reviewer

# Use it to review the paper
/exec my-reviewer "Review resources/draft.md for coherence and citation completeness"
```

---

## Critical Files to Modify (Phase 1 only)

| File | Change | Insertion Point |
|------|--------|-----------------|
| `skill-manager-cli/skill-manager/src/schemas/skillSchemas.mjs` | Add `DOC_SCAFFOLDS` export | After line 370 (after SKILL_TEMPLATES) |
| `skill-manager-cli/skill-manager/src/skills/get-template/get-template.mjs` | Serve doc scaffold templates | Line 5 (import) + before existing template lookup |
| `skill-manager-cli/skill-manager/src/skills/scaffold-doc-skill/cgskill.md` | **New** built-in skill descriptor | New file |
| `skill-manager-cli/skill-manager/src/skills/scaffold-doc-skill/scaffold-doc-skill.mjs` | **New** scaffold implementation | New file |
| `skill-manager-cli/skill-manager/src/repl/SlashCommandHandler.mjs` | Add `/scaffold` command + completions | After line 141 (COMMANDS), line 386 (completions) |
| `skill-manager-cli/skill-manager/src/lib/constants.mjs` | Add `SCAFFOLD_DOC` constant | After line 38 (BUILT_IN_SKILLS) |
| `skill-manager-cli/skill-manager/src/skills/skills-orchestrator/oskill.md` | Add doc intent routing + scaffold intent | Lines 11-26 (operations), 60-75 (examples), 269-286 (intents) |

## Patterns to Reuse

| Pattern | Source File | Key Lines |
|---------|-------------|-----------|
| Built-in skill structure (cgskill.md + .mjs) | Any `skill-manager/src/skills/*/` | — |
| File creation + reloadSkills | `write-skill/write-skill.mjs` | 10 (getSkillsDir), 51-52 (mkdirSync), 59 (writeFileSync), 65-72 (reloadSkills) |
| Template serving | `get-template/get-template.mjs` | Full file (42 lines) |
| Slash command definition | `SlashCommandHandler.mjs` COMMANDS | Lines 19-142 |
| Claude skill execution model | `ClaudeSkillsSubsystem.mjs` | 67-120 (executeSkillPrompt) |
| Claude tools (up to 10) | `buildTools.mjs` + `tools/*.mjs` | 51-154 (buildClaudeTools) |

---

## Verification

**Deterministic checks (must pass):**
1. `/template doc-scientific` → shows the scientific article SKILL.md template + resource list
2. `/scaffold doc-scientific my-paper` → creates `skills/my-paper/` with SKILL.md + resources/structure.md + resources/citation-styles/ + scripts/
3. `/list` → shows `my-paper` as a registered claude skill
4. `/scaffold doc-review my-reviewer` → creates review skill directory with SKILL.md
5. `/scaffold doc-eu-deliverable wp3-report` → creates EU deliverable skill with Horizon Europe structure profile + dissemination-levels.md

**Capability checks (model-dependent — verify tools are available, not that model uses them deterministically):**
6. `/exec my-paper "Write the introduction about ML"` → runs as loop session; skill can use `get-resource` to load structure profile, `write` to save output, `ask-user` to clarify
7. `/exec my-reviewer "Review the paper draft"` → skill can ask clarifying questions via `ask-user`, can use `read`/`glob`/`grep` to analyze docs, can use `edit` to apply fixes
8. Natural language: `"create a technical documentation skill called api-docs"` → can route to scaffold-doc-skill via orchestrator

---

## Phase 2: Legacy type migration (separate from Phase 1)

### Scope

This is significantly larger than a simple rename. Full inventory:

**Descriptor files to rename (16):**
```
skill-manager-cli/skill-manager/src/skills/*/cgskill.md → dcgskill.md
```
Skills: delete-skill, execute-skill, generate-code, generate-tests, get-template, list-skills, preview-changes, read-skill, read-specs, run-tests, test-code, update-section, validate-skill, write-skill, write-specs, write-tests.

**Schema changes (`skillSchemas.mjs`):**
- Replace `cgskill` entry (lines 45-51) with `dcgskill` (fileName: `dcgskill.md`)
- Remove `iskill` entry entirely (lines 24-29) — no subsystem exists
- Update `detectSkillType()` (lines 399-404 for iskill, 418-421 for cgskill)
- Update validation logic

**Source files with iskill code logic (6 files):**

| File | Lines | What |
|------|-------|------|
| `schemas/skillSchemas.mjs` | 24-29, 188-198, 399-404 | iskill schema, template, detection |
| `skills/generate-code/generate-code.mjs` | 12, 19, 141-142 | `buildIskillCodeGenPrompt`, SUPPORTED_TYPES, switch case |
| `skills/generate-code/codeGeneration.prompts.mjs` | 200+ | Full iskill code generation prompt builder |
| `repl/SlashCommandHandler.mjs` | 386, 407 | Type completion lists |
| `ui/HelpSystem.mjs` | 155-159, 502, 550, 787 | iskill help sections, type listings |
| `index.mjs` | 337 | CLI help text |

**Documentation files (4+):**
- `skill-manager-cli/CLAUDE.md` — ~18 references to cgskill
- `skill-manager-cli/ARCHITECTURE.md` — architecture references
- `skill-manager-cli/bash-skills/README.md` — line 173
- `skill-manager-cli/skill-manager/src/README.md`
- Spec files in `skill-manager-cli/skill-manager/src/specs/`

**Test files (10+):**

| Test File | What |
|-----------|------|
| `tests/generateCode.test.mjs` | Lines 3, 100-128: full "iskill Code Generation" suite |
| `tests/codeGeneration.integration.test.mjs` | Lines 85, 89-90, 115: iskill integration test |
| `tests/testCode.test.mjs` | Lines 121-147: "iskill Code Testing" suite |
| `tests/helpers/testHelpers.mjs` | Lines 60, 165-189, 297-321: iskill file types, templates, mock code |
| `tests/SkillManagerCli.integration.test.mjs` | Line 217: iskill.md test skill |
| `tests/realAgentIntegration.test.mjs` | Lines 140-153, 177: cgskill test skills |
| `tests/skills/validationSkills.test.mjs` | Lines 100-102: iskill template test |
| `tests/skills/skillSchemas.test.mjs` | Lines 40, 160: iskill detection + template tests |
| `tests/skills/crudSkills.test.mjs` | Line 136: iskill.md in TYPES array |
| `tests/skills/editorSkills.test.mjs` | Lines 112, 122, 132: iskill.md write/update/read |

**Total: ~40 files, ~120+ individual references.**

### Migration steps

1. Rename 16 `cgskill.md` → `dcgskill.md` files
2. Update `skillSchemas.mjs`: replace `cgskill` with `dcgskill`, remove `iskill`
3. Update `generate-code.mjs`: remove iskill switch case + prompt builder
4. Update `SlashCommandHandler.mjs`: replace type lists
5. Update `HelpSystem.mjs`: remove iskill, rename cgskill
6. Update `index.mjs`: remove iskill from CLI help
7. Update all test files: fixtures, mocks, assertions
8. Update documentation: CLAUDE.md, ARCHITECTURE.md, READMEs, specs

---

## Phase 1: Test Plan

Tests should follow the existing patterns in `skill-manager-cli/skill-manager/tests/`. Key test files to reference for patterns: `tests/skills/crudSkills.test.mjs` (skill creation), `tests/skills/skillSchemas.test.mjs` (schema/template tests).

### 1. `DOC_SCAFFOLDS` schema tests (`tests/skills/skillSchemas.test.mjs`)

- Each scaffold key exists in `DOC_SCAFFOLDS` and has `skillType: 'claude'`
- Each scaffold has non-empty `template`, `description`, and `resources` (object)
- Template content starts with `#` (markdown heading — valid SKILL.md)
- No unknown scaffold keys (only the 5 defined types)

### 2. `scaffold-doc-skill` unit tests (`tests/skills/scaffoldDocSkill.test.mjs` — new)

- **Missing args** → returns usage string with available types
- **Unknown doc type** → returns error with available types listed
- **Valid scaffold** (`doc-scientific my-paper`):
  - Creates `skills/my-paper/SKILL.md` matching scaffold template
  - Creates `skills/my-paper/resources/structure.md`
  - Creates `skills/my-paper/resources/citation-styles/ieee.md` and `apa.md`
  - Creates `skills/my-paper/scripts/` (empty directory)
  - Calls `reloadSkills()` and reports count in output
- **Scaffold with no resources** (`doc-review my-reviewer`):
  - Creates `skills/my-reviewer/SKILL.md`
  - Creates empty `resources/` directory
  - Creates empty `scripts/` directory
- **All 5 types** scaffold without error (parameterized test)

### 3. `get-template` doc scaffold tests (`tests/skills/crudSkills.test.mjs` or new file)

- `/template doc-scientific` → output contains "Doc Scaffold" header, template content, and resource list
- `/template doc-review` → output contains template but no resource list (empty resources)
- `/template doc-unknown` → falls through to existing template handling (no match)
- `/template cskill` → still works (existing behavior not broken)

### 4. `/scaffold` command wiring (`tests/repl/` or integration tests)

- `/scaffold` exists in `COMMANDS` with `skill: BUILT_IN_SKILLS.SCAFFOLD_DOC`
- `BUILT_IN_SKILLS.SCAFFOLD_DOC` equals `'scaffold-doc-skill'`

### 5. `/scaffold` completions

- Typing `/scaffold d` → completes to all 5 doc types
- Typing `/scaffold doc-s` → completes to `doc-scientific` only
- Typing `/scaffold doc-eu` → completes to `doc-eu-deliverable`
- Returns `[matchingTypes, line]` tuple (not flat array)
- `/template` completions include doc types alongside existing skill types
