import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run');

console.log('==================================================');
console.log('AGY-memory: Interactive Setup for Antigravity IDE');
if (isDryRun) {
  console.log('*** DRY RUN MODE: No files will be modified ***');
}
console.log('==================================================\n');

const isInteractive = process.stdout.isTTY && !process.env.CI && !process.argv.includes('--non-interactive');

let rl = null;
let askQuestion = () => Promise.resolve('');

if (isInteractive) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  askQuestion = (query, defaultValue = '') => {
    const prompt = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  };
}

async function setup() {
  const mcpEnv = {};

  if (!isInteractive) {
    console.log('Non-interactive environment detected. Installing with default SQLite configuration...');
    mcpEnv.DB_TYPE = 'sqlite';
    mcpEnv.SQLITE_DB_PATH = path.join(repoRoot, 'antigravity_core.db');
  } else {

  // 1. Choose Database Mode
  console.log('--- Database Configuration ---');
  console.log('Choose your persistent storage engine:');
  console.log('  1) SQLite (Local file, zero-install, recommended for solo setups)');
  console.log('  2) MySQL / MariaDB (Remote or local server, recommended for multi-agent/advanced setups)');
  
  const dbChoice = await askQuestion('Select database option (1 or 2)', '1');
  
  if (dbChoice === '2') {
    mcpEnv.DB_TYPE = 'mysql';
    mcpEnv.DB_HOST = await askQuestion('Database Host', '127.0.0.1');
    mcpEnv.DB_PORT = await askQuestion('Database Port', '3306');
    mcpEnv.DB_USER = await askQuestion('Database User', '');
    mcpEnv.DB_PASS = await askQuestion('Database Password', '');
    mcpEnv.DB_NAME = await askQuestion('Database Name', 'antigravity');
  } else {
    mcpEnv.DB_TYPE = 'sqlite';
    const defaultSqlitePath = path.join(repoRoot, 'antigravity_core.db');
    mcpEnv.SQLITE_DB_PATH = await askQuestion('SQLite Database File Path', defaultSqlitePath);
  }

  // 2. Configure LLM Summarization API Keys (Optional)
  console.log('\n--- LLM Summarization Configuration (Optional) ---');
  console.log('These credentials are used by the server to automatically summarize session logs on closeout.');
  
  const configureLLM = await askQuestion('Do you want to configure an LLM API key now? (y/n)', 'n');
  
  if (configureLLM.toLowerCase() === 'y' || configureLLM.toLowerCase() === 'yes') {
    console.log('Select your LLM provider:');
    console.log('  1) DeepSeek');
    console.log('  2) Google Gemini');
    const llmChoice = await askQuestion('Select LLM option (1 or 2)', '1');
    
    if (llmChoice === '1') {
      mcpEnv.DEEPSEEK_API_KEY = await askQuestion('DeepSeek API Key', '');
      mcpEnv.DEEPSEEK_API_URL = await askQuestion('DeepSeek API URL Base', 'https://api.deepseek.com');
      mcpEnv.DEEPSEEK_MODEL = await askQuestion('DeepSeek Model Name', 'deepseek-v4-flash');
      mcpEnv.DEEPSEEK_REASONING_EFFORT = await askQuestion('DeepSeek Reasoning Effort (low/medium/high)', 'low');
    } else {
      mcpEnv.GEMINI_API_KEY = await askQuestion('Gemini API Key', '');
      mcpEnv.GEMINI_MODEL = await askQuestion('Gemini Model Name', 'gemini-1.5-flash');
    }
  }
  }

  // 3. Write configuration to local .env file
  console.log('\nWriting local configuration to .env...');
  let envContent = '';
  for (const [key, value] of Object.entries(mcpEnv)) {
    envContent += `${key}=${value}\n`;
  }
  
  try {
    if (isDryRun) {
      console.log('✓ [Dry Run] Would write to local .env file:\n' + envContent);
    } else {
      fs.writeFileSync(path.join(repoRoot, '.env'), envContent, 'utf8');
      console.log('✓ Local .env file successfully created.');
    }
  } catch (err) {
    console.error('Warning: Failed to write .env file:', err.message);
  }

  // 4. Locate and load mcp_config.json
  const configDir = path.join(os.homedir(), '.gemini', 'antigravity-ide');
  const configPath = path.join(configDir, 'mcp_config.json');
  
  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    try {
      if (isDryRun) {
        console.log(`[Dry Run] Would create config directory: ${configDir}`);
      } else {
        fs.mkdirSync(configDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create configuration directory:', err.message);
      if (rl) rl.close();
      process.exit(1);
    }
  }

  let mcpConfig = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      const rawData = fs.readFileSync(configPath, 'utf8');
      mcpConfig = JSON.parse(rawData);
    } catch (err) {
      console.warn('Existing mcp_config.json is not valid JSON. Initializing clean config.');
    }
  }

  // 5. Update mcpServers config
  const serverName = 'antigravity-remote-memory';
  mcpConfig.mcpServers[serverName] = {
    command: process.execPath,
    args: [path.join(repoRoot, 'server.js')],
    cwd: repoRoot,
    env: mcpEnv
  };

  // 6. Write back to mcp_config.json
  try {
    if (isDryRun) {
      console.log(`✓ [Dry Run] Would write server config to ${configPath}:\n` + JSON.stringify(mcpConfig.mcpServers[serverName], null, 2));
      console.log('\n==================================================');
      console.log('✓ [Dry Run] Configuration simulation complete!');
      console.log('==================================================\n');
    } else {
      fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      console.log('\n==================================================');
      console.log('✓ Configuration complete!');
      console.log('✓ MCP Server successfully registered in Antigravity IDE!');
      console.log('✓ It will now start automatically whenever the IDE launches.');
      console.log('==================================================\n');
    }
  } catch (err) {
    console.error('Failed to write mcp_config.json:', err.message);
  }

  // 7. Write/Append Global Agent Guidelines (AGENTS.md)
  console.log('\nConfiguring global agent instructions...');
  const globalConfigDir = path.join(os.homedir(), '.gemini', 'config');
  const globalAgentsPath = path.join(globalConfigDir, 'AGENTS.md');
  const templatePath = path.join(repoRoot, 'templates', 'AGENTS.md');
  
  if (!fs.existsSync(globalConfigDir)) {
    try {
      fs.mkdirSync(globalConfigDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create global configuration directory:', err.message);
    }
  }

  try {
    let templateContent = '';
    if (fs.existsSync(templatePath)) {
      templateContent = fs.readFileSync(templatePath, 'utf8');
    } else {
      templateContent = `# Antigravity Persistent Memory Guidelines

## Auto-Start Behaviour
The persistent memory server is registered globally in mcp_config.json and launches automatically in the background whenever the Antigravity IDE (AGY) starts.

## Memory Saving & Shards
You have access to a set of persistent database memory tools. You MUST actively maintain the memory bank of the workspace:
1. **Save Checkpoints**: Call memory_save_note to record important code edits, structural changes, major decisions, or command outcomes.
2. **Ask Confirmation**: ALWAYS ask the user for confirmation before calling memory_save_note or memory_end_session.

## Session Lifecycle Guidelines
To maintain database hygiene across all workspaces:
1. **Boot**: Start a session with memory_start_session at the beginning of each active workspace task.
2. **Track**: Log major actions, discoveries, or refactoring updates using memory_save_note.
3. **Closeout**: Always finalize the session with memory_end_session.

## Multi-Agent Safety Rules
When multiple AI agents work in this repository or workspace concurrently:
1. **Never** git stash create/apply/drop to avoid messing up other active agent workflows.
2. **Always** git pull --rebase before pushing to avoid branch conflicts.
3. **Commit only your changes** — ignore changes in directories belonging to other agents.

## Zero-API Closeout Protocol (Mandatory)
When ending an active coding session, you MUST close the session using the memory_end_session tool. Pre-compute the summaries client-side:
1. Analyze session history.
2. Confirm with user.
3. Pre-compute session summary, todo list, known issues, and strategic context.
4. Pass these parameters directly to memory_end_session.
`;
    }

    if (fs.existsSync(globalAgentsPath)) {
      const existingContent = fs.readFileSync(globalAgentsPath, 'utf8');
      if (!existingContent.includes('Antigravity Persistent Memory Guidelines')) {
        if (isDryRun) {
          console.log(`✓ [Dry Run] Would append guidelines to global AGENTS.md at ${globalAgentsPath}`);
        } else {
          fs.appendFileSync(globalAgentsPath, `\n\n${templateContent}`, 'utf8');
          console.log('✓ Appended memory guidelines to your global AGENTS.md file.');
        }
      } else {
        console.log('✓ Global AGENTS.md already contains memory guidelines.');
      }
    } else {
      if (isDryRun) {
        console.log(`✓ [Dry Run] Would create global AGENTS.md at ${globalAgentsPath}`);
      } else {
        fs.writeFileSync(globalAgentsPath, templateContent, 'utf8');
        console.log('✓ Created global AGENTS.md file with memory guidelines.');
      }
    }
  } catch (err) {
    console.error('Failed to update global AGENTS.md:', err.message);
  }

  if (rl) rl.close();
}

setup().catch((err) => {
  console.error('Error during setup:', err);
  if (rl) rl.close();
  process.exit(1);
});
