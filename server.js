import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool, { initializeDatabase } from './db.js';

// Initialize the MCP Server
const server = new Server(
  {
    name: "antigravity-remote-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Gemini or DeepSeek API client if API key is present
let genAI = null;
let geminiModel = null;
const geminiApiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const deepseekReasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT || 'low';
let deepseekApiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
if (!deepseekApiUrl.endsWith('/chat/completions') && !deepseekApiUrl.endsWith('/chat/completions/')) {
  deepseekApiUrl = deepseekApiUrl.replace(/\/$/, '') + '/chat/completions';
}

if (geminiApiKey) {
  try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    geminiModel = genAI.getGenerativeModel({ model: modelName });
    console.error(`Gemini API client initialized successfully using model: ${modelName}`);
  } catch (err) {
    console.error('Failed to initialize Gemini API client:', err);
  }
} else if (deepseekApiKey) {
  console.error(`DeepSeek API client configured using model: ${deepseekModel}`);
} else {
  console.error('Neither GEMINI_API_KEY nor DEEPSEEK_API_KEY env variables are set. Session summarization will run in local fallback mode.');
}


// 1. Tool Registration List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "memory_get_context",
        description: "Retrieve the strategic context (SSoT), active todos, known issues, and recent notes for the active project workspace.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            scope: {
              type: "string",
              description: "Optional specific scope to retrieve state and constraints for.",
            },
          },
          required: ["workspace_path"],
        },
      },
      {
        name: "memory_start_session",
        description: "Start a new session to track coding activities. Initializes the workspace context if it does not exist.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            session_id: {
              type: "string",
              description: "Unique identifier for this session (e.g. timestamp or UUID).",
            },
          },
          required: ["workspace_path", "session_id"],
        },
      },
      {
        name: "memory_save_note",
        description: "Save a shard (receipt) of an event, decision, command result, or codebase observation to the current session.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            session_id: {
              type: "string",
              description: "The active session identifier.",
            },
            type: {
              type: "string",
              description: "The type of note. Examples: 'checkpoint', 'observation', 'bug_fix', 'decision'.",
            },
            content: {
              type: "string",
              description: "The actual content of the note/observation.",
            },
            file_path: {
              type: "string",
              description: "Optional reference to a file path related to this note.",
            },
            command: {
              type: "string",
              description: "Optional command line string executed.",
            },
            outcome: {
              type: "string",
              description: "Optional stdout/stderr output or success/failure details of the command.",
            },
          },
          required: ["workspace_path", "session_id", "type", "content"],
        },
      },
      {
        name: "memory_update_context",
        description: "Directly update the core workspace parameters (strategic context, todos, and known issues) in the database.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            strategic_context: {
              type: "string",
              description: "Updated high-level architecture, tech stack, rules, and context.",
            },
            todo_list: {
              type: "string",
              description: "Updated markdown format todo list.",
            },
            known_issues: {
              type: "string",
              description: "Updated log of bugs and their resolutions.",
            },
            scope: {
              type: "string",
              description: "Optional specific scope to update.",
            },
            scope_state: {
              type: "string",
              description: "Updated state summary for the specified scope.",
            },
            constraints: {
              type: "array",
              description: "Array of active constraints for the specified scope.",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["MUST", "MUST_NOT", "SHOULD", "DEPENDS_ON"] },
                  description: { type: "string" },
                  active: { type: "boolean" }
                },
                required: ["type", "description"]
              }
            },
          },
          required: ["workspace_path"],
        },
      },
      {
        name: "memory_end_session",
        description: "Close out the session and summarize activity. Optionally update context.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            session_id: {
              type: "string",
              description: "The active session identifier.",
            },
            raw_activity_log: {
              type: "string",
              description: "A detailed summary of actions taken, files edited, errors encountered, and results during this session.",
            },
            session_summary: {
              type: "string",
              description: "A 2-3 sentence summary of the session's achievements.",
            },
            strategic_context: {
              type: "string",
              description: "The updated strategic context for the workspace.",
            },
            todo_list: {
              type: "string",
              description: "The updated todo list (markdown format).",
            },
            known_issues: {
              type: "string",
              description: "The updated known issues list.",
            }
          },
          required: ["workspace_path", "session_id", "raw_activity_log"],
        },
      },
      {
        name: "memory_search_history",
        description: "Search past notes, decisions, and session summaries for the active workspace.",
        inputSchema: {
          type: "object",
          properties: {
            workspace_path: {
              type: "string",
              description: "The absolute path of the workspace/project repository.",
            },
            query: {
              type: "string",
              description: "Search keyword or query string.",
            },
            limit: {
              type: "integer",
              description: "Maximum results to return.",
            },
          },
          required: ["workspace_path", "query"],
        },
      },
    ],
  };
});

