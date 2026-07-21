// Path routes for Observatory instruments.
// Each section has a stable URL so it can be bookmarked and shared.

export const ROUTES = [
  { mode: 'spm', path: '/spm', title: 'Observatory · SPM Mooring', aliases: ['/mooring'] },
  { mode: 'solar', path: '/', title: 'Observatory · Solar System', aliases: ['/solar'] },
  { mode: 'math', path: '/equation', title: 'Observatory · Equation Lab', aliases: ['/math', '/equations'] },
  { mode: 'earth', path: '/earth', title: 'Observatory · Earth Lab', aliases: [] },
  { mode: 'light', path: '/light', title: 'Observatory · Light Lab', aliases: ['/optics'] },
  { mode: 'gravity', path: '/gravity', title: 'Observatory · Gravity Lab', aliases: [] },
  { mode: 'photo', path: '/photo', title: 'Observatory · Photo Lab', aliases: ['/photosynthesis', '/photoelectric'] },
  { mode: 'fractal', path: '/fractals', title: 'Observatory · Fractals Lab', aliases: ['/fractal'] },
];

const byMode = Object.fromEntries(ROUTES.map((r) => [r.mode, r]));
const byPath = new Map();
for (const r of ROUTES) {
  byPath.set(r.path, r.mode);
  for (const a of r.aliases) byPath.set(a, r.mode);
}

export function pathForMode(mode) {
  return (byMode[mode] || byMode.solar).path;
}

export function titleForMode(mode) {
  return (byMode[mode] || byMode.solar).title;
}

export function modeFromLocation(loc = window.location) {
  // Hash (#/equation or #photo) wins when present so old and shared links still work
  const hash = (loc.hash || '').replace(/^#\/?/, '');
  if (hash) {
    const hp = '/' + hash.replace(/^\/+/, '');
    if (byPath.has(hp)) return byPath.get(hp);
    if (byMode[hash]) return hash;
  }

  let raw = (loc.pathname || '/').replace(/\/+$/, '') || '/';
  if (raw === '') raw = '/';
  if (byPath.has(raw)) return byPath.get(raw);
  return 'solar';
}

export function syncUrl(mode, { replace = false } = {}) {
  const route = byMode[mode] || byMode.solar;
  const url = route.path + window.location.search;
  const state = { mode: route.mode };
  if (replace) window.history.replaceState(state, '', url);
  else {
    const cur = window.location.pathname.replace(/\/+$/, '') || '/';
    if (cur === route.path) {
      window.history.replaceState(state, '', url);
    } else {
      window.history.pushState(state, '', url);
    }
  }
  document.title = route.title;
}

export function bindPopState(onMode) {
  window.addEventListener('popstate', (e) => {
    const mode = (e.state && e.state.mode) || modeFromLocation();
    onMode(mode);
  });
}
