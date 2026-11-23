// View links: parse/build explorer URLs. Plain browser JS; also CommonJS.
(function (root) {
  var KEYS = ['thr', 'tab', 'cluster', 'tract', 'topic', 'section', 'map', 'hemi', 'view', 'atlas'];
  var ENUMS = {
    tab: ['cluster', 'tract', 'matrix'],
    section: ['map', 'topics', 'charts', 'networks'],
    map: ['both', 'RAS', 'LPI', 'bytract'],
    hemi: ['both', 'lh', 'rh'],
    view: ['dorsal', 'ventral', 'anterior', 'posterior', 'lateral-left', 'lateral-right', 'medial-left', 'medial-right']
  };
  var ID_RE = /^[A-Za-z0-9_]+$/;

  function resolveThreshold(x, cfg) {
    if (x == null || !cfg || !cfg.thresholds) return null;
    x = String(x).trim();
    if (!x) return null;
    var entries = Object.keys(cfg.thresholds).map(function (k) { return cfg.thresholds[k]; });
    var def = cfg.thresholds[cfg.defaultThreshold];
    if (x === 'default') return def ? def.folder : null;
    for (var i = 0; i < entries.length; i++) if (entries[i].folder === x) return x;
    if (!/^\d*\.?\d+$/.test(x)) return null;
    var n = Number(x);
    if (def && Number(def.value) === n) return def.folder;
    for (var j = 0; j < entries.length; j++) if (Number(entries[j].value) === n) return entries[j].folder;
    return null;
  }

  function posInt(s) { return /^[1-9]\d*$/.test(s) ? Number(s) : null; }

  function parse(search, hash, cfg) {
    var q = new URLSearchParams(search || '');
    var out = {};
    var v;
    if (q.has('thr') && (v = resolveThreshold(q.get('thr'), cfg)) !== null) out.thr = v;
    ['tab', 'section', 'map', 'hemi', 'view'].forEach(function (k) {
      if (q.has(k) && ENUMS[k].indexOf(q.get(k)) >= 0) out[k] = q.get(k);
    });
    ['cluster', 'topic'].forEach(function (k) {
      if (q.has(k) && (v = posInt(q.get(k))) !== null) out[k] = v;
    });
    ['tract', 'atlas'].forEach(function (k) {
      if (q.has(k) && ID_RE.test(q.get(k))) out[k] = q.get(k);
    });
    var h = String(hash || '').replace(/^#/, '');
    if (!out.tab && ENUMS.tab.indexOf(h) >= 0) out.tab = h;
    var ordered = {};
    KEYS.forEach(function (k) { if (k in out) ordered[k] = out[k]; });
    return ordered;
  }

  function toQuery(p) {
    var q = new URLSearchParams();
    KEYS.forEach(function (k) {
      if (p && p[k] !== undefined && p[k] !== null && p[k] !== '') q.set(k, String(p[k]));
    });
    var s = q.toString();
    return s ? '?' + s : '';
  }

  function fromUrl(url, baseUrl, cfg) {
    var u, b;
    try { u = new URL(url, baseUrl); b = new URL(baseUrl); } catch (e) { return null; }
    if (u.origin !== b.origin) return null;
    if (!/explorer\.html$/.test(u.pathname) || u.pathname !== b.pathname) return null;
    return parse(u.search, u.hash, cfg);
  }

  var TEView = { KEYS: KEYS, parse: parse, toQuery: toQuery, fromUrl: fromUrl, resolveThreshold: resolveThreshold };
  if (typeof module !== 'undefined' && module.exports) module.exports = TEView;
  else root.TEView = TEView;
})(typeof window !== 'undefined' ? window : this);
