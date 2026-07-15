# Persistent Memory & Coding Guidelines

This document provides guidelines for persistent session tracking, database maintenance, and high-quality coding workflows. Any AI agent operating in this workspace must follow these rules.

---

## 1. Memory & Session Lifecycle

To keep the project memory database clean and accurate across coding sessions:

1. **Boot**: Start a memory session using `memory_start_session` at the beginning of each task.
2. **Track**: Log critical milestones, discoveries, or refactoring decisions using `memory_save_note` (type: `checkpoint` or `insight`).
   * *Rule*: **ALWAYS** ask the user for confirmation before calling `memory_save_note` or `memory_end_session`.
3. **Closeout**: Finalize the session by calling `memory_end_session` (see the Zero-API Closeout Protocol below).
4. **Maintenance**: Periodically compact database rows using `memory_compact_context` if duplicate or obsolete scope states accumulate.

---

## 2. Zero-API Closeout Protocol (Mandatory)

To prevent latency and avoid requiring server-side Gemini/DeepSeek API keys, the agent **MUST** pre-compute summaries client-side before ending a session:

1. **Analyze**: Chronologically review the active session's conversation history.
2. **Confirm**: Ask the user for confirmation before closing the session.
3. **Pre-compute**: Generate a 2-3 sentence session summary.
4. **Update Todos**: Update the workspace todo list, checking off completed tasks and adding new ones.
5. **Log Issues**: Extract any newly discovered bugs, issues, or fixes.
6. **Refine Context**: Update the strategic context if the architecture, technology stack, or file structure evolved.
7. **Call Tool**: Pass these pre-computed values directly as parameters to `memory_end_session`.

---

## 3. Distilled Coding Workflow (Plan-Execute-Verify)

To maintain code quality without external reasoning engines:

### Phase A: Research & Plan
* Before writing any code, search the codebase, check dependencies, and locate modified files.
* Propose a brief, bulleted implementation plan to the user.
* Obtain explicit user approval before proceeding.

### Phase B: Execute & Track
* Implement changes in small, logical steps.
* Maintain documentation integrity: do not delete unrelated comments or docstrings.
* Call `memory_save_note` to checkpoint your changes after key files are modified.

### Phase C: Verify & Document
* Verify that the project builds and runs (e.g., run tests, syntax checks, or run dry setups).
* Create or update a walkthrough documenting:
  * Key changes made.
  * Test commands run and their results.
* Summarize your work concisely when ending your turn.

---

## 4. Multi-Agent Safety Rules

When multiple AI agents work in this repository or workspace concurrently:

1. **Never** `git stash` create/apply/drop to avoid messing up other active agent workflows.
2. **Always** `git pull --rebase` before pushing to avoid branch conflicts.
3. **Commit only your changes** — ignore files in directories belonging to other agents.
