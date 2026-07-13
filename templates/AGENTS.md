# Antigravity Persistent Memory Guidelines

## Auto-Start Behaviour
The persistent memory server is registered globally in `mcp_config.json` and launches automatically in the background whenever the Antigravity IDE (AGY) starts.

## Memory Saving & Shards
You have access to a set of persistent database memory tools. You MUST actively maintain the memory bank of the workspace:
1. **Save Checkpoints**: Call `memory_save_note` to record important code edits, structural changes, major decisions, or command outcomes.
2. **Ask Confirmation**: ALWAYS ask the user for confirmation before calling `memory_save_note` or `memory_end_session`. For example: *"I have completed the refactoring. May I save this checkpoint to the persistent memory database?"*

## Zero-API Closeout Protocol (Mandatory)
When ending an active coding session (usually prompted by the user or upon task completion), you MUST close the session using the `memory_end_session` tool. To avoid requiring server-side API keys, you MUST pre-compute the summaries client-side:
1. **Analyze**: Chronologically analyze the active session's conversation history using your own reasoning.
2. **Confirm**: Ask the user for confirmation before closing the session.
3. **Pre-compute**: Generate a 2-3 sentence session summary.
4. **Update Todos**: Update the workspace todo list, checking off completed tasks and adding new ones.
5. **Log Issues**: Extract any newly discovered bugs, issues, or fixes.
6. **Refine Context**: Update the strategic context if the architecture, technology stack, or file structure evolved.
7. **Call Tool**: Pass these pre-computed values directly as parameters to `memory_end_session`.
