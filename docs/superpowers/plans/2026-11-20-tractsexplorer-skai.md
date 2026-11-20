# TractsExplorer + SKAI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every TractsExplorer view addressable by link, add a read-only Python data API, add an ABC-Atlas-style SKAI chat panel that drives the explorer, and give SKAI a small tool server for the data.

**Architecture:** A shared `config.json` drives the static explorer and a FastAPI backend that serves the site plus `/api`. A tiny `view-state.js` module (browser + Node) parses/serialises view links; `viewer.js` gains `applyView()` and URL sync. A `skai-panel.js` Vue component talks to SKAI over its existing ticket → WebSocket protocol and applies explorer links found in SKAI's answers. A stdio MCP server in `brainlife-assistant` wraps the API.

**Tech Stack:** Vue 2.7 (CDN, no build), Node 25 `node --test` for pure JS modules, Python 3.11+ / FastAPI / uvicorn / pandas / pytest (backend), `mcp` + `aiohttp` (SKAI server, already in SKAI).

**Spec:** `docs/superpowers/specs/2026-11-20-agent-api-design.md`

## Global Constraints

- Explorer stays Vue 2.7 from CDN, **no build step**; `explorer.html` must keep working from a plain static file server and with SKAI unreachable.
- Existing `#cluster`, `#tract`, `#matrix` deep links keep working; query params win when both present.
- Default threshold everywhere (site, API, SKAI) = `defaultThreshold` in `config.json` = **0.15 full, folder `thr-15`**. Every API response and tool result states the threshold used.
- `{thr}` accepts a folder (`thr-15`), a value (`0.15`) or `default`.
- API is read-only over the published files in `testdata/` and `assets/`; nothing is recomputed except reading CSVs.
- API errors: JSON `{"error": ..., "hint": ...}` with an actionable hint.
- Top-N default = 10.
- SKAI PR: only `api/assistant_api/mcps/tractexplorer/{server.py,README.md,test_server.py}` + one line in `mcps/registry.py`; no new dependencies; opened as **draft**; description short, warm, plain language.
- `TRACTEXPLORER_URL` default `https://brainlife.io/tractexplorer`; backend settings `PUBLIC_URL`, `ROOT_PATH`.
- SKAI panel shown only when a brainlife login is present; otherwise explorer full width + "Log in to ask SKAI".
- SKAI messages rendered as safe markdown (no raw HTML).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. **Tract names typed loosely** ("left arcuate", "arcuate", "Arc") → API suggests close matches in `hint`, never a 500. Test in Task 4.
2. **The two 0.15 sets** → `0.15` resolves to the default `thr-15`; `thr-15_5clusters` only when named; the response says which. Test in Task 4.
3. **A link for a view the threshold can't show** (cluster 7 at a 4-cluster threshold, a tract missing at that threshold, unknown atlas) → explorer ignores the bad part and shows the nearest valid view, no blank page. Test in Task 2 (parse) and manual check in Task 3.
4. **SKAI unreachable / login expired mid-chat** → panel says so plainly with a retry, explorer keeps working. Test in Task 6.
5. **A SKAI answer containing links to other sites or several explorer links** → only links to this explorer are applied, the last one wins, others render as normal links. Test in Task 6.

---

## File Structure

TractsExplorer repo:
- `config.json` (new) — thresholds, data paths, default threshold, SKAI settings. Read by explorer and backend.
- `view-state.js` (new) — `TEView` UMD module: parse/serialise view params. Pure.
- `explorer.html` (modify) — load `config.json`, then mount; load `view-state.js`, `skai-client.js`, `skai-panel.js`; two-pane layout.
- `viewer.js` (modify) — `applyView()`, `currentView` computed, URL sync.
- `skai-client.js` (new) — `TESkai` UMD module: SKAI ticket/session/WebSocket protocol + explorer-link extraction. Pure apart from injected `fetch`/`WebSocket`.
- `skai-panel.js` (new) — Vue component `skai-panel` (UI only).
- `style.css` (modify) — two-pane layout, panel styles.
- `server/app.py`, `server/data.py`, `server/requirements.txt`, `server/tests/` (new) — backend.
- `tests/js/*.test.mjs` (new) — Node tests.
- `README.md` (modify) — API, view links, SKAI panel, running the server.

