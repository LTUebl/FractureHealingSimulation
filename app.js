/**
 * app.js — Main Application Controller
 * Bone Fracture Healing & Mechanoregulation Lattice Simulator
 * Based on Byrne, Lacroix & Prendergast (2011), J Orthop Res 29:1496–1503
 * and Perier-Metz, Duda & Checa (2020), Front Bioeng Biotechnol 8:585799
 * Developed for LTU BME 5313 / 6303: Cellular Mechanobiology — Dr. Eric G. Meyer
 */

import {
  DEFAULT_PARAMS,
  PRESETS,
  BYRNE_BENCHMARKS,
  QUIZ_QUESTIONS,
  solveFractureHealing,
  getSnapshotAtDay
} from './physics.js';

import { FractureRenderer } from './renderer.js';

// ============================================================================
// 1. APPLICATION STATE & CACHE
// ============================================================================

const state = {
  params: { ...DEFAULT_PARAMS },
  activePreset: 'byrne_baseline',
  activeMode: 'timeline',
  fieldMode: 'phenotype',
  overlays: {
    showHardware: true,
    showVectors: true,
    showCells: true,
    showRegions: true
  },
  simResult: null,
  graftComparisonCache: null,
  isPlaying: false,
  playSpeed: 1,
  rafId: null,
  lastFrameTime: 0
};

let renderer = null;
let chartStiffness = null;
let chartIFS = null;
let chartTissues = null;
let chartMechanoreg = null;
let chartRegions = null;
let chartGraftCompare = null;

const quizState = {
  answered: {},
  score: 0
};

const FIXATION_LABELS = {
  external_fixator: 'Ext. Fixator',
  locking_plate: 'Locking Plate',
  im_nail: 'IM Nail',
  cast_unfixed: 'Cast / Brace'
};

const GRAFT_LABELS = {
  none: 'No Graft',
  autograft: 'Autograft',
  osteoconductive_scaffold: '3D Scaffold',
  osteoinductive_bmp2: 'BMP-2 Gel',
  msc_scaffold: 'MSC Scaffold'
};

// ============================================================================
// 2. INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initCanvasRenderer();
  initTabs();
  initFieldPills();
  initOverlayToggles();
  initPresets();
  initControls();
  initPlayback();
  initCharts();
  initModalsAndQuiz();
  initExportAndReset();

  syncControlsFromState();
  runSimulationAndUpdateUI(true);
  renderMath(document.body);
});

function renderMath(root) {
  if (typeof window.renderMathInElement === 'function' && root) {
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
      });
    } catch {
      // Ignore math render errors when offline
    }
  }
}

// ============================================================================
// 3. CANVAS RENDERER & FIELD LEGENDS
// ============================================================================

function initCanvasRenderer() {
  const canvas = document.getElementById('sim-canvas');
  if (!canvas) return;

  renderer = new FractureRenderer(canvas, (probe) => {
    const hudProbe = document.getElementById('hud-probe');
    if (!hudProbe) return;
    if (!probe) {
      hudProbe.textContent = 'Hover cross-section to inspect local tissue & stimulus S';
      return;
    }
    hudProbe.textContent =
      `${probe.regionName} (${probe.xMm.toFixed(1)}, ${probe.zMm.toFixed(1)} mm) · ` +
      `${probe.phenotypeName} (E=${formatModulus(probe.modulusMPa)}) · ` +
      `S=${probe.stimulusS.toFixed(2)} (γ=${probe.shearStrainPct.toFixed(2)}%, v=${probe.fluidVelocityUmS.toFixed(2)} µm/s)`;
  });

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => renderer?.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => renderer?.zoomOut());
  document.getElementById('btn-view-reset')?.addEventListener('click', () => renderer?.resetView());
}

function formatModulus(eMPa) {
  if (eMPa >= 1000) return `${(eMPa / 1000).toFixed(1)} GPa`;
  if (eMPa >= 10) return `${eMPa.toFixed(0)} MPa`;
  return `${eMPa.toFixed(1)} MPa`;
}

function initFieldPills() {
  const pills = document.querySelectorAll('#field-selector-bar .btn-view-pill');
  pills.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-field');
      if (!mode) return;
      state.fieldMode = mode;
      pills.forEach((b) => b.classList.toggle('active', b === btn));
      updateCanvasLegend(mode);
      if (renderer) {
        renderer.setFieldMode(mode);
      }
    });
  });
}

