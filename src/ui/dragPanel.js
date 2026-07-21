// Make a panel float and drag by a handle (title bar).
// Position is remembered in left/top px; right/bottom anchoring is cleared.

export function makePanelDraggable(el, {
  handleSelector = '.list-title, .panel-drag-handle',
  storageKey = null,
} = {}) {
  if (!el || el.dataset.draggable === '1') return;
  el.dataset.draggable = '1';
  el.classList.add('panel-float');

  const handle = el.querySelector(handleSelector) || el;
  handle.classList.add('panel-drag-handle');
  if (!handle.querySelector('.panel-drag-hint')) {
    const hint = document.createElement('span');
    hint.className = 'panel-drag-hint';
    hint.textContent = '⠿ drag';
    hint.title = 'Drag to move this panel';
    handle.appendChild(hint);
  }

  // Restore last position if any
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const { left, top } = JSON.parse(raw);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          applyPos(el, left, top);
        }
      }
    } catch { /* ignore */ }
  }

  let dragging = false;
  let ox = 0, oy = 0;

  const onDown = (e) => {
    // Ignore interactive controls inside the handle
    if (e.target.closest('button, input, select, a, label')) return;
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    el.classList.add('is-dragging');
    const rect = el.getBoundingClientRect();
    // Switch to left/top so drag is stable
    applyPos(el, rect.left, rect.top);
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!dragging) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 8;
    let left = e.clientX - ox;
    let top = e.clientY - oy;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    top = Math.max(pad, Math.min(window.innerHeight - h - pad, top));
    applyPos(el, left, top);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          left: parseFloat(el.style.left) || 0,
          top: parseFloat(el.style.top) || 0,
        }));
      } catch { /* ignore */ }
    }
  };

  handle.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  return () => {
    handle.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
}

function applyPos(el, left, top) {
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
}

/** Floating live description card used while recording (drives overlay HUD box). */
export function createRecDescFloater() {
  let el = document.getElementById('rec-desc-floater');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rec-desc-floater';
    el.className = 'rec-desc-floater hidden';
    el.innerHTML = `
      <div class="rec-desc-head panel-drag-handle">
        <span class="rec-desc-title">Recording description</span>
        <span class="panel-drag-hint">⠿ drag</span>
      </div>
      <div class="rec-desc-body" id="rec-desc-body"></div>
      <div class="rec-desc-note">Drag to place this box in the recorded video</div>`;
    document.body.appendChild(el);
  }

  // Default lower-left-ish
  if (!el.style.left) {
    el.style.left = '24px';
    el.style.top = `${Math.max(120, window.innerHeight - 280)}px`;
  }

  makePanelDraggable(el, {
    handleSelector: '.rec-desc-head',
    storageKey: 'observatory-rec-desc-pos',
  });

  function show() { el.classList.remove('hidden'); }
  function hide() { el.classList.add('hidden'); }

  function setContent(hud) {
    const body = el.querySelector('#rec-desc-body');
    if (!body) return;
    const lines = [];
    if (hud.status) lines.push(hud.status);
    if (hud.lines) lines.push(...hud.lines.filter(Boolean));
    if (hud.points?.length) {
      const maxPts = Math.min(hud.points.length, 8);
      for (let i = 0; i < maxPts; i++) {
        const p = hud.points[i];
        lines.push(`${p.name}: ${p.line}`);
      }
    }
    body.textContent = lines.join('\n') || '…';
  }

  /** Normalized box origin (0..1) for overlay painter, relative to viewport. */
  function getNormPos() {
    const r = el.getBoundingClientRect();
    const vw = Math.max(window.innerWidth, 1);
    const vh = Math.max(window.innerHeight, 1);
    return {
      nx: Math.min(0.92, Math.max(0.02, r.left / vw)),
      ny: Math.min(0.92, Math.max(0.02, r.top / vh)),
    };
  }

  return { el, show, hide, setContent, getNormPos };
}
