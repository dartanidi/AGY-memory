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
    console.error('MySQL database tables initialized successfully (with evolved schema).');
  } catch (error) {
    console.error('Failed to initialize MySQL database tables:', error);
    throw error;
  } finally {
    connection.release();
  }
}