brainlife-assistant repo (separate branch `tractexplorer-mcp`):
- `api/assistant_api/mcps/tractexplorer/server.py`, `README.md`, `test_server.py` (new); `api/assistant_api/mcps/registry.py` (one line).

---

### Task 1: Shared `config.json`

**Files:**
- Create: `config.json`
- Modify: `explorer.html:26-63` (inline config → fetched)
- Test: `server/tests/test_config.py`

**Interfaces:**
- Produces: `config.json` with keys `dataBase`, `surfMeshBase`, `topicTermsUrl`, `atlasBase` (`"assets/atlases"`), `thresholds` (same label-keyed object as today, each entry gaining `"value": <float>`), `defaultThreshold` (label `"0.15 full (46 in tree)"`), `skai: {"url": "", "loginUrl": "https://brainlife.io/auth/"}`.

- [ ] **Step 1: Write the failing test** `server/tests/test_config.py`:

```python
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]

def test_config_matches_published_folders():
    cfg = json.loads((ROOT / "config.json").read_text())
    folders = {v["folder"] for v in cfg["thresholds"].values()}
    assert folders == {"thr-05", "thr-10", "thr-15", "thr-15_5clusters", "thr-20"}
    assert cfg["thresholds"][cfg["defaultThreshold"]]["folder"] == "thr-15"
    for v in cfg["thresholds"].values():
        assert (ROOT / cfg["dataBase"] / v["folder"] / "matrix.csv").exists()
        assert isinstance(v["value"], float)
```

- [ ] **Step 2: Run** `python3 -m pytest server/tests/test_config.py -v` → FAIL (no `config.json`).
- [ ] **Step 3:** Create `config.json` by moving the object from `explorer.html` verbatim (keep the comments as a `"_comment"` key or in README), adding `value` per threshold (0.05, 0.10, 0.15, 0.15, 0.20), `atlasBase`, `skai`. In `explorer.html`, `fetch('config.json')` then mount the Vue root with it; show the existing `error` slot if the fetch fails.
- [ ] **Step 4: Run** the test → PASS. Serve the repo (`npx serve .`) and open `explorer.html`: it loads exactly as before at 0.15 full.
- [ ] **Step 5: Commit** `git add config.json explorer.html server/tests/test_config.py && git commit -m "Move the explorer's threshold settings into a shared config.json"`

---

### Task 2: `view-state.js` — view links

**Files:**
- Create: `view-state.js`, `tests/js/view-state.test.mjs`