function updateCanvasLegend(mode) {
  const pill = document.getElementById('canvas-legend-pill');
  if (!pill) return;

  if (mode === 'phenotype') {
    pill.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:#fda4af;"></span>Granulation</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#ef4444;"></span>Fibrous</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#8b5cf6;"></span>Cartilage</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#84cc16;"></span>Immature Bone</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#15803d;"></span>Mature Bone</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#e7e5e4;"></span>Cortical</span>
    `;
  } else if (mode === 'stimulus') {
    pill.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:#38bdf8;"></span>Resorb (S&le;0.01)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#15803d;"></span>Mature (0.01&ndash;0.53)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#84cc16;"></span>Immature (0.53&ndash;1)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#a855f7;"></span>Cartilage (1&ndash;3)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#ef4444;"></span>Fibrous (&gt;3)</span>
    `;
  } else if (mode === 'strain_flow') {
    pill.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:linear-gradient(90deg,#1d4ed8,#10b981,#f59e0b,#ef4444);"></span>Shear Strain &gamma; (%)</span>
      <span class="legend-item" style="color:var(--color-text-muted);">Arrows: Interstitial Fluid Flow (v)</span>
    `;
  } else {
    pill.innerHTML = `
      <span class="legend-item"><span class="legend-swatch" style="background:#d97706;"></span>MSC</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#ef4444;"></span>Fibroblast</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#8b5cf6;"></span>Chondrocyte</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#10b981;"></span>Osteoblast</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#0284c7;"></span>Osteoclast</span>
    `;
  }
}

function initOverlayToggles() {
  const bindToggle = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.overlays[key] = el.checked;
      if (renderer) renderer.setOverlays(state.overlays);
    });
  };
  bindToggle('toggle-hardware', 'showHardware');
  bindToggle('toggle-vectors', 'showVectors');
  bindToggle('toggle-cells', 'showCells');
  bindToggle('toggle-regions', 'showRegions');
}

// ============================================================================
// 4. TABS, PRESETS & PARAMETER CONTROLS
// ============================================================================

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const panels = {
    timeline: document.getElementById('panel-timeline'),
    stimulus: document.getElementById('panel-stimulus'),
    spatial: document.getElementById('panel-spatial'),
    model: document.getElementById('panel-model')
  };

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (!mode || !panels[mode]) return;
      state.activeMode = mode;

      tabs.forEach((b) => b.classList.toggle('active', b === btn));
      Object.entries(panels).forEach(([k, p]) => {
        if (p) p.style.display = k === mode ? 'flex' : 'none';
      });

      refreshCharts();
      renderMath(panels[mode]);
    });
  });
}

function initPresets() {
  const btns = document.querySelectorAll('#preset-grid .btn-preset');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetId = btn.getAttribute('data-preset');
      const preset = PRESETS[presetId];
      if (!preset) return;

      stopPlayback();
      state.activePreset = presetId;
      state.params = { ...DEFAULT_PARAMS, ...preset.params };

      btns.forEach((b) => b.classList.toggle('active', b === btn));
      syncControlsFromState();
      runSimulationAndUpdateUI(true);
    });
  });
}

function clearPresetHighlight() {
  state.activePreset = null;
  document.querySelectorAll('#preset-grid .btn-preset').forEach((b) => b.classList.remove('active'));
}

function initControls() {
  const onParamChange = (recompute = true) => {
    clearPresetHighlight();
    updateControlLabels();
    if (recompute) {
      runSimulationAndUpdateUI(false);
    } else {
      updateDayViewOnly();
    }
  };

  const bindRange = (id, key, parser = parseFloat) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state.params[key] = parser(el.value);
      onParamChange(true);
    });
  };

  const bindSelect = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.params[key] = el.value;
      onParamChange(true);
    });
  };

  bindRange('slider-load', 'loadMultiplier');
  bindSelect('select-rehab', 'rehabProtocol');
  bindRange('slider-gap', 'gapSizeMm');
  bindRange('slider-callus-index', 'callusIndex');
  bindSelect('select-fixation', 'fixationType');
  bindRange('slider-fix-stiff', 'fixationStiffnessPct', (v) => parseInt(v, 10));
  bindSelect('select-graft', 'graftType');
  bindRange('slider-msc-activity', 'mscActivity');

  const chkAuto = document.getElementById('chk-auto-remove');
  if (chkAuto) {
    chkAuto.addEventListener('change', () => {
      state.params.autoRemoveFixator = chkAuto.checked;
      onParamChange(true);
    });
  }

  const sliderDay = document.getElementById('slider-day');
  if (sliderDay) {
    sliderDay.addEventListener('input', () => {
      state.params.currentDay = parseInt(sliderDay.value, 10);
      updateDayViewOnly();
    });
  }
}

function syncControlsFromState() {
  const p = state.params;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setVal('slider-load', p.loadMultiplier);
  setVal('select-rehab', p.rehabProtocol);
  setVal('slider-gap', p.gapSizeMm);
  setVal('slider-callus-index', p.callusIndex);
  setVal('select-fixation', p.fixationType);
  setVal('slider-fix-stiff', p.fixationStiffnessPct);
  setVal('select-graft', p.graftType);
  setVal('slider-msc-activity', p.mscActivity);
  setVal('slider-day', p.currentDay);

  const chkAuto = document.getElementById('chk-auto-remove');
  if (chkAuto) chkAuto.checked = Boolean(p.autoRemoveFixator);

  updateControlLabels();
}

function updateControlLabels() {
  const p = state.params;
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  const bwKg = Math.round(80 * p.loadMultiplier);
  setTxt('val-load', `${p.loadMultiplier.toFixed(1)}× BW (${bwKg} kg)`);
  setTxt('val-gap', `${p.gapSizeMm.toFixed(1)} mm`);
  setTxt('val-callus-index', `${p.callusIndex.toFixed(2)}×`);
  setTxt('val-fix-stiff', `${p.fixationStiffnessPct}%`);
  setTxt('val-msc-activity', `${p.mscActivity.toFixed(2)}×`);
}

// ============================================================================
// 5. PLAYBACK & TIME SCRUBBER
// ============================================================================

function initPlayback() {
  const btnPlay = document.getElementById('btn-play-timelapse');
  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      if (state.isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    });
  }

  document.querySelectorAll('.btn-speed').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.playSpeed = Number(btn.getAttribute('data-speed')) || 1;
      document.querySelectorAll('.btn-speed').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
}

function startPlayback() {
  if (state.isPlaying) return;
  if (state.params.currentDay >= 376) {
    state.params.currentDay = 0;
  }
  state.isPlaying = true;
  state.lastFrameTime = performance.now();

  const btn = document.getElementById('btn-play-timelapse');
  if (btn) {
    btn.classList.add('playing');
    btn.innerHTML = '<span>&#9724; Pause</span>';
  }

  const tick = (now) => {
    if (!state.isPlaying) return;
    const dtSec = Math.min(0.1, (now - state.lastFrameTime) / 1000);
    state.lastFrameTime = now;

    // 28 days per second at 1x speed (~13.5 sec full 380-day sweep)
    state.params.currentDay += dtSec * 28 * state.playSpeed;
    if (state.params.currentDay >= 380) {
      state.params.currentDay = 380;
      updateDayViewOnly();
      stopPlayback();
      return;
    }

    const sliderDay = document.getElementById('slider-day');
    if (sliderDay) sliderDay.value = Math.round(state.params.currentDay);
    updateDayViewOnly();
    state.rafId = requestAnimationFrame(tick);
  };

  state.rafId = requestAnimationFrame(tick);
}

function stopPlayback() {
  state.isPlaying = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  const btn = document.getElementById('btn-play-timelapse');
  if (btn) {
    btn.classList.remove('playing');
    btn.innerHTML = '<span>&#9654; Play Healing</span>';
  }
}

// ============================================================================
// 6. SIMULATION EXECUTION & UI SYNC
// ============================================================================

function runSimulationAndUpdateUI(recomputeGraftCompare = false) {
  state.simResult = solveFractureHealing(state.params);

  if (recomputeGraftCompare || !state.graftComparisonCache) {
    state.graftComparisonCache = computeGraftBenchmarkComparison();
  }

  updateOutcomeBanner();
  updateDayViewOnly();
  updateTimelineCharts();
  updateGraftComparisonChart();
}

function updateDayViewOnly() {
  if (!state.simResult) return;
  const day = Math.round(state.params.currentDay);
  const snap = getSnapshotAtDay(state.simResult, day);
  if (!snap) return;

  // Update playback bar labels
  const lblDay = document.getElementById('lbl-day-week');
  if (lblDay) {
    lblDay.textContent = `Day ${snap.day} (Week ${snap.week.toFixed(1)})`;
  }
  const lblPhase = document.getElementById('lbl-phase-name');
  if (lblPhase) {
    lblPhase.textContent = `Phase: ${snap.phaseLabel}`;
  }

  // Update Canvas HUD
  const hudGapFix = document.getElementById('hud-gap-fix');
  if (hudGapFix) {
    const fixTxt = FIXATION_LABELS[state.params.fixationType] || state.params.fixationType;
    const fixStatus = snap.fixatorActive ? `${state.params.fixationStiffnessPct}%` : 'REMOVED';
    const graftTxt = state.params.graftType !== 'none' ? ` · ${GRAFT_LABELS[state.params.graftType]}` : '';
    hudGapFix.textContent = `Gap: ${state.params.gapSizeMm.toFixed(1)} mm · ${fixTxt} (${fixStatus})${graftTxt}`;
  }
  const hudWb = document.getElementById('hud-wb');
  if (hudWb) {
    hudWb.textContent = `Gait Load: ${snap.weightBearingPct.toFixed(0)}% (${state.params.loadMultiplier.toFixed(1)}× BW)`;
  }

  // Update 6 Metrics Ribbon
  updateMetricsRibbon(snap, state.simResult.summary);

  // Render Canvas
  if (renderer) {
    renderer.render(state.simResult, snap.day);
  }

  // Update Day-Dependent Charts & Tables
  updateDayMarkersOnTimelineCharts(snap);
  updateMechanoregChart(snap);
  updateSpatialTableAndChart(snap);
}

function updateOutcomeBanner() {
  const summary = state.simResult?.summary;
  if (!summary) return;
  const banner = document.getElementById('outcome-banner');
  const badge = document.getElementById('outcome-badge');
  const text = document.getElementById('outcome-summary-text');

  if (banner) {
    banner.className = `outcome-banner ${summary.outcomeTone}`;
  }
  if (badge) {
    badge.textContent = summary.outcomeStatus;
  }
  if (text) {
    text.textContent = summary.outcomeSummary;
  }
}

function updateMetricsRibbon(snap, summary) {
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('metric-stiffness', `${snap.bendingStiffnessNmDeg.toFixed(1)} Nm/deg`);
  setTxt(
    'metric-stiffness-sub',
    snap.bendingStiffnessNmDeg >= 15
      ? `Above 15 Nm/deg union (Peak ${summary.peakStiffnessNmDeg.toFixed(0)})`
      : `Union threshold: 15.0 Nm/deg`
  );

  setTxt('metric-ifs', `${snap.ifsMaxPct.toFixed(2)}%`);
  setTxt('metric-ifs-sub', `Ant ${snap.ifsAntPct.toFixed(1)}% / Post ${snap.ifsPostPct.toFixed(1)}%`);

  setTxt('metric-union', summary.unionDay !== null ? `Day ${summary.unionDay}` : 'Non-Union');
  if (summary.fixatorRemovalDay !== null) {
    setTxt('metric-union-sub', `Ext. fixator removed Day ${summary.fixatorRemovalDay}`);
  } else if (summary.unionDay !== null) {
    setTxt('metric-union-sub', `Week ${(summary.unionDay / 7).toFixed(1)} clinical union`);
  } else {
    setTxt('metric-union-sub', 'Did not reach 15 Nm/deg');
  }

  setTxt('metric-bone-pct', `${snap.boneFractionPct.toFixed(1)}%`);
  setTxt('metric-bone-sub', `Cart ${snap.cartilageFractionPct.toFixed(0)}% · Fib ${snap.fibrousFractionPct.toFixed(0)}%`);

  setTxt('metric-stimulus', `${snap.centerStimulusS.toFixed(2)}`);
  setTxt('metric-stimulus-sub', `Favors ${snap.centerPhenotype}`);

  setTxt('metric-load-share', `${snap.fixatorLoadSharePct.toFixed(0)}%`);
  setTxt(
    'metric-load-share-sub',
    snap.fixatorActive
      ? `${(100 - snap.fixatorLoadSharePct).toFixed(0)}% carried by callus`
      : 'Fixator removed (100% bone)'
  );
}

// ============================================================================
// 7. CHART.JS SCIENTIFIC VISUALIZATIONS
// ============================================================================

// Custom plugin to draw Prendergast mechanoregulation boundaries on log-log plot
const prendergastZonesPlugin = {
  id: 'prendergastZones',
  beforeDatasetsDraw(chart) {
    if (chart.canvas.id !== 'chart-mechanoreg') return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x || !scales.y) return;

    const xScale = scales.x;
    const yScale = scales.y;

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();

    // Draw boundary curves S = gammaPct / 3.75 + vUmS / 3.0 = S_thresh
    // => vUmS = 3.0 * (S_thresh - gammaPct / 3.75)
    const boundaries = [
      { S: 0.01, label: 'Resorption (S≤0.01)', color: '#0284c7', dash: [4, 3] },
      { S: 0.53, label: 'Mature Bone (0.53)', color: '#15803d', dash: [] },
      { S: 1.0, label: 'Immature Bone (1.0)', color: '#65a30d', dash: [] },
      { S: 3.0, label: 'Cartilage / Fibrous (3.0)', color: '#dc2626', dash: [] }
    ];

    boundaries.forEach((b) => {
      const gMax = 3.75 * b.S;
      const steps = 60;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        // Sample gammaPct logarithmically from 1e-4 up to 0.995 * gMax
        const frac = i / steps;
        const gMin = 1e-4;
        const g = gMin * Math.pow((0.995 * gMax) / gMin, frac);
        const v = 3.0 * (b.S - g / 3.75);
        if (v <= 1e-4) continue;
        const px = xScale.getPixelForValue(g);
        const py = yScale.getPixelForValue(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash(b.dash);
      ctx.stroke();

      // Label near left edge
      const vLabel = Math.min(80, Math.max(0.002, 3.0 * b.S * 0.85));
      const pxL = xScale.getPixelForValue(0.00022);
      const pyL = yScale.getPixelForValue(vLabel);
      if (pyL >= chartArea.top + 10 && pyL <= chartArea.bottom - 6) {
        ctx.fillStyle = b.color;
        ctx.font = '700 9.5px Inter, sans-serif';
        ctx.fillText(b.label, pxL, pyL - 4);
      }
    });

    ctx.restore();
  }
};

function initCharts() {
  if (typeof window.Chart === 'undefined') return;
  window.Chart.register(prendergastZonesPlugin);
  window.Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  window.Chart.defaults.font.size = 11;
  window.Chart.defaults.color = '#475569';

  // 1. Bending Stiffness (Fig. 5)
  const ctxStiff = document.getElementById('chart-stiffness')?.getContext('2d');
  if (ctxStiff) {
    chartStiffness = new window.Chart(ctxStiff, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 11, font: { size: 9.5 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} Nm/deg (Wk ${ctx.parsed.x.toFixed(1)})`
            }
          }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Time (Weeks)', font: { weight: '600' } }, min: 0, max: 55 },
          y: { title: { display: true, text: 'Bending Stiffness (Nm/deg)', font: { weight: '600' } }, min: 0, suggestedMax: 90 }
        }
      }
    });
  }

  // 2. Interfragmentary Strain (Fig. 4)
  const ctxIfs = document.getElementById('chart-ifs')?.getContext('2d');
  if (ctxIfs) {
    chartIFS = new window.Chart(ctxIfs, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 11, font: { size: 9.5 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}% (Wk ${ctx.parsed.x.toFixed(1)})`
            }
          }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Time (Weeks)', font: { weight: '600' } }, min: 0, max: 55 },
          y: { title: { display: true, text: 'Interfragmentary Strain (%)', font: { weight: '600' } }, min: 0 }
        }
      }
    });
  }

  // 3. Tissue Fractions Over Time
  const ctxTissues = document.getElementById('chart-tissues')?.getContext('2d');
  if (ctxTissues) {
    chartTissues = new window.Chart(ctxTissues, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 11, font: { size: 9.5 } } }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Time (Weeks)', font: { weight: '600' } }, min: 0, max: 55 },
          y: { title: { display: true, text: 'Callus Area Fraction (%)', font: { weight: '600' } }, min: 0, max: 100 }
        }
      }
    });
  }

  // 4. Mechanoregulation Diagram (Fig. 3 Log-Log Scatter)
  const ctxMech = document.getElementById('chart-mechanoreg')?.getContext('2d');
  if (ctxMech) {
    chartMechanoreg = new window.Chart(ctxMech, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 11, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.raw || {};
                return `${ctx.dataset.label}: γ=${ctx.parsed.x.toFixed(3)}%, v=${ctx.parsed.y.toFixed(3)} µm/s (S=${(raw.S ?? 0).toFixed(2)})`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic',
            title: { display: true, text: 'Tissue Shear Strain γ (%)', font: { weight: '600' } },
            min: 0.0001,
            max: 100,
            ticks: {
              callback: (v) => {
                const log = Math.log10(v);
                return Number.isInteger(log) ? v.toString() : '';
              }
            }
          },
          y: {
            type: 'logarithmic',
            title: { display: true, text: 'Interstitial Fluid Flow v (µm/s)', font: { weight: '600' } },
            min: 0.001,
            max: 100,
            ticks: {
              callback: (v) => {
                const log = Math.log10(v);
                return Number.isInteger(log) ? v.toString() : '';
              }
            }
          }
        }
      }
    });
  }

  // 5. Regional Composition Bar Chart
  const ctxReg = document.getElementById('chart-regions')?.getContext('2d');
  if (ctxReg) {
    chartRegions = new window.Chart(ctxReg, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9.5 } } } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, min: 0, max: 100, title: { display: true, text: 'Tissue Share (%)', font: { weight: '600' } } }
        }
      }
    });
  }

  // 6. Graft Comparison Bar Chart
  const ctxGraft = document.getElementById('chart-graft-compare')?.getContext('2d');
  if (ctxGraft) {
    chartGraftCompare = new window.Chart(ctxGraft, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9.5 } } } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Week-35 Stiffness (Nm/deg)', font: { weight: '600' } } }
        }
      }
    });
  }
}

function refreshCharts() {
  [chartStiffness, chartIFS, chartTissues, chartMechanoreg, chartRegions, chartGraftCompare].forEach((c) => {
    if (c) {
      c.resize();
      c.update('none');
    }
  });
}

function updateTimelineCharts() {
  if (!state.simResult) return;
  const snaps = state.simResult.snapshots;

  if (chartStiffness) {
    chartStiffness.data.datasets = [
      {
        label: 'Active Simulation',
        data: snaps.map((s) => ({ x: s.week, y: s.bendingStiffnessNmDeg })),
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.10)',
        borderWidth: 2.8,
        pointRadius: 0,
        tension: 0.25,
        fill: true
      },
      {
        label: 'Byrne (2011) Baseline',
        data: BYRNE_BENCHMARKS.stiffnessSimSeries.filter((p) => p.week <= 55).map((p) => ({ x: p.week, y: p.stiffness })),
        borderColor: '#0f172a',
        borderDash: [5, 3],
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Richardson (1994) Exp.',
        data: BYRNE_BENCHMARKS.stiffnessExpRichardson.map((p) => ({ x: p.week, y: p.stiffness })),
        borderColor: '#64748b',
        borderDash: [2, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Union Threshold (15 Nm/deg)',
        data: [{ x: 0, y: 15 }, { x: 55, y: 15 }],
        borderColor: '#10b981',
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0
      },
      {
        label: 'Selected Day',
        data: [],
        borderColor: '#dc2626',
        backgroundColor: '#dc2626',
        pointRadius: 5,
        showLine: false
      }
    ];
    chartStiffness.update('none');
  }

  if (chartIFS) {
    chartIFS.data.datasets = [
      {
        label: 'Active IFS (%)',
        data: snaps.map((s) => ({ x: s.week, y: s.ifsMaxPct })),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.08)',
        borderWidth: 2.6,
        pointRadius: 0,
        tension: 0.25,
        fill: true
      },
      {
        label: 'Byrne (2011) Fig. 4',
        data: BYRNE_BENCHMARKS.ifsSeries.map((p) => ({ x: p.week, y: p.ifsPct })),
        borderColor: '#0f172a',
        borderDash: [5, 3],
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Selected Day',
        data: [],
        borderColor: '#0284c7',
        backgroundColor: '#0284c7',
        pointRadius: 5,
        showLine: false
      }
    ];
    chartIFS.update('none');
  }

  if (chartTissues) {
    chartTissues.data.datasets = [
      {
        label: 'Bone (Immature + Mature)',
        data: snaps.map((s) => ({ x: s.week, y: s.boneFractionPct })),
        borderColor: '#15803d',
        borderWidth: 2.4,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Cartilage',
        data: snaps.map((s) => ({ x: s.week, y: s.cartilageFractionPct })),
        borderColor: '#8b5cf6',
        borderWidth: 2.0,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Fibrous Tissue',
        data: snaps.map((s) => ({ x: s.week, y: s.fibrousFractionPct })),
        borderColor: '#ef4444',
        borderWidth: 1.8,
        pointRadius: 0,
        tension: 0.25
      },
      {
        label: 'Resorbed / Marrow',
        data: snaps.map((s) => ({ x: s.week, y: s.resorbedFractionPct })),
        borderColor: '#0284c7',
        borderDash: [4, 3],
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0.25
      }
    ];
    chartTissues.update('none');
  }

  const snap = getSnapshotAtDay(state.simResult, state.params.currentDay);
  if (snap) updateDayMarkersOnTimelineCharts(snap);
}

function updateDayMarkersOnTimelineCharts(snap) {
  if (chartStiffness && chartStiffness.data.datasets.length >= 5) {
    chartStiffness.data.datasets[4].data = [{ x: snap.week, y: snap.bendingStiffnessNmDeg }];
    chartStiffness.update('none');
  }
  if (chartIFS && chartIFS.data.datasets.length >= 3) {
    chartIFS.data.datasets[2].data = [{ x: snap.week, y: snap.ifsMaxPct }];
    chartIFS.update('none');
  }
  const tag = document.getElementById('timeline-tag');
  if (tag) {
    const unionTxt = state.simResult.summary.unionDay !== null ? `Union: Day ${state.simResult.summary.unionDay}` : 'No Union';
    tag.textContent = `${unionTxt} · Selected: Day ${snap.day} (${snap.bendingStiffnessNmDeg.toFixed(1)} Nm/deg)`;
  }
}

function updateMechanoregChart(snap) {
  if (!chartMechanoreg || !state.simResult) return;
  const tag = document.getElementById('stimulus-day-tag');
  if (tag) tag.textContent = `Day ${snap.day} Snapshot (Week ${snap.week.toFixed(1)})`;

  const { regionMask } = state.simResult.grid;
  const { shearStrainPct, fluidVelocityUmS, stimulusS, phenotype } = snap;

  const gapPts = [];
  const marrowPts = [];
  const callusPts = [];

  for (let i = 0; i < regionMask.length; i++) {
    const reg = regionMask[i];
    const ph = phenotype[i];
    if (reg < 2 || ph === 0 || ph === 6 || ph === 7 || ph === 8) continue;

    const g = Math.max(0.00015, Math.min(80, shearStrainPct[i]));
    const v = Math.max(0.0015, Math.min(80, fluidVelocityUmS[i]));
    const pt = { x: g, y: v, S: stimulusS[i] };

    if (reg === 3) gapPts.push(pt);
    else if (reg === 2) marrowPts.push(pt);
    else if (reg === 4) callusPts.push(pt);
  }

  chartMechanoreg.data.datasets = [
    {
      label: 'Fracture Gap',
      data: gapPts,
      backgroundColor: 'rgba(21, 128, 61, 0.78)',
      borderColor: '#14532d',
      borderWidth: 0.7,
      pointRadius: 3.4
    },
    {
      label: 'Medullary Cavity',
      data: marrowPts,
      backgroundColor: 'rgba(37, 99, 235, 0.65)',
      borderColor: '#1e3a8a',
      borderWidth: 0.7,
      pointRadius: 3.0
    },
    {
      label: 'External Callus',
      data: callusPts,
      backgroundColor: 'rgba(148, 163, 184, 0.55)',
      borderColor: '#475569',
      borderWidth: 0.7,
      pointRadius: 2.8
    }
  ];
  chartMechanoreg.update('none');
}

function updateSpatialTableAndChart(snap) {
  const tag = document.getElementById('spatial-day-tag');
  if (tag) tag.textContent = `Day ${snap.day} Regional Breakdown`;

  const tbody = document.getElementById('tbody-regions');
  const regs = snap.regions;
  if (!regs) return;

  const rows = [
    { name: 'Anterior Gap (Plate/Fixator Side)', data: regs.anteriorGap },
    { name: 'Posterior Gap (High Bending Side)', data: regs.posteriorGap },
    { name: 'Medullary Cavity', data: regs.medullary },
    { name: 'External Periosteal Callus', data: regs.externalCallus }
  ];

  const describeS = (s) => {
    if (s <= 0.01) return 'Resorption';
    if (s <= 0.53) return 'Mature Bone';
    if (s <= 1.0) return 'Immature Bone';
    if (s <= 3.0) return 'Cartilage';
    return 'Fibrous Tissue';
  };

  if (tbody) {
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td style="font-family:var(--font-sans); font-weight:600;">${r.name}</td>
        <td>${r.data.bonePct.toFixed(1)}%</td>
        <td>${r.data.cartPct.toFixed(1)}%</td>
        <td>${r.data.fibPct.toFixed(1)}%</td>
        <td>${r.data.meanS.toFixed(2)}</td>
        <td style="font-family:var(--font-sans);">${describeS(r.data.meanS)}</td>
      </tr>
    `
      )
      .join('');
  }

  if (chartRegions) {
    chartRegions.data.labels = ['Ant. Gap', 'Post. Gap', 'Medullary', 'Ext. Callus'];
    chartRegions.data.datasets = [
      {
        label: 'Bone (%)',
        data: rows.map((r) => Number(r.data.bonePct.toFixed(1))),
        backgroundColor: '#15803d'
      },
      {
        label: 'Cartilage (%)',
        data: rows.map((r) => Number(r.data.cartPct.toFixed(1))),
        backgroundColor: '#8b5cf6'
      },
      {
        label: 'Fibrous (%)',
        data: rows.map((r) => Number(r.data.fibPct.toFixed(1))),
        backgroundColor: '#ef4444'
      }
    ];
    chartRegions.update('none');
  }
}

