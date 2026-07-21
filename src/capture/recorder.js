/** Canvas video capture with XO/logo HUD overlay and per-point data traces.
 * Hard-capped at 10 seconds. On stop: downloads video + JSON/CSV traces and
 * returns a report for the results panel (expected vs actual).
 */

import { createOverlayPainter } from './overlay.js';
import { createDataTrace, hudFromSnapshot } from './datatrace.js';
import { createRecDescFloater } from '../ui/dragPanel.js';

export const RECORD_MAX_MS = 10_000;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

/**
 * @param {{
 *   sourceCanvas: HTMLCanvasElement,
 *   getFilename: () => string,
 *   getSnapshot: () => object | null,
 *   onStateChange?: (rec: boolean) => void,
 *   onReport?: (report: object) => void,
 * }} opts
 */
export function createRecorder({
  sourceCanvas,
  getFilename,
  getSnapshot,
  onStateChange,
  onReport,
}) {
  const painter = createOverlayPainter();
  const dataTrace = createDataTrace({ sampleHz: 10 });
  const descFloater = createRecDescFloater();
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let videoTrack = null;
  let autoStop = null;
  let startedAt = 0;
  let basename = 'observatory-trace';
  let recording = false;

  function isRecording() {
    return recording;
  }

  function cleanupTracks() {
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    videoTrack = null;
  }

  function paintFrame() {
    const snap = getSnapshot ? getSnapshot() : null;
    const recSec = recording ? (performance.now() - startedAt) / 1000 : 0;
    const hud = hudFromSnapshot(snap, recSec, RECORD_MAX_MS / 1000);
    if (recording) {
      const pos = descFloater.getNormPos();
      hud.nx = pos.nx;
      hud.ny = pos.ny;
      descFloater.setContent(hud);
    }
    painter.paint(sourceCanvas, hud);
    // Chrome: push an explicit frame into captureStream(0)
    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
      try { videoTrack.requestFrame(); } catch { /* ignore */ }
    }
    if (recording && snap) dataTrace.push(snap);
    return snap;
  }

  /** Call once per animation frame after composer.render(). */
  function tick() {
    if (!recording) return;
    paintFrame();
  }

  function stop() {
    if (autoStop) {
      clearTimeout(autoStop);
      autoStop = null;
    }
    if (!mediaRecorder) {
      recording = false;
      painter.unlock();
      descFloater.hide();
      onStateChange?.(false);
      return;
    }
    if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
      try { mediaRecorder.requestData(); } catch { /* ignore */ }
      mediaRecorder.stop();
    } else {
      recording = false;
      painter.unlock();
      descFloater.hide();
      onStateChange?.(false);
    }
  }

  function start() {
    if (recording) return false;
    if (typeof MediaRecorder === 'undefined') {
      console.warn('MediaRecorder is not supported in this browser.');
      return false;
    }
    if (!painter.canvas.captureStream) {
      console.warn('canvas.captureStream is not supported in this browser.');
      return false;
    }
    if (!(sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0)) {
      console.warn('WebGL canvas is not ready to record yet.');
      return false;
    }

    basename = getFilename().replace(/\.(webm|mp4)$/i, '');
    const snap0 = getSnapshot ? getSnapshot() : null;
    dataTrace.start({
      filename: basename,
      mode: snap0?.mode || 'unknown',
      title: snap0?.name || basename,
    });

    // Lock size BEFORE opening the stream. Resizing later kills captureStream.
    painter.lockFrom(sourceCanvas);
    paintFrame();

    const mimeType = pickMime();
    // Prefer explicit requestFrame when available; otherwise a fixed fps stream.
    // captureStream(0) without requestFrame produces empty recordings in several browsers.
    stream = painter.canvas.captureStream(0);
    videoTrack = stream.getVideoTracks()[0] || null;
    if (!videoTrack || typeof videoTrack.requestFrame !== 'function') {
      cleanupTracks();
      stream = painter.canvas.captureStream(30);
      videoTrack = stream.getVideoTracks()[0] || null;
    } else {
      try { videoTrack.requestFrame(); } catch { /* ignore */ }
    }

    chunks = [];
    const opts = { videoBitsPerSecond: 5_000_000 };
    if (mimeType) opts.mimeType = mimeType;

    try {
      mediaRecorder = new MediaRecorder(stream, opts);
    } catch (err) {
      // Retry without an explicit mimeType
      try {
        mediaRecorder = new MediaRecorder(stream);
      } catch (err2) {
        console.warn('MediaRecorder failed to start:', err2);
        cleanupTracks();
        mediaRecorder = null;
        recording = false;
        painter.unlock();
        dataTrace.stop();
        return false;
      }
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    mediaRecorder.onerror = (e) => {
      console.warn('MediaRecorder error:', e.error || e);
    };

    mediaRecorder.onstop = () => {
      recording = false;
      const type = (mediaRecorder && mediaRecorder.mimeType) || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      chunks = [];
      mediaRecorder = null;
      cleanupTracks();
      painter.unlock();

      const report = dataTrace.stop();
      const ext = type.includes('mp4') ? 'mp4' : 'webm';

      if (blob.size > 0) {
        downloadBlob(blob, `${basename}.${ext}`);
      } else {
        console.warn('Recording produced an empty video blob.');
        alert('Video capture produced an empty file. Try Chrome/Edge, or record again after the scene is fully loaded.');
      }

      // Stagger secondary downloads so the browser does not block them
      if (report && report.frames.length) {
        setTimeout(() => dataTrace.downloadAll(report, basename), 400);
      }
      descFloater.hide();
      onStateChange?.(false);
      setTimeout(() => onReport?.(report), 500);
    };

    try {
      mediaRecorder.start(250);
    } catch (err) {
      console.warn('MediaRecorder.start failed:', err);
      cleanupTracks();
      mediaRecorder = null;
      recording = false;
      painter.unlock();
      dataTrace.stop();
      return false;
    }

    recording = true;
    startedAt = performance.now();
    descFloater.show();
    // Push a couple of frames so the encoder has content immediately
    paintFrame();
    requestAnimationFrame(() => { if (recording) paintFrame(); });

    autoStop = setTimeout(() => stop(), RECORD_MAX_MS);
    onStateChange?.(true);
    return true;
  }

  function toggle() {
    if (recording) {
      stop();
      return false;
    }
    return start();
  }

  function elapsedMs() {
    return recording ? performance.now() - startedAt : 0;
  }

  return {
    start,
    stop,
    toggle,
    tick,
    isRecording,
    elapsedMs,
    maxMs: RECORD_MAX_MS,
  };
}
