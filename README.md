# create-ui-kit

A Claude Code skill that turns approved Figma mockups into an organised, editable UI Kit in the same Figma file — through the official Figma MCP server.

> **Status: v0.1.0, experimental.** The audit and QA scripts pass their offline test suite, and the skill has been run read-only (preflight and audit) on a real Figma file. The full automated cycle — build, QA and corrections — has **not** been tested end to end yet. Save a Figma version before letting it write, and review every gate.

## What it does

The skill rebuilds what the mockups already show; it does not redesign. Anything the mockups do not show is proposed as a numbered decision for you to approve.

- **Audit** — reads the source frames by node id and extracts colors, typography, fonts, radii, spacing, component candidates and Desktop/Tablet/Mobile groupings, marking each item as FACT, INFERENCE or PROPOSAL.
- **Architecture** — plans Variables (color, sizes with breakpoint modes), Text Styles, components with variants, states and breakpoints, patterns, and page structure.
- **Build** — creates Foundations and component sets via `use_figma`. Every writing script starts with a guard (fileKey, target page, fonts) and stops before its first change if the guard fails.
- **QA** — runs a read-only structural scan (`scripts/qa.js`): broken instances, unbound properties, literal colors, text styles and trim, mode pinning, clipping, sizes against the sources, documentation layout.
- **Documentation** — writes component sheets, descriptions, and a developer `handoff.md`.
- **Resumable state** — `ui-kit/ledger.json` in your working directory records every created id and decision, so any session can resume or undo by id.

## Three checkpoints

The skill works on its own between gates and stops at each one for your answer.

| Gate | When | You |
|---|---|---|
| **G1 · Brief** | after preflight | confirm source pages, target page, fonts, scope |
| **G2 · Plan** | after audit and design, before any write to the library | reply `ок` to accept every ★ recommendation, or override by number |
| **G3 · Acceptance** | after build and QA | review in Figma, send corrections, or reply `принято` |

The gate messages are written in Russian. The skill tells the agent to use your language, but the templates stay Russian; see Limitations.

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code).
- The official **Figma MCP server** (`https://mcp.figma.com/mcp`), connected and authorised. The easiest way to get it is the official Figma plugin for Claude Code.
- The Figma skills `figma-use`, `figma-generate-library` and `figma-generate-design`, which come with that plugin. This skill loads them; it does not include them.
- **Edit access** to the Figma file. With view-only access the skill can read but not build.
- Every font used in the mockups must be available to Figma's servers: in the Figma catalog or uploaded to your Figma account, team or organisation. Fonts installed only on your machine are not visible to the MCP server, and the skill never substitutes fonts.
- Node.js 18+, only to run the local tests.

## Installation

```bash
git clone https://github.com/pawell9/create-ui-kit.git ~/.claude/skills/create-ui-kit
```

Restart Claude Code, or start a new session. Check that `/create-ui-kit` appears among the slash commands.

The skill has `disable-model-invocation: true`, so it runs only when you call it explicitly.

## Usage

Run it from a working directory for this project. The skill creates `ui-kit/` there.

```
/create-ui-kit https://www.figma.com/design/<fileKey>/<name>?node-id=<id>   # start: preflight → G1
/create-ui-kit ок                                                             # answer at a gate
/create-ui-kit 3.1 B, 2: без Hotspot                                          # override decisions at G2
/create-ui-kit status                                                         # progress from the ledger
/create-ui-kit                                                                # resume where it stopped
```

Before the first write, save a version in Figma (File → Save to version history). `use_figma` has no version API, so that saved version is your restore point.

## Safety guardrails

- Source pages are read-only and are read by node id only. Pages you mark as protected, such as backups, are never read.
- Writes go only to the target page, plus the file-wide Variables and Styles you approved at G2.
- The skill deletes only nodes it created (recorded in the ledger) or nodes you name in a correction.
- Publishing the library, Code Connect, creating new files and account changes happen only when you ask for them.

## Repository layout

```
SKILL.md                 entry point: phases, gates, guardrails, message templates
reference/               audit method, architecture, build recipes, QA checklist, documentation, Figma MCP gotchas
scripts/audit.js         read-only audit script for use_figma
scripts/qa.js            read-only QA script for use_figma
scripts/test/            offline tests with a minimal mock of the Figma Plugin API
templates/ledger.json    initial state file
```

## Tests

```bash
cd ~/.claude/skills/create-ui-kit
node scripts/test/run-tests.mjs
```

The tests run without Figma. They check that `audit.js` and `qa.js` contain no mutating Plugin API calls, that their guards work (fileKey, forbidden pages), that the audit groups and aggregates correctly, that output stays within the size budget, and that QA detects its defect codes on a seeded scene. They do not exercise the build phase.

## Limitations and testing status

| Area | Status |
|---|---|
| `audit.js`, `qa.js` — offline tests (40 checks) | passing |
| Preflight and audit, read-only, on a real Figma file | tested once |
| Build, QA and corrections on a real file, end to end | **not tested** |

Known limitations:
- Gate message templates are in Russian.
- Breakpoints default to Desktop ≥ 1200, Tablet ≥ 600, Mobile below that, by frame width. Change them in `PARAMS.breakpoints` of `audit.js` if your mockups differ.
- Results depend on the Figma MCP server and Plugin API, which change over time; `reference/figma-gotchas.md` reflects their behaviour as of October 2026.
- Large files need many tool calls, and each call's output is capped at about 15 KB; the audit pages its results.
- Mockups without auto layout give spacing as measurements; reading them as padding or gap is an inference you confirm at G2.

## Updating

```bash
cd ~/.claude/skills/create-ui-kit
git pull
```

Releases are tagged (`v0.1.0`, …); see [CHANGELOG.md](CHANGELOG.md). To pin a version, run `git checkout v0.1.0`.

## Feedback

Please open an issue with what you ran, at which phase it failed, and the relevant part of `ui-kit/ledger.json`. Do not include client file links or screenshots you are not allowed to share.

## License

MIT — see [LICENSE](LICENSE).
