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
  }
  return dbInstance;
}

export async function query(sql, params = [], config = {}) {
  const db = await getDb(config);
  
  // Normalize NOW() to CURRENT_TIMESTAMP if any queries still contain it
  let normalizedSql = sql.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');
  
  const isSelect = normalizedSql.trim().toLowerCase().startsWith('select');
  
  if (isSelect) {
    return await db.all(normalizedSql, params);
  } else {
    const result = await db.run(normalizedSql, params);
    // Return an array-like structure or query result adapter if needed,
    // but typically mysql returns [rows] or result metadata. 
    // We return the result object containing lastID, changes.
    return result;
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
    console.error('SQLite database tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize SQLite database tables:', error);
    throw error;
  }
}
