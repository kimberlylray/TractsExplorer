# TractsExplorer + SKAI — design

Date: 2026-11-20 · Status: draft for review

## Intent

Let a researcher ask **SKAI** (brainlife.io's AI assistant) questions about the
tract endpoint decoding results and see each answer **in TractsExplorer**,
side by side with the chat — the way the Allen Institute's ABC Atlas puts its
assistant on the left and the atlas on the right
(https://knowledge.brain-map.org/abcatlas).

Example: "Which tracts decode most strongly to language topics?" → SKAI
answers in the left panel with the ranked tracts, and the explorer on the
right opens the top tract, its topics and its brain map.

TractsExplorer stays its **own deployment**, outside SKAI, at
**brainlife.io/tractexplorer** (deployed later by Franco). It is public and
works without SKAI; the SKAI panel appears once the user is logged in to
brainlife.io.

## Goals

1. **Every view has a link.** The explorer can open any view from its URL
   (threshold, tab, cluster, tract, topic, brain settings, network atlas),
   and keeps the address bar in sync as the user clicks.
2. **A small Python backend** that serves the explorer and a read-only JSON
   API over the published results, usable by SKAI or any other agent/script.
3. **A SKAI side panel in the explorer.** Logged-in brainlife users get a
   collapsible SKAI chat on the left; SKAI's answers move the explorer on the
   right. Logged-out visitors get the explorer full width plus a
   "Log in to ask SKAI" button.
4. **A SKAI tool server** (MCP) wrapping the API, so SKAI can look up the
   results (and also answer in SKAI's own chat on brainlife.io, returning an
   explorer link).
5. **Two pull requests:** this repo (`francopestilli/TractsExplorer`) and
   SKAI (`brainlife/brainlife-assistant`). The SKAI PR must be small, kind and
   easy for a human to read.

## Non-goals

- Changes to SKAI's chat front end, agent core, prompts or login rules.
- Anonymous (logged-out) use of SKAI.
- Deploying to brainlife.io (Franco does this later).
- Recomputing decoding, clustering or network correspondence on the server.
  The API only reads the published CSV/JSON files.
- A compact "embed inside SKAI's chat" mode (not needed with the side panel).

## Anti-goals (would be a failure even if it "works")

- Breaking the current static site: `explorer.html` must still work from a
  plain file server / GitHub Pages, including `#cluster`, `#tract`, `#matrix`
  deep links, and must work with SKAI unreachable.
- The API (and so SKAI) giving numbers that differ from what the explorer
  shows for the same threshold/selection.
- A SKAI PR that is large, touches unrelated files, or reads as machine
  boilerplate.
- SKAI changing the explorer to a view it didn't describe in its answer.

## Approaches considered

- **A. View links + data tools for SKAI + SKAI panel in the explorer
  (chosen).** The explorer reads/writes its state in the URL. The backend
  serves data. SKAI's server-side tools look things up; the explorer page
  registers a *client tool* with SKAI so SKAI can move the view in place.
  Uses only mechanisms SKAI already has.
- **B. Explorer shown inside SKAI's own chat page on brainlife.io.** Needs a
  change to SKAI's chat front end (not in our hands, larger PR). Rejected
  for now; the view links from A make it easy later.
- **C. One live explorer steered over a server-side WebSocket session.**
  Unneeded: with the panel in the same page, the link between chat and view
  is automatic.

Franco chose **A**, with the ABC Atlas-style side-by-side layout.

## How SKAI connects (as found in `brainlife-assistant/api`)

- Web clients talk to SKAI over a WebSocket (`api/websocket.py`), authorised
  by a short-lived ticket fetched with the user's brainlife JWT
  (`api/ticket.py`, `api/auth.py`). Allowed page origins come from the
  `WHITELISTED_ORIGINS` setting.
- Sessions are created/listed via `api/session.py`.
- A client sends `CLIENT_CAPABILITIES` (`{platform, tools: [...]}`); SKAI
  stores them per session (`set_client_tools`) and, when it decides to use
  one, emits a `CLIENT_TOOL` message to the page (`agents/agent.py`).
- SKAI's system prompt already tells it to open viewable URLs with a client
  tool (`agents/react/prompts/__init__.py`).

The builder must confirm exact message shapes (ticket route, SUBSCRIBE /
message payloads, `ClientToolSpec` fields in `llm_integration.py`) from that
code and, where unclear, from a local SKAI (`docker-compose.yml`).

## Design

### 1. View links (frontend: `viewer.js`, `explorer.html`)

Query parameters on `explorer.html` (all optional; invalid values are
ignored and fall back to today's defaults):

| param    | meaning                                      | example     |
|----------|----------------------------------------------|-------------|
| `thr`    | threshold folder                             | `thr-15`    |
| `tab`    | `cluster` \| `tract` \| `matrix`             | `tract`     |
| `cluster`| cluster number (as shown in the explorer)    | `3`         |
| `tract`  | tract name as in `matrix.csv`                | `leftArc`   |
| `topic`  | topic id (number) — opens the topic panel    | `42`        |
| `section`| `map` \| `topics` \| `charts` \| `networks`  | `networks`  |
| `map`    | `both` \| `RAS` \| `LPI` \| `bytract`        | `both`      |
| `hemi`   | `both` \| `lh` \| `rh`                       | `lh`        |
| `view`   | camera preset id from `brainViews`           | `lateral`   |
| `atlas`  | network atlas code                           | `TY7`       |

- `thr` uses the folder name (stable), not the dropdown label.
- Existing `#cluster|#tract|#matrix` hashes keep working; query params win.
- The URL stays in sync via `history.replaceState` (no new history entries).
- The same state can be applied without a reload through one function
  (e.g. `applyView(params)`), used by both URL loading and the SKAI panel.

### 2. Shared config

Move the threshold list (inline in `explorer.html` today) to `config.json`
at the repo root, read by both the explorer and the backend, so they never
disagree about thresholds, folders, labels or cuts.

**Thresholds are selectable everywhere** (Franco): every API endpoint, every
SKAI tool and every view link takes a threshold. When none is given, the
default is **the same as the website's: 0.15 full, `thr-15`** (46 tracts in
the tree, 4 clusters), read from `defaultThreshold` in `config.json` — one
setting drives the site, the API and SKAI. The fixed 43-tract set
(`thr-15_5clusters`, 5 clusters) and the other thresholds are chosen by
passing them explicitly; `GET /api/thresholds` lists them all, and every
response says which threshold it used.

### 3. Backend (`server/`, Python)

- **FastAPI + uvicorn** in `server/` with its own requirements — Python like
  the repo's scripts and SKAI.
- Serves the static site at the root and the API under `/api`.
- Works under a path prefix (`ROOT_PATH=/tractexplorer`); the explorer uses
  relative URLs so it works at any prefix.
- `PUBLIC_URL` (e.g. `https://brainlife.io/tractexplorer`) builds the
  absolute `view_url` links returned to agents.
- Read-only; loads CSVs per threshold on first use and caches them.

**Cluster numbering:** the backend uses `cluster-assignments_joint.csv`. A
pre-check re-ran the explorer's live clustering in Python and it matches for
all five folders; keep that as a test so future data can't drift.

**Endpoints** (JSON; anything naming a view includes `view_url`). `{thr}`
accepts a folder (`thr-15`), a value (`0.15`) or `default`; every response
echoes the resolved threshold:

| endpoint | returns |
|---|---|
| `GET /api/thresholds` | folder, label, tract count, cluster count, default flag |
| `GET /api/{thr}/clusters` | number, member tracts, top 5 topics |
| `GET /api/{thr}/clusters/{n}` | members, top topics (r), network correspondence (`?atlas=`) |
| `GET /api/{thr}/tracts?q=` | tracts filtered by name/readable label |
| `GET /api/{thr}/tracts/{tract}` | cluster, top topics joint / RAS / LPI, network correspondence |
| `GET /api/topics?q=` | topics whose label or LDA terms match (from `topic-terms.json`) |
| `GET /api/{thr}/topics/{id}/tracts` | tracts ranked by r for that topic |
| `GET /api/{thr}/networks?entity=tract:leftArc&atlas=TY7` | Dice, p, max Dice, significance |
| `GET /api/view-url?...` | builds an explorer link from the §1 params |

Defaults: top-N = 10; topic labels use "functional terms only" like the
explorer. Errors are JSON `{error, hint}` with an actionable hint ("unknown
tract 'arcuate'; did you mean leftArc, rightArc?").

**Tests:** pytest per endpoint against `testdata/`, the cluster-numbering
check, and `view_url` round-trip.

### 4. SKAI panel (frontend, in this repo)

- Layout like the ABC Atlas: SKAI panel on the left (~360 px, collapsible),
  explorer on the right. On narrow screens the panel becomes a drawer.
- **Logged out:** explorer full width + "Log in to ask SKAI" button
  (brainlife.io login, returning to the same view).
- **Logged in:** welcome line, 3–5 starter questions about this dataset, chat
  history, input box. Messages rendered as markdown, safely (no raw HTML).
- Connects to SKAI (`SKAI_URL` in `config.json`) using the user's brainlife
  login → ticket → WebSocket, creates/uses a SKAI session (so the chat also
  shows in the user's SKAI history on brainlife.io), and sends
  `CLIENT_CAPABILITIES` with platform `tractexplorer` and one client tool:
  `show_in_explorer` — arguments are the §1 view params (or a `view_url`);
  the page validates them and calls `applyView`.
- Also sends a short context message telling SKAI what the user is currently
  looking at (threshold, tab, selection), so "this tract" works.
- If SKAI is unreachable or errors, the panel says so plainly; the explorer is
  unaffected.
- New code in its own file (e.g. `skai-panel.js`), loaded only by
  `explorer.html`; no build step.

How the page obtains the brainlife JWT on brainlife.io (same domain) is to be
confirmed during building; for local development, a JWT can be pasted into a
dev-only setting.

### 5. SKAI tool server (PR to `brainlife/brainlife-assistant`)

Follows SKAI's existing pattern exactly:

- `api/assistant_api/mcps/tractexplorer/server.py` — stdio MCP server
  (`mcp.server.Server`, like `pubmed`/`clinvar`) calling the TractsExplorer
  API; base URL from `TRACTEXPLORER_URL` (default
  `https://brainlife.io/tractexplorer`). Uses only libraries SKAI already
  installs (`mcp`, `aiohttp`) — no new requirements, no Dockerfile change.
- `api/assistant_api/mcps/tractexplorer/README.md` — what it is, the tools,
  how to try it locally.
- One line in `api/assistant_api/mcps/registry.py`.

**Tools:** `list_thresholds`, `list_clusters`, `get_cluster`, `find_tracts`,
`get_tract`, `search_topics`, `tracts_for_topic`, `network_correspondence`,
`explorer_link`. Every tool takes an optional `threshold` (defaults to the
website's default, 0.15 full). Descriptions are short and say what the numbers are
(Pearson r between a tract's cortical endpoint map and a NeuroQuery LDA
topic; Dice overlap with atlas networks). Results include `view_url`; when
the TractsExplorer panel is the client, SKAI uses `show_in_explorer`,
otherwise its existing "open viewable URLs" behaviour applies.

Unreachable API → a plain, friendly message, not a stack trace.

**PR tone:** short and warm, plain language: what it adds, why (researchers
can explore the tract decoding results by asking SKAI), what it doesn't
touch, how to try it. Opened as a **draft** until brainlife.io/tractexplorer
is live and the origin is added to `WHITELISTED_ORIGINS` (a deployment
setting, noted in the PR, not changed by it).

## Constraints

- Explorer stays Vue 2.7 from CDN, no build step.
- Data files are the published ones in `testdata/` and `assets/`.
- SKAI conventions: Python, `mcp` package, one folder per server, stdio.

## Left to the builder

- Panel visual details within the layout above.
- Internal structure of `server/`, caching.
- Tool argument and response field names, if consistent and documented.
- Whether to add a Dockerfile for later deployment.

## SKAI round trip — findings (2026-11-20)

Docker is not available here, so SKAI was not run. These findings come from reading the SKAI code (`brainlife-assistant/api/assistant_api`), not from a live test.

**(a) Registering and calling a client tool.** The client sends a `CLIENT_CAPABILITIES` message with `{tools, platform}` (`agents/react/agent.py:225`), which calls `set_client_tools` (`agents/react/llm_integration.py:182`). Entries are validated against `ClientToolSpec` (`llm_integration.py:86`); bad ones are dropped, not raised. When the model calls such a tool, the result carries a `__client_tool__` marker (`llm_integration.py:32-80`). The action phase turns that into a `CLIENT_TOOL` event with tool, platform and arguments (`agents/react/phases/action.py:541`). `ingest` forwards it to the frontend but does not store it (`agents/agent.py:164`).

**(b) The loop parks after CLIENT_TOOL.** After emitting the event, the ReAct loop saves its state in `_pending_resume` and stops (`agents/react/llm_agent.py:385-401`). It resumes only when the client sends a `TOOL_CALL` (`agent.py:231`). `process_tool_call` (`llm_agent.py:506`) runs that tool server-side through `mcp_integration.execute_tool_call`, so it must be a real MCP tool. A display-only page action such as `show_in_explorer` has no MCP implementation. The client cannot send a "done" reply, so the resume path is unclear and the answer may never finish.

**(c) Without a client tool, SKAI falls back to a plain URL.** The prompt says to open viewable URLs with a client tool, and to fall back to a plain URL "when no client tool can display it" (`agents/react/prompts/__init__.py:61`). With no tool registered, SKAI puts the explorer link in its text answer, and the panel (`skai-panel.js`) applies it. That is the mechanism now.

**(d) Decision.** Link-following is the mechanism for now. We register no client tool and change no JS. A dedicated `show_in_explorer` action needs a live test against a running SKAI, and possibly a small SKAI change so display-only client tools can complete. To try next time:
1. Run SKAI (docker compose) and connect the panel to it.
2. Send `CLIENT_CAPABILITIES` with a `show_in_explorer` tool and ask a question that yields an explorer link.
3. Check that `CLIENT_TOOL` arrives with the arguments, and that the panel can apply it.
4. Check what the panel must send back. Try a `TOOL_CALL` with a no-op MCP tool, and check whether the loop ends and the answer finishes.
5. If it hangs, propose a SKAI change: a display-only flag on `ClientToolSpec` that does not park the loop.
6. Confirm the plain-URL fallback still works when no client tool is registered.

**Uncertainties.** I did not trace what `ClientToolSpec` requires (fields, naming rules). I do not know whether SKAI times out a parked loop or drops it when a new user message arrives. I did not confirm that the model reliably puts explorer URLs in its answer when no tool is registered. Prompt line 128 (`prompts/__init__.py`) also makes opening URLs "MANDATORY" and was not examined further.