function computeGraftBenchmarkComparison() {
  const grafts = ['none', 'osteoconductive_scaffold', 'osteoinductive_bmp2', 'autograft', 'msc_scaffold'];
  return grafts.map((g) => {
    const res = solveFractureHealing({
      ...DEFAULT_PARAMS,
      gapSizeMm: 15.0,
      fixationType: 'locking_plate',
      fixationStiffnessPct: 120,
      graftType: g,
      currentDay: 245
    });
    const wk35 = getSnapshotAtDay(res, 245);
    return {
      graft: g,
      label: GRAFT_LABELS[g],
      stiffness: wk35 ? wk35.bendingStiffnessNmDeg : res.summary.finalStiffnessNmDeg,
      bonePct: wk35 ? wk35.boneFractionPct : res.summary.finalBoneFractionPct
    };
  });
}

function updateGraftComparisonChart() {
  if (!chartGraftCompare || !state.graftComparisonCache) return;
  const cache = state.graftComparisonCache;
  chartGraftCompare.data.labels = cache.map((c) => c.label);
  chartGraftCompare.data.datasets = [
    {
      label: 'Week-35 Bending Stiffness (Nm/deg) in 15 mm Defect',
      data: cache.map((c) => Number(c.stiffness.toFixed(1))),
      backgroundColor: cache.map((c) => (c.graft === state.params.graftType ? '#0284c7' : '#94a3b8'))
    }
  ];
  chartGraftCompare.update('none');
}

