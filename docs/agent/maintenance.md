# Agent-context maintenance

Repository context is a versioned product artifact, not chat memory. New conversations receive the root `AGENTS.md`; that map tells them which smaller files to load. These files must describe the current implementation and should be updated in the same patch as the code that changes their claims.

## Routing and ownership

| Changed area | Context to review/update |
| --- | --- |
| Top-level file ownership, runtime topology, socket events, state boundary, or new subsystem | `architecture.md` and possibly root `AGENTS.md` |
| Match rules, constants, phases, resources, cycle, categories, siphon, damage, defenses, or structural limits | `gameplay.md` |
| DOM structure, rendering, selection/input, visual cue grammar, local storage, responsiveness, or accessibility | `frontend.md` and possibly `public/AGENTS.md` |
| Commands, harness, suite coverage, required checks, or test conventions | `testing.md` and possibly `test/AGENTS.md` |
| Player-visible setup or implemented feature set | root `README.md` |
| A new task domain with substantial durable context | Add one focused `docs/agent/*.md` file and one route in root `AGENTS.md` |

## Required end-of-task protocol

1. Run `git diff --name-only`.
2. Match changed files and behavior to the table above.
3. Read the affected context file; do not update from memory.
4. Correct stale statements and add only durable decisions a future agent cannot safely infer quickly.
5. Keep root `AGENTS.md` as a map. Move detail into the narrow routed file.
6. Check every referenced path and command, then run `git diff --check` and the applicable tests.

This protocol is the repository's practical meaning of “auto-update context.” An instruction file cannot create hidden cross-session memory or guarantee that every tool obeys it. It can ensure that Codex conversations entering this repository load the map and are explicitly required to maintain the versioned context before finishing.

## Writing rules

- State current truth in direct language; avoid histories such as “recently changed.”
- Prefer contracts, boundaries, inputs/outputs, and verification commands over prose tours of obvious code.
- Link to the owning file/function instead of copying large implementations.
- Keep one topic in one source of truth. Other files should link to it rather than paraphrase it.
- Separate implemented behavior from proposals. Product ideas belong in a deliberate design document only when requested.
- Do not store secrets, personal data, transient terminal output, task transcripts, or speculative TODOs in agent context.
- Delete obsolete instructions. More context is harmful when it is stale or irrelevant.

## Why this structure

The structure intentionally combines three compatible practices:

- OpenAI's agent-first engineering guidance recommends a concise `AGENTS.md` as a table of contents while structured repository docs remain the system of record: https://openai.com/index/harness-engineering/
- Google's Agent Skills guidance uses progressive disclosure so small routing metadata loads first and detailed instructions/resources load only when needed: https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/
- Jake Van Clief and David McDermott's Interpretable Context Methodology treats folder structure and plain Markdown as an inspectable context-delivery mechanism, including selective section routing: https://arxiv.org/abs/2603.16021

Those sources discuss larger agent systems, so this repository applies the ideas proportionally: one short root map, two scoped instruction files, and a few focused context documents rather than a heavy orchestration framework.
