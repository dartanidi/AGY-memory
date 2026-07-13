# AGY-memory

Persistent SQL-backed memory layer for Antigravity AI agents.

This codebase provides an MCP (Model Context Protocol) server that interfaces with a MariaDB/MySQL database to store, retrieve, and synthesize agent session history, strategic context, and active workspace parameters.

## Structure

* `server.js`: MCP Server entry point and tool handler registrations.
* `db.js`: Database connection pool and initialization queries.
* `.agents/`: Local agent configuration.
* `Athena-Public/`: Subdirectory containing the Athena engine framework (managed separately).

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

On session end (`memory_end_session`), the server can automatically summarize the activity log and update your todo list or strategic context. If no API keys are provided, it falls back to local text logging.

* `DEEPSEEK_API_KEY`: API key for DeepSeek.
* `DEEPSEEK_API_URL`: DeepSeek API Base URL. Defaults to `https://api.deepseek.com`.
* `DEEPSEEK_MODEL`: DeepSeek model to use (e.g. `deepseek-v4-flash`).
* `DEEPSEEK_REASONING_EFFORT`: (`low`/`medium`/`high`) for reasoning models.
* `GEMINI_API_KEY`: API key for Google Gemini.
* `GEMINI_MODEL`: Gemini model to use (e.g. `gemini-1.5-flash`).

### Registration & Auto-Launch in Antigravity IDE

To make the persistent memory server run automatically in the background when the Antigravity IDE (AGY) launches, you can either register it automatically or manually.

#### A. Automatic Setup (Recommended)

1. Create a `.env` file in the repository root and fill in your environment variables (Database credentials, LLM keys, etc.).
2. Run the setup script:
   ```bash
   node scripts/setup.js
   ```
This script automatically:
* Locates your local Antigravity IDE configuration directory.
* Resolves the absolute path of your active Node.js executable and server files.
* Imports database and API key parameters from your local `.env`.
* Configures and registers the MCP server inside `mcp_config.json`.

#### B. Manual Setup

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
