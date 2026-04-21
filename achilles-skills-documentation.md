# Anthropic Agent Skills — Complete Documentation

> Official Anthropic Agent Skills feature documentation compiled from platform.claude.com, code.claude.com, and claude.com/blog.
> Last updated: March 2026.

## Table of Contents

1. [Overview](#overview)
2. [How Skills Work — Progressive Disclosure](#how-skills-work--progressive-disclosure)
3. [SKILL.md Format and Structure](#skillmd-format-and-structure)
4. [Where Skills Work](#where-skills-work)
5. [Pre-Built Agent Skills](#pre-built-agent-skills)
6. [Custom Skills](#custom-skills)
7. [Claude Code Skills](#claude-code-skills)
   - [Getting Started](#getting-started)
   - [Where Skills Live](#where-skills-live)
   - [Frontmatter Reference](#frontmatter-reference)
   - [String Substitutions](#string-substitutions)
   - [Supporting Files](#supporting-files)
   - [Invocation Control](#invocation-control)
   - [Passing Arguments](#passing-arguments)
   - [Dynamic Context Injection](#dynamic-context-injection)
   - [Subagent Execution](#subagent-execution)
   - [Bundled Skills](#bundled-skills)
   - [Permission Control](#permission-control)
   - [Sharing Skills](#sharing-skills)
8. [Skills API (Claude API)](#skills-api-claude-api)
   - [Prerequisites and Beta Headers](#prerequisites-and-beta-headers)
   - [Container Parameter](#container-parameter)
   - [Downloading Generated Files](#downloading-generated-files)
   - [Multi-Turn Conversations](#multi-turn-conversations)
   - [Long-Running Operations](#long-running-operations)
   - [Using Multiple Skills](#using-multiple-skills)
   - [Skills CRUD API](#skills-crud-api)
   - [Versioning](#versioning)
9. [Best Practices](#best-practices)
   - [Core Principles](#core-principles)
   - [Naming Conventions](#naming-conventions)
   - [Writing Effective Descriptions](#writing-effective-descriptions)
   - [Progressive Disclosure Patterns](#progressive-disclosure-patterns)
   - [Workflows and Feedback Loops](#workflows-and-feedback-loops)
   - [Common Patterns](#common-patterns)
   - [Anti-Patterns](#anti-patterns)
   - [Evaluation-Driven Development](#evaluation-driven-development)
   - [Checklist](#checklist-for-effective-skills)
10. [Security Considerations](#security-considerations)
11. [Limitations](#limitations)
12. [Agent Skills Open Standard](#agent-skills-open-standard)

---

## Overview

Agent Skills are modular capabilities that extend Claude's functionality. Each Skill packages instructions, metadata, and optional resources (scripts, templates) that Claude uses automatically when relevant.

Skills are reusable, filesystem-based resources that provide Claude with domain-specific expertise: workflows, context, and best practices that transform general-purpose agents into specialists. Unlike prompts (conversation-level instructions for one-off tasks), Skills load on-demand and eliminate the need to repeatedly provide the same guidance across multiple conversations.

**Key benefits:**
- **Specialize Claude**: Tailor capabilities for domain-specific tasks
- **Reduce repetition**: Create once, use automatically
- **Compose capabilities**: Combine Skills to build complex workflows

Skills come in two categories:
- **Pre-built Agent Skills** — provided by Anthropic for common document tasks (PowerPoint, Excel, Word, PDF)
- **Custom Skills** — user-created Skills that package domain expertise and organizational knowledge

---

## How Skills Work — Progressive Disclosure

Skills leverage Claude's VM environment to provide capabilities beyond what's possible with prompts alone. Claude operates in a virtual machine with filesystem access, allowing Skills to exist as directories containing instructions, executable code, and reference materials.

The filesystem-based architecture enables **progressive disclosure**: Claude loads information in stages as needed, rather than consuming context upfront.

### Three Levels of Loading

#### Level 1: Metadata (always loaded, ~100 tokens per Skill)

The Skill's YAML frontmatter provides discovery information:

```yaml
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---
```

Claude loads this metadata at startup and includes it in the system prompt. This lightweight approach means you can install many Skills without context penalty.

#### Level 2: Instructions (loaded when triggered, under 5k tokens)

The main body of SKILL.md contains procedural knowledge: workflows, best practices, and guidance.

When you request something that matches a Skill's description, Claude reads SKILL.md from the filesystem via bash. Only then does this content enter the context window.

#### Level 3: Resources and Code (loaded as needed, effectively unlimited)

Skills can bundle additional materials:

```
pdf-skill/
├── SKILL.md          (main instructions)
├── FORMS.md          (form-filling guide)
├── REFERENCE.md      (detailed API reference)
└── scripts/
    └── fill_form.py  (utility script)
```

Content types at this level:
- **Instructions**: Additional markdown files containing specialized guidance
- **Code**: Executable scripts that Claude runs via bash; scripts provide deterministic operations without consuming context
- **Resources**: Reference materials like database schemas, API documentation, templates, or examples

Claude accesses these files only when referenced. Script code never enters the context window — only script output consumes tokens.

| Level | When Loaded | Token Cost | Content |
|-------|-------------|------------|---------|
| Level 1: Metadata | Always (at startup) | ~100 tokens per Skill | `name` and `description` from YAML frontmatter |
| Level 2: Instructions | When Skill is triggered | Under 5k tokens | SKILL.md body with instructions and guidance |
| Level 3+: Resources | As needed | Effectively unlimited | Bundled files executed via bash without loading contents into context |

### Example: Loading a PDF Processing Skill

1. **Startup**: System prompt includes: `PDF Processing - Extract text and tables from PDF files, fill forms, merge documents`
2. **User request**: "Extract the text from this PDF and summarize it"
3. **Claude invokes**: `bash: read pdf-skill/SKILL.md` → Instructions loaded into context
4. **Claude determines**: Form filling is not needed, so FORMS.md is not read
5. **Claude executes**: Uses instructions from SKILL.md to complete the task

---

## SKILL.md Format and Structure

Every Skill requires a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---

# Your Skill Name

## Instructions
[Clear, step-by-step guidance for Claude to follow]

## Examples
[Concrete examples of using this Skill]
```

### Required Fields

**`name`**:
- Maximum 64 characters
- Must contain only lowercase letters, numbers, and hyphens
- Cannot contain XML tags
- Cannot contain reserved words: "anthropic", "claude"

**`description`**:
- Must be non-empty
- Maximum 1024 characters
- Cannot contain XML tags
- Should describe both what the Skill does and when Claude should use it

---

## Where Skills Work

Skills are available across Claude's agent products:

### Claude API

Supports both pre-built and custom Skills. Specify the `skill_id` in the `container` parameter along with the code execution tool.

**Required beta headers:**
- `code-execution-2025-08-25` — Skills run in the code execution container
- `skills-2025-10-02` — Enables Skills functionality
- `files-api-2025-04-14` — Required for uploading/downloading files

### Claude Code

Supports only custom Skills. Skills are filesystem-based directories with SKILL.md files — no API uploads required. Claude discovers and uses them automatically.

Claude Code extends the Agent Skills open standard with additional features like invocation control, subagent execution, and dynamic context injection.

### Claude Agent SDK

Supports custom Skills through filesystem-based configuration. Create Skills as directories with SKILL.md files in `.claude/skills/`. Enable Skills by including `"Skill"` in your `allowed_tools` configuration.

### Claude.ai

Supports both pre-built and custom Skills.

- **Pre-built**: Work automatically behind the scenes when creating documents
- **Custom**: Upload as zip files through Settings > Features. Available on Pro, Max, Team, and Enterprise plans. Custom Skills are individual to each user — not shared organization-wide.

---

## Pre-Built Agent Skills

Anthropic provides these pre-built Agent Skills for immediate use:

| Skill | ID | Description |
|-------|----|-------------|
| **PowerPoint** | `pptx` | Create presentations, edit slides, analyze presentation content |
| **Excel** | `xlsx` | Create spreadsheets, analyze data, generate reports with charts |
| **Word** | `docx` | Create documents, edit content, format text |
| **PDF** | `pdf` | Generate formatted PDF documents and reports |

Available on the Claude API and claude.ai.

---

## Custom Skills

Custom Skills let you package domain expertise and organizational knowledge. They can be created in:
- **Claude Code**: As filesystem directories with SKILL.md
- **Claude API**: Upload via the Skills API (`/v1/skills` endpoints) — shared workspace-wide
- **Claude.ai**: Upload as zip files through Settings > Features — individual user only

### Skill Directory Structure

```
my-skill/
├── SKILL.md           # Main instructions (required)
├── template.md        # Template for Claude to fill in
├── examples/
│   └── sample.md      # Example output showing expected format
└── scripts/
    └── validate.sh    # Script Claude can execute
```

---

## Claude Code Skills

Claude Code skills follow the Agent Skills open standard and extend it with additional features.

> Custom commands have been merged into skills. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way. Existing `.claude/commands/` files keep working.

### Getting Started

Create a skill directory with a SKILL.md file:

```bash
mkdir -p ~/.claude/skills/explain-code
```

Create `~/.claude/skills/explain-code/SKILL.md`:

```yaml
---
name: explain-code
description: Explains code with visual diagrams and analogies. Use when explaining how code works, teaching about a codebase, or when the user asks "how does this work?"
---

When explaining code, always include:

1. **Start with an analogy**: Compare the code to something from everyday life
2. **Draw a diagram**: Use ASCII art to show the flow, structure, or relationships
3. **Walk through the code**: Explain step-by-step what happens
4. **Highlight a gotcha**: What's a common mistake or misconception?
```

Test it by asking "How does this code work?" (auto-triggered) or invoking directly with `/explain-code src/auth/login.ts`.

### Where Skills Live

| Location | Path | Applies to |
|----------|------|------------|
| Enterprise | See managed settings docs | All users in your organization |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<skill-name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | Where plugin is enabled |

Priority: enterprise > personal > project. Plugin skills use a `plugin-name:skill-name` namespace and cannot conflict.

Skills from nested `.claude/skills/` directories are auto-discovered when working in subdirectories (supports monorepos).

### Frontmatter Reference

All fields are optional. Only `description` is recommended.

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name. If omitted, uses directory name. Lowercase letters, numbers, hyphens only (max 64 chars). |
| `description` | Recommended | What the skill does and when to use it. Claude uses this for auto-discovery. |
| `argument-hint` | No | Hint shown during autocomplete. Example: `[issue-number]` |
| `disable-model-invocation` | No | `true` = only user can invoke (not Claude). Default: `false`. |
| `user-invocable` | No | `false` = hidden from `/` menu. Default: `true`. |
| `allowed-tools` | No | Tools Claude can use without asking permission when this skill is active. |
| `model` | No | Model to use when this skill is active. |
| `context` | No | `fork` = run in a forked subagent context. |
| `agent` | No | Which subagent type to use when `context: fork` is set. |
| `hooks` | No | Hooks scoped to this skill's lifecycle. |

### String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed when invoking the skill. If not present, arguments are appended as `ARGUMENTS: <value>`. |
| `$ARGUMENTS[N]` | Access a specific argument by 0-based index. |
| `$N` | Shorthand for `$ARGUMENTS[N]`. `$0` = first argument, `$1` = second, etc. |
| `${CLAUDE_SESSION_ID}` | Current session ID. Useful for logging or session-specific files. |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill's SKILL.md file. |

**Example:**

```yaml
---
name: migrate-component
description: Migrate a component from one framework to another
---

Migrate the $0 component from $1 to $2.
Preserve all existing behavior and tests.
```

Running `/migrate-component SearchBar React Vue` replaces `$0`→SearchBar, `$1`→React, `$2`→Vue.

### Supporting Files

Keep SKILL.md focused (under 500 lines) and move detailed reference material to separate files:

```
my-skill/
├── SKILL.md       (required — overview and navigation)
├── reference.md   (detailed API docs — loaded when needed)
├── examples.md    (usage examples — loaded when needed)
└── scripts/
    └── helper.py  (utility script — executed, not loaded)
```

Reference them from SKILL.md:

```markdown
## Additional resources
- For complete API details, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
```

### Invocation Control

| Frontmatter | You can invoke | Claude can invoke | When loaded into context |
|-------------|---------------|-------------------|------------------------|
| (default) | Yes | Yes | Description always in context, full skill loads when invoked |
| `disable-model-invocation: true` | Yes | No | Description not in context, full skill loads when you invoke |
| `user-invocable: false` | No | Yes | Description always in context, full skill loads when invoked |

**Example — deploy skill (user-only):**

```yaml
---
name: deploy
description: Deploy the application to production
disable-model-invocation: true
---

Deploy $ARGUMENTS to production:
1. Run the test suite
2. Build the application
3. Push to the deployment target
4. Verify the deployment succeeded
```

### Passing Arguments

```yaml
---
name: fix-issue
description: Fix a GitHub issue
disable-model-invocation: true
---

Fix GitHub issue $ARGUMENTS following our coding standards.
1. Read the issue description
2. Implement the fix
3. Write tests
4. Create a commit
```

`/fix-issue 123` → Claude receives "Fix GitHub issue 123 following our coding standards..."

### Dynamic Context Injection

The `` !`command` `` syntax runs shell commands before the skill content is sent to Claude. The command output replaces the placeholder.

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

Each `` !`command` `` executes immediately (before Claude sees anything), the output replaces the placeholder, and Claude receives the fully-rendered prompt.

### Subagent Execution

Add `context: fork` to run a skill in isolation. The skill content becomes the prompt that drives the subagent (no access to conversation history).

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:
1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

The `agent` field specifies which subagent to use: built-in (`Explore`, `Plan`, `general-purpose`) or custom from `.claude/agents/`.

Skills and subagents work together in two directions:

| Approach | System prompt | Task | Also loads |
|----------|--------------|------|------------|
| Skill with `context: fork` | From agent type | SKILL.md content | CLAUDE.md |
| Subagent with `skills` field | Subagent's markdown body | Claude's delegation message | Preloaded skills + CLAUDE.md |

### Bundled Skills

These ship with Claude Code and are available in every session:

- **`/simplify`**: Reviews recently changed files for code reuse, quality, and efficiency issues. Spawns three review agents in parallel, aggregates findings, and applies fixes.

- **`/batch <instruction>`**: Orchestrates large-scale changes across a codebase in parallel. Researches the codebase, decomposes work into 5-30 independent units, spawns one background agent per unit (each in an isolated git worktree), each implements its unit, runs tests, and opens a PR.

- **`/debug [description]`**: Troubleshoots current Claude Code session by reading the session debug log.

- **`/loop [interval] <prompt>`**: Runs a prompt repeatedly on an interval. Example: `/loop 5m check if the deploy finished`.

- **`/claude-api`**: Loads Claude API reference material for your project's language. Covers tool use, streaming, batches, structured outputs. Also activates automatically when code imports `anthropic`, `@anthropic-ai/sdk`, or `claude_agent_sdk`.

### Permission Control

Three ways to control which skills Claude can invoke:

1. **Disable all skills** by denying the Skill tool in `/permissions`:
   ```
   Skill
   ```

2. **Allow or deny specific skills** using permission rules:
   ```
   Skill(commit)          # Allow exact match
   Skill(review-pr *)     # Allow prefix match
   Skill(deploy *)        # Deny prefix match
   ```

3. **Hide individual skills** by adding `disable-model-invocation: true` to their frontmatter.

### Sharing Skills

- **Project skills**: Commit `.claude/skills/` to version control
- **Plugins**: Create a `skills/` directory in your plugin
- **Managed**: Deploy organization-wide through managed settings

---

## Skills API (Claude API)

### Prerequisites and Beta Headers

Three beta headers are required:

| Header | Purpose |
|--------|---------|
| `code-execution-2025-08-25` | Enables code execution (Skills run in the code execution container) |
| `skills-2025-10-02` | Enables Skills functionality |
| `files-api-2025-04-14` | For uploading/downloading files to/from the container |

The code execution tool must also be enabled in requests.

### Container Parameter

Specify Skills using the `container` parameter in the Messages API. Up to 8 Skills per request:

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "skills": [{"type": "anthropic", "skill_id": "pptx", "version": "latest"}]
    },
    messages=[
        {"role": "user", "content": "Create a presentation about renewable energy with 5 slides"}
    ],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)
```

```typescript
const response = await client.beta.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  betas: ["code-execution-2025-08-25", "skills-2025-10-02"],
  container: {
    skills: [{ type: "anthropic", skill_id: "pptx", version: "latest" }]
  },
  messages: [
    { role: "user", content: "Create a presentation about renewable energy with 5 slides" }
  ],
  tools: [{ type: "code_execution_20250825", name: "code_execution" }]
});
```

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: code-execution-2025-08-25,skills-2025-10-02" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 4096,
    "container": {
      "skills": [{"type": "anthropic", "skill_id": "pptx", "version": "latest"}]
    },
    "messages": [{"role": "user", "content": "Create a presentation about renewable energy"}],
    "tools": [{"type": "code_execution_20250825", "name": "code_execution"}]
  }'
```

**Key fields:**
- `container.skills` — array of Skills to enable
- `type` — `"anthropic"` (pre-built) or `"custom"` (uploaded)
- `skill_id` — short name for Anthropic Skills (`pptx`, `xlsx`, `docx`, `pdf`) or generated ID for custom Skills (`skill_01AbCdEf...`)
- `version` — `"latest"` or specific version (date-based for Anthropic, epoch timestamp for custom)

### Downloading Generated Files

When Skills create documents, the response includes file references with file IDs. Download using the Files API:

```python
# Extract file IDs from response
def extract_file_ids(response):
    file_ids = []
    for item in response.content:
        if item.type == "bash_code_execution_tool_result":
            content_item = item.content
            if content_item.type == "bash_code_execution_result":
                for file in content_item.content:
                    if hasattr(file, "file_id"):
                        file_ids.append(file.file_id)
    return file_ids

# Download files
for file_id in extract_file_ids(response):
    file_metadata = client.beta.files.retrieve_metadata(
        file_id=file_id, betas=["files-api-2025-04-14"]
    )
    file_content = client.beta.files.download(
        file_id=file_id, betas=["files-api-2025-04-14"]
    )
    file_content.write_to_file(file_metadata.filename)
    print(f"Downloaded: {file_metadata.filename}")
```

### Multi-Turn Conversations

Reuse the same container across multiple messages by passing `container.id`:

```python
# First request creates container
response1 = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "skills": [{"type": "anthropic", "skill_id": "xlsx", "version": "latest"}]
    },
    messages=[{"role": "user", "content": "Analyze this sales data"}],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)

# Continue with same container
response2 = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "id": response1.container.id,  # Reuse container
        "skills": [{"type": "anthropic", "skill_id": "xlsx", "version": "latest"}],
    },
    messages=[
        {"role": "user", "content": "Analyze this sales data"},
        {"role": "assistant", "content": response1.content},
        {"role": "user", "content": "What was the total revenue?"},
    ],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)
```

### Long-Running Operations

Handle `pause_turn` stop reasons for long-running Skill operations:

```python
messages = [{"role": "user", "content": "Process this large dataset"}]
max_retries = 10

response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "skills": [{"type": "custom", "skill_id": "skill_01AbCdEf...", "version": "latest"}]
    },
    messages=messages,
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)

for i in range(max_retries):
    if response.stop_reason != "pause_turn":
        break
    messages.append({"role": "assistant", "content": response.content})
    response = client.beta.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        betas=["code-execution-2025-08-25", "skills-2025-10-02"],
        container={
            "id": response.container.id,
            "skills": [{"type": "custom", "skill_id": "skill_01AbCdEf...", "version": "latest"}],
        },
        messages=messages,
        tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
    )
```

### Using Multiple Skills

Combine up to 8 Skills in a single request:

```python
response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "skills": [
            {"type": "anthropic", "skill_id": "xlsx", "version": "latest"},
            {"type": "anthropic", "skill_id": "pptx", "version": "latest"},
            {"type": "custom", "skill_id": "skill_01AbCdEf...", "version": "latest"},
        ]
    },
    messages=[
        {"role": "user", "content": "Analyze sales data and create a presentation"}
    ],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)
```

### Skills CRUD API

#### List Skills

```python
# List all
skills = client.beta.skills.list(betas=["skills-2025-10-02"])

# List by source
anthropic_skills = client.beta.skills.list(source="anthropic", betas=["skills-2025-10-02"])
custom_skills = client.beta.skills.list(source="custom", betas=["skills-2025-10-02"])

for skill in skills.data:
    print(f"{skill.id}: {skill.display_title} (source: {skill.source})")
```

```bash
curl "https://api.anthropic.com/v1/skills?source=anthropic" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

#### Create a Skill

```python
from anthropic.lib import files_from_dir

# Option 1: From directory (recommended)
skill = client.beta.skills.create(
    display_title="Financial Analysis",
    files=files_from_dir("/path/to/financial_analysis_skill"),
    betas=["skills-2025-10-02"],
)

# Option 2: From zip
skill = client.beta.skills.create(
    display_title="Financial Analysis",
    files=[("skill.zip", open("financial_analysis_skill.zip", "rb"))],
    betas=["skills-2025-10-02"],
)

# Option 3: From file tuples
skill = client.beta.skills.create(
    display_title="Financial Analysis",
    files=[
        ("financial_skill/SKILL.md", open("financial_skill/SKILL.md", "rb"), "text/markdown"),
        ("financial_skill/analyze.py", open("financial_skill/analyze.py", "rb"), "text/x-python"),
    ],
    betas=["skills-2025-10-02"],
)

print(f"Created: {skill.id}, Version: {skill.latest_version}")
```

```bash
curl -X POST "https://api.anthropic.com/v1/skills" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "display_title=Financial Analysis" \
  -F "files[]=@financial_skill/SKILL.md;filename=financial_skill/SKILL.md" \
  -F "files[]=@financial_skill/analyze.py;filename=financial_skill/analyze.py"
```

**Requirements:**
- Must include a SKILL.md file at the top level
- All files must specify a common root directory in their paths
- Total upload size under 8MB
- YAML frontmatter validation applies (name: max 64 chars, lowercase/numbers/hyphens; description: max 1024 chars)

#### Retrieve a Skill

```python
skill = client.beta.skills.retrieve(
    skill_id="skill_01AbCdEf...", betas=["skills-2025-10-02"]
)
print(f"Skill: {skill.display_title}, Version: {skill.latest_version}")
```

#### Delete a Skill

Delete all versions first, then the Skill:

```python
# Step 1: Delete all versions
versions = client.beta.skills.versions.list(
    skill_id="skill_01AbCdEf...", betas=["skills-2025-10-02"]
)
for version in versions.data:
    client.beta.skills.versions.delete(
        skill_id="skill_01AbCdEf...",
        version=version.version,
        betas=["skills-2025-10-02"],
    )

# Step 2: Delete the Skill
client.beta.skills.delete(
    skill_id="skill_01AbCdEf...", betas=["skills-2025-10-02"]
)
```

### Versioning

| Skill Type | Version Format | Example |
|------------|---------------|---------|
| Anthropic Skills | Date-based | `20251013` |
| Custom Skills | Epoch timestamp | `1759178010641129` |

Both support `"latest"` to use the most recent version.

Create new versions when updating Skill files:

```python
from anthropic.lib import files_from_dir

new_version = client.beta.skills.versions.create(
    skill_id="skill_01AbCdEf...",
    files=files_from_dir("/path/to/updated_skill"),
    betas=["skills-2025-10-02"],
)

# Use specific version
response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    betas=["code-execution-2025-08-25", "skills-2025-10-02"],
    container={
        "skills": [{"type": "custom", "skill_id": "skill_01AbCdEf...", "version": new_version.version}]
    },
    messages=[{"role": "user", "content": "Use updated Skill"}],
    tools=[{"type": "code_execution_20250825", "name": "code_execution"}],
)
```

---

## Best Practices

### Core Principles

#### Concise is Key

The context window is shared. Only add context Claude doesn't already have.

**Good** (~50 tokens):
````markdown
## Extract PDF text
Use pdfplumber for text extraction:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

**Bad** (~150 tokens):
```markdown
PDF (Portable Document Format) files are a common file format that contains text,
images, and other content. To extract text from a PDF, you'll need to use a library...
```

The concise version assumes Claude knows what PDFs are.

#### Set Appropriate Degrees of Freedom

- **High freedom** (text-based instructions): Multiple approaches valid, decisions depend on context
- **Medium freedom** (pseudocode/scripts with parameters): Preferred pattern exists, some variation acceptable
- **Low freedom** (specific scripts, few parameters): Operations are fragile, consistency critical

#### Test with All Models You Plan to Use

- **Claude Haiku**: Does the Skill provide enough guidance?
- **Claude Sonnet**: Is the Skill clear and efficient?
- **Claude Opus**: Does the Skill avoid over-explaining?

### Naming Conventions

Use consistent naming patterns. Consider **gerund form** (verb + -ing):

- `processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`
- Or noun phrases: `pdf-processing`, `spreadsheet-analysis`
- Or action-oriented: `process-pdfs`, `analyze-spreadsheets`

**Avoid**: `helper`, `utils`, `tools` (vague), `anthropic-helper` (reserved words)

### Writing Effective Descriptions

**Always write in third person.** The description is injected into the system prompt.

- Good: "Processes Excel files and generates reports"
- Avoid: "I can help you process Excel files"

**Be specific and include key terms** — both what the Skill does and when to use it:

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents.
  Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

### Progressive Disclosure Patterns

#### Pattern 1: High-level guide with references

````markdown
# PDF Processing

## Quick start
Extract text with pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## Advanced features
**Form filling**: See [FORMS.md](FORMS.md)
**API reference**: See [REFERENCE.md](REFERENCE.md)
````

#### Pattern 2: Domain-specific organization

```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── reference/
    ├── finance.md
    ├── sales.md
    ├── product.md
    └── marketing.md
```

#### Pattern 3: Conditional details

```markdown
## Creating documents
Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents
For simple edits, modify the XML directly.
**For tracked changes**: See [REDLINING.md](REDLINING.md)
```

**Important:** Keep references one level deep from SKILL.md. Avoid deeply nested references.

### Workflows and Feedback Loops

Break complex operations into clear, sequential steps with checklists:

````markdown
## Form filling workflow

Task Progress:
- [ ] Step 1: Analyze the form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill the form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)
````

**Feedback loop pattern:** Run validator → fix errors → repeat.

### Common Patterns

#### Template Pattern

Provide output format templates. Match strictness to your needs — strict for API responses, flexible for adapted content.

#### Examples Pattern

Provide input/output pairs:

````markdown
**Example 1:**
Input: Added user authentication with JWT tokens
Output:
```
feat(auth): implement JWT-based authentication
Add login endpoint and token validation middleware
```
````

#### Conditional Workflow Pattern

```markdown
**Creating new content?** → Follow "Creation workflow"
**Editing existing content?** → Follow "Editing workflow"
```

### Anti-Patterns

- **Windows-style paths**: Always use forward slashes (`scripts/helper.py`, not `scripts\helper.py`)
- **Too many options**: Provide a default with an escape hatch, not a menu of choices
- **Vague descriptions**: "Helps with documents" — be specific
- **Time-sensitive information**: Don't include dates that will become wrong
- **Inconsistent terminology**: Pick one term and use it throughout
- **Over-explanation**: Don't explain what PDFs are — Claude already knows
- **Deeply nested references**: Keep references one level deep from SKILL.md

### Evaluation-Driven Development

Create evaluations BEFORE writing extensive documentation:

1. **Identify gaps**: Run Claude on representative tasks without a Skill. Document specific failures.
2. **Create evaluations**: Build three scenarios that test these gaps.
3. **Establish baseline**: Measure Claude's performance without the Skill.
4. **Write minimal instructions**: Just enough content to address the gaps.
5. **Iterate**: Execute evaluations, compare against baseline, refine.

**Iterative development with Claude:**
- Work with "Claude A" (expert) to design and refine the Skill
- Test with "Claude B" (fresh instance with Skill loaded) on real tasks
- Observe behavior, bring insights back to Claude A for improvements
- Repeat the observe-refine-test cycle

### Checklist for Effective Skills

**Core quality:**
- [ ] Description is specific and includes key terms
- [ ] Description includes both what the Skill does and when to use it
- [ ] SKILL.md body is under 500 lines
- [ ] Additional details are in separate files (if needed)
- [ ] No time-sensitive information
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps

**Code and scripts:**
- [ ] Scripts solve problems rather than punt to Claude
- [ ] Error handling is explicit and helpful
- [ ] No "voodoo constants" (all values justified)
- [ ] Required packages listed and verified
- [ ] No Windows-style paths
- [ ] Validation/verification steps for critical operations
- [ ] Feedback loops for quality-critical tasks

**Testing:**
- [ ] At least three evaluations created
- [ ] Tested with Haiku, Sonnet, and Opus
- [ ] Tested with real usage scenarios
- [ ] Team feedback incorporated

---

## Security Considerations

Use Skills only from trusted sources: those you created yourself or obtained from Anthropic.

**Key security considerations:**
- **Audit thoroughly**: Review all files bundled in the Skill — SKILL.md, scripts, images, resources. Look for unexpected network calls, file access patterns, or operations that don't match the Skill's stated purpose.
- **External sources are risky**: Skills that fetch data from external URLs pose risk, as fetched content may contain malicious instructions.
- **Tool misuse**: Malicious Skills can invoke tools (file operations, bash commands, code execution) in harmful ways.
- **Data exposure**: Skills with access to sensitive data could leak information to external systems.
- **Treat like installing software**: Only use Skills from trusted sources.

---

## Limitations

### Cross-Surface Availability

Custom Skills do not sync across surfaces:
- Skills uploaded to Claude.ai must be separately uploaded to the API
- Skills uploaded via the API are not available on Claude.ai
- Claude Code Skills are filesystem-based and separate from both

### Sharing Scope

| Surface | Sharing scope |
|---------|--------------|
| Claude.ai | Individual user only; each team member must upload separately |
| Claude API | Workspace-wide; all workspace members can access |
| Claude Code | Personal (`~/.claude/skills/`) or project-based (`.claude/skills/`); can also share via Plugins |

### Runtime Environment Constraints

| Surface | Network | Package installation |
|---------|---------|---------------------|
| Claude.ai | Varies (depends on user/admin settings) | Can install from npm, PyPI, GitHub |
| Claude API | No network access | No runtime package installation; pre-installed only |
| Claude Code | Full network access | Global installation discouraged; install locally |

---

## Agent Skills Open Standard

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard, which works across multiple AI tools. The standard defines the core SKILL.md format with YAML frontmatter and markdown body. Claude Code extends this standard with additional features:

- Invocation control (`disable-model-invocation`, `user-invocable`)
- Subagent execution (`context: fork`, `agent`)
- Dynamic context injection (`` !`command` ``)
- Tool restrictions (`allowed-tools`)
- String substitutions (`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`, etc.)
- Model override (`model`)
- Lifecycle hooks (`hooks`)

The open standard ensures Skills are portable across different AI tools while allowing platform-specific extensions.
