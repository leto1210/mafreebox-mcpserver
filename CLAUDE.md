# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Build**: `npm run build` — compiles TypeScript (`src/`) to `dist/`
- **Dev**: `npm run dev` — tsx watch mode (auto-recompile on save)
- **Start**: `npm start` — runs `node dist/index.js` (production)
- **Test**: `npm test` — runs build + node test runner (14/14 tests passing)
- No linting configured (no ESLint/Prettier)

## Architecture

MCP (Model Context Protocol) server that bridges Claude Desktop to a **Freebox** (French ISP router) via its local HTTP REST API.

```
Claude Desktop → (MCP stdio) → Node.js process → (HTTP) → Freebox OS API v8+
```

### Source Structure (v1.3.0)
- **`src/index.ts`** — MCP server entry point: defines 49 tools with JSON schemas, handles `ListTools`/`CallTool` requests, delegates all logic to `FreeboxClient`. All tool responses use a `safe()` error wrapper.
- **`src/freeboxClient.ts`** — Freebox API client: auth flow, session management, model detection, capability caching, 40+ endpoint methods. `ensureSession()` is called before every API request.
- **`src/freeboxClient.test.ts`** — Comprehensive test suite (14 tests): auth flow, session retry, timeout handling, JSON safety, model detection, caching, Phase 4 features.

### Tool Coverage (49 total)

| Category | Tools | Phase | Features |
|----------|-------|-------|----------|
| Auth | 3 | P1-2 | authorize, check, reset |
| System | 5 | P1-3 | connection, system, capabilities, reboot, stats |
| Network | 2 | P1 | LAN hosts, WoL |
| WiFi | 10 | P1,P4 | get config, toggle, networks, guest networks, APs, stations, planning |
| DHCP | 6 | P1,P4 | config, dynamic, static leases (CRUD) |
| Ports | 3 | P1 | forwarding (get, add, delete) |
| Parental | 1 | P1 | get config |
| VMs | 3 | P1,P3 | get, start, stop (Ultra/Delta only) |
| Calls | 2 | P1 | log, missed |
| Storage | 2 | P1 | storage, freeplug |
| Downloads | 12 | P1,P4 | get, add, pause, resume, delete, delete all, stats, config, trackers, peers, files, priority |
| File Manager | 1 | P1 | list directory |

### Phases Overview

**Phase 1 (v1.1.2 → v1.2.0)**: Request pipeline hardening
- HTTP timeouts (AbortController, configurable via `FREEBOX_REQUEST_TIMEOUT`)
- Safe JSON parsing with fallback
- Automatic session retry on `auth_required`
- Download/add encoding fix (form-urlencoded)

**Phase 2 (v1.2.0 → v1.2.0)**: Auth & permissions
- `freebox_reset_authorization` tool
- Permission error enrichment with actionable messages
- Permission tracking and reuse

**Phase 3 (v1.2.0 → v1.2.0)**: Model detection & capability filtering
- Model detection from `/api_version` (Ultra/Delta/Pop/Revolution/Unknown)
- Capability caching (5-min TTL)
- VM tool masking for incompatible models
- Dynamic tool visibility based on detected model

**Phase 4 (v1.3.0)**: High-value dashboard features
- DHCP static leases (CRUD): 4 tools
- WiFi guest networks (CRUD): 4 tools
- WiFi advanced (APs, stations, planning): 4 tools
- Download stats & details (stats, config, trackers, peers, files, priority): 6 tools

**Phase 5 (v1.3.0)**: Extended test coverage
- 14/14 tests passing (9 existing + 5 Phase 4)
- DHCP, WiFi guest, WiFi advanced, Download stats all tested

### Auth Flow (HMAC-SHA1)
1. `freebox_authorize` → POST to Freebox, user presses `>` on LCD panel → stores `app_token` in token file
2. `freebox_check_authorization` → poll until approved
3. Every subsequent call → `openSession()`: GET challenge → POST `HMAC-SHA1(app_token, challenge)` → receive `session_token` → set `X-Fbx-App-Auth` header

Token file location: `$FREEBOX_TOKEN_FILE` (default: `dist/../freebox_token.json`; Docker: `/app/data/freebox_token.json`)

### Environment Variables
| Variable | Default | Purpose |
|---|---|---|
| `FREEBOX_HOST` | `mafreebox.freebox.fr` | Freebox hostname |
| `FREEBOX_APP_ID` | `fr.freebox.mcp` | App identifier for auth |
| `FREEBOX_TOKEN_FILE` | `dist/../freebox_token.json` | Token persistence path |
| `FREEBOX_REQUEST_TIMEOUT` | `10000` (ms) | HTTP request timeout |
| `DEBUG` | unset | Set to `1` for verbose stderr logs |

### Docker
Multi-stage Alpine build. Token persisted in volume `/app/data` (owned by `node` user). `--ignore-scripts` on all `npm ci` calls. Base image: Node 25-Alpine.

### MCP Protocol Note
Communication is over **stdio**. Claude Desktop spawns the process as a child. All debug logs must go to **stderr** only — stdout is reserved for the MCP protocol.

---

## Development Patterns

### 1. Request Pipeline Safety
All HTTP requests flow through `performRequest()`:
- AbortController timeout
- Safe JSON parsing (parseJsonBody)
- Automatic retry on `auth_required`
- Permission error enrichment
- Structured error responses

### 2. Session Management
- `ensureSession()` called before every authenticated request
- Session token reused across requests in same process
- Token file persisted for process restarts
- Auto-retry with fresh session on expiry

### 3. Model-Aware Tool Visibility
- Capabilities detected once and cached (5 min TTL)
- VM tools hidden for models that don't support them
- Capability detection transparent to callers
- Graceful fallback to "unknown" model on detection failure

### 4. Error Handling
- All tool handlers wrapped in `safe()` (try/catch)
- Permission errors include actionable recovery guidance
- Timeout errors clearly reported with configurable threshold
- Non-JSON responses detected and reported

### 5. Testing Strategy
- Mock fetch responses for all test cases
- Session lifecycle fully tested (auth, token reuse, retry)
- Model detection and caching verified
- Phase features tested before merging
- 14 tests cover core flows + all Phase 4 features

---

## Deployment

**Version**: v1.3.0  
**Status**: Production-ready, zero breaking changes  
**Stability**: All 14 tests passing, comprehensive error handling, auto-retry resilience

Previous releases: v1.2.0 (model detection), v1.1.2 (hardening)

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