**Interfaces:**
- Produces global `TEView` (and CommonJS export):
  - `TEView.KEYS = ['thr','tab','cluster','tract','topic','section','map','hemi','view','atlas']`
  - `TEView.parse(search: string, hash: string, cfg) -> ViewParams` — `ViewParams` is a plain object with only valid keys present. `cfg` = `{ thresholds: {label: {folder, value, ...}}, defaultThreshold }`. `thr` accepts folder, value string or `default` and is normalised to a folder. `tab` ∈ cluster|tract|matrix; `cluster` positive int; `topic` positive int; `section` ∈ map|topics|charts|networks; `map` ∈ both|RAS|LPI|bytract; `hemi` ∈ both|lh|rh; `view` ∈ the 8 `brainViews` ids (`dorsal, ventral, anterior, posterior, lateral-left, lateral-right, medial-left, medial-right`); `tract`, `atlas` = non-empty strings matching `/^[A-Za-z0-9_]+$/` (checked against data later by `applyView`). Hash `#cluster|#tract|#matrix` sets `tab` only if the query has none.
  - `TEView.toQuery(p: ViewParams) -> string` — `?`-prefixed, keys in `KEYS` order, omits empty; `''` for `{}`.
  - `TEView.fromUrl(url: string, baseUrl: string, cfg) -> ViewParams | null` — `null` unless `url` resolves to the same origin and path ending `explorer.html` as `baseUrl`.
  - `TEView.resolveThreshold(x, cfg) -> folder | null` (shared with parse; `"0.15"` → default's folder if the default has that value, else first match).

- [ ] **Step 1: Write failing tests** in `tests/js/view-state.test.mjs` (load via `createRequire`), with a `cfg` fixture copied from `config.json`:
  - `parse('?thr=0.15&tab=tract&tract=leftArc','',cfg)` → `{thr:'thr-15',tab:'tract',tract:'leftArc'}`
  - `parse('?thr=thr-15_5clusters','',cfg).thr === 'thr-15_5clusters'`; `parse('?thr=default','',cfg).thr === 'thr-15'`
  - invalid values dropped: `parse('?thr=0.99&cluster=-2&view=sideways&tract=<b>','',cfg)` → `{}`
  - hash: `parse('', '#matrix', cfg)` → `{tab:'matrix'}`; `parse('?tab=tract', '#matrix', cfg).tab === 'tract'`
  - round trip: for `p = {thr:'thr-10',tab:'cluster',cluster:3,section:'networks',atlas:'TY7',view:'lateral-left'}`, `parse(toQuery(p),'',cfg)` deep-equals `p`
  - `fromUrl('https://brainlife.io/tractexplorer/explorer.html?cluster=2', 'https://brainlife.io/tractexplorer/explorer.html', cfg)` → `{cluster:2}`; other origin → `null`; `https://evil.example/explorer.html?cluster=2` → `null`
- [ ] **Step 2: Run** `node --test tests/js/` → FAIL.
- [ ] **Step 3: Implement** `view-state.js` as a UMD IIFE (`typeof module !== 'undefined' ? module.exports = TEView : window.TEView = TEView`), using `URLSearchParams` / `URL`.
- [ ] **Step 4: Run** `node --test tests/js/` → PASS.
- [ ] **Step 5: Commit** `git add view-state.js tests/js && git commit -m "Add view-state.js: parse and build links to any explorer view"`

---

### Task 3: Explorer opens and keeps its view in the URL

**Files:**
- Modify: `viewer.js` (`mounted` at ~1186, new method `applyView`, new computed `currentView`, watcher), `explorer.html` (script tag for `view-state.js` before `viewer.js`)

**Interfaces:**
- Consumes: `TEView.parse`, `TEView.toQuery` (Task 2).
- Produces on the viewer component: `applyView(p: ViewParams): Promise<void>` and computed `currentView: ViewParams`. The SKAI panel (Task 6) reaches the component via `window.teExplorer` (set in `mounted`).

- [ ] **Step 1: Implement `applyView(p)`** in `viewer.js` methods. Order matters: if `p.thr` differs from the current folder, set `selectedThreshold` to the matching label, call `onThresholdChange()` and await data load (resolve when `loading` turns false — add a `_whenLoaded()` helper returning a Promise). Then: `tract` → `selectTractAndSwitch` if the tract exists in `tractOrder`, else ignore; `cluster` → `selectCluster` if it exists in `clusters`, else ignore; `tab` → `showTractView`/`showClusterView`/`tab='matrix'`; `topic` → find the column in `topics` whose id prefix (`/^(\d+)_/`) equals it and `openTopic`; `map`/`hemi` → `brain.mode`/`brain.hemi`; `view` → `setBrainView`; `atlas` → `networkAtlas` if in `networkAtlases`; `section` → `goToSection` (existing, line ~1459). Anything not valid for the loaded data is skipped silently.
- [ ] **Step 2: Implement `currentView`** returning the folder, tab, selections (topic as its numeric id), brain mode/hemi/view, atlas — omitting defaults so links stay short.
- [ ] **Step 3: URL sync.** In `mounted`, replace the hash-only block with `this.applyView(TEView.parse(location.search, location.hash, this.config))` after `loadData()` completes. Watch `currentView` (deep) → `history.replaceState(null, '', location.pathname + TEView.toQuery(v))`, skipped while `loading`. Keep the "no tour when arriving via link" rule (`readPref('wmc.tourDone')` check at ~1301): also skip the tour when `location.search` is non-empty. Set `window.teExplorer = this`.
- [ ] **Step 4: Verify in a browser** (`npx serve .`, Playwright or by hand). Each must hold:
  - `explorer.html?thr=thr-10&cluster=2&section=networks&atlas=TY7` opens 0.10, cluster 2, networks section, TY7.
  - `explorer.html?tab=tract&tract=leftArc&topic=42&view=lateral-left&hemi=lh` opens that tract, topic 42 panel, left lateral view.
  - `explorer.html?cluster=9` at a 4-cluster threshold shows the normal first cluster, no error.
  - `explorer.html#matrix` still opens the matrix.
  - Clicking around updates the address bar; reloading restores the same view; Back button is not polluted.
- [ ] **Step 5: Commit** `git add viewer.js explorer.html && git commit -m "Open any view from its link and keep the address bar in sync"`

---

### Task 4: Backend data layer

**Files:**
- Create: `server/requirements.txt` (`fastapi`, `uvicorn[standard]`, `pandas`, `httpx`, `pytest`, `scipy`), `server/data.py`, `server/tests/test_data.py`

**Interfaces:**
- Produces class `Repository(root: Path)` in `server/data.py`:
  - `thresholds() -> list[dict]` — `{id: folder, label, value, default: bool, tracts: int, clusters: int}`
  - `resolve_threshold(x: str | None) -> str` — folder; `None`/`"default"` → default; raises `NotFound(error, hint)` listing valid ids.
  - `clusters(thr) -> list[dict]` — `{cluster: int, tracts: [str], top_topics: [Topic]}` (top 5, from `cluster-matrix.csv`)
  - `cluster(thr, n, atlas=None, limit=10) -> dict` — members, `top_topics`, `networks` (list of `Network`)
  - `find_tracts(thr, q: str) -> list[dict]` — `{tract, label, cluster}`; match case-insensitive on raw name and readable label (port `tractLabel`, `viewer.js:71`)
  - `tract(thr, name, atlas=None, limit=10) -> dict` — `cluster`, `top_topics: {joint, RAS, LPI}`, `networks`
  - `search_topics(q: str) -> list[dict]` — `{id: int, label, terms: [str]}` over `topic-terms.json` terms and topic column names
  - `tracts_for_topic(thr, topic_id: int, limit=10) -> list[dict]` — `{tract, r, cluster}` sorted desc
  - `networks(thr, entity_type: 'tract'|'cluster', entity_id: str, atlas=None) -> list[Network]`
  - `Topic = {id: int, label: str, r: float}`; label = port of the explorer's functional-terms labelling (`topicLabel`, `viewer.js:43`, and `chartTermSets`, `viewer.js:981`) so labels match what users see.
  - `Network = {name, dice, max_dice, p_value, significant: p<0.05}` sorted by dice desc; `atlas=None` → first atlas in the CSV for that threshold; unknown atlas → `NotFound` with the available codes.
  - `NotFound(Exception)` with `.error`, `.hint`; unknown tract hint = up to 3 `difflib.get_close_matches` over names and labels, plus substring matches.
  - Caches each threshold's frames on first use.

- [ ] **Step 1: Write failing tests** `server/tests/test_data.py` (fixture `repo = Repository(ROOT)`):
  - `resolve_threshold(None) == resolve_threshold("default") == resolve_threshold("0.15") == "thr-15"`; `resolve_threshold("thr-15_5clusters") == "thr-15_5clusters"`; `resolve_threshold("0.99")` raises `NotFound` whose hint contains `"thr-10"`.
  - `len(repo.clusters("thr-15")) == 4`, `len(repo.clusters("thr-15_5clusters")) == 5`.
  - **Cluster numbering:** for every folder, recompute with scipy (`matrix.csv`, drop rows with NaN, distance `1 - pearson r` via `pdist(..., 'correlation')`, `linkage(method='complete')`, `fcluster(t=cut, criterion='distance')` with `cut` from config) and assert equal to `cluster-assignments_joint.csv`.
  - `repo.tract("thr-15","leftArc")["cluster"]` equals the CSV assignment; `top_topics["joint"]` has 10 items sorted by `r` desc.
  - `repo.tract("thr-15","arcuate")` raises `NotFound` whose hint mentions `leftArc`.
  - `repo.find_tracts("thr-15","arc")` includes `leftArc` and `rightArc`.
  - `repo.networks("thr-15","tract","leftArc","TY7")` non-empty, each `max_dice >= dice`; `atlas="NOPE"` raises with `"TY7"` in hint.
  - `repo.search_topics("language")` non-empty; `repo.tracts_for_topic("thr-15", <first id from that>)` sorted desc by `r`.
- [ ] **Step 2: Run** `python3 -m pip install -r server/requirements.txt && python3 -m pytest server/tests -v` → FAIL.
- [ ] **Step 3: Implement** `server/data.py`.
- [ ] **Step 4: Run** → PASS. If the cluster-numbering test fails for any folder, stop and report (spec anti-goal).
- [ ] **Step 5: Commit** `git add server && git commit -m "Add a read-only data layer over the published decoding results"`

---

### Task 5: Backend HTTP API and static site

**Files:**
- Create: `server/app.py`, `server/tests/test_api.py`

**Interfaces:**
- Consumes: `Repository`, `NotFound` (Task 4); `TEView` param names (Task 2).
- Produces: `create_app(root: Path, public_url: str, root_path: str = "") -> FastAPI` and module-level `app` built from env `TE_ROOT` (default repo root), `PUBLIC_URL` (default `http://localhost:8000`), `ROOT_PATH` (default `""`). Run: `uvicorn app:app --app-dir server`.
- Routes exactly as the spec table (`/api/thresholds`, `/api/{thr}/clusters`, `/api/{thr}/clusters/{n}`, `/api/{thr}/tracts?q=`, `/api/{thr}/tracts/{tract}`, `/api/topics?q=`, `/api/{thr}/topics/{id}/tracts`, `/api/{thr}/networks?entity=tract:leftArc&atlas=TY7`, `/api/view-url?...`). Query `limit` (1–50, default 10), `atlas`. Every JSON body has `"threshold": {"id", "label"}` (except `/api/thresholds`, `/api/topics`) and, where it names a view, `"view_url"` = `public_url + "/explorer.html" + toQuery(...)` (Python port of `toQuery`, same key order).
- `NotFound` → HTTP 404 `{"error","hint"}`; validation errors → 400 same shape.
- Static: mount the repo root at `/` (`StaticFiles(html=True)`), but only serve `index.html`, `explorer.html`, `*.js`, `*.css`, `config.json`, `assets/`, `testdata/` — never `server/`, `scripts/`, `docs/`, `.git`.
- CORS: allow GET from any origin (read-only public data).

- [ ] **Step 1: Write failing tests** with `fastapi.testclient.TestClient(create_app(ROOT, "https://x.test/te"))`:
  - `/api/thresholds` → 5 items, exactly one `default: true` with `id == "thr-15"`.
  - `/api/0.15/clusters` → `threshold.id == "thr-15"`, 4 clusters, each with `view_url` starting `https://x.test/te/explorer.html?thr=thr-15&tab=cluster&cluster=`.
  - `/api/default/tracts/leftArc?atlas=TY7` → 200, has `top_topics.joint`, `networks`, `view_url`.
  - `/api/thr-15/tracts/arcuate` → 404, `hint` mentions `leftArc`.
  - `/api/view-url?thr=0.10&cluster=2&atlas=TY7` → `{"view_url": ".../explorer.html?thr=thr-10&cluster=2&atlas=TY7"}`; the query part parses back identically with `TEView.parse` semantics (Python port).
  - `/explorer.html` → 200; `/server/app.py` and `/.git/config` → 404.
  - With `root_path="/tractexplorer"`, `/api/thresholds` still works when the request carries that prefix.
- [ ] **Step 2: Run** `python3 -m pytest server/tests -v` → FAIL.
- [ ] **Step 3: Implement** `server/app.py`.
- [ ] **Step 4: Run** → PASS. Then `uvicorn app:app --app-dir server` and open `http://localhost:8000/explorer.html` — the explorer works as on GitHub Pages.
- [ ] **Step 5: Commit** `git add server && git commit -m "Serve the explorer and a JSON API for agents"`

---

### Task 6: SKAI client and side panel

**Files:**
- Create: `skai-client.js`, `skai-panel.js`, `tests/js/skai-client.test.mjs`
- Modify: `explorer.html` (layout wrapper + script tags), `style.css` (layout + panel)

**Interfaces:**
- Consumes: `TEView.fromUrl` (Task 2), `window.teExplorer.applyView` / `.currentView` (Task 3), `config.skai` (Task 1).
- Produces global `TESkai`:
  - `TESkai.getJwt(storage) -> string | null` — `storage.getItem('jwt')` (brainlife.io convention — **confirm on brainlife.io**), else dev key `storage.getItem('tractexplorer.devJwt')`; returns null for missing or expired (`exp` in the JWT payload < now).
  - `TESkai.createClient({skaiUrl, jwt, fetch, WebSocket, sessionName='TractsExplorer'}) -> client` with `connect(): Promise<void>` (GET `{skaiUrl}/ticket` with `Authorization: Bearer jwt` → `{ticket}`; POST `{skaiUrl}/sessions` `{name}` → `{session}` (SKAI reuses the named session); open `ws(s)://…/ws?ticket=`; send `{"sessionId", "message":{"type":"SUBSCRIBE"}}`), `ask(text)` (sends `{"sessionId","message":{"type":"TEXT","content":text}}`), `sendContext(view)` (sends `{"type":"CONTEXT","content":{"platform":"tractexplorer","data":{"view": view}}}`), `onMessage(cb)`, `onStatus(cb)` with statuses `connecting|ready|offline|login`, `close()`. Reconnects with backoff on close; 401/403 → status `login`.
  - `TESkai.explorerLinks(text, baseUrl, cfg) -> ViewParams[]` — every markdown/bare URL in `text` for which `TEView.fromUrl` is non-null, in order.
  - **Confirm** incoming frame shape from `brainlife-assistant/api/assistant_api/api/websocket.py` (`on_message` ~line 124) and `agents/agent.py` (`ingest`) before writing the parser; message types to render: `TEXT` (markdown), `MESSAGE_DEFER` (ignore), react-step/progress types (show as a one-line "thinking…" status), `CLIENT_TOOL` (Task 7).
- Vue component `skai-panel` (props: `config`), rendered in a left column of `explorer.html`:
  - Logged out (`getJwt` null): collapsed rail with "Log in to ask SKAI" → `config.skai.loginUrl` + `?redirect=` current URL.
  - Logged in: header "SKAI" + collapse «; welcome line "Ask about the tract decoding results — answers open here in the explorer."; starter buttons: "Which tracts decode most strongly to language?", "Describe cluster 1 and its top topics", "Show the network overlap of the left arcuate on TY7", "Which topics does this tract decode to?"; message list; input.
  - Markdown: minimal safe renderer (escape HTML first, then links, bold, italics, lists, code) — no `v-html` on unescaped text.
  - On each SKAI `TEXT` answer: `explorerLinks(...)`; if any, `applyView(last)` and show a chip "Showing: <short summary>" that re-applies on click; other links open in a new tab.
  - Before each `ask`, `sendContext(teExplorer.currentView)`.
  - Width 360 px, collapsible; below 900 px it is a drawer over the explorer.
  - `config.skai.url` empty → panel not rendered at all (static GitHub Pages stays unchanged).

- [ ] **Step 1: Write failing tests** `tests/js/skai-client.test.mjs` with fake `fetch`/`WebSocket`:
  - `connect()` calls `/ticket` with the bearer token, then `/sessions` POST, then opens `wss://skai.test/ws?ticket=T` and sends SUBSCRIBE with the session id.
  - `/ticket` 401 → status `login`, no WebSocket opened.
  - WebSocket close → status `offline`, then a reconnect attempt.
  - `ask('hi')` sends the TEXT frame shape above.
  - `explorerLinks('See [cluster 2](https://b.io/te/explorer.html?cluster=2) and https://evil.example/explorer.html?cluster=3 and https://b.io/te/explorer.html?tract=leftArc', 'https://b.io/te/explorer.html', cfg)` → `[{cluster:2},{tract:'leftArc'}]`.
  - `getJwt` with an expired token → `null`.
- [ ] **Step 2: Run** `node --test tests/js/` → FAIL.
- [ ] **Step 3: Implement** `skai-client.js` (UMD, like `view-state.js`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Implement** `skai-panel.js` + layout/CSS. Verify in a browser with `config.skai.url` pointing at a stub (a 30-line local Python WebSocket echo that replies with a TEXT containing an explorer link): logged-out rail; dev JWT → panel; asking a starter question moves the explorer; killing the stub shows "SKAI is offline — retry", explorer still usable; with `skai.url` empty the page looks exactly like before.
- [ ] **Step 6: Commit** `git add skai-client.js skai-panel.js explorer.html style.css tests/js && git commit -m "Add a SKAI side panel that opens its answers in the explorer"`

---

### Task 7: Check SKAI's page-action round trip (spike, then decide)

SKAI pauses its answer after calling a page action (`CLIENT_TOOL`) and resumes on a follow-up `TOOL_CALL` (`agents/react/llm_agent.py:380-400`, `process_tool_call` at 506). It is not yet clear how a display-only action should resume.

- [ ] **Step 1:** Run SKAI locally (`brainlife-assistant/docker-compose.yml`), with the Task 8 server registered and the Task 5 backend running; add `http://localhost:8000` to `WHITELISTED_ORIGINS`.
- [ ] **Step 2:** From the panel, send `CLIENT_CAPABILITIES` `{"platform":"tractexplorer","tools":[{"name":"show_in_explorer","description":"Open a view in the TractsExplorer next to this chat. Pass view_url from a tractexplorer tool result.","arguments":{"view_url":"string"}}]}` and ask "Show cluster 2 at threshold 0.10".
- [ ] **Step 3:** Record in `docs/superpowers/specs/2026-11-20-agent-api-design.md` (new section "SKAI round trip — findings") what SKAI sends, and whether replying with a `TOOL_CALL` lets it finish with a text answer.
- [ ] **Step 4: Decide.** If it resumes cleanly: handle `CLIENT_TOOL` `show_in_explorer` in `skai-panel.js` (validate via `TEView.fromUrl`, `applyView`, send the documented reply), add a test in `tests/js/skai-client.test.mjs`. If not: don't register the action — link-following from Task 6 stays the mechanism — and note it for a later SKAI conversation. Either way the panel works.
- [ ] **Step 5: Commit** the findings (and code, if added).

---

### Task 8: SKAI tool server (brainlife-assistant)

Work in `/Users/fp4834/git/brainlife/brainlife-assistant` on a new branch `tractexplorer-mcp` from up-to-date `main`.

**Files:**
- Create: `api/assistant_api/mcps/tractexplorer/server.py`, `README.md`, `test_server.py`
- Modify: `api/assistant_api/mcps/registry.py` (one line after `pubmed`)

**Interfaces:**
- Consumes: the Task 5 HTTP API.
- Produces MCP tools (all take optional `threshold: string` — "folder like thr-15, a value like 0.15, or omit for the website default (0.15, all 46 tracts)"):
  `list_thresholds()`, `list_clusters(threshold)`, `get_cluster(cluster:int, threshold, atlas, limit)`, `find_tracts(query, threshold)`, `get_tract(tract, threshold, atlas, limit)`, `search_topics(query)`, `tracts_for_topic(topic_id:int, threshold, limit)`, `network_correspondence(entity_type, entity_id, threshold, atlas)`, `explorer_link(threshold, tab, cluster, tract, topic, section, map, hemi, view, atlas)`.
  Each returns one `TextContent` holding the API JSON (pretty-printed). Tool descriptions say what r and Dice mean (spec §5) and: "Results include view_url — open it for the user; it shows this view in TractsExplorer."
- Pattern: copy `mcps/pubmed/server.py` structure (`Server("mcp-tractexplorer")`, `@app.list_tools`, `@app.call_tool`, shared `aiohttp` session, stdio `main`). Base URL `TRACTEXPLORER_URL` (default `https://brainlife.io/tractexplorer`).
- API 404 → return the API's `error` + `hint` as text. Connection failure/timeout (10 s) → "TractsExplorer isn't reachable right now (<url>). Please try again later." — never a traceback.
- Registry line: `_server("tractexplorer", "TractsExplorer: white matter tract endpoint decoding results"),`

- [ ] **Step 1: Write failing tests** `test_server.py` following `mcps/clinvar/test_server.py`'s style: patch the HTTP getter; assert `list_tools()` names equal the nine above; `call_tool("get_tract", {"tract":"leftArc"})` requests `/api/default/tracts/leftArc`; `threshold="0.10"` → `/api/0.10/...`; a 404 payload is returned as readable text containing the hint; `aiohttp.ClientConnectorError` → the friendly unreachable message.
- [ ] **Step 2: Run** `cd api && python -m pytest assistant_api/mcps/tractexplorer -v` → FAIL.
- [ ] **Step 3: Implement** `server.py`; add the registry line; write `README.md` (what it is, the tools in one table, run locally: start TractsExplorer with `uvicorn app:app --app-dir server`, set `TRACTEXPLORER_URL=http://localhost:8000`).
- [ ] **Step 4: Run** → PASS; also run SKAI's existing registry/integrator tests (`python -m pytest tests/test_mcp_integrator.py -v`) → PASS.
- [ ] **Step 5: Commit** `git add api/assistant_api/mcps/tractexplorer api/assistant_api/mcps/registry.py && git commit -m "Add a TractsExplorer tool server so SKAI can answer questions about tract decoding"`

---

### Task 9: Docs and pull requests

**Files:**
- Modify: `README.md` (TractsExplorer)

- [ ] **Step 1:** README sections: "View links" (param table), "Running the server" (install, `uvicorn`, env vars `PUBLIC_URL`, `ROOT_PATH`, `TE_ROOT`), "API" (endpoint table, threshold rules), "SKAI panel" (when it shows, `config.skai`, dev JWT key, `WHITELISTED_ORIGINS` note for deployment), "Tests" (`python3 -m pytest server/tests`, `node --test tests/js/`). Fix the stale "Live" link to the new repo name.
- [ ] **Step 2:** Run both test suites → all PASS. Commit `git commit -am "Document view links, the API and the SKAI panel"`.
- [ ] **Step 3:** Push `agent-api` and open the TractsExplorer PR (`gh pr create --repo francopestilli/TractsExplorer`), body: summary, what's new, how to try, test results, deployment notes; ends with the Claude Code line.
- [ ] **Step 4:** Push `tractexplorer-mcp` and open the SKAI PR as **draft** (`gh pr create --draft --repo brainlife/brainlife-assistant`). Body, kind and plain — roughly:

  > Hi! This adds a small tool server so SKAI can answer questions about the white matter tract endpoint decoding results from TractsExplorer (Ray et al.) — e.g. "which tracts relate most to language?" — and point people to the matching view in the explorer.
  >
  > **What's in it:** one new folder, `mcps/tractexplorer/` (server, README, tests), and one line in `registry.py`. It uses only libraries SKAI already has, and doesn't touch the agent, prompts or front end.
  >
  > **Why draft:** it talks to brainlife.io/tractexplorer, which isn't deployed yet. Once it is, we'll also need that origin in `WHITELISTED_ORIGINS` so the explorer's SKAI panel can connect.
  >
  > **Try it:** see `mcps/tractexplorer/README.md`.
  >
  > Thank you for taking a look — happy to change anything!

  Ends with the Claude Code line. Show both PR bodies to Franco before creating them.
