/** Per-point data trace during recording, with expected vs actual summaries. */

function downloadText(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function fmt(x, d = 4) {
  if (x == null || !Number.isFinite(x)) return '';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(3);
  return x.toFixed(d);
}

export function createDataTrace({ sampleHz = 10 } = {}) {
  let active = false;
  let frames = [];
  let meta = null;
  let lastSampleAt = 0;
  let intervalMs = 1000 / sampleHz;

  function start(runMeta = {}) {
    active = true;
    frames = [];
    meta = {
      startedAt: new Date().toISOString(),
      ...runMeta,
    };
    lastSampleAt = 0;
  }

  function push(snapshot) {
    if (!active || !snapshot) return;
    const now = performance.now();
    if (lastSampleAt && now - lastSampleAt < intervalMs) return;
    lastSampleAt = now;
    frames.push({
      wallMs: now,
      t: snapshot.tau ?? snapshot.t ?? null,
      mode: snapshot.mode,
      points: (snapshot.points || []).map((p) => ({
        id: p.id,
        name: p.name,
        t: p.t,
        actual: p.actual ? { ...p.actual } : null,
        expected: p.expected ? { ...p.expected } : null,
        err: p.err,
        extra: p.extra ? { ...p.extra } : null,
      })),
      verify: snapshot.verify || null,
      status: snapshot.status || null,
    });
  }

  function stop() {
    active = false;
    return summarize();
  }

  function isActive() {
    return active;
  }

  function summarize() {
    const first = frames[0];
    const last = frames[frames.length - 1];
    const pointIds = new Map();
    if (last) {
      for (const p of last.points) pointIds.set(p.id, p);
    }

    const results = [];
    for (const [id, end] of pointIds) {
      const startPt = first?.points?.find((p) => p.id === id) || null;
      const series = frames.map((f) => {
        const p = f.points.find((x) => x.id === id);
        return p ? { t: f.t, wallMs: f.wallMs, ...p } : null;
      }).filter(Boolean);

      let meanErr = null;
      const errs = series.map((s) => s.err).filter((e) => Number.isFinite(e));
      if (errs.length) meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;

      results.push({
        id,
        name: end.name,
        start: startPt,
        end,
        samples: series.length,
        meanErr,
        ok: meanErr == null ? null : meanErr < 1e-6 || meanErr < 0.05,
      });
    }

    const verify = last?.verify || null;
    return {
      meta: {
        ...meta,
        endedAt: new Date().toISOString(),
        frames: frames.length,
        durationMs: frames.length > 1
          ? frames[frames.length - 1].wallMs - frames[0].wallMs
          : 0,
      },
      frames,
      results,
      verify,
      finalStatus: last?.status || null,
    };
  }

  function toJSON(report) {
    return JSON.stringify(report, null, 2);
  }

  function toCSV(report) {
    const rows = [['frame', 't', 'point', 'ax', 'ay', 'az', 'ex', 'ey', 'ez', 'err']];
    report.frames.forEach((f, fi) => {
      for (const p of f.points) {
        const a = p.actual || {};
        const e = p.expected || {};
        rows.push([
          fi,
          f.t ?? '',
          p.name || p.id,
          a.x ?? a.r ?? a.vx ?? '',
          a.y ?? a.v ?? a.vy ?? '',
          a.z ?? a.e ?? a.vz ?? '',
          e.x ?? e.r ?? e.vx ?? e.period ?? '',
          e.y ?? e.v ?? e.vy ?? e.a ?? '',
          e.z ?? e.vz ?? e.ax ?? '',
          p.err ?? '',
        ].map(String));
      }
    });
    return rows.map((r) => r.join(',')).join('\n');
  }

  function downloadAll(report, basename) {
    downloadText(toJSON(report), `${basename}-trace.json`, 'application/json');
    downloadText(toCSV(report), `${basename}-trace.csv`, 'text/csv');
  }

  return {
    start,
    push,
    stop,
    isActive,
    summarize,
    toJSON,
    toCSV,
    downloadAll,
    fmt,
  };
}

/** Build a compact HUD description from a lab snapshot. */
export function hudFromSnapshot(snap, recSec, recMaxSec) {
  if (!snap) {
    return { title: 'Observatory', status: '', lines: [], points: [], recSec, recMaxSec };
  }
  const lines = [];
  if (snap.mode === 'math') {
    lines.push(`${snap.name} · ${snap.type}`);
    const ex = snap.exprs || {};
    if (ex.x) lines.push(`x = ${ex.x}`);
    if (ex.y) lines.push(`y = ${ex.y}`);
    if (ex.z) lines.push(`z = ${ex.z}`);
    const ps = snap.params || {};
    const pk = Object.keys(ps);
    if (pk.length) {
      lines.push(pk.map((k) => `${k}=${fmt(ps[k], 3)}`).join('  '));
    }
  } else if (snap.mode === 'gravity') {
    lines.push(snap.name || 'Gravity Lab');
    if (snap.forceLaw) lines.push(snap.forceLaw);
    if (snap.qgLabel) lines.push(`QG: ${snap.qgLabel}`);
  } else if (snap.mode === 'light') {
    lines.push(snap.name || 'Light Lab');
  } else if (snap.mode === 'earth') {
    lines.push(snap.name || 'Earth Lab');
  } else {
    lines.push(snap.name || 'Solar system');
  }
  if (snap.verify) {
    lines.push(`${snap.verify.ok ? 'OK' : 'CHECK'} ${snap.verify.label}: ${snap.verify.value}`);
  }

  const points = (snap.points || []).slice(0, 12).map((p) => {
    const a = p.actual || {};
    let line;
    if (a.x != null) {
      line = `(${fmt(a.x, 3)}, ${fmt(a.y, 3)}, ${fmt(a.z, 3)})`;
      if (p.expected && p.err != null) line += `  err ${fmt(p.err, 3)}`;
    } else if (a.r != null) {
      line = `r=${fmt(a.r, 1)}  v=${fmt(a.v, 2)}  e=${fmt(a.e, 3)}`;
      if (p.expected?.period != null) {
        line += `  T ${fmt(a.period, 1)}/${fmt(p.expected.period, 1)}`;
      }
    } else {
      line = p.extra ? JSON.stringify(p.extra).slice(0, 60) : '-';
    }
    return { name: p.name || p.id, line };
  });

  return {
    title: snap.name || snap.mode || 'Observatory',
    status: snap.status || '',
    lines,
    points,
    recSec,
    recMaxSec,
  };
}