// 2. Tool Execution Request Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "memory_get_context": {
        const { workspace_path, scope } = args;

        // Fetch workspace context
        const [contextRows] = await pool.query(
          "SELECT * FROM workspace_context WHERE workspace_path = ?",
          [workspace_path]
        );

        if (contextRows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "new_workspace",
                  message: `No context found for workspace: ${workspace_path}. This is a newly initialized project.`,
                  strategic_context: "New workspace. No strategic context defined yet.",
                  todo_list: "",
                  known_issues: "",
                  scope_states: [],
                  constraints: [],
                  sessions: [],
                  recent_shards: []
                }, null, 2),
              },
            ],
          };
        }

        const context = contextRows[0];

        // Fetch last 3 sessions
        const [sessionRows] = await pool.query(
          "SELECT id, started_at, ended_at, summary FROM sessions WHERE workspace_path = ? ORDER BY started_at DESC LIMIT 3",
          [workspace_path]
        );

        // Fetch last 15 shards
        const [shardRows] = await pool.query(
          "SELECT shard_type, content, file_path, command, outcome, created_at FROM shards WHERE workspace_path = ? ORDER BY created_at DESC LIMIT 15",
          [workspace_path]
        );

        // Fetch modular scope states and constraints
        let scopeStates = [];
        let constraints = [];

        if (scope) {
          const [scopeRows] = await pool.query(
            "SELECT scope, state_summary, updated_at FROM workspace_scope_state WHERE workspace_path = ? AND scope = ?",
            [workspace_path, scope]
          );
          scopeStates = scopeRows;

          const [constraintRows] = await pool.query(
            "SELECT scope, constraint_type, description, active FROM workspace_constraints WHERE workspace_path = ? AND scope = ? AND active = 1",
            [workspace_path, scope]
          );
          constraints = constraintRows;
        } else {
          const [scopeRows] = await pool.query(
            "SELECT scope, state_summary, updated_at FROM workspace_scope_state WHERE workspace_path = ?",
            [workspace_path]
          );
          scopeStates = scopeRows;

          const [constraintRows] = await pool.query(
            "SELECT scope, constraint_type, description, active FROM workspace_constraints WHERE workspace_path = ? AND active = 1",
            [workspace_path]
          );
          constraints = constraintRows;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "active",
                workspace_path: context.workspace_path,
                strategic_context: context.strategic_context,
                todo_list: context.todo_list,
                known_issues: context.known_issues,
                scope_states: scopeStates,
                constraints: constraints,
                sessions: sessionRows,
                recent_shards: shardRows
              }, null, 2),
            },
          ],
        };
      }

      case "memory_start_session": {
        const { workspace_path, session_id } = args;

        // Ensure workspace context exists
        const [contextRows] = await pool.query(
          "SELECT 1 FROM workspace_context WHERE workspace_path = ?",
          [workspace_path]
        );

        if (contextRows.length === 0) {
          await pool.query(
            "INSERT INTO workspace_context (workspace_path, strategic_context, todo_list, known_issues) VALUES (?, ?, ?, ?)",
            [workspace_path, "New workspace. No strategic context defined yet.", "", ""]
          );
        }

        // Insert new session
        await pool.query(
          "INSERT INTO sessions (id, workspace_path, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
          [session_id, workspace_path]
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "success", session_id, workspace_path }),
            },
          ],
        };
      }

      case "memory_save_note": {
        const {
          workspace_path,
          session_id,
          type,
          content,
          file_path: fp = null,
          command: cmd = null,
          outcome: out = null,
        } = args;

        await pool.query(
          "INSERT INTO shards (session_id, workspace_path, shard_type, content, file_path, command, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [session_id, workspace_path, type, content, fp, cmd, out]
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "success", message: "Shard saved successfully" }),
            },
          ],
        };
      }

      case "memory_update_context": {
        const {
          workspace_path,
          strategic_context,
          todo_list,
          known_issues,
          scope,
          scope_state,
          constraints
        } = args;

        let updatedCore = false;
        let updatedScope = false;
        let updatedConstraintsCount = 0;

        // 1. Core workspace_context updates
        const updates = [];
        const params = [];

        if (strategic_context !== undefined) {
          updates.push("strategic_context = ?");
          params.push(strategic_context);
        }
        if (todo_list !== undefined) {
          updates.push("todo_list = ?");
          params.push(todo_list);
        }
        if (known_issues !== undefined) {
          updates.push("known_issues = ?");
          params.push(known_issues);
        }

        if (updates.length > 0) {
          params.push(workspace_path);
          await pool.query(
            `UPDATE workspace_context SET ${updates.join(", ")} WHERE workspace_path = ?`,
            params
          );
          updatedCore = true;
        }

        // 2. Scope-based state updates
        if (scope && scope_state !== undefined) {
          // Database-agnostic SELECT-then-INSERT/UPDATE
          const [existingScopeRows] = await pool.query(
            "SELECT 1 FROM workspace_scope_state WHERE workspace_path = ? AND scope = ?",
            [workspace_path, scope]
          );

          if (existingScopeRows.length > 0) {
            await pool.query(
              "UPDATE workspace_scope_state SET state_summary = ? WHERE workspace_path = ? AND scope = ?",
              [scope_state, workspace_path, scope]
            );
          } else {
            await pool.query(
              "INSERT INTO workspace_scope_state (workspace_path, scope, state_summary) VALUES (?, ?, ?)",
              [workspace_path, scope, scope_state]
            );
          }
          updatedScope = true;
        }

        // 3. Constraint tracking updates
        if (scope && constraints && Array.isArray(constraints)) {
          for (const constraint of constraints) {
            const { type, description, active = true } = constraint;
            const activeVal = active ? 1 : 0;

            const [existingConstraintRows] = await pool.query(
              "SELECT id FROM workspace_constraints WHERE workspace_path = ? AND scope = ? AND description = ?",
              [workspace_path, scope, description]
            );

            if (existingConstraintRows.length > 0) {
              const constraintId = existingConstraintRows[0].id;
              await pool.query(
                "UPDATE workspace_constraints SET constraint_type = ?, active = ? WHERE id = ?",
                [type, activeVal, constraintId]
              );
            } else {
              await pool.query(
                "INSERT INTO workspace_constraints (workspace_path, scope, constraint_type, description, active) VALUES (?, ?, ?, ?, ?)",
                [workspace_path, scope, type, description, activeVal]
              );
            }
            updatedConstraintsCount++;
          }
        }

        if (!updatedCore && !updatedScope && updatedConstraintsCount === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ status: "ignored", message: "No updates provided" }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                message: "Workspace context updated successfully",
                updates: {
                  core_context: updatedCore,
                  scope_state: updatedScope ? scope : null,
                  constraints_processed: updatedConstraintsCount
                }
              }, null, 2),
            },
          ],
        };
      }

      case "memory_end_session": {
        const {
          workspace_path,
          session_id,
          raw_activity_log,
          session_summary: preSummary = null,
          strategic_context: preStrategic = null,
          todo_list: preTodo = null,
          known_issues: preIssues = null
        } = args;

        // Fetch current workspace context to pass to Gemini
        const [contextRows] = await pool.query(
          "SELECT * FROM workspace_context WHERE workspace_path = ?",
          [workspace_path]
        );

        if (contextRows.length === 0) {
          throw new Error(`Workspace context not found for path: ${workspace_path}`);
        }

        const currentContext = contextRows[0];
        let summary = preSummary || "Session completed. Activity logged.";
        let updatedTodo = preTodo !== null ? preTodo : currentContext.todo_list;
        let updatedIssues = preIssues !== null ? preIssues : currentContext.known_issues;
        let updatedStrategic = preStrategic !== null ? preStrategic : currentContext.strategic_context;

        // Call Gemini or DeepSeek to summarize and update context files if client is set up and no pre-summaries were provided
        if (!preSummary && (geminiModel || deepseekApiKey)) {
          try {
            const prompt = `You are a helper that maintains the memory bank of a coding assistant.
Given the current workspace state and a raw log of the current session's activities, you must produce:
1. A 2-3 sentence summary of the session's achievements.
2. An updated Todo list (markdown format, keep it clean and remove completed tasks if needed, or update their status).
3. Updated Known Issues (add any newly discovered bugs/resolutions from this session).
4. Refined Strategic Context (update tech stack, architecture decisions if any were made).

Here is the current workspace state:
- Strategic Context: ${currentContext.strategic_context}
- Todo List: ${currentContext.todo_list}
- Known Issues: ${currentContext.known_issues}

Here is the raw activity log of the current session:
${raw_activity_log}

Respond ONLY with a JSON object in this format (do not include markdown code block formatting in your raw response, just the JSON):
{
  "session_summary": "...",
  "updated_todo_list": "...",
  "updated_known_issues": "...",
  "updated_strategic_context": "..."
}
`;

            let responseText = '';
            if (geminiModel) {
              console.error('Invoking Gemini model to process session closeout...');
              const result = await geminiModel.generateContent({
                contents: prompt,
                generationConfig: {
                  responseMimeType: "application/json",
                }
              });
              responseText = result.response.text();
            } else {
              console.error(`Invoking DeepSeek model at ${deepseekApiUrl} to process session closeout...`);
              const response = await fetch(deepseekApiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${deepseekApiKey}`
                },
                body: JSON.stringify({
                  model: deepseekModel,
                  messages: [
                    { role: "system", content: "You are a helpful assistant that maintains the memory bank of a coding assistant. You must output ONLY a valid JSON object." },
                    { role: "user", content: prompt }
                  ],
                  thinking: { type: "enabled" },
                  reasoning_effort: deepseekReasoningEffort,
                  stream: false,
                  response_format: {
                    type: "json_object"
                  }
                })
              });
              
              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errText}`);
              }
              
              const data = await response.json();
              responseText = data.choices[0].message.content;
            }

            // Clean up possible markdown code block wrappers (e.g. ```json ... ```)
            let jsonString = responseText.trim();
            if (jsonString.startsWith("```")) {
              const lines = jsonString.split("\n");
              if (lines[0].startsWith("```")) {
                lines.shift();
              }
              if (lines[lines.length - 1].startsWith("```")) {
                lines.pop();
              }
              jsonString = lines.join("\n").trim();
            }

            const parsed = JSON.parse(jsonString);

            if (parsed.session_summary) summary = parsed.session_summary;
            if (parsed.updated_todo_list) updatedTodo = parsed.updated_todo_list;
            if (parsed.updated_known_issues) updatedIssues = parsed.updated_known_issues;
            if (parsed.updated_strategic_context) updatedStrategic = parsed.updated_strategic_context;

            console.error('LLM synthesis completed successfully.');
          } catch (llmError) {
            console.error('Error invoking or parsing LLM model response. Falling back to local logging:', llmError);
            summary = `Session ended. Raw activity: ${raw_activity_log.slice(0, 200)}...`;
          }
        } else if (!preSummary) {
          summary = `Session ended. Raw activity: ${raw_activity_log.slice(0, 200)}...`;
        }

        // Write changes back to MariaDB
        // 1. Update session summary and end time
        await pool.query(
          "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, summary = ? WHERE id = ?",
          [summary, session_id]
        );

        // 2. Update workspace context
        await pool.query(
          "UPDATE workspace_context SET strategic_context = ?, todo_list = ?, known_issues = ? WHERE workspace_path = ?",
          [updatedStrategic, updatedTodo, updatedIssues, workspace_path]
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                session_summary: summary,
                workspace_updates: {
                  todo_list: updatedTodo,
                  known_issues: updatedIssues,
                  strategic_context: updatedStrategic
                }
              }, null, 2),
            },
          ],
        };
      }

      case "memory_search_history": {
        const { workspace_path, query, limit = 10 } = args;

        const wildQuery = `%${query}%`;
        
        // Search shards and session summaries
        const [shardRows] = await pool.query(
          `SELECT 'note' AS source, shard_type AS subtype, content, created_at, file_path 
           FROM shards 
           WHERE workspace_path = ? AND (content LIKE ? OR file_path LIKE ?) 
           ORDER BY created_at DESC LIMIT ?`,
          [workspace_path, wildQuery, wildQuery, limit]
        );

        const [sessionRows] = await pool.query(
          `SELECT 'session' AS source, id AS subtype, summary AS content, started_at AS created_at, NULL AS file_path 
           FROM sessions 
           WHERE workspace_path = ? AND summary LIKE ? 
           ORDER BY started_at DESC LIMIT ?`,
          [workspace_path, wildQuery, limit]
        );

        // Merge and sort results
        const merged = [...shardRows, ...sessionRows]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ query, results: merged }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    console.error(`Error in tool execution (${name}):`, error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message }),
        },
      ],
    };
  }
});

// Start transport listener
const transport = new StdioServerTransport();
initializeDatabase()
  .then(() => {
    return server.connect(transport);
  })
  .then(() => {
    console.error("Antigravity Remote SQL Memory MCP Server running on stdio transport");
  })
  .catch((err) => {
    console.error("Fatal error starting MCP Server:", err);
    process.exit(1);
  });
