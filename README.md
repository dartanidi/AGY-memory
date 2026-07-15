# AGY-memory

Persistent SQL-backed memory layer for Antigravity AI agents.

This codebase provides an MCP (Model Context Protocol) server that interfaces with a MariaDB/MySQL database to store, retrieve, and synthesize agent session history, strategic context, and active workspace parameters.

## Structure

* `server.js`: MCP Server entry point and tool handler registrations.
* `db.js`: Central database connection gateway.
* `db/`: Database engine drivers (`mysql.js` and `sqlite.js`).
* `scripts/`: Utilities including `setup.js` (installation wizard) and `db-migrate.js` (data migration).
* `templates/`: Templates for global agent guidelines (`AGENTS.md`).
* `docs/`: Technical specifications and design documents.

## Features

* Session state lifecycle (`memory_start_session`, `memory_end_session`).
* Shard tracking (`memory_save_note`) for fine-grained logging.
* Strategic context retrieval and updates.
* Scope-based context state segmentation.
* Constraint tracking (`MUST`, `MUST_NOT`, `SHOULD`, `DEPENDS_ON`).

## Configuration

AGY-memory can be configured via environment variables, specified in a `.env` file in the root directory or directly inside your MCP settings (`mcp_config.json`).

### Database Settings

* `DB_TYPE`: Selects the database type. Supported values are:
  - `mysql` (Default): Uses a remote/local MySQL or MariaDB database.
  - `sqlite`: Uses a local SQLite file database (dynamic loading, zero-install required for MySQL users).
* `SQLITE_DB_PATH`: (For `sqlite` mode) Absolute or relative path to the SQLite file. Defaults to `./antigravity_core.db`.
* `DB_HOST`: (For `mysql` mode) Host IP address of the database.
* `DB_PORT`: (For `mysql` mode) Port of the database. Defaults to `3306`.
* `DB_USER`: (For `mysql` mode) Database username.
* `DB_PASS`: (For `mysql` mode) Database password.
* `DB_NAME`: (For `mysql` mode) Database schema name.

### LLM Summarization Settings (Optional)

On session end (`memory_end_session`), the server can automatically summarize the activity log and update your todo list or strategic context.

> [!NOTE]
> **Client-Side vs Server-Side Summarization (Zero-API Closeout)**:
> If you are using our custom agent configuration (e.g., the rules in `.agents/AGENTS.md`), the agent itself pre-computes the summaries, todo updates, and constraints locally and passes them directly to the tool. **In this case, configuring server-side LLM keys is completely superfluous**, as the server will bypass any API calls and save the pre-computed values directly, reducing latency and saving API costs.
>
> **When are these settings useful?**
> They are required only if you connect this MCP server to standard/external clients (e.g., standard Claude Desktop, Cursor, or raw CLI clients) that only send a raw `raw_activity_log`. In that case, the server uses these keys to perform the summarization on the server side.

* `DEEPSEEK_API_KEY`: API key for DeepSeek.
* `DEEPSEEK_API_URL`: DeepSeek API Base URL. Defaults to `https://api.deepseek.com`.
* `DEEPSEEK_MODEL`: DeepSeek model to use (e.g. `deepseek-v4-flash`).
* `DEEPSEEK_REASONING_EFFORT`: (`low`/`medium`/`high`) for reasoning models.
* `GEMINI_API_KEY`: API key for Google Gemini.
* `GEMINI_MODEL`: Gemini model to use (e.g. `gemini-1.5-flash`).

### Registration & Auto-Launch in Antigravity IDE

#### A. Automatic Setup (Recommended)

To install the server and configure it to run automatically in the background when the Antigravity IDE (AGY) launches, you only need to run:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/dartanidi/AGY-memory.git
   cd AGY-memory
   ```
2. **Install and configure**:
   ```bash
   npm install
   ```

Running `npm install` will automatically:
* Download all required Node.js dependencies.
* Immediately trigger the **interactive setup wizard** (`setup.js`) directly in your terminal to choose your database (SQLite or MySQL) and configure optional LLM keys.
* Write your local `.env` configuration file.
* Register the MCP server in your local Antigravity IDE `mcp_config.json` configuration file, ensuring it auto-starts in the background whenever the IDE launches.
* Configure or append the **global agent guidelines** in your global `~/.gemini/config/AGENTS.md` file, instructing the IDE agent to:
  - Ask for user confirmation before saving any checkpoints (`memory_save_note`) or closing sessions (`memory_end_session`).
  - Automatically run the client-side *Zero-API Closeout Protocol* to save API cost.

#### B. Manual Setup (Alternative)

If you prefer to configure it manually, edit your `mcp_config.json` file (typically located under `~/.gemini/antigravity-ide/mcp_config.json`) and append the following server configuration:

```json
{
  "mcpServers": {
    "antigravity-remote-memory": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/memory/server.js"
      ],
      "cwd": "/absolute/path/to/memory",
      "env": {
        "DB_TYPE": "mysql",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_USER": "your_username",
        "DB_PASS": "your_password",
        "DB_NAME": "your_db_name",
        "DEEPSEEK_API_KEY": "your_deepseek_key"
      }
    }
  }
}
```

### Migrating Data

If you need to migrate your existing database history from one storage type to another (e.g., MySQL to SQLite), configure the source and destination in your `.env` file and run:

```bash
# Set src and dst types
MIGRATE_SRC_TYPE=mysql
MIGRATE_DST_TYPE=sqlite
MIGRATE_DST_SQLITE_PATH=/path/to/new.db

# Run the migration tool
node scripts/db-migrate.js
```

## Roadmap

| Version | Feature | Status |
|:--------|:--------|:-------|
| v1.0.0 | Dual MySQL/SQLite support, scope-based context, explicit constraints, interactive setup wizard, global agent rules, dry-run mode | ✅ Released |
| v1.2.0 | Context Compaction Layer — client-side deduplication, merging, and `memory_compact_context` tool | ✅ Released |
| v1.2.1 | Standalone Portability — Distilled agent guidelines, offline SQLite defaults, and multi-client support | ✅ Released |
| v1.3.0 | Server-side automatic compaction with LLM fallback | 📋 Planned |

> See [`docs/context-compaction-spec.md`](docs/context-compaction-spec.md) for the full technical specification of the Context Compaction Layer.

