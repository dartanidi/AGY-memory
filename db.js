import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the current directory
dotenv.config({ path: path.join(__dirname, '.env') });

const dbType = process.env.DB_TYPE || 'mysql';

const config = {
  // MySQL/MariaDB config
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',

  // SQLite config
  sqlitePath: process.env.SQLITE_DB_PATH || path.join(__dirname, 'antigravity_core.db'),
};

let activeDriver;

// Dynamic top-level await import to load drivers conditionally based on environment
if (dbType === 'sqlite') {
  console.error('Database Mode: SQLite');
  activeDriver = await import('./db/sqlite.js');
} else {
  console.error('Database Mode: MySQL/MariaDB');
  activeDriver = await import('./db/mysql.js');
}

export const pool = {
  async query(sql, params) {
    return await activeDriver.query(sql, params, config);
  }
};

export async function initializeDatabase() {
  return await activeDriver.initializeDatabase(config);
}

export async function compactContext(workspace_path, data) {
  return await activeDriver.compactContext(workspace_path, data, config);
}

export default pool;
