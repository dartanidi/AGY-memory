import mysql from 'mysql2/promise';

let pool = null;

export function getPool(config) {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host || '127.0.0.1',
      port: parseInt(config.port || '3306', 10),
      user: config.user || '',
      password: config.password || '',
      database: config.database || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function query(sql, params, config) {
  const activePool = getPool(config);
  return await activePool.query(sql, params);
}

export async function initializeDatabase(config) {
  console.error('Initializing MySQL/MariaDB database tables...');
  const activePool = getPool(config);
  const connection = await activePool.getConnection();

  const tables = [
    `CREATE TABLE IF NOT EXISTS workspace_context (
      workspace_path VARCHAR(512) PRIMARY KEY,
      strategic_context TEXT NOT NULL,
      todo_list TEXT NULL,
      known_issues TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      workspace_path VARCHAR(512) NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL,
      summary TEXT NULL,
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS shards (
      id INT AUTO_INCREMENT PRIMARY KEY,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS workspace_scope_state (
      workspace_path VARCHAR(512) NOT NULL,
      scope VARCHAR(100) NOT NULL,
      state_summary TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT TRUE,
      superseded_by VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (workspace_path, scope),
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS workspace_constraints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      workspace_path VARCHAR(512) NOT NULL,
      scope VARCHAR(100) NOT NULL,
      constraint_type VARCHAR(20) NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT TRUE,
      FOREIGN KEY (workspace_path) REFERENCES workspace_context(workspace_path) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  try {
    for (const sql of tables) {
      await connection.query(sql);
    }

    // Perform schema migration for existing MySQL databases
    try {
      await connection.query('ALTER TABLE workspace_scope_state ADD COLUMN active BOOLEAN DEFAULT 1;');
    } catch (err) {
      // Column might already exist, ignore
    }
    try {
      await connection.query('ALTER TABLE workspace_scope_state ADD COLUMN superseded_by VARCHAR(255) DEFAULT NULL;');
    } catch (err) {
      // Column might already exist, ignore
    }

    console.error('MySQL database tables initialized successfully (with evolved schema).');
  } catch (error) {
    console.error('Failed to initialize MySQL database tables:', error);
    throw error;
  } finally {
    connection.release();
  }
}

export async function compactContext(workspace_path, data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      compacted_scopes = [],
      archived_scopes = [],
      compacted_constraints = [],
      archived_constraint_ids = []
    } = data;

    // 1. Archive obsolete scopes
    if (archived_scopes.length > 0) {
      for (const scopeName of archived_scopes) {
        await connection.query(
          "UPDATE workspace_scope_state SET active = 0 WHERE workspace_path = ? AND scope = ?",
          [workspace_path, scopeName]
        );
      }
    }

    // 2. Insert or update compacted scopes
    if (compacted_scopes.length > 0) {
      for (const s of compacted_scopes) {
        await connection.query(
          `INSERT INTO workspace_scope_state (workspace_path, scope, state_summary, active, superseded_by)
           VALUES (?, ?, ?, 1, NULL)
           ON DUPLICATE KEY UPDATE state_summary = VALUES(state_summary), active = 1, superseded_by = NULL, updated_at = CURRENT_TIMESTAMP`,
          [workspace_path, s.scope, s.state_summary]
        );
      }
    }

    // 3. Archive obsolete constraints
    if (archived_constraint_ids.length > 0) {
      for (const cid of archived_constraint_ids) {
        await connection.query(
          "UPDATE workspace_constraints SET active = 0 WHERE id = ? AND workspace_path = ?",
          [cid, workspace_path]
        );
      }
    }

    // 4. Insert compacted constraints
    if (compacted_constraints.length > 0) {
      for (const c of compacted_constraints) {
        await connection.query(
          "INSERT INTO workspace_constraints (workspace_path, scope, constraint_type, description, active) VALUES (?, ?, ?, ?, 1)",
          [workspace_path, c.scope, c.constraint_type, c.description]
        );
      }
    }

    await connection.commit();
    return { status: "success", message: "Context compacted successfully." };
  } catch (err) {
    await connection.rollback();
    console.error("Compaction transaction failed:", err);
    throw err;
  } finally {
    connection.release();
  }
}
