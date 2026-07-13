# Context Compaction Layer — Technical Specification

> **Status**: Proposed (Roadmap v1.1.0)
> **Date**: 2026-07-13
> **Authors**: Davide Artanidi

---

## 1. Problem Statement

As sessions accumulate over time, the `workspace_scope_state` and `workspace_constraints` tables grow with entries that increasingly overlap on the same conceptual domains. When the agent retrieves context via `memory_get_context`, it receives **all** historical scope states and constraints — including outdated, redundant, or superseded entries.

This causes:
- **Token waste**: Redundant information inflates the context window.
- **Conflicting signals**: Old generic instructions coexist with newer, more refined ones.
- **Degraded agent performance**: The agent cannot distinguish which version of a scope represents the current evolved state.

---

## 2. Proposed Solution: Context Compaction

A new MCP tool (`memory_compact_context`) and an internal background process that performs three operations on a given workspace's stored context:

### 2.1 Scope Deduplication

Detect when two or more `workspace_scope_state` entries cover the same logical domain.

**Mechanism**:
- Group scope entries by shared domain keywords (e.g., two scopes both referencing `database`, `auth`, or `audio`).
- Flag groups with ≥2 entries as candidates for compaction.

**Example**:
| Scope | State Summary |
|:------|:-------------|
| `database_layer` (old) | *"Uses MySQL for persistence."* |
| `database_layer` (current) | *"Supports dynamic routing between MySQL and SQLite via adapter pattern."* |

→ The current entry is strictly more informative. The old entry can be archived.

### 2.2 Evolutionary Selection

When two entries cover the same scope, compare them by **specificity**:

| Criterion | Definition |
|:----------|:----------|
| **Specificity** | Does entry B contain concrete parameters, versions, or constraints that entry A lacks? |
| **Completeness** | Does entry B cover all the sub-domains that entry A covered? |
| **Recency + Refinement** | Was entry B produced in a later session where the user explicitly refined the concept? |

**Decision Logic**:
- If B ⊇ A (B is a strict superset of A): **Replace** A with B.
- If A and B are complementary (A has info absent in B, and vice versa): **Merge** into a single synthesized entry.
- If A and B are unrelated despite sharing a scope name: **Keep both** (false positive — no compaction needed).

### 2.3 Constraint Consolidation

Apply the same logic to `workspace_constraints`:
- Remove constraints that are logically superseded (e.g., `MUST use MySQL` replaced by `MUST support both MySQL and SQLite`).
- Merge complementary constraints that reference the same scope.
- Mark superseded constraints as `active = 0` (soft delete) rather than physically deleting them, preserving audit history.

---

## 3. Implementation Options

### Option A: Agent-Side Compaction (Recommended for v1.1.0)

The compaction logic runs **inside the agent's reasoning** (client-side), similar to the Zero-API Closeout Protocol:

1. Agent calls `memory_get_context` and receives all scopes and constraints.
2. Agent analyzes overlapping entries using its own reasoning capabilities.
3. Agent calls `memory_update_context` with the compacted, deduplicated results.

**Pros**: Zero additional API cost, leverages the agent's natural language understanding.
**Cons**: Requires agent instructions in `AGENTS.md` (already our established pattern).

### Option B: Server-Side Compaction (Future consideration)

The server runs compaction autonomously using an LLM API (DeepSeek/Gemini):

1. A new tool `memory_compact_context` triggers the process.
2. The server queries all scopes/constraints, sends them to the LLM for analysis.
3. The LLM returns a compacted version, which the server writes back.

**Pros**: Works with any client, even those without custom agent rules.
**Cons**: Requires API keys and incurs cost per compaction cycle.

---

## 4. New MCP Tool Schema

```json
{
  "name": "memory_compact_context",
  "description": "Analyze and compact overlapping scope states and constraints for a workspace. Deduplicates redundant entries, merges complementary ones, and archives superseded data.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workspace_path": {
        "type": "string",
        "description": "The workspace path to compact context for."
      },
      "compacted_scopes": {
        "type": "array",
        "description": "Pre-computed compacted scope entries (client-side mode).",
        "items": {
          "type": "object",
          "properties": {
            "scope": { "type": "string" },
            "state_summary": { "type": "string" }
          }
        }
      },
      "archived_scopes": {
        "type": "array",
        "description": "Scope names to archive (mark inactive).",
        "items": { "type": "string" }
      },
      "compacted_constraints": {
        "type": "array",
        "description": "Pre-computed compacted constraint entries.",
        "items": {
          "type": "object",
          "properties": {
            "scope": { "type": "string" },
            "constraint_type": { "type": "string" },
            "description": { "type": "string" }
          }
        }
      },
      "archived_constraint_ids": {
        "type": "array",
        "description": "Constraint IDs to archive (set active = 0).",
        "items": { "type": "integer" }
      }
    },
    "required": ["workspace_path"]
  }
}
```

---

## 5. Database Schema Changes

No new tables required. Changes to existing tables:

### `workspace_scope_state`
- Add column: `active BOOLEAN DEFAULT 1` — allows soft-archiving of superseded scopes.
- Add column: `superseded_by VARCHAR(255) DEFAULT NULL` — references the scope that replaced this one.

### `workspace_constraints`
- Already has `active` column. No changes needed.

---

## 6. Agent Instructions Addition (templates/AGENTS.md)

The following section would be appended to the global agent guidelines:

```markdown
## Context Compaction (Periodic Maintenance)
When retrieving workspace context via `memory_get_context`, if you detect:
- Two or more scopes describing the same domain with overlapping information,
- Constraints that have been superseded by more specific or evolved ones,

You SHOULD propose a compaction to the user:
1. Identify redundant or overlapping entries.
2. Propose a merged/deduplicated version.
3. After user confirmation, call `memory_compact_context` with the compacted data.
```

---

## 7. Relationship to Original "Matrice di Interscambio" Concept

This specification is a pragmatic reformulation of the original vision:

| Original Concept | This Specification |
|:----------------|:-------------------|
| Matrice Logica di Interscambio | Scope Deduplication + Evolutionary Selection |
| Sniffatore Logico (background daemon) | Agent-side reasoning during context retrieval |
| AILM Bytecode notation | Natural language scope summaries (already in use) |
| Determinismo matematico assoluto | Deterministic SQL operations + LLM-assisted comparison |
| Iniezione ad alta densità | Compacted context served via `memory_get_context` |

The core insight is preserved: **the agent should always operate on the evolutionary peak of the project's context, not on its full unfiltered history.**

---

## 8. Rollout Plan

| Phase | Version | Scope |
|:------|:--------|:------|
| Phase 1 | v1.1.0 | Add `active` and `superseded_by` columns. Implement client-side compaction instructions. |
| Phase 2 | v1.2.0 | Implement `memory_compact_context` tool in `server.js`. |
| Phase 3 | v1.3.0 | (Optional) Add server-side automatic compaction with LLM fallback. |
