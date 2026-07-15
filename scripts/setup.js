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
      templateContent = `# Persistent Memory & Coding Guidelines

This document provides guidelines for persistent session tracking, database maintenance, and high-quality coding workflows. Any AI agent operating in this workspace must follow these rules.

---

## 1. Memory & Session Lifecycle

To keep the project memory database clean and accurate across coding sessions:

1. **Boot**: Start a memory session using \`memory_start_session\` at the beginning of each task.
2. **Track**: Log critical milestones, discoveries, or refactoring decisions using \`memory_save_note\` (type: \`checkpoint\` or \`insight\`).
   * *Rule*: **ALWAYS** ask the user for confirmation before calling \`memory_save_note\` or \`memory_end_session\`.
3. **Closeout**: Finalize the session by calling \`memory_end_session\` (see the Zero-API Closeout Protocol below).
4. **Maintenance**: Periodically compact database rows using \`memory_compact_context\` if duplicate or obsolete scope states accumulate.

---

## 2. Zero-API Closeout Protocol (Mandatory)

To prevent latency and avoid requiring server-side Gemini/DeepSeek API keys, the agent **MUST** pre-compute summaries client-side before ending a session:

1. **Analyze**: Chronologically review the active session's conversation history.
2. **Confirm**: Ask the user for confirmation before closing the session.
3. **Pre-compute**: Generate a 2-3 sentence session summary.
4. **Update Todos**: Update the workspace todo list, checking off completed tasks and adding new ones.
5. **Log Issues**: Extract any newly discovered bugs, issues, or fixes.
6. **Refine Context**: Update the strategic context if the architecture, technology stack, or file structure evolved.
7. **Call Tool**: Pass these pre-computed values directly as parameters to \`memory_end_session\`.

---

## 3. Distilled Coding Workflow (Plan-Execute-Verify)

To maintain code quality without external reasoning engines:

### Phase A: Research & Plan
* Before writing any code, search the codebase, check dependencies, and locate modified files.
* Propose a brief, bulleted implementation plan to the user.
* Obtain explicit user approval before proceeding.

### Phase B: Execute & Track
* Implement changes in small, logical steps.
* Maintain documentation integrity: do not delete unrelated comments or docstrings.
* Call \`memory_save_note\` to checkpoint your changes after key files are modified.

### Phase C: Verify & Document
* Verify that the project builds and runs (e.g., run tests, syntax checks, or run dry setups).
* Create or update a walkthrough documenting:
  * Key changes made.
  * Test commands run and their results.
* Summarize your work concisely when ending your turn.

---

## 4. Multi-Agent Safety Rules

When multiple AI agents work in this repository or workspace concurrently:

1. **Never** \`git stash\` create/apply/drop to avoid messing up other active agent workflows.
2. **Always** \`git pull --rebase\` before pushing to avoid branch conflicts.
3. **Commit only your changes** — ignore files in directories belonging to other agents.
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
