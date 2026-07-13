import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

// Load existing .env variables to populate MCP configurations
dotenv.config({ path: path.join(repoRoot, '.env') });

console.log('==================================================');
console.log('AGY-memory: Automatic Setup for Antigravity IDE');
console.log('==================================================\n');

// 1. Locate mcp_config.json path
let configDir;
if (os.platform() === 'win32') {
  configDir = path.join(os.homedir(), '.gemini', 'antigravity-ide');
} else {
  configDir = path.join(os.homedir(), '.gemini', 'antigravity-ide');
}

const configPath = path.join(configDir, 'mcp_config.json');
console.log(`Locating MCP configuration file at:\n  ${configPath}`);

// Ensure directory exists
if (!fs.existsSync(configDir)) {
  try {
    fs.mkdirSync(configDir, { recursive: true });
    console.log('Created Antigravity IDE configuration directory.');
  } catch (err) {
    console.error('Failed to create configuration directory:', err.message);
    process.exit(1);
  }
}

// 2. Load or initialize mcp_config.json
let mcpConfig = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  try {
    const rawData = fs.readFileSync(configPath, 'utf8');
    mcpConfig = JSON.parse(rawData);
    console.log('Found existing mcp_config.json.');
  } catch (err) {
    console.warn('Existing mcp_config.json is not valid JSON. Starting fresh.');
  }
}

// 3. Extract environment variables from .env to forward to MCP
const mcpEnv = {};
const envKeys = [
  'DB_TYPE', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'SQLITE_DB_PATH',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_API_URL', 'DEEPSEEK_MODEL', 'DEEPSEEK_REASONING_EFFORT',
  'GEMINI_API_KEY', 'GEMINI_MODEL'
];

for (const key of envKeys) {
  if (process.env[key] !== undefined) {
    mcpEnv[key] = process.env[key];
  }
}

// Default to sqlite if no DB config is specified
if (!mcpEnv.DB_TYPE) {
  mcpEnv.DB_TYPE = 'sqlite';
  mcpEnv.SQLITE_DB_PATH = path.join(repoRoot, 'antigravity_core.db');
  console.log('No database type selected in .env. Defaulting to local SQLite database.');
}

// 4. Create or update configuration entry
const serverName = 'antigravity-remote-memory';
const absoluteNodePath = process.execPath;
const absoluteServerPath = path.join(repoRoot, 'server.js');

console.log(`\nConfiguring server: "${serverName}"
  Node executable: ${absoluteNodePath}
  Server script:   ${absoluteServerPath}
  Working Dir:     ${repoRoot}`);

mcpConfig.mcpServers[serverName] = {
  command: absoluteNodePath,
  args: [absoluteServerPath],
  cwd: repoRoot,
  env: mcpEnv
};

// 5. Save mcp_config.json back
try {
  fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
  console.log('\n==================================================');
  console.log('✓ MCP Server successfully registered in Antigravity IDE!');
  console.log('✓ It will now start automatically whenever the IDE launches.');
  console.log('==================================================\n');
} catch (err) {
  console.error('Failed to write mcp_config.json:', err.message);
  process.exit(1);
}