// ============================================================================
// 8. MODALS (THEORY & PRACTICE QUIZ)
// ============================================================================

function initModalsAndQuiz() {
  const modalTheory = document.getElementById('modal-theory');
  const modalQuiz = document.getElementById('modal-quiz');

  document.getElementById('btn-theory')?.addEventListener('click', () => {
    if (modalTheory) {
      modalTheory.classList.add('active');
      renderMath(modalTheory);
    }
  });

  document.getElementById('btn-quiz')?.addEventListener('click', () => {
    if (modalQuiz) {
      buildQuizDOM();
      modalQuiz.classList.add('active');
      renderMath(modalQuiz);
    }
  });

  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close');
      const modal = targetId ? document.getElementById(targetId) : btn.closest('.modal-backdrop');
      if (modal) modal.classList.remove('active');
    });
  });

  [modalTheory, modalQuiz].forEach((m) => {
    if (!m) return;
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modalTheory?.classList.remove('active');
      modalQuiz?.classList.remove('active');
    }
  });
}

function buildQuizDOM() {
  const container = document.getElementById('quiz-container');
  if (!container) return;
  const questions = QUIZ_QUESTIONS || [];
  quizState.answered = {};
  quizState.score = 0;

  const headerHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-primary-light); padding:0.65rem 1rem; border-radius:var(--radius-sm); border-left:4px solid var(--color-primary);">
      <div>
        <strong>BME 5313 / 6303 Self-Assessment Quiz</strong>
        <div style="font-size:0.78rem; color:var(--color-text-muted);">Test your grasp of mechanoregulation, fixation stability, and bone grafts.</div>
      </div>
      <div style="font-family:var(--font-mono); font-weight:700; font-size:0.95rem; color:var(--color-primary-dark);" id="quiz-score-banner">
        Score: 0 / ${questions.length}
      </div>
    </div>
  `;

  const cardsHtml = questions
    .map((q, qIdx) => {
      const optsHtml = q.options
        .map(
          (opt, oIdx) => `
          <button type="button" class="quiz-option-btn" data-q="${qIdx}" data-opt="${oIdx}" data-correct="${q.correctIndex}">
            <span style="font-family:var(--font-mono); font-weight:700; color:var(--color-primary);">${String.fromCharCode(65 + oIdx)}.</span>
            <span>${opt}</span>
          </button>
        `
        )
        .join('');

      return `
        <div class="quiz-question-card" id="quiz-card-${qIdx}">
          <div class="quiz-question-title">${qIdx + 1}. ${q.question}</div>
          <div class="quiz-options-list">${optsHtml}</div>
          <div class="quiz-feedback" id="quiz-feedback-${qIdx}"></div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = headerHtml + cardsHtml;

  container.querySelectorAll('.quiz-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qIdx = Number(btn.getAttribute('data-q'));
      const optIdx = Number(btn.getAttribute('data-opt'));
      const correctIdx = Number(btn.getAttribute('data-correct'));
      if (quizState.answered[qIdx] !== undefined) return;
      quizState.answered[qIdx] = optIdx;

      const isCorrect = optIdx === correctIdx;
      if (isCorrect) quizState.score += 1;

      const card = document.getElementById(`quiz-card-${qIdx}`);
      card?.querySelectorAll('.quiz-option-btn').forEach((b, idx) => {
        if (idx === correctIdx) b.classList.add('selected-correct');
        else if (idx === optIdx) b.classList.add('selected-incorrect');
      });

      const fb = document.getElementById(`quiz-feedback-${qIdx}`);
      if (fb) {
        fb.className = `quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
        fb.innerHTML = `<strong>${isCorrect ? '✓ Correct!' : '✗ Incorrect.'}</strong> ${questions[qIdx].explanation || ''}`;
        renderMath(fb);
      }

      const banner = document.getElementById('quiz-score-banner');
      if (banner) banner.textContent = `Score: ${quizState.score} / ${questions.length}`;
    });
  });
}

// ============================================================================
// 9. CSV EXPORT & RESET
// ============================================================================

function initExportAndReset() {
  document.getElementById('btn-export-csv')?.addEventListener('click', exportSimulationCSV);
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    stopPlayback();
    state.params = { ...DEFAULT_PARAMS };
    state.activePreset = 'byrne_baseline';
    document.querySelectorAll('#preset-grid .btn-preset').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-preset') === 'byrne_baseline');
    });
    renderer?.resetView();
    syncControlsFromState();
    runSimulationAndUpdateUI(false);
  });
}

function exportSimulationCSV() {
  if (!state.simResult) return;
  const { params, snapshots, summary } = state.simResult;
  const lines = [];
  lines.push('# LTU BME 5313 / 6303 — Bone Fracture Healing & Mechanoregulation Simulator');
  lines.push('# Models: Byrne, Lacroix & Prendergast (2011) J Orthop Res 29:1496-1503 & Perier-Metz et al. (2020) Front Bioeng Biotechnol 8:585799');
  lines.push('');
  lines.push('SECTION 1: SIMULATION PARAMETERS & OUTCOME SUMMARY');
  lines.push('Parameter,Value,Units');
  lines.push(`Peak Gait Load,${params.loadMultiplier.toFixed(2)},x BW (80 kg)`);
  lines.push(`Rehab Protocol,${params.rehabProtocol},`);
  lines.push(`Fracture Gap Width,${params.gapSizeMm.toFixed(2)},mm`);
  lines.push(`Callus Index,${params.callusIndex.toFixed(2)},dimensionless`);
  lines.push(`Fixation Type,${params.fixationType},`);
  lines.push(`Fixation Stiffness,${params.fixationStiffnessPct},% nominal`);
  lines.push(`MSC Activity Multiplier,${params.mscActivity.toFixed(2)},x`);
  lines.push(`Bone Graft / Material,${params.graftType},`);
  lines.push(`Clinical Union Day (>=15 Nm/deg),${summary.unionDay ?? 'Non-Union'},days`);
  lines.push(`Fixator Removal Day,${summary.fixatorRemovalDay ?? 'N/A'},days`);
  lines.push(`Peak Bending Stiffness,${summary.peakStiffnessNmDeg.toFixed(2)},Nm/deg`);
  lines.push(`Final Bending Stiffness,${summary.finalStiffnessNmDeg.toFixed(2)},Nm/deg`);
  lines.push(`Outcome Classification,${summary.outcomeStatus},`);
  lines.push('');
  lines.push('SECTION 2: HEALING TIMELINE TRAJECTORY');
  lines.push('Day,Week,WeightBearing_Pct,FixatorActive,BendingStiffness_NmDeg,IFS_Max_Pct,IFS_Ant_Pct,IFS_Post_Pct,FixatorLoadShare_Pct,Bone_Pct,Cartilage_Pct,Fibrous_Pct,Resorbed_Pct,CenterStimulus_S');
  snapshots.forEach((s) => {
    lines.push([
      s.day,
      s.week.toFixed(2),
      s.weightBearingPct.toFixed(1),
      s.fixatorActive ? 1 : 0,
      s.bendingStiffnessNmDeg.toFixed(3),
      s.ifsMaxPct.toFixed(3),
      s.ifsAntPct.toFixed(3),
      s.ifsPostPct.toFixed(3),
      s.fixatorLoadSharePct.toFixed(2),
      s.boneFractionPct.toFixed(2),
      s.cartilageFractionPct.toFixed(2),
      s.fibrousFractionPct.toFixed(2),
      s.resorbedFractionPct.toFixed(2),
      s.centerStimulusS.toFixed(4)
    ].join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FractureHealing_Gap${params.gapSizeMm.toFixed(1)}mm_${params.fixationType}_${params.graftType}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
