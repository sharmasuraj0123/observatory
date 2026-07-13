/** Post-recording results panel: expected vs actual per point + download hooks. */

function fmt(x, d = 4) {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(3);
  return x.toFixed(d);
}

function vecStr(o) {
  if (!o) return 'n/a';
  if (o.x != null) return `(${fmt(o.x, 3)}, ${fmt(o.y, 3)}, ${fmt(o.z, 3)})`;
  if (o.r != null) return `r=${fmt(o.r, 1)} v=${fmt(o.v, 2)} e=${fmt(o.e, 3)}`;
  if (o.period != null) return `T=${fmt(o.period, 2)} a=${fmt(o.a, 1)}`;
  if (o.vx != null) return `v=(${fmt(o.vx, 3)}, ${fmt(o.vy, 3)}, ${fmt(o.vz, 3)})`;
  if (o.ax != null) return `a=(${fmt(o.ax, 3)}, ${fmt(o.ay, 3)}, ${fmt(o.az, 3)})`;
  return JSON.stringify(o).slice(0, 80);
}

export class TraceResultsPanel {
  constructor() {
    this.el = document.getElementById('trace-results');
    this.report = null;
    if (!this.el) return;
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.classList.contains('panel-close')) this.hide();
    });
  }

  show(report) {
    if (!this.el || !report) return;
    this.report = report;
    const m = report.meta || {};
    const rows = (report.results || []).map((r) => {
      const endA = vecStr(r.end?.actual);
      const endE = vecStr(r.end?.expected);
      const okCls = r.ok === true ? 'ok' : r.ok === false ? 'bad' : '';
      return `<tr>
        <td>${r.name || r.id}</td>
        <td>${r.samples}</td>
        <td class="mono">${endE}</td>
        <td class="mono">${endA}</td>
        <td class="${okCls}">${r.meanErr == null ? 'n/a' : fmt(r.meanErr, 4)}</td>
      </tr>`;
    }).join('');

    const verify = report.verify
      ? `<div class="light-verify" style="margin:8px 18px;">
          <span class="verify-dot ${report.verify.ok ? 'ok' : 'bad'}"></span>
          ${report.verify.label}: <b>${report.verify.value}</b>
        </div>`
      : '';

    this.el.innerHTML = `
      <div class="help-card trace-card">
        <button class="panel-close" title="Close">×</button>
        <h2>Trace results</h2>
        <p class="help-sub">${m.title || 'Recording'} · ${m.frames || 0} frames ·
          ${((m.durationMs || 0) / 1000).toFixed(1)}s · mode <b>${m.mode || '?'}</b></p>
        ${verify}
        <p class="lab-note" style="padding: 0 4px 8px;">End state of each point: expected (analytic / field)
          vs actual (simulation). Video, JSON, and CSV downloaded automatically.</p>
        <div class="light-table-wrap" style="max-height: 42vh;">
          <table class="spm-table light-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>Samples</th>
                <th>Expected (end)</th>
                <th>Actual (end)</th>
                <th>Mean err</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">No point samples collected.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="kick-row eq-actions" style="padding-top: 12px;">
          <button class="btn tiny" id="tr-rejson">Download JSON</button>
          <button class="btn tiny" id="tr-recsv">Download CSV</button>
          <button class="btn tiny" id="tr-close">Close</button>
        </div>
      </div>`;

    this.el.classList.remove('hidden');
    this.el.querySelector('#tr-close').addEventListener('click', () => this.hide());
    this.el.querySelector('#tr-rejson').addEventListener('click', () => this.redownload('json'));
    this.el.querySelector('#tr-recsv').addEventListener('click', () => this.redownload('csv'));
  }

  redownload(kind) {
    if (!this.report) return;
    const base = (this.report.meta && this.report.meta.filename) || 'observatory-trace';
    if (kind === 'json') {
      const blob = new Blob([JSON.stringify(this.report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-trace.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } else {
      const rows = [['frame', 't', 'point', 'ax', 'ay', 'az', 'ex', 'ey', 'ez', 'err']];
      this.report.frames.forEach((f, fi) => {
        for (const p of f.points) {
          const a = p.actual || {};
          const e = p.expected || {};
          rows.push([
            fi, f.t ?? '', p.name || p.id,
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
      const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-trace.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    }
  }

  hide() {
    if (!this.el) return;
    this.el.classList.add('hidden');
  }
}
