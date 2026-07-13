let dbInstance = null;

async function getDb(config) {
  if (!dbInstance) {
    console.error('Dynamically loading SQLite dependencies...');
    // Dynamic imports ensure these libraries are only loaded if SQLite mode is explicitly selected
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    
    const dbPath = config.sqlitePath || './antigravity_core.db';
    console.error(`Connecting to SQLite database at: ${dbPath}`);
    
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.default.Database
    });
    
    // Enable foreign keys explicitly in SQLite
    await dbInstance.run('PRAGMA foreign_keys = ON;');
    // Enable WAL journal mode for concurrent reads/writes
    await dbInstance.run('PRAGMA journal_mode = WAL;');
    // Set busy timeout to 5000ms to queue writes instead of failing immediately
    await dbInstance.run('PRAGMA busy_timeout = 5000;');
  }
  return dbInstance;
}

export async function query(sql, params = [], config = {}) {
  const db = await getDb(config);
  
  // Normalize NOW() to CURRENT_TIMESTAMP if any queries still contain it
  let normalizedSql = sql.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');
  
  const isSelect = normalizedSql.trim().toLowerCase().startsWith('select');
  
  if (isSelect) {
    const rows = await db.all(normalizedSql, params);
    return [rows, null];
  } else {
    const result = await db.run(normalizedSql, params);
    return [result, null];
  }
}

export async function initializeDatabase(config = {}) {
  console.error('Initializing SQLite database tables...');
  const db = await getDb(config);
  
  const tables = [
    `CREATE TABLE IF NOT EXISTS workspace_context (
      workspace_path VARCHAR(512) PRIMARY KEY,
      strategic_context TEXT NOT NULL,
      todo_list TEXT NULL,
      known_issues TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      workspace_path VARCHAR(512) NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL,
      summary TEXT NULL,
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS shards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id VARCHAR(128) NOT NULL,
      workspace_path VARCHAR(512) NOT NULL,
      shard_type VARCHAR(64) NOT NULL,
      content TEXT NOT NULL,
      file_path VARCHAR(512) NULL,
      command TEXT NULL,
      outcome TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS workspace_scope_state (
      workspace_path VARCHAR(512) NOT NULL,
      scope VARCHAR(100) NOT NULL,
      state_summary TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 1,
      superseded_by VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (workspace_path, scope),
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS workspace_constraints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_path VARCHAR(512) NOT NULL,
      scope VARCHAR(100) NOT NULL,
      constraint_type VARCHAR(20) NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 1,
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    );`
  ];

  try {
    for (const sql of tables) {
      await db.run(sql);
    }
    
    // Perform schema migration for existing SQLite databases
    try {
      await db.run('ALTER TABLE workspace_scope_state ADD COLUMN active BOOLEAN DEFAULT 1;');
    } catch (err) {
      // Column might already exist, ignore
    }
    try {
      await db.run('ALTER TABLE workspace_scope_state ADD COLUMN superseded_by VARCHAR(255) DEFAULT NULL;');
    } catch (err) {
      // Column might already exist, ignore
    }

    console.error('SQLite database tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize SQLite database tables:', error);
    throw error;
  }
}

export async function compactContext(workspace_path, data, config = {}) {
  const db = await getDb(config);
  try {
    await db.run("BEGIN TRANSACTION;");

    const {
      compacted_scopes = [],
      archived_scopes = [],
      compacted_constraints = [],
      archived_constraint_ids = []
    } = data;

    // 1. Archive obsolete scopes
    if (archived_scopes.length > 0) {
      for (const scopeName of archived_scopes) {
        await db.run(
          "UPDATE workspace_scope_state SET active = 0 WHERE workspace_path = ? AND scope = ?",
          [workspace_path, scopeName]
        );
      }
    }

    // 2. Insert or update compacted scopes
    if (compacted_scopes.length > 0) {
      for (const s of compacted_scopes) {
        await db.run(
          `INSERT INTO workspace_scope_state (workspace_path, scope, state_summary, active, superseded_by)
           VALUES (?, ?, ?, 1, NULL)
           ON CONFLICT(workspace_path, scope) DO UPDATE SET state_summary = excluded.state_summary, active = 1, superseded_by = NULL, updated_at = CURRENT_TIMESTAMP`,
          [workspace_path, s.scope, s.state_summary]
        );
      }
    }

    // 3. Archive obsolete constraints
    if (archived_constraint_ids.length > 0) {
      for (const cid of archived_constraint_ids) {
        await db.run(
          "UPDATE workspace_constraints SET active = 0 WHERE id = ? AND workspace_path = ?",
          [cid, workspace_path]
        );
      }
    }

    // 4. Insert compacted constraints
    if (compacted_constraints.length > 0) {
      for (const c of compacted_constraints) {
        await db.run(
          "INSERT INTO workspace_constraints (workspace_path, scope, constraint_type, description, active) VALUES (?, ?, ?, ?, 1)",
          [workspace_path, c.scope, c.constraint_type, c.description]
        );
      }
    }

    await db.run("COMMIT;");
    return { status: "success", message: "Context compacted successfully." };
  } catch (err) {
    await db.run("ROLLBACK;");
    console.error("Compaction transaction failed:", err);
    throw err;
  }
}
