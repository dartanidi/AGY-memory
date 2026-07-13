import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const srcType = process.env.MIGRATE_SRC_TYPE || 'mysql';
const dstType = process.env.MIGRATE_DST_TYPE || 'sqlite';

const srcConfig = {
  host: process.env.MIGRATE_SRC_HOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.MIGRATE_SRC_PORT || process.env.DB_PORT || '3306', 10),
  user: process.env.MIGRATE_SRC_USER || process.env.DB_USER || '',
  password: process.env.MIGRATE_SRC_PASS || process.env.DB_PASS || '',
  database: process.env.MIGRATE_SRC_NAME || process.env.DB_NAME || '',
  sqlitePath: process.env.MIGRATE_SRC_SQLITE_PATH || path.join(__dirname, '../antigravity_core.db'),
};

const dstConfig = {
  host: process.env.MIGRATE_DST_HOST || '127.0.0.1',
  port: parseInt(process.env.MIGRATE_DST_PORT || '3306', 10),
  user: process.env.MIGRATE_DST_USER || '',
  password: process.env.MIGRATE_DST_PASS || '',
  database: process.env.MIGRATE_DST_NAME || '',
  sqlitePath: process.env.MIGRATE_DST_SQLITE_PATH || path.join(__dirname, '../antigravity_core.db'),
};

async function getDriver(type) {
  if (type === 'sqlite') {
    return await import('../db/sqlite.js');
  } else {
    return await import('../db/mysql.js');
  }
}

async function runMigration() {
  console.log(`\n==================================================`);
  console.log(`Database Migration Utility: ${srcType.toUpperCase()} -> ${dstType.toUpperCase()}`);
  console.log(`==================================================\n`);

  let srcDriver, dstDriver;

  try {
    srcDriver = await getDriver(srcType);
  } catch (err) {
    console.error(`Failed to load source database driver for: ${srcType}. Make sure dependencies are installed.`, err.message);
    process.exit(1);
  }

  try {
    dstDriver = await getDriver(dstType);
  } catch (err) {
    console.error(`Failed to load destination database driver for: ${dstType}. Make sure dependencies are installed.`, err.message);
    process.exit(1);
  }

  // 1. Initialize destination database schemas
  console.log('Initializing destination database tables...');
  await dstDriver.initializeDatabase(dstConfig);
  console.log('Destination tables ready.');

  // 2. Fetch rows from Source
  console.log('\nReading data from source...');
  
  const [contexts] = await srcDriver.query('SELECT * FROM workspace_context', [], srcConfig);
  const [sessions] = await srcDriver.query('SELECT * FROM sessions', [], srcConfig);
  const [shards] = await srcDriver.query('SELECT * FROM shards', [], srcConfig);
  
  // Try reading modular states/constraints if they exist in source
  let scopeStates = [];
  let constraints = [];
  try {
    const [scopeRows] = await srcDriver.query('SELECT * FROM workspace_scope_state', [], srcConfig);
    scopeStates = scopeRows;
  } catch (e) {
    console.log('workspace_scope_state table not present in source, skipping.');
  }
  
  try {
    const [constraintRows] = await srcDriver.query('SELECT * FROM workspace_constraints', [], srcConfig);
    constraints = constraintRows;
  } catch (e) {
    console.log('workspace_constraints table not present in source, skipping.');
  }

  console.log(`Fetched:
  - ${contexts.length} Workspaces
  - ${sessions.length} Sessions
  - ${shards.length} Shards
  - ${scopeStates.length} Scope States
  - ${constraints.length} Constraints`);

  // 3. Write rows to Destination
  console.log('\nWriting data to destination...');

  // A. Migrate workspace_context
  for (const row of contexts) {
    try {
      await dstDriver.query(
        'INSERT INTO workspace_context (workspace_path, strategic_context, todo_list, known_issues, created_at) VALUES (?, ?, ?, ?, ?)',
        [row.workspace_path, row.strategic_context, row.todo_list, row.known_issues, row.created_at],
        dstConfig
      );
    } catch (err) {
      if (err.message.includes('Duplicate') || err.message.includes('UNIQUE')) {
        console.log(`Workspace already exists: ${row.workspace_path}, updating context instead.`);
        await dstDriver.query(
          'UPDATE workspace_context SET strategic_context = ?, todo_list = ?, known_issues = ? WHERE workspace_path = ?',
          [row.strategic_context, row.todo_list, row.known_issues, row.workspace_path],
          dstConfig
        );
      } else {
        console.error(`Failed to migrate workspace ${row.workspace_path}:`, err.message);
      }
    }
  }
  console.log('✓ Workspaces migration complete.');

  // B. Migrate sessions
  for (const row of sessions) {
    try {
      await dstDriver.query(
        'INSERT INTO sessions (id, workspace_path, started_at, ended_at, summary) VALUES (?, ?, ?, ?, ?)',
        [row.id, row.workspace_path, row.started_at, row.ended_at, row.summary],
        dstConfig
      );
    } catch (err) {
      if (err.message.includes('Duplicate') || err.message.includes('UNIQUE')) {
        // Skip or update
      } else {
        console.error(`Failed to migrate session ${row.id}:`, err.message);
      }
    }
  }
  console.log('✓ Sessions migration complete.');

  // C. Migrate shards
  for (const row of shards) {
    try {
      await dstDriver.query(
        'INSERT INTO shards (session_id, workspace_path, shard_type, content, file_path, command, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [row.session_id, row.workspace_path, row.shard_type, row.content, row.file_path, row.command, row.outcome, row.created_at],
        dstConfig
      );
    } catch (err) {
      console.error(`Failed to migrate shard ID ${row.id}:`, err.message);
    }
  }
  console.log('✓ Shards migration complete.');

  // D. Migrate Scope States
  for (const row of scopeStates) {
    try {
      await dstDriver.query(
        'INSERT INTO workspace_scope_state (workspace_path, scope, state_summary, updated_at) VALUES (?, ?, ?, ?)',
        [row.workspace_path, row.scope, row.state_summary, row.updated_at],
        dstConfig
      );
    } catch (err) {
      if (err.message.includes('Duplicate') || err.message.includes('UNIQUE')) {
        await dstDriver.query(
          'UPDATE workspace_scope_state SET state_summary = ? WHERE workspace_path = ? AND scope = ?',
          [row.state_summary, row.workspace_path, row.scope],
          dstConfig
        );
      } else {
        console.error(`Failed to migrate scope state ${row.scope}:`, err.message);
      }
    }
  }
  console.log('✓ Scope states migration complete.');

  // E. Migrate Constraints
  for (const row of constraints) {
    try {
      await dstDriver.query(
        'INSERT INTO workspace_constraints (workspace_path, scope, constraint_type, description, created_at, active) VALUES (?, ?, ?, ?, ?, ?)',
        [row.workspace_path, row.scope, row.constraint_type, row.description, row.created_at, row.active],
        dstConfig
      );
    } catch (err) {
      console.error(`Failed to migrate constraint:`, err.message);
    }
  }
  console.log('✓ Constraints migration complete.');

  console.log(`\n==================================================`);
  console.log(`Migration Completed Successfully!`);
  console.log(`==================================================\n`);
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
