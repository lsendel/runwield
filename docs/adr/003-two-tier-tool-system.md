# ADR-003: Two-Tier Tool System (Core vs Agent Tools)

## Status

Accepted

## Context

Harns uses a layered agent definition system where users can override bundled agent configurations via local
(`.hns/agents/`) or home (`~/.hns/agents/`) markdown files. The `tools:` frontmatter list determines which tools an
agent can use.

As Harns adds infrastructure tools (`codebase_search`, `memory_recall`, `switch_agent`, `triage_report`,
`plan_written`), a tension emerges: these tools are foundational to how the SDLC works — removing them breaks the
system's ability to route, plan, and recall context. But the override system allows users to replace the entire tool
list, potentially crippling agents unintentionally.

The design question: how to provide a curated, "it just works" experience while still allowing customization for
developers who code differently?

## Decision

Introduce a **two-tier tool classification**:

### Core Tools

Tools that are infrastructure for the Harns SDLC. They cannot be removed by user overrides:

- `codebase_search` — semantic code retrieval
- `memory_recall`, `memory_recall_global` — memory search
- `memory_store`, `memory_store_global` — memory creation
- `memory_delete` — memory removal
- `switch_agent` — agent hand-off
- `triage_report` — router classification output
- `plan_written` — planner/architect plan declaration

### Agent Tools

Tools that define what an agent *can do* — customizable via frontmatter overrides:

- `read`, `grep`, `find`, `ls`, `edit`, `write`, `bash`, `user_interview`, etc.

### Implementation

Core tools remain in the bundled agent frontmatter `tools:` lists — this is the source of truth for which agent gets
which core tools (not every core tool goes to every agent; e.g., `triage_report` is only for the router).

On `loadAgentDef`, after the layered merge (bundled → home → local), the system ensures core tools from the **bundled**
layer are always present in the final tool set. User overrides cannot remove them, only add. The merged list is
deduplicated.

Concretely:
- Bundled `router.md` lists `triage_report`, `codebase_search`, `memory_recall`, etc.
- A user override at `.hns/agents/router.md` with `tools: [read, bash]` won't strip the core tools — they're
  re-injected from the bundled layer.
- Users CAN add core tools to agents that don't have them by default (e.g., adding `memory_list` to a custom agent).

### Escape Hatch

If a user truly wants to replace a core tool's behavior (e.g., with a custom search extension), extensions that register
a tool with the same name would override the built-in implementation. The tool still exists in the agent's toolset —
just with different behavior. This preserves the system contract while allowing power-user customization.

## Consequences

### Positive

- **Curated experience** — the SDLC pipeline (route → plan → execute → recall) always works out of the box.
- **Safe customization** — users can add/remove agent-capability tools without accidentally breaking infrastructure.
- **Clear mental model** — "core tools are the system; agent tools are the capabilities."
- **Simpler agent definitions** — as core tools are guaranteed, prompts and documentation can assume their presence.

### Negative

- **Slight complexity in `loadAgentDef`** — the merge logic needs to identify and protect bundled core tools.
- **Less flexibility for radical customization** — users who want a completely different SDLC would need to fork rather
  than override. This is intentional — Harns is opinionated, and those users should use Pi directly.
