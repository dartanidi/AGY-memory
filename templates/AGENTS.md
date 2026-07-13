# Antigravity Persistent Memory Guidelines

## Auto-Start Behaviour
The persistent memory server is registered globally in `mcp_config.json` and launches automatically in the background whenever the Antigravity IDE (AGY) starts.

## Memory Saving & Shards
You have access to a set of persistent database memory tools. You MUST actively maintain the memory bank of the workspace:
1. **Save Checkpoints**: Call `memory_save_note` to record important code edits, structural changes, major decisions, or command outcomes.
2. **Ask Confirmation**: ALWAYS ask the user for confirmation before calling `memory_save_note` or `memory_end_session`. For example: *"I have completed the changes. May I save this checkpoint to the persistent memory database?"*

## Session Lifecycle Guidelines
To maintain database hygiene across all workspaces:
1. **Boot**: Start a session with `memory_start_session` at the beginning of each active workspace task.
2. **Track**: Log major actions, discoveries, or refactoring updates using `memory_save_note` (type: `checkpoint` or `insight`).
3. **Closeout**: Always finalize the session with `memory_end_session` to write summaries and update workspace context.

## Multi-Agent Safety Rules
When multiple AI agents work in this repository or workspace concurrently:
1. **Never** `git stash` create/apply/drop to avoid messing up other active agent workflows.
2. **Always** `git pull --rebase` before pushing to avoid branch conflicts.
3. **Commit only your changes** — ignore changes in directories belonging to other agents.

## Zero-API Closeout Protocol (Mandatory)
When ending an active coding session (usually prompted by the user or upon task completion), you MUST close the session using the `memory_end_session` tool. To avoid requiring server-side API keys, you MUST pre-compute the summaries client-side:
1. **Analyze**: Chronologically analyze the active session's conversation history using your own reasoning.
2. **Confirm**: Ask the user for confirmation before closing the session.
3. **Pre-compute**: Generate a 2-3 sentence session summary.
4. **Update Todos**: Update the workspace todo list, checking off completed tasks and adding new ones.
5. **Log Issues**: Extract any newly discovered bugs, issues, or fixes.
6. **Refine Context**: Update the strategic context if the architecture, technology stack, or file structure evolved.
7. **Call Tool**: Pass these pre-computed values directly as parameters to `memory_end_session`.

## Context Compaction Protocol (Periodic Maintenance)
To prevent context inflation and database pollution, you must periodically deduplicate and merge overlapping or obsolete scope states and constraints:
1. **Analyze**: When calling `memory_get_context`, check if there are multiple scopes describing the same conceptual domain, or constraints that have been superseded by newer requirements.
2. **Propose**: Propose a compaction plan to the user, showing the merged results.
3. **Confirm**: Always ask for the user's explicit confirmation.
4. **Call Tool**: Use the `memory_compact_context` tool to archive obsolete rows (`active = 0`) and insert/update the new merged states in a single operation.

