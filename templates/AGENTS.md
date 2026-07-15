# Standalone Persistent Memory & Coding Guidelines

This document provides comprehensive guidelines for session tracking, database maintenance, high-quality software engineering, and user interface design. Any AI agent operating in this workspace must follow these rules.

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

## 3. Coding & Engineering Standards (Distilled Athena)

### The External Verification Mandate
* **Never** answer questions or write code based solely on your internal training weights.
* **Always** ground your reasoning by calling at least one tool (grep, file read, search, or run command) to verify files, versions, and active code state before outputting a solution.

### Development Workflow
1. **Research & Plan**: Before making changes, check the workspace structure and locate all relevant files. Propose a brief, bulleted implementation plan to the user and obtain approval before editing.
2. **Execution**: Make changes in small, logically structured steps. Preserve all existing comments and docstrings unless explicitly asked to modify them.
3. **Verification**: Run tests, check syntax, and verify that the application builds and runs correctly.
4. **Checkpointing**: Call `memory_save_note` to checkpoint your changes after key files are modified (e.g., after database changes, API changes).
5. **Documentation**: Create or update a walkthrough documenting the changes and verification results.

---

## 4. UI & Design DNA (Aesthetics Standard)

When developing or modifying front-end code (HTML, CSS, JS):

* **Rich Aesthetics**: Interfaces must feel premium and state-of-the-art. Use harmonious color palettes (curated HSL values, dark modes, subtle gradients, and glassmorphism) instead of default primary colors.
* **Modern Typography**: Use modern typography (e.g., Google Fonts like Inter, Outfit, or Roboto) rather than generic system fonts.
* **Dynamic Design**: Add hover states, smooth transitions, and subtle micro-animations for interactive elements.
* **No Placeholders**: Never use placeholder text or broken/empty image frames. Use working illustrations or mockups.
* **Responsive Layouts**: Ensure all layouts are fully responsive and adapt to mobile, tablet, and desktop screens.

---

## 5. Anti-Patterns to Avoid

* ❌ ** cd commands**: Never run `cd` in terminal commands since shell state is not shared between transport processes. Always execute commands with the proper working directory (`Cwd`) parameter.
* ❌ **Inventing APIs**: Do not write code using library APIs, fields, or config files without first reading the code or docs to verify they exist in this environment.
* ❌ **Placeholders & TODOs**: Do not leave unfinished `// TODO` comments or mock logic in production files.
* ❌ **Over-writing Entire Files**: Avoid replacing entire files when localized edits (`replace_file_content` or `multi_replace_file_content`) are sufficient.

---

## 6. Communication & Output Standards

* **Concise & Direct**: Keep responses short and to the point. Avoid conversational filler or long disclaimers.
* **Clickable Links**: Always create clickable markdown links for all referenced files and code symbols (classes, types, functions, structs) using the `file://` scheme:
  * Correct: `[server.js](file:///absolute/path/to/server.js#L50-L80)` or `[ClassName](file:///path/to/file.js)`
  * Incorrect: `\`server.js\`` (do not use raw code tags for paths).
* **Ask-Don't-Assume**: If requirements are ambiguous, clarify them with the user rather than making assumptions.

---

## 7. Multi-Agent Safety Rules

When multiple AI agents work in this repository or workspace concurrently:

1. **Never** `git stash` create/apply/drop to avoid messing up other active agent workflows.
2. **Always** `git pull --rebase` before pushing to avoid branch conflicts.
3. **Commit only your changes** — ignore files in directories belonging to other agents.
