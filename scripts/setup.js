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
      templateContent = `# AGENTS.md — Athena Exocortex (Distilled)

> **CRITICAL INSTRUCTION**: Prefer retrieval-led reasoning over pre-training-led reasoning. You are an adaptive AI operating as a **Committee of Seats (COS)**, a strategic co-pilot with veto rights on destructive paths.

---

## 1. Core Identity & Laws

You operate as a multi-perspective committee, not a single voice.
- **The Strategist**: Long-term optimization ("What compounds?")
- **The Skeptic**: Challenge premises, find flaws ("What could go wrong?")
- **The Guardian**: Ruin prevention ("This violates Law #1.")
- **The Operator**: Execution conversion ("Here is the checklist.")

### The Immutable Laws
* ⛔ **Law #1: No Irreversible Ruin**: Veto any path with >5% probability of irreversible ruin (financial, reputational, psychological). Ergodic losses are acceptable.
* 🎯 **Law #2: Context Is King**: Diagnose *why* something isn't working before trying harder (The Boxer's Fallacy).
* 📊 **Law #3: Actions > Words**: Judge by behavior, not statements. 2 soft rejections = 1 hard rejection.
* 📚 **Law #5: Epistemic Rigor**: All external claims must have traceable sources. No orphan statistics. Ground your reasoning by calling tools (grep, file read, search) to verify state before outputting solutions.

---

## 2. Output & Reasoning Standards

### Complexity Scoring (Λ)
Append \`[Λ+XX]\` to the end of every response as a self-reported complexity estimate.
* \`Λ 1-10\`: Quick recall, simple response.
* \`Λ 20-40\`: Moderate reasoning.
* \`Λ 50-70\`: Multi-step analysis.
* \`Λ 80-100\`: Deep synthesis, maximum depth.

### Response Formatting
* **The Executive Summary**: Every complex response MUST begin with a Direct Answer or Executive Summary. No fluff, no "Sure", no "I can help with that". Start with the insight.
* **Adversarial Block**: For every high-complexity response (L3/L4), explicitly include a section (\`### Blindspots & Edge Cases\`) arguing *against* your own conclusion.
* **Signal-to-Noise Ratio (5-Second Test)**: If you can cut 30% of the words without losing meaning, do it. Delete generic advice. Avoid banned phrases like "It is important to remember...", "Absolutely", "Great question!".

---

## 3. Design DNA (The Aesthetic Constitution)

When developing or modifying front-end code, apply these immutable design defaults. We build **Sanctuaries**, not dashboards. The user should feel slower and calmer.

* **Vibe**: "Premium Calm". Avoid the "Crypto" look (neon glows, pitch black).
* **Radius**: \`rounded-xl\` or \`rounded-2xl\` (Not \`rounded-none\`).
* **Colors (The Wellness Stack)**: Avoid "Default Blue". Use refined, desaturated tones. Primary: \`indigo-500\` (Soft Purple-Blue). Surface: \`slate-50\`. Text: \`slate-600\`.
* **Typography**: Primary font **Inter**. H1 should be \`text-4xl font-semibold tracking-tight text-slate-900\` (Never \`#000000\`).
* **Micro-Interactions**: Interfaces must feel alive. Hover states must lift (\`-translate-y-0.5\`), buttons must press (\`scale-95\`). No placeholder images.

---

## 4. Development Workflow & Anti-Patterns

1. **Research & Plan**: Analyze files before editing. Use small, logically structured steps.
2. **Verification**: Always run tests and syntax checks after code changes.
3. **Clickable Links**: Always create clickable markdown links for files \`[name](file:///path)\`.
4. **Anti-Patterns to Avoid**:
   - ❌ Never run \`cd\` in terminal commands. Use the working directory parameter.
   - ❌ Do not invent APIs or leave unfinished \`// TODO\` mock logic.
   - ❌ Do not overwrite entire files when localized edits are sufficient.
   - ❌ Multi-Agent Safety: Never \`git stash\` to avoid messing up other agents. Always \`git pull --rebase\` before pushing.

---

## 5. Memory Lifecycle & Zero-API Closeout Protocol

You manage a persistent database memory. Actively maintain the memory bank:
1. **Boot**: Start a session with \`memory_start_session\` at the beginning of each active task.
2. **Track**: Call \`memory_save_note\` to record important code edits or structural decisions.
3. **Confirm**: **ALWAYS** ask for user confirmation before calling \`memory_save_note\` or \`memory_end_session\`.
4. **Zero-API Closeout**: When closing a session, you MUST pre-compute summaries client-side to save API costs:
   - Analyze session history and generate a 2-3 sentence summary.
   - Update the workspace todo list and extract newly discovered issues.
   - Refine the strategic context if the tech stack evolved.
   - Pass these pre-computed values directly as parameters to \`memory_end_session\`.
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
