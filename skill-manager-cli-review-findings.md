# skill-manager-cli Review Findings

## Findings

### 1. `/scaffold` can write outside the `skills/` root
Severity: High

`skill-manager/src/skills/scaffold-doc-skill/scaffold-doc-skill.mjs:17-19` accepts the raw second token as `skillName`, and `skill-manager/src/skills/scaffold-doc-skill/scaffold-doc-skill.mjs:32-66` joins it directly into `path.join(skillsDir, skillName)` before creating directories and files. Inputs like `../outside` or `../../escape` resolve outside the intended skills root, so the new command introduces a path traversal/write-anywhere issue.

### 2. `/ls` now drops summaries for the renamed skill families
Severity: Medium

`skill-manager/src/skills/list-skills/list-skills.mjs:76-81` still reads `descriptorSections.description` for `cskill`, `dcgskill`, `mskill`, and `oskill`, but the updated schemas/templates define `Summary` or other section names instead (`skill-manager/src/schemas/skillSchemas.mjs:17-43`). In a direct execution check, a `dcgskill` and a `cskill` with valid `Summary` content both rendered as `Description: No description`, so the listing output regresses immediately for the types this patch touched.

### 3. `cskill` and `dcgskill` boundaries are internally inconsistent
Severity: Medium

`skill-manager/src/schemas/skillSchemas.mjs:17-22` defines `cskill` as `Summary + Input Format + Output Format`, while `skill-manager/src/schemas/skillSchemas.mjs:697-705` detects `Summary + Prompt` as `dcgskill`. That conflicts with the repository's own updated tests and examples, which still treat `Summary + Prompt` as `cskill` (`tests/skills/skillSchemas.test.mjs:30-32`, `tests/skills/skillSchemas.test.mjs:95-99`, `tests/skills/validationSkills.test.mjs:59-76`). A direct schema check shows `detectSkillType('# ... ## Summary ... ## Prompt ...') === 'dcgskill'`, while `validateSkillContent(..., 'cskill')` rejects the same content for missing `Input Format` and `Output Format`. This will misclassify or invalidate existing prompt-style code skills.

### 4. The new REPL commands are not documented consistently, and `/scaffold` completion stalls on the second argument
Severity: Medium

`skill-manager/src/repl/SlashCommandHandler.mjs:151-157` adds `/scaffold`, but there is no corresponding help topic in `skill-manager/src/ui/HelpSystem.mjs:531-820`; the same file also has no `/tier` topic even though `/tier` is executable. In addition, `skill-manager/src/repl/SlashCommandHandler.mjs:472-478` always treats the entire `/scaffold ...` argument string as a doc-type prefix, so completion works for `/scaffold doc-tech` but returns no suggestions once the user starts the skill name (`/scaffold doc-technical m`).

## Plan Alignment

The uncommitted work does not implement the refactoring plan in `~/.claude/plans/piped-hugging-pony.md`; it is mostly a feature patch for `dcgskill`, doc scaffolds, and tier selection. The largest divergence is `skillSchemas.mjs`: the plan says to split it into focused modules and leave `skillSchemas.mjs` as a barrel (`~/.claude/plans/piped-hugging-pony.md:23-40`), but the current diff adds roughly 368 lines to the same file instead. The plan's highest-impact refactors in `CommandSelector.mjs`, `InteractivePrompt.mjs`, and quick-command consolidation (`~/.claude/plans/piped-hugging-pony.md:64-113`) are also not part of this patch.

## Verification Notes

`node --check` succeeded for the main changed source files I spot-checked:

- `skill-manager/src/index.mjs`
- `skill-manager/src/repl/REPLSession.mjs`
- `skill-manager/src/repl/SlashCommandHandler.mjs`
- `skill-manager/src/schemas/skillSchemas.mjs`
- `skill-manager/src/skills/scaffold-doc-skill/scaffold-doc-skill.mjs`

Targeted execution checks reproduced the issues above:

- `/ls` formatting returned `Description: No description` for summary-based `cskill` and `dcgskill` records.
- `/scaffold doc-technical m` produced no completions for the skill-name argument.
