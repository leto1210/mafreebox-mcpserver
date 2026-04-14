# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Build**: `npm run build` — compiles TypeScript (`src/`) to `dist/`
- **Dev**: `npm run dev` — tsx watch mode (auto-recompile on save)
- **Start**: `npm start` — runs `node dist/index.js` (production)
- **Test**: `npm test` — no-op placeholder (no test suite yet)
- No linting configured (no ESLint/Prettier)

## Architecture

MCP (Model Context Protocol) server that bridges Claude Desktop to a **Freebox** (French ISP router) via its local HTTP REST API.

```
Claude Desktop → (MCP stdio) → Node.js process → (HTTP) → Freebox OS API v8+
```

### Two-file source structure
- **`src/index.ts`** — MCP server entry point: defines 29 tools with JSON schemas, handles `ListTools`/`CallTool` requests, delegates all logic to `FreeboxClient`. All tool responses use a `safe()` error wrapper.
- **`src/freeboxClient.ts`** — Freebox API client: auth flow, session management, 25+ endpoint methods. `ensureSession()` is called before every API request.

### Auth flow (HMAC-SHA1)
1. `freebox_authorize` → POST to Freebox, user presses `>` on LCD panel → stores `app_token` in `freebox_token.json`
2. `freebox_check_authorization` → poll until approved
3. Every subsequent call → `openSession()`: GET challenge → POST `HMAC-SHA1(app_token, challenge)` → receive `session_token` → set `X-Fbx-App-Auth` header

Token file location: `$FREEBOX_TOKEN_FILE` (default: `dist/../freebox_token.json`; Docker: `/app/data/freebox_token.json`)

### Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `FREEBOX_HOST` | `mafreebox.freebox.fr` | Freebox hostname |
| `FREEBOX_APP_ID` | `fr.freebox.mcp` | App identifier for auth |
| `FREEBOX_TOKEN_FILE` | `dist/../freebox_token.json` | Token persistence path |
| `DEBUG` | unset | Set to `1` for verbose stderr logs |

### Docker
Multi-stage Alpine build. Token persisted in volume `/app/data` (owned by `node` user before `VOLUME` declaration). `--ignore-scripts` on all `npm ci` calls to skip the `prepare` hook.

### MCP protocol note
Communication is over **stdio**. Claude Desktop spawns the process as a child. All debug logs must go to **stderr** only — stdout is reserved for the MCP protocol.

---

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items  
2. **Verify Plan**: Check in before starting implementation  
3. **Track Progress**: Mark items complete as you go  
4. **Explain Changes**: High-level summary at each step  
5. **Document Results**: Add review section to `tasks/todo.md`  
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections  

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
