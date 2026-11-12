/**
 * renderer.js — Interactive Dual-Viewport HTML5 Canvas Visualizer
 * LTU Experimental Biomechanics Laboratory (EBL) · BME 5313 / 6303
 * Bone Fracture Healing & Mechanoregulation Simulator
 * Based on Byrne, Lacroix & Prendergast (2011), J Orthop Res 29:1496–1503
 * & Perier-Metz, Duda & Checa (2020), Front Bioeng Biotechnol 8:585799.
 *
 * Left Viewport (~36% width):
 *   - Clinical/textbook sagittal/AP-oblique overview of the human tibia shaft
 *     centered on the fracture gap, with medullary canal, cortical walls,
 *     translucent bulging fracture callus, active fixation hardware
 *     (external fixator with auto-removal ghost state, locking plate, IM nail,
 *     or cast sleeve), animated/live sagittal bending deflection, and gait load vectors.
 *   - Zoom-box bracket pointing to the Right Viewport.
 *
 * Right Viewport (~64% width):
 *   - Magnified sagittal callus cross-section (-x Posterior left, +x Anterior right;
 *     -z Distal bottom, +z Proximal top) over the nx × nz lattice.
 *   - 4 Field Modes:
 *       'phenotype'   : Histological tissue phenotypes + cortical ends + scaffold struts
 *       'stimulus'    : Prendergast stimulus S across the 5 mechanoregulation bands
 *       'strain_flow' : Octahedral shear strain γ (%) heatmap + fluid velocity vectors v
 *       'cells'       : 30% opacity tissue backdrop + discrete cell glyphs
 *   - Overlays: showHardware, showVectors, showCells, showRegions
 *   - Interactive Hover Probe with crosshair, glassmorphic tooltip, and callback
 *   - Mouse wheel zoom, drag-to-pan, and DevicePixelRatio-aware ResizeObserver
 */

// =============================================================================
// CONSTANTS & PALETTES
// =============================================================================

const PHENOTYPE_META = {
  outside: { id: 'outside', name: 'Soft Tissue / Outside', color: '#f8fafc', rgb: [248, 250, 252] },
  marrow: { id: 'marrow', name: 'Marrow / Resorbed', color: '#fef3c7', rgb: [254, 243, 199] },
  granulation: { id: 'granulation', name: 'Granulation Tissue', color: '#fda4af', rgb: [253, 164, 175] },
  fibrous: { id: 'fibrous', name: 'Fibrous Tissue', color: '#ef4444', rgb: [239, 68, 68] },
  cartilage: { id: 'cartilage', name: 'Cartilage', color: '#8b5cf6', rgb: [139, 92, 246] },
  immature_bone: { id: 'immature_bone', name: 'Immature Woven Bone', color: '#84cc16', rgb: [132, 204, 22] },
  mature_bone: { id: 'mature_bone', name: 'Mature Lamellar Bone', color: '#15803d', rgb: [21, 128, 61] },
  cortical: { id: 'cortical', name: 'Intact Cortical Bone', color: '#e7e5e4', rgb: [231, 229, 228] },
  scaffold: { id: 'scaffold', name: '3D Scaffold Strut', color: '#475569', rgb: [71, 85, 105] }
};

const CELL_META = {
  msc: { id: 'msc', name: 'MSC (Progenitor)', color: '#f59e0b' },
  fibroblast: { id: 'fibroblast', name: 'Fibroblast', color: '#ef4444' },
  chondrocyte: { id: 'chondrocyte', name: 'Chondrocyte', color: '#8b5cf6' },
  osteoblast: { id: 'osteoblast', name: 'Osteoblast', color: '#10b981' },
  osteoclast: { id: 'osteoclast', name: 'Osteoclast', color: '#0284c7' },
  osteocyte: { id: 'osteocyte', name: 'Osteocyte (Cortical)', color: '#64748b' },
  none: { id: 'none', name: 'Acellular / Matrix', color: '#94a3b8' }
};

const NUMERIC_TISSUE_MAP = {
  [-1]: 'outside',
  0: 'marrow',
  1: 'granulation',
  2: 'fibrous',
  3: 'cartilage',
  4: 'immature_bone',
  5: 'mature_bone',
  6: 'cortical',
  7: 'scaffold'
};

const RENDERER_FIXATION_LABELS = {
  external_fixator: 'Unilateral Ext. Fixator',
  locking_plate: 'Medial Locking Plate',
  im_nail: 'Intramedullary Nail',
  cast_unfixed: 'Functional Cast / Brace'
};

export class FractureRenderer {
  /**
   * Create a dual-viewport bone fracture healing renderer.
   * @param {HTMLCanvasElement} canvas - Target HTML5 canvas element.
   * @param {Function|null} [onHoverProbe=null] - Callback invoked with probe data on hover, or null on leave.
   */
  constructor(canvas, onHoverProbe = null) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.onHoverProbe = onHoverProbe;

    // High-DPI display metrics
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this.width = 960;
    this.height = 515;

    // Visualization mode & current day
    this.fieldMode = 'phenotype'; // 'phenotype' | 'stimulus' | 'strain_flow' | 'cells'
    this.day = 0;

    // Overlay toggles
    this.overlays = {
      showHardware: true,
      showVectors: true,
      showCells: true,
      showRegions: true
    };

    // Zoom & pan state for magnified right viewport
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Pointer interaction state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
    this.mousePos = { x: -1000, y: -1000 };
    this.hoverProbe = null;

    // Cached layout boxes
    this._layout = {
      leftPanel: { x: 0, y: 44, w: 345, h: 425 },
      rightPanel: { x: 345, y: 44, w: 615, h: 425 },
      plotFrame: { x: 400, y: 84, w: 430, h: 340 },
      plot2D: { x: 400, y: 84, w: 430, h: 340 },
      colorbar: { x: 848, y: 88, w: 18, h: 330 },
      zoomBoxLeft: { x: 100, y: 200, w: 100, h: 90 }
    };

    // Offscreen canvas for lattice / heatmap rendering
    this._offscreen = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    this._offCtx = this._offscreen ? this._offscreen.getContext('2d') : null;

    // Cached last simulation result
    this.lastSimResult = null;
    this._resizeObserver = null;
    this._boundResize = () => this.resize();

    if (this.canvas) {
      this._initEvents();
      this._initResizeObserver();
      this.resize();
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Set active spatial field visualization mode.
   * @param {'phenotype'|'stimulus'|'strain_flow'|'cells'} mode
   */
  setFieldMode(mode) {
    const valid = ['phenotype', 'stimulus', 'strain_flow', 'cells'];
    if (!valid.includes(mode)) return;
    this.fieldMode = mode;
    if (this.lastSimResult) {
      this._updateHoverProbeFromMouse();
      this.render(this.lastSimResult, this.day);
    }
  }

  /**
   * Update visual overlay flags.
   * @param {Object} overlays - Partial or full overlay flags { showHardware, showVectors, showCells, showRegions }.
   */
  setOverlays(overlays = {}) {
    if (!overlays || typeof overlays !== 'object') return;
    Object.assign(this.overlays, overlays);
    if (this.lastSimResult) {
      this.render(this.lastSimResult, this.day);
    }
  }

  /**
   * Set current simulation day and re-render if data is available.
   * @param {number} day
   */
  setDay(day) {
    if (typeof day === 'number' && !Number.isNaN(day)) {
      this.day = day;
      if (this.lastSimResult) {
        this._updateHoverProbeFromMouse();
        this.render(this.lastSimResult, this.day);
      }
    }
  }

  /**
   * Zoom in on the magnified callus cross-section.
   */
  zoomIn() {
    this._setZoom(this.zoom * 1.18);
  }

  /**
   * Zoom out on the magnified callus cross-section.
   */
  zoomOut() {
    this._setZoom(this.zoom / 1.18);
  }

  /**
   * Reset zoom and pan of the magnified callus cross-section to default.
   */
  resetView() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    if (this.lastSimResult) {
      this._updateHoverProbeFromMouse();
      this.render(this.lastSimResult, this.day);
    }
  }

  /**
   * Get current zoom factor.
   * @returns {number}
   */
  getZoom() {
    return this.zoom;
  }

  /**
   * Resize canvas to match container CSS dimensions with DevicePixelRatio scaling.
   */
  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    const cssWidth = Math.max(360, Math.floor(rect.width || 960));
    const cssHeight = Math.max(360, Math.floor(rect.height || 515));

    this.width = cssWidth;
    this.height = cssHeight;

    const targetW = Math.round(cssWidth * this.dpr);
    const targetH = Math.round(cssHeight * this.dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    if (this.lastSimResult) {
      this.render(this.lastSimResult, this.day);
    }
  }

  /**
   * Render the dual-viewport tibia and callus lattice visualization.
   * @param {Object} simResult - Simulation result containing parameters, snapshots, and lattice fields.
   * @param {number|null} [day=null] - Optional day to select snapshot; defaults to current renderer day.
   */
  render(simResult, day = null) {
    if (!this.ctx || !simResult) return;
    this.lastSimResult = simResult;
    if (day !== null && day !== undefined && !Number.isNaN(Number(day))) {
      this.day = Number(day);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Extract & normalize snapshot + spatial lattice data
    const data = this._extractRenderData(simResult, this.day);

    // 2. Compute responsive dual-viewport geometry
    this._computeLayout(data);

    // 3. Clinical paper background & subtle grid
    this._drawBackground(ctx);

    // 4. Left Viewport (~36%): Whole Tibia, Fixation Hardware, Load Arrows, Bending
    this._drawLeftTibiaViewport(ctx, data);

    // 5. Center Divider
    this._drawPanelDivider(ctx);

    // 6. Right Viewport (~64%): Magnified Sagittal Callus Lattice + Colorbar/Legend
    this._drawRightCallusViewport(ctx, data);

    // 7. Zoom-box connector linking Left Fracture Site to Right Magnified Viewport
    this._drawZoomConnector(ctx, data);

    // 8. Interactive Hover Crosshair & Glassmorphic Tooltip
    if (this.hoverProbe) {
      this._drawHoverProbeOverlay(ctx, data, this.hoverProbe);
    }

    ctx.restore();
  }

  // ===========================================================================
  // INTERNAL ZOOM, EVENTS & RESIZE OBSERVER
  // ===========================================================================

  _setZoom(z) {
    if (typeof z !== 'number' || Number.isNaN(z)) return;
    this.zoom = Math.max(0.75, Math.min(3.5, z));
    if (this.zoom <= 1.02) {
      this.panX = 0;
      this.panY = 0;
    }
    if (this.lastSimResult) {
      this._updateHoverProbeFromMouse();
      this.render(this.lastSimResult, this.day);
    }
  }

  _initResizeObserver() {
    if (typeof ResizeObserver !== 'undefined' && this.canvas) {
      this._resizeObserver = new ResizeObserver(this._boundResize);
      this._resizeObserver.observe(this.canvas.parentElement || this.canvas);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._boundResize);
    }
  }

  _initEvents() {
    const c = this.canvas;
    if (!c) return;

    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.mousePos = { x: mx, y: my };

      if (this.isDragging) {
        const dx = mx - this.dragStart.x;
        const dy = my - this.dragStart.y;
        const maxPanX = Math.max(60, this._layout.plot2D.w * 0.45);
        const maxPanY = Math.max(60, this._layout.plot2D.h * 0.45);
        this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.dragStart.panX + dx));
        this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.dragStart.panY + dy));
        if (this.lastSimResult) this.render(this.lastSimResult, this.day);
        return;
      }

      this._updateHoverProbeFromMouse();
      if (this.lastSimResult) {
        this.render(this.lastSimResult, this.day);
      }
    });

    c.addEventListener('mousedown', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const pf = this._layout.plotFrame;

      if (mx >= pf.x && mx <= pf.x + pf.w && my >= pf.y && my <= pf.y + pf.h && (this.zoom > 1.02 || e.shiftKey || e.button === 1)) {
        this.isDragging = true;
        this.dragStart = { x: mx, y: my, panX: this.panX, panY: this.panY };
        c.style.cursor = 'grabbing';
      }
    });

    const endDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this._updateCursor();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', endDrag);
    }

    c.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.mousePos = { x: -1000, y: -1000 };
      if (this.hoverProbe !== null) {
        this.hoverProbe = null;
        if (typeof this.onHoverProbe === 'function') {
          this.onHoverProbe(null);
        }
        if (this.lastSimResult) {
          this.render(this.lastSimResult, this.day);
        }
      }
    });

    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx >= this._layout.rightPanel.x) {
        this.resetView();
      }
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
      this._setZoom(this.zoom * factor);
    }, { passive: false });
  }

  _updateCursor() {
    if (!this.canvas) return;
    const { x, y } = this.mousePos;
    const pf = this._layout.plotFrame;
    if (this.isDragging) {
      this.canvas.style.cursor = 'grabbing';
    } else if (x >= pf.x && x <= pf.x + pf.w && y >= pf.y && y <= pf.y + pf.h) {
      this.canvas.style.cursor = this.zoom > 1.02 ? 'grab' : 'crosshair';
    } else {
      this.canvas.style.cursor = 'default';
    }
  }

  // ===========================================================================
  // DATA NORMALIZATION & SNAPSHOT EXTRACTION
  // ===========================================================================

  _extractRenderData(simResult, targetDay) {
    const params = simResult.params || {};
    const snap = this._resolveSnapshot(simResult, targetDay);

    const day = Number(snap.day ?? targetDay ?? 0);
    const gapSizeMm = Number(params.gapSizeMm ?? snap.gapSizeMm ?? 3.0);
    const callusIndex = Number(params.callusIndex ?? snap.callusIndex ?? 1.4);
    const fixationType = params.fixationType || snap.fixationType || 'external_fixator';
    const fixationStiffnessPct = Number(params.fixationStiffnessPct ?? 100);
    const loadMultiplier = Number(params.loadMultiplier ?? 1.0);
    const graftType = params.graftType || 'none';
    const weightBearingPct = Number(snap.weightBearingPct ?? 50);
    const ifsMaxPct = Number(snap.ifsMaxPct ?? snap.ifsPct ?? 2.0);
    const stiffnessNmDeg = Number(snap.bendingStiffnessNmDeg ?? snap.stiffnessNmDeg ?? snap.bendingStiffness ?? 5.0);

    const fixatorActive = snap.fixatorActive !== undefined
      ? Boolean(snap.fixatorActive)
      : (fixationType === 'external_fixator');

    const unionDay = simResult.unionDay ?? simResult.summary?.unionDay ?? snap.fixatorRemovedDay ?? null;

    // Resolve lattice object (can sit on snap, snap.lattice, or snap.grid)
    const lat = snap.lattice || snap.grid || snap;
    const staticGrid = simResult.grid || simResult.gridMeta || simResult.latticeMeta || lat;
    const meta = simResult.gridMeta || simResult.latticeMeta || staticGrid;

    const nx = Number(lat.nx ?? meta.nx ?? 36);
    const nz = Number(lat.nz ?? meta.nz ?? 44);

    // Physical domain dimensions (mm): centered around fracture (x = 0, z = 0)
    const widthMm = Number(lat.widthMm ?? meta.widthMm ?? 36);
    const heightMm = Number(lat.heightMm ?? meta.heightMm ?? Math.max(32, gapSizeMm + 28));
    const xMinMm = Number(lat.xMinMm ?? meta.xMinMm ?? (-widthMm * 0.5));
    const xMaxMm = Number(lat.xMaxMm ?? meta.xMaxMm ?? (widthMm * 0.5));
    const zMinMm = Number(lat.zMinMm ?? meta.zMinMm ?? (-heightMm * 0.5));
    const zMaxMm = Number(lat.zMaxMm ?? meta.zMaxMm ?? (heightMm * 0.5));

    // Extract fields (supporting both 1D flat arrays and 2D [iz][ix] arrays)
    const phenotypeRaw = lat.phenotypeGrid || lat.phenotype || lat.tissueGrid || lat.tissue || lat.tissueType;
    const stimulusRaw = lat.stimulusGrid || lat.stimulusS || lat.stimulus || lat.S;
    const strainRaw = lat.shearStrainPctGrid || lat.shearStrainPct || lat.gammaPct || lat.strainGrid || lat.strain;
    const fluidRaw = lat.fluidVelocityUmSGrid || lat.fluidVelocityUmS || lat.fluidVel || lat.vUmS || lat.fluidGrid;
    const vxRaw = lat.fluidVxGrid || lat.vxUmS || lat.fluidVx || null;
    const vzRaw = lat.fluidVzGrid || lat.vzUmS || lat.fluidVz || null;
    const modulusRaw = lat.modulusMPaGrid || lat.modulusMPa || lat.E || lat.modulusGrid;
    const mscRaw = lat.mscDensityGrid || lat.mscDensity || lat.msc || lat.mscGrid;
    const cellTypeRaw = lat.cellTypeGrid || lat.cellType || lat.cells || null;
    const scaffoldRaw = lat.scaffoldMask || lat.scaffoldGrid || lat.scaffold || staticGrid.scaffoldMask || null;
    const corticalRaw = lat.corticalMask || lat.corticalGrid || staticGrid.corticalMask || null;
    const regionRaw = lat.regionGrid || lat.regionMap || lat.region || null;

    const totalCells = nx * nz;
    const phenotype = new Array(totalCells);
    const stimulus = new Float32Array(totalCells);
    const strain = new Float32Array(totalCells);
    const fluid = new Float32Array(totalCells);
    const vx = vxRaw ? new Float32Array(totalCells) : null;
    const vz = vzRaw ? new Float32Array(totalCells) : null;
    const modulus = new Float32Array(totalCells);
    const msc = new Float32Array(totalCells);
    const scaffoldMask = new Uint8Array(totalCells);
    const cellType = new Array(totalCells);
    const regionName = new Array(totalCells);

    // Geometry constants for fallback anatomical masking
    const outerRadius = Number(staticGrid.rCortMm ?? 10.0); // mm cortical outer half-width
    const innerRadius = Number(staticGrid.rMarrowMm ?? 5.0); // mm medullary canal half-width
    const halfGap = gapSizeMm * 0.5;
    const callusBulge = outerRadius * (0.95 + (callusIndex - 1.0) * 0.95);

    let hasScaffold = false;

    for (let iz = 0; iz < nz; iz++) {
      const zFrac = (iz + 0.5) / nz;
      const zMm = zMinMm + zFrac * (zMaxMm - zMinMm);

      for (let ix = 0; ix < nx; ix++) {
        const xFrac = (ix + 0.5) / nx;
        const xMm = xMinMm + xFrac * (xMaxMm - xMinMm);
        const idx = iz * nx + ix;

        // Scaffold mask
        const scafVal = scaffoldRaw ? this._readGrid(scaffoldRaw, iz, ix, nx) : 0;
        const isScaffold = Number(scafVal) === 1 || scafVal === true;
        scaffoldMask[idx] = isScaffold ? 1 : 0;
        if (isScaffold) hasScaffold = true;

        // Cortical mask check
        const isCortRaw = corticalRaw ? Boolean(this._readGrid(corticalRaw, iz, ix, nx)) : null;

        // Phenotype normalization
        let pKey = this._normalizePhenotypeKey(
          phenotypeRaw ? this._readGrid(phenotypeRaw, iz, ix, nx) : null,
          simResult.TISSUE_TYPES || simResult.PHENOTYPES
        );

        if (!pKey) {
          // Anatomical fallback if no phenotype array was provided
          const absX = Math.abs(xMm);
          const absZ = Math.abs(zMm);
          if (absZ > halfGap && absX >= innerRadius && absX <= outerRadius) {
            pKey = 'cortical';
          } else if (absZ > halfGap && absX < innerRadius) {
            pKey = 'marrow';
          } else {
            const bulgeProfile = Math.exp(-Math.pow(zMm / Math.max(4, halfGap + 7), 2));
            const maxX = outerRadius + (callusBulge - outerRadius) * bulgeProfile;
            pKey = absX <= maxX ? 'granulation' : 'outside';
          }
        } else if (isCortRaw && pKey !== 'scaffold') {
          pKey = 'cortical';
        }
        if (isScaffold) pKey = 'scaffold';
        phenotype[idx] = pKey;

        // Mechanical fields
        const sVal = stimulusRaw ? Number(this._readGrid(stimulusRaw, iz, ix, nx)) : 0.8;
        const gVal = strainRaw ? Number(this._readGrid(strainRaw, iz, ix, nx)) : (sVal * 2.1);
        const vVal = fluidRaw ? Number(this._readGrid(fluidRaw, iz, ix, nx)) : (sVal * 1.1);
        stimulus[idx] = Number.isFinite(sVal) ? sVal : 0;
        strain[idx] = Number.isFinite(gVal) ? gVal : 0;
        fluid[idx] = Number.isFinite(vVal) ? vVal : 0;

        if (vx && vxRaw) vx[idx] = Number(this._readGrid(vxRaw, iz, ix, nx)) || 0;
        if (vz && vzRaw) vz[idx] = Number(this._readGrid(vzRaw, iz, ix, nx)) || 0;

        // Modulus
        let eVal = modulusRaw ? Number(this._readGrid(modulusRaw, iz, ix, nx)) : NaN;
        if (!Number.isFinite(eVal)) {
          eVal = this._defaultModulusForPhenotype(pKey);
        }
        modulus[idx] = eVal;

        // MSC density
        const mVal = mscRaw ? Number(this._readGrid(mscRaw, iz, ix, nx)) : (pKey === 'outside' || pKey === 'cortical' ? 0 : 0.35);
        msc[idx] = Number.isFinite(mVal) ? Math.max(0, Math.min(1, mVal)) : 0;

        // Cell type
        const cRaw = cellTypeRaw ? this._readGrid(cellTypeRaw, iz, ix, nx) : null;
        cellType[idx] = this._normalizeCellKey(cRaw, pKey, msc[idx], stimulus[idx]);

        // Anatomical region label
        const rRaw = regionRaw ? this._readGrid(regionRaw, iz, ix, nx) : null;
        regionName[idx] = rRaw ? String(rRaw) : this._inferRegionName(xMm, zMm, halfGap, innerRadius, outerRadius, pKey);
      }
    }

    // Derive fluid velocity vectors if scalar speed was given without vx/vz
    const vecX = vx || new Float32Array(totalCells);
    const vecZ = vz || new Float32Array(totalCells);
    if (!vxRaw || !vzRaw) {
      for (let iz = 0; iz < nz; iz++) {
        const zFrac = (iz + 0.5) / nz;
        const zMm = zMinMm + zFrac * (zMaxMm - zMinMm);
        for (let ix = 0; ix < nx; ix++) {
          const xFrac = (ix + 0.5) / nx;
          const xMm = xMinMm + xFrac * (xMaxMm - xMinMm);
          const idx = iz * nx + ix;
          const pKey = phenotype[idx];
          if (pKey === 'outside' || pKey === 'cortical' || pKey === 'scaffold') {
            vecX[idx] = 0;
            vecZ[idx] = 0;
            continue;
          }
          const speed = fluid[idx];
          // Fluid squeezes radially outward from the compressed gap & canal toward periosteum
          const rx = xMm === 0 ? 0.15 : xMm;
          const rz = zMm * 0.45;
          const norm = Math.hypot(rx, rz) || 1;
          vecX[idx] = (rx / norm) * speed;
          vecZ[idx] = (rz / norm) * speed;
        }
      }
    }

    return {
      raw: simResult,
      snap,
      day,
      params: {
        gapSizeMm,
        callusIndex,
        fixationType,
        fixationStiffnessPct,
        loadMultiplier,
        graftType
      },
      weightBearingPct,
      ifsMaxPct,
      stiffnessNmDeg,
      fixatorActive,
      unionDay,
      nx,
      nz,
      widthMm: xMaxMm - xMinMm,
      heightMm: zMaxMm - zMinMm,
      xMinMm,
      xMaxMm,
      zMinMm,
      zMaxMm,
      outerRadius,
      innerRadius,
      halfGap,
      hasScaffold,
      fields: {
        phenotype,
        stimulus,
        strain,
        fluid,
        vecX,
        vecZ,
        modulus,
        msc,
        scaffoldMask,
        cellType,
        regionName
      }
    };
  }

  _resolveSnapshot(simResult, targetDay) {
    if (typeof simResult.getSnapshotAtDay === 'function') {
      const s = simResult.getSnapshotAtDay(targetDay);
      if (s) return s;
    }
    if (typeof simResult.getSnapshot === 'function') {
      const s = simResult.getSnapshot(targetDay);
      if (s) return s;
    }
    const list = simResult.snapshots || simResult.timeline || simResult.history;
    if (Array.isArray(list) && list.length > 0) {
      let best = list[0];
      let bestDist = Math.abs(Number(best.day ?? 0) - targetDay);
      for (let i = 1; i < list.length; i++) {
        const d = Math.abs(Number(list[i].day ?? 0) - targetDay);
        if (d < bestDist) {
          best = list[i];
          bestDist = d;
        }
      }
      return best;
    }
    return simResult;
  }

  _readGrid(arr, iz, ix, nx) {
    if (Array.isArray(arr[0])) {
      return arr[iz] ? arr[iz][ix] : undefined;
    }
    return arr[iz * nx + ix];
  }

  _normalizePhenotypeKey(val, customEnum) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') {
      const s = val.toLowerCase().trim();
      if (s === 'outside' || s === 'void' || s === 'empty' || s === 'air') return 'outside';
      if (s === 'marrow' || s === 'resorbed' || s === 'resorption') return 'marrow';
      if (s === 'granulation' || s === 'hematoma') return 'granulation';
      if (s === 'fibrous' || s === 'fibrous_tissue') return 'fibrous';
      if (s === 'cartilage' || s === 'chondroid') return 'cartilage';
      if (s === 'immature' || s === 'immature_bone' || s === 'woven' || s === 'woven_bone') return 'immature_bone';
      if (s === 'mature' || s === 'mature_bone' || s === 'lamellar' || s === 'bone') return 'mature_bone';
      if (s === 'cortical' || s === 'cortical_bone' || s === 'intact_bone') return 'cortical';
      if (s === 'scaffold' || s === 'strut' || s === 'graft_strut') return 'scaffold';
    }
    if (typeof val === 'number') {
      if (customEnum && typeof customEnum === 'object') {
        for (const [k, v] of Object.entries(customEnum)) {
          if (v === val) {
            return this._normalizePhenotypeKey(k, null);
          }
        }
      }
      return NUMERIC_TISSUE_MAP[val] || 'granulation';
    }
    return null;
  }

  _normalizeCellKey(raw, pKey, mscDensity, stimulusS) {
    if (raw && typeof raw === 'string') {
      const s = raw.toLowerCase();
      if (s.includes('msc')) return 'msc';
      if (s.includes('fibro')) return 'fibroblast';
      if (s.includes('chondro')) return 'chondrocyte';
      if (s.includes('osteoblast')) return 'osteoblast';
      if (s.includes('osteoclast')) return 'osteoclast';
      if (s.includes('osteocyte')) return 'osteocyte';
    }
    if (pKey === 'outside' || pKey === 'scaffold') return 'none';
    if (pKey === 'cortical') return 'osteocyte';
    if (pKey === 'marrow') {
      return stimulusS <= 0.01 ? 'osteoclast' : (mscDensity > 0.12 ? 'msc' : 'none');
    }
    if (pKey === 'granulation') return mscDensity > 0.08 ? 'msc' : 'none';
    if (pKey === 'fibrous') return 'fibroblast';
    if (pKey === 'cartilage') return 'chondrocyte';
    if (pKey === 'immature_bone' || pKey === 'mature_bone') {
      return stimulusS <= 0.01 ? 'osteoclast' : 'osteoblast';
    }
    return 'none';
  }

  _defaultModulusForPhenotype(pKey) {
    switch (pKey) {
      case 'granulation': return 0.2;
      case 'fibrous': return 2.0;
      case 'cartilage': return 10.0;
      case 'immature_bone': return 1000.0;
      case 'mature_bone': return 6000.0;
      case 'cortical': return 17000.0;
      case 'scaffold': return 110000.0;
      case 'marrow': return 0.2;
      default: return 0.0;
    }
  }

  _inferRegionName(xMm, zMm, halfGap, innerRadius, outerRadius, pKey) {
    if (pKey === 'outside') return 'Surrounding Soft Tissue';
    if (pKey === 'cortical') return xMm < 0 ? 'Posterior Cortex' : 'Anterior Cortex';
    if (Math.abs(xMm) < innerRadius && Math.abs(zMm) > halfGap * 1.2) {
      return 'Medullary Canal';
    }
    if (Math.abs(zMm) <= halfGap * 1.15 && Math.abs(xMm) <= outerRadius * 1.05) {
      return xMm < 0 ? 'Posterior Gap' : 'Anterior Gap';
    }
    return xMm < 0 ? 'Posterior External Callus' : 'Anterior External Callus';
  }

  // ===========================================================================
  // RESPONSIVE LAYOUT & BACKGROUND
  // ===========================================================================

  _computeLayout(data) {
    const W = this.width;
    const H = this.height;

    const topSafe = 44;
    const bottomSafe = 44;

    const leftW = Math.round(W * 0.36);
    const rightW = W - leftW;

    this._layout.leftPanel = {
      x: 0,
      y: topSafe,
      w: leftW,
      h: H - topSafe - bottomSafe
    };

    this._layout.rightPanel = {
      x: leftW,
      y: topSafe,
      w: rightW,
      h: H - topSafe - bottomSafe
    };

    const rp = this._layout.rightPanel;
    const padLeft = 52;
    const padRight = 134; // Room for colorbar / phenotype legend on right edge
    const padTop = 44;
    const padBottom = 42;

    const frameW = Math.max(150, rp.w - padLeft - padRight);
    const frameH = Math.max(140, rp.h - padTop - padBottom);

    this._layout.plotFrame = {
      x: Math.round(rp.x + padLeft),
      y: Math.round(rp.y + padTop),
      w: Math.round(frameW),
      h: Math.round(frameH)
    };

    // Fit physical aspect ratio cleanly inside plotFrame, then apply zoom & pan
    const physRatio = data.widthMm / Math.max(1, data.heightMm);
    let baseW = frameW;
    let baseH = baseW / physRatio;
    if (baseH > frameH) {
      baseH = frameH;
      baseW = baseH * physRatio;
    }

    const scaledW = baseW * this.zoom;
    const scaledH = baseH * this.zoom;
    const cx = this._layout.plotFrame.x + frameW * 0.5 + this.panX;
    const cy = this._layout.plotFrame.y + frameH * 0.5 + this.panY;

    this._layout.plot2D = {
      x: Math.round(cx - scaledW * 0.5),
      y: Math.round(cy - scaledH * 0.5),
      w: Math.round(scaledW),
      h: Math.round(scaledH)
    };

    this._layout.colorbar = {
      x: Math.round(this._layout.plotFrame.x + frameW + 18),
      y: Math.round(this._layout.plotFrame.y + 8),
      w: 16,
      h: Math.round(Math.max(120, frameH - 16))
    };
  }

  _drawBackground(ctx) {
    ctx.clearRect(0, 0, this.width, this.height);

    // Soft clinical slate-white backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f8fafc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle scientific blueprint micro-grid
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = 1;
    const step = 24;
    for (let x = step; x < this.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = step; y < this.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPanelDivider(ctx) {
    const x = this._layout.leftPanel.w;
    ctx.save();
    const grad = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.35)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 6, 42, 12, this.height - 84);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 42);
    ctx.lineTo(x, this.height - 42);
    ctx.stroke();
    ctx.restore();
  }

  // ===========================================================================
  // LEFT VIEWPORT (~36%): ANATOMICAL HUMAN TIBIA & FIXATION OVERVIEW
  // ===========================================================================

  _drawLeftTibiaViewport(ctx, data) {
    const lp = this._layout.leftPanel;
    const { params, ifsMaxPct, weightBearingPct, fixatorActive, unionDay } = data;

    ctx.save();

    // Header Title & Subtitle
    const headerX = lp.x + lp.w * 0.5;
    ctx.font = '700 11px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText('ANATOMICAL TIBIA & FIXATION OVERVIEW', headerX, lp.y + 12);

    ctx.font = '500 10px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    const fixLabel = RENDERER_FIXATION_LABELS[params.fixationType] || params.fixationType;
    ctx.fillText(
      `${fixLabel} (${params.fixationStiffnessPct}%) · Day ${Math.round(data.day)}`,
      headerX,
      lp.y + 26
    );

    // Center of tibia diagram (offset slightly right to give room for external fixator bar on left)
    const cx = lp.x + lp.w * (params.fixationType === 'external_fixator' ? 0.56 : 0.50);
    const topY = lp.y + 56;
    const botY = lp.y + lp.h - 24;
    const totalH = Math.max(160, botY - topY);
    const midY = topY + totalH * 0.5;

    // Visual shaft dimensions
    const shaftHalfW = Math.min(24, lp.w * 0.088);
    const marrowHalfW = shaftHalfW * 0.50;
    const gapPx = Math.max(4, Math.min(34, 3 + params.gapSizeMm * 1.22));
    const halfGapPx = gapPx * 0.5;

    // Subtle live sagittal bending deflection proportional to ifsMaxPct
    const clampedIfs = Math.min(20, Math.max(0, ifsMaxPct));
    const bendAngleRad = (clampedIfs * 0.0055); // Up to ~6.3 deg exaggerated visual tilt
    const bendOffsetPx = Math.sin(bendAngleRad) * (totalH * 0.35);

    // Callus color modulated by dominant healing phase / day
    const callusColor = this._getOverviewCallusColor(data);
    const callusRx = shaftHalfW * (1.05 + (params.callusIndex - 1.0) * 1.15);
    const callusRy = halfGapPx + 24 + (params.callusIndex - 1.0) * 12;

    // 1. Cast / Functional Brace outer sleeve (drawn behind/around tibia if selected)
    if (this.overlays.showHardware && params.fixationType === 'cast_unfixed') {
      this._drawCastSleeve(ctx, cx, topY, botY, shaftHalfW, midY, clampedIfs);
    }

    // 2. Translucent Bulging Fracture Callus around fracture site
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + bendOffsetPx * 0.12, midY, callusRx, callusRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = callusColor.fill;
    ctx.fill();
    ctx.strokeStyle = callusColor.stroke;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 3. Proximal Tibia Fragment (tilts slightly around fracture center under bending)
    ctx.save();
    ctx.translate(cx, midY);
    ctx.rotate(bendAngleRad);
    ctx.translate(-cx, -midY);
    this._drawTibiaFragment(ctx, cx, topY, midY - halfGapPx, shaftHalfW, marrowHalfW, 'proximal');
    ctx.restore();

    // 4. Distal Tibia Fragment (stationary anchored distal plafond)
    this._drawTibiaFragment(ctx, cx, midY + halfGapPx, botY, shaftHalfW, marrowHalfW, 'distal');

    // 5. Graft visual indicator inside gap if large defect has graft
    if (params.graftType && params.graftType !== 'none') {
      this._drawOverviewGraftIndicator(ctx, cx, midY, shaftHalfW, halfGapPx, params.graftType);
    }

    // 6. Active Fixation Hardware (when showHardware is true)
    if (this.overlays.showHardware) {
      if (params.fixationType === 'external_fixator') {
        this._drawExternalFixatorOverview(ctx, cx, topY, botY, midY, shaftHalfW, bendAngleRad, fixatorActive, unionDay, lp);
      } else if (params.fixationType === 'locking_plate') {
        this._drawLockingPlateOverview(ctx, cx, topY, botY, midY, shaftHalfW, bendAngleRad);
      } else if (params.fixationType === 'im_nail') {
        this._drawIMNailOverview(ctx, cx, topY, botY, midY, marrowHalfW, bendAngleRad);
      }
    }

    // 7. Physiological Gait Load Arrows (when showVectors is true)
    if (this.overlays.showVectors) {
      this._drawOverviewLoadVectors(ctx, cx, topY, botY, shaftHalfW, weightBearingPct, params.loadMultiplier, bendOffsetPx);
    }

    // 8. Anatomical Orientation Labels (Ant.-Med. / Post.)
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Ant.-Med.', cx - shaftHalfW - 22, botY - 8);
    ctx.fillText('Post.', cx + shaftHalfW + 16, botY - 8);

    // 9. Zoom-box bracket around fracture site (stored for connector to Right Viewport)
    const zbW = Math.max(callusRx * 2 + 18, shaftHalfW * 2.8);
    const zbH = Math.max(callusRy * 2 + 12, gapPx + 54);
    const zb = {
      x: Math.round(cx - zbW * 0.5),
      y: Math.round(midY - zbH * 0.5),
      w: Math.round(zbW),
      h: Math.round(zbH)
    };
    this._layout.zoomBoxLeft = zb;

    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    this._roundRect(ctx, zb.x, zb.y, zb.w, zb.h, 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.restore();
  }

  _drawTibiaFragment(ctx, cx, zTop, zBot, shaftHalfW, marrowHalfW, endType) {
    const isProx = endType === 'proximal';
    const len = Math.max(20, zBot - zTop);
    const flare = isProx ? shaftHalfW * 0.72 : shaftHalfW * 0.52;
    const flareLen = Math.min(len * 0.34, 34);

    // Outer bone silhouette path
    ctx.save();
    ctx.beginPath();
    if (isProx) {
      // Proximal plateau flare at top, flat osteotomy cut at bottom (zBot)
      ctx.moveTo(cx - shaftHalfW - flare, zTop + 4);
      ctx.quadraticCurveTo(cx, zTop - 4, cx + shaftHalfW + flare, zTop + 4);
      ctx.quadraticCurveTo(cx + shaftHalfW + flare * 0.85, zTop + flareLen, cx + shaftHalfW, zTop + flareLen + 8);
      ctx.lineTo(cx + shaftHalfW, zBot);
      ctx.lineTo(cx - shaftHalfW, zBot);
      ctx.lineTo(cx - shaftHalfW, zTop + flareLen + 8);
      ctx.quadraticCurveTo(cx - shaftHalfW - flare * 0.85, zTop + flareLen, cx - shaftHalfW - flare, zTop + 4);
    } else {
      // Flat osteotomy cut at top (zTop), distal ankle plafond flare at bottom
      ctx.moveTo(cx - shaftHalfW, zTop);
      ctx.lineTo(cx + shaftHalfW, zTop);
      ctx.lineTo(cx + shaftHalfW, zBot - flareLen - 6);
      ctx.quadraticCurveTo(cx + shaftHalfW + flare * 0.75, zBot - flareLen * 0.4, cx + shaftHalfW + flare, zBot - 3);
      ctx.quadraticCurveTo(cx, zBot + 3, cx - shaftHalfW - flare, zBot - 3);
      ctx.quadraticCurveTo(cx - shaftHalfW - flare * 0.75, zBot - flareLen * 0.4, cx - shaftHalfW, zBot - flareLen - 6);
    }
    ctx.closePath();

    // Bone-ivory cortical gradient
    const boneGrad = ctx.createLinearGradient(cx - shaftHalfW - flare, 0, cx + shaftHalfW + flare, 0);
    boneGrad.addColorStop(0, '#d6d3d1');
    boneGrad.addColorStop(0.3, '#f5f5f4');
    boneGrad.addColorStop(0.7, '#e7e5e4');
    boneGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = boneGrad;
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Inner Medullary Canal
    const mTop = isProx ? zTop + flareLen * 0.55 : zTop + 1;
    const mBot = isProx ? zBot - 1 : zBot - flareLen * 0.55;
    if (mBot > mTop + 4) {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(cx - marrowHalfW, mTop, marrowHalfW * 2, mBot - mTop);
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - marrowHalfW, mTop);
      ctx.lineTo(cx - marrowHalfW, mBot);
      ctx.moveTo(cx + marrowHalfW, mTop);
      ctx.lineTo(cx + marrowHalfW, mBot);
      ctx.stroke();
    }
    ctx.restore();
  }

  _getOverviewCallusColor(data) {
    const f = data.fields.phenotype;
    let boneCount = 0;
    let cartCount = 0;
    let fibCount = 0;
    let total = 0;
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      if (p === 'outside' || p === 'cortical' || p === 'scaffold') continue;
      total++;
      if (p === 'immature_bone' || p === 'mature_bone') boneCount++;
      else if (p === 'cartilage') cartCount++;
      else if (p === 'fibrous') fibCount++;
    }
    if (total === 0) return { fill: 'rgba(253, 164, 175, 0.55)', stroke: '#e11d48' };
    const boneFrac = boneCount / total;
    const cartFrac = cartCount / total;
    const fibFrac = fibCount / total;

    if (boneFrac >= 0.45) {
      return { fill: 'rgba(132, 204, 22, 0.42)', stroke: '#15803d' };
    }
    if (cartFrac >= 0.22) {
      return { fill: 'rgba(139, 92, 246, 0.42)', stroke: '#6d28d9' };
    }
    if (fibFrac >= 0.25) {
      return { fill: 'rgba(239, 68, 68, 0.42)', stroke: '#b91c1c' };
    }
    return { fill: 'rgba(253, 164, 175, 0.52)', stroke: '#e11d48' };
  }

  _drawOverviewGraftIndicator(ctx, cx, midY, shaftHalfW, halfGapPx, graftType) {
    ctx.save();
    const w = shaftHalfW * 1.9;
    const h = Math.max(4, halfGapPx * 1.8);
    if (graftType === 'osteoconductive_scaffold' || graftType === 'msc_scaffold') {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.1;
      for (let gx = cx - w * 0.45; gx <= cx + w * 0.45; gx += 5) {
        ctx.beginPath();
        ctx.moveTo(gx, midY - h * 0.45);
        ctx.lineTo(gx, midY + h * 0.45);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.45, midY);
      ctx.lineTo(cx + w * 0.45, midY);
      ctx.stroke();
    } else if (graftType === 'autograft') {
      ctx.fillStyle = 'rgba(217, 119, 6, 0.65)';
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(cx + i * 5 - 1.5, midY - 1.5, 3, 3);
      }
    } else if (graftType === 'osteoinductive_bmp2') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.fillRect(cx - w * 0.48, midY - h * 0.45, w * 0.96, h * 0.9);
    }
    ctx.restore();
  }

  _drawExternalFixatorOverview(ctx, cx, topY, botY, midY, shaftHalfW, bendAngleRad, active, unionDay, lp) {
    ctx.save();
    const barX = Math.max(lp.x + 20, cx - shaftHalfW - 44);
    const barTop = topY + 28;
    const barBot = botY - 24;

    const pin1Y = midY - 46;
    const pin2Y = midY + 46;

    if (!active) {
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([4, 3]);
    }

    // 2 Transfixion Pins (Proximal & Distal)
    const drawPin = (py, tilt) => {
      ctx.save();
      if (tilt) {
        ctx.translate(cx, midY);
        ctx.rotate(tilt);
        ctx.translate(-cx, -midY);
      }
      ctx.strokeStyle = active ? '#475569' : '#16a34a';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(barX - 4, py);
      ctx.lineTo(cx + shaftHalfW * 0.85, py);
      ctx.stroke();

      // Pin clamp at bar
      ctx.fillStyle = active ? '#1e293b' : 'rgba(22, 163, 74, 0.25)';
      ctx.strokeStyle = active ? '#0f172a' : '#16a34a';
      ctx.lineWidth = 1.2;
      this._roundRect(ctx, barX - 6, py - 5, 12, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    drawPin(pin1Y, bendAngleRad);
    drawPin(pin2Y, 0);

    // External carbon/titanium connecting bar
    ctx.fillStyle = active ? '#334155' : 'rgba(22, 163, 74, 0.14)';
    ctx.strokeStyle = active ? '#0f172a' : '#16a34a';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, barX - 4, barTop, 8, barBot - barTop, 3);
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (!active) {
      const badgeText = unionDay ? `FIXATOR REMOVED (Day ${Math.round(unionDay)})` : 'FIXATOR REMOVED';
      this._drawBadgePill(ctx, lp.x + lp.w * 0.5, topY + 14, badgeText, {
        bg: '#dcfce7',
        fg: '#166534',
        border: '#22c55e',
        font: '700 9px "Inter", sans-serif',
        padX: 7,
        padY: 3
      });
    }
    ctx.restore();
  }

  _drawLockingPlateOverview(ctx, cx, topY, botY, midY, shaftHalfW, bendAngleRad) {
    ctx.save();
    const plateW = 6.5;
    const plateX = cx - shaftHalfW - plateW + 0.5;
    const plateH = Math.min(130, (botY - topY) * 0.52);
    const plateY = midY - plateH * 0.5;

    ctx.translate(cx, midY);
    ctx.rotate(bendAngleRad * 0.35);
    ctx.translate(-cx, -midY);

    // Steel locking compression plate flush along anterior-medial cortex
    const pGrad = ctx.createLinearGradient(plateX, 0, plateX + plateW, 0);
    pGrad.addColorStop(0, '#94a3b8');
    pGrad.addColorStop(0.5, '#e2e8f0');
    pGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = pGrad;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, plateX, plateY, plateW, plateH, 2.5);
    ctx.fill();
    ctx.stroke();

    // 6 Cortical Locking Screws (3 proximal, 3 distal)
    const screwOffsets = [-0.41, -0.28, -0.16, 0.16, 0.28, 0.41];
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    for (const frac of screwOffsets) {
      const sy = midY + frac * plateH;
      ctx.beginPath();
      ctx.moveTo(plateX + 1, sy);
      ctx.lineTo(cx + shaftHalfW * 0.92, sy);
      ctx.stroke();

      // Screw head
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(plateX - 1.5, sy - 2, 3, 4);
    }
    ctx.restore();
  }

  _drawIMNailOverview(ctx, cx, topY, botY, midY, marrowHalfW, bendAngleRad) {
    ctx.save();
    const nailW = Math.max(5, marrowHalfW * 1.15);
    const nailTop = topY + 18;
    const nailBot = botY - 18;

    ctx.translate(cx, midY);
    ctx.rotate(bendAngleRad * 0.25);
    ctx.translate(-cx, -midY);

    const nGrad = ctx.createLinearGradient(cx - nailW * 0.5, 0, cx + nailW * 0.5, 0);
    nGrad.addColorStop(0, '#475569');
    nGrad.addColorStop(0.5, '#cbd5e1');
    nGrad.addColorStop(1, '#334155');

    ctx.fillStyle = nGrad;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.1;
    this._roundRect(ctx, cx - nailW * 0.5, nailTop, nailW, nailBot - nailTop, 2);
    ctx.fill();
    ctx.stroke();

    // Proximal & distal interlocking screws
    const lockYs = [nailTop + 14, nailTop + 26, nailBot - 26, nailBot - 14];
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    for (const ly of lockYs) {
      ctx.beginPath();
      ctx.moveTo(cx - nailW * 1.9, ly);
      ctx.lineTo(cx + nailW * 1.9, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCastSleeve(ctx, cx, topY, botY, shaftHalfW, midY, clampedIfs) {
    ctx.save();
    const sleeveW = shaftHalfW * 3.1;
    const sleeveTop = topY + 22;
    const sleeveH = (botY - topY) - 42;
    this._roundRect(ctx, cx - sleeveW * 0.5, sleeveTop, sleeveW, sleeveH, 10);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Micromotion arrows near gap
    if (clampedIfs > 1.0) {
      ctx.strokeStyle = '#d97706';
      ctx.fillStyle = '#d97706';
      ctx.lineWidth = 1.5;
      const ax = cx + sleeveW * 0.5 + 8;
      this._drawArrow(ctx, ax, midY - 12, ax, midY - 2, 4);
      this._drawArrow(ctx, ax, midY + 12, ax, midY + 2, 4);
    }
    ctx.restore();
  }

  _drawOverviewLoadVectors(ctx, cx, topY, botY, shaftHalfW, weightBearingPct, loadMultiplier, bendOffsetPx) {
    ctx.save();
    const effLoadPct = Math.round(weightBearingPct * loadMultiplier);
    const scale = Math.max(0.45, Math.min(1.5, (effLoadPct / 100) * 0.85 + 0.35));

    // Downward Axial + Muscle Force F at top
    const arrowLen = 20 * scale;
    const fx = cx + bendOffsetPx * 0.4;
    const fyEnd = topY - 4;
    const fyStart = fyEnd - arrowLen;

    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 2.4;
    this._drawArrow(ctx, fx, fyStart, fx, fyEnd, 5.5);

    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`F (${effLoadPct}% BW)`, fx, fyStart - 4);

    // Curved A-P Bending Moment M arrow
    const mx = cx + shaftHalfW + 18;
    const my = topY + 18;
    ctx.strokeStyle = '#d97706';
    ctx.fillStyle = '#d97706';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(mx, my, 10, -Math.PI * 0.8, Math.PI * 0.25);
    ctx.stroke();
    const ex = mx + 10 * Math.cos(Math.PI * 0.25);
    const ey = my + 10 * Math.sin(Math.PI * 0.25);
    this._drawArrowHead(ctx, ex, ey, Math.PI * 0.75, 4.5);
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillText('M', mx + 14, my - 2);

    // Distal ground reaction upward arrow
    ctx.strokeStyle = '#0284c7';
    ctx.fillStyle = '#0284c7';
    ctx.lineWidth = 2.0;
    this._drawArrow(ctx, cx, botY + 16, cx, botY + 3, 4.5);

    ctx.restore();
  }

  _drawZoomConnector(ctx, data) {
    const zb = this._layout.zoomBoxLeft;
    const pf = this._layout.plotFrame;

    ctx.save();
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.55)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);

    ctx.beginPath();
    ctx.moveTo(zb.x + zb.w, zb.y);
    ctx.lineTo(pf.x, pf.y);
    ctx.moveTo(zb.x + zb.w, zb.y + zb.h);
    ctx.lineTo(pf.x, pf.y + pf.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ===========================================================================
  // RIGHT VIEWPORT (~64%): MAGNIFIED SAGITTAL CALLUS CROSS-SECTION & LATTICE
  // ===========================================================================

  _drawRightCallusViewport(ctx, data) {
    const rp = this._layout.rightPanel;
    const pf = this._layout.plotFrame;
    const p = this._layout.plot2D;
    const cb = this._layout.colorbar;

    ctx.save();

    // 1. Header Title & Subtitle
    const headerX = pf.x + pf.w * 0.5;
    ctx.font = '700 11px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText(this._getModeHeaderTitle(this.fieldMode), headerX, rp.y + 12);

    ctx.font = '500 10px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(
      `Magnified Callus Lattice Cross-Section (${data.nx}×${data.nz}) · Gap ${data.params.gapSizeMm.toFixed(1)} mm · Stiffness ${data.stiffnessNmDeg.toFixed(1)} Nm/deg`,
      headerX,
      rp.y + 26
    );

    // 2. Plot Frame Backdrop
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
    ctx.restore();

    // 3. Clip inside plotFrame for zoomed/panned lattice content
    ctx.save();
    ctx.beginPath();
    ctx.rect(pf.x, pf.y, pf.w, pf.h);
    ctx.clip();

    // 3a. Base Lattice / Heatmap Rendering
    this._drawLatticeField(ctx, data, p);

    // 3b. Cortical Bone Outlines & Texture Polish
    this._drawCorticalOutlines(ctx, data, p);

    // 3c. Hardware Cross-Sections in Magnified View (showHardware)
    if (this.overlays.showHardware) {
      this._drawMagnifiedHardwareOverlay(ctx, data, p);
    }

    // 3d. Interstitial Fluid Velocity Vectors (showVectors in strain_flow mode)
    if (this.fieldMode === 'strain_flow' && this.overlays.showVectors) {
      this._drawFluidVelocityVectors(ctx, data, p);
    }

    // 3e. Discrete Cell Glyphs (showCells)
    if (this.overlays.showCells) {
      this._drawCellGlyphsOverlay(ctx, data, p);
    }

    // 3f. Anatomical Region Labels & Scale Bar (showRegions)
    if (this.overlays.showRegions) {
      this._drawRegionLabelsAndScaleBar(ctx, data, p, pf);
    }

    ctx.restore(); // End clip to plotFrame

    // 4. Crisp Axes & Boundary Labels around plotFrame
    this._drawRightAxes(ctx, data, pf, p);

    // 5. Right-Edge Colorbar / Phenotype Legend
    this._drawRightLegendOrColorbar(ctx, data, cb);

    ctx.restore();
  }

  _getModeHeaderTitle(mode) {
    switch (mode) {
      case 'stimulus': return 'PRENDERGAST MECHANOREGULATION STIMULUS (S = γ/a + v/b)';
      case 'strain_flow': return 'OCTAHEDRAL SHEAR STRAIN (γ %) & FLUID VELOCITY (v)';
      case 'cells': return 'DISCRETE LATTICE CELL ACTIVITY & DIFFERENTIATION';
      default: return 'CALLUS TISSUE PHENOTYPE & REMODELING LATTICE';
    }
  }

  _drawLatticeField(ctx, data, p) {
    if (!this._offscreen || !this._offCtx) return;

    const { nx, nz, fields } = data;
    const isSmoothField = (this.fieldMode === 'stimulus' || this.fieldMode === 'strain_flow');

    const texW = isSmoothField ? Math.min(260, Math.max(120, Math.round(p.w * 0.7))) : nx;
    const texH = isSmoothField ? Math.min(260, Math.max(120, Math.round(p.h * 0.7))) : nz;

    if (this._offscreen.width !== texW || this._offscreen.height !== texH) {
      this._offscreen.width = texW;
      this._offscreen.height = texH;
    }

    const imgData = this._offCtx.createImageData(texW, texH);
    const buf = imgData.data;

    if (!isSmoothField) {
      // Crisp cell-by-cell rendering for 'phenotype' and 'cells' modes
      const alphaBg = this.fieldMode === 'cells' ? 0.30 : 1.0;
      for (let iz = 0; iz < nz; iz++) {
        // Screen top (py = 0) corresponds to Proximal (+z, iz = nz - 1)
        const py = nz - 1 - iz;
        for (let ix = 0; ix < nx; ix++) {
          const idx = iz * nx + ix;
          const pKey = fields.phenotype[idx];
          const meta = PHENOTYPE_META[pKey] || PHENOTYPE_META.granulation;
          let [r, g, b] = meta.rgb;

          // Blend slightly toward #f8fafc for 30% opacity in 'cells' mode (keeping cortical & scaffold distinct)
          if (alphaBg < 1.0 && pKey !== 'outside') {
            const blend = (pKey === 'cortical' || pKey === 'scaffold') ? 0.55 : alphaBg;
            r = Math.round(248 * (1 - blend) + r * blend);
            g = Math.round(250 * (1 - blend) + g * blend);
            b = Math.round(252 * (1 - blend) + b * blend);
          }

          const outIdx = (py * nx + ix) * 4;
          buf[outIdx] = r;
          buf[outIdx + 1] = g;
          buf[outIdx + 2] = b;
          buf[outIdx + 3] = 255;
        }
      }
      this._offCtx.putImageData(imgData, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._offscreen, p.x, p.y, p.w, p.h);
      ctx.restore();

      // Subtle lattice cell grid lines for crisp lattice readability
      if (p.w / nx >= 6) {
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
        ctx.lineWidth = 0.7;
        for (let ix = 1; ix < nx; ix++) {
          const lx = p.x + (ix / nx) * p.w;
          ctx.beginPath();
          ctx.moveTo(lx, p.y);
          ctx.lineTo(lx, p.y + p.h);
          ctx.stroke();
        }
        for (let iz = 1; iz < nz; iz++) {
          const ly = p.y + (iz / nz) * p.h;
          ctx.beginPath();
          ctx.moveTo(p.x, ly);
          ctx.lineTo(p.x + p.w, ly);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // Smooth bilinearly-interpolated field rendering for 'stimulus' and 'strain_flow'
      const activeArr = this.fieldMode === 'stimulus' ? fields.stimulus : fields.strain;
      let outIdx = 0;

      for (let py = 0; py < texH; py++) {
        const zNorm = 1 - (py / Math.max(1, texH - 1));
        const izNearest = Math.min(nz - 1, Math.max(0, Math.round(zNorm * (nz - 1))));
        for (let px = 0; px < texW; px++) {
          const xNorm = px / Math.max(1, texW - 1);
          const ixNearest = Math.min(nx - 1, Math.max(0, Math.round(xNorm * (nx - 1))));
          const nearestIdx = izNearest * nx + ixNearest;
          const pKey = fields.phenotype[nearestIdx];

          let rgb;
          if (pKey === 'outside') {
            rgb = PHENOTYPE_META.outside.rgb;
          } else if (pKey === 'cortical') {
            rgb = [226, 232, 240]; // Slate-ivory #e2e8f0
          } else if (pKey === 'scaffold') {
            rgb = PHENOTYPE_META.scaffold.rgb;
          } else {
            const val = this._sampleFlatBilinear(activeArr, nx, nz, xNorm, zNorm);
            rgb = this.fieldMode === 'stimulus'
              ? this._mapStimulusToRGB(val)
              : this._mapStrainToRGB(val);
          }

          buf[outIdx] = rgb[0];
          buf[outIdx + 1] = rgb[1];
          buf[outIdx + 2] = rgb[2];
          buf[outIdx + 3] = 255;
          outIdx += 4;
        }
      }
      this._offCtx.putImageData(imgData, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._offscreen, p.x, p.y, p.w, p.h);
      ctx.restore();
    }

    // Crisp dark metallic outline around scaffold struts (if any)
    if (data.hasScaffold) {
      const cellW = p.w / nx;
      const cellH = p.h / nz;
      ctx.save();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.1;
      for (let iz = 0; iz < nz; iz++) {
        const sy = p.y + ((nz - 1 - iz) / nz) * p.h;
        for (let ix = 0; ix < nx; ix++) {
          if (fields.scaffoldMask[iz * nx + ix] === 1) {
            const sx = p.x + (ix / nx) * p.w;
            ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
          }
        }
      }
      ctx.restore();
    }
  }

  _drawCorticalOutlines(ctx, data, p) {
    const { nx, nz, fields } = data;
    const cellW = p.w / nx;
    const cellH = p.h / nz;

    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;

    // Trace boundary edges between cortical cells and non-cortical neighbors
    ctx.beginPath();
    for (let iz = 0; iz < nz; iz++) {
      const sy = p.y + ((nz - 1 - iz) / nz) * p.h;
      for (let ix = 0; ix < nx; ix++) {
        if (fields.phenotype[iz * nx + ix] !== 'cortical') continue;
        const sx = p.x + (ix / nx) * p.w;

        if (ix === 0 || fields.phenotype[iz * nx + (ix - 1)] !== 'cortical') {
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy + cellH);
        }
        if (ix === nx - 1 || fields.phenotype[iz * nx + (ix + 1)] !== 'cortical') {
          ctx.moveTo(sx + cellW, sy);
          ctx.lineTo(sx + cellW, sy + cellH);
        }
        if (iz === nz - 1 || fields.phenotype[(iz + 1) * nx + ix] !== 'cortical') {
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + cellW, sy);
        }
        if (iz === 0 || fields.phenotype[(iz - 1) * nx + ix] !== 'cortical') {
          ctx.moveTo(sx, sy + cellH);
          ctx.lineTo(sx + cellW, sy + cellH);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawMagnifiedHardwareOverlay(ctx, data, p) {
    const { params, outerRadius, innerRadius } = data;
    const xToPx = (xMm) => p.x + ((xMm - data.xMinMm) / data.widthMm) * p.w;

    ctx.save();
    if (params.fixationType === 'locking_plate') {
      // Locking plate flush along Anterior (+x) cortex
      const plateX = xToPx(outerRadius);
      const plateW = Math.max(8, (2.2 / data.widthMm) * p.w);
      const grad = ctx.createLinearGradient(plateX, 0, plateX + plateW, 0);
      grad.addColorStop(0, '#94a3b8');
      grad.addColorStop(0.5, '#e2e8f0');
      grad.addColorStop(1, '#475569');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.4;
      ctx.fillRect(plateX, p.y + 4, plateW, p.h - 8);
      ctx.strokeRect(plateX, p.y + 4, plateW, p.h - 8);

      // Proximal & distal screw cross-sections
      const screwYs = [p.y + p.h * 0.14, p.y + p.h * 0.86];
      const screwEnd = xToPx(-outerRadius * 0.92);
      for (const sy of screwYs) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.78)';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.1;
        ctx.fillRect(screwEnd, sy - 3, plateX - screwEnd, 6);
        ctx.strokeRect(screwEnd, sy - 3, plateX - screwEnd, 6);
      }
    } else if (params.fixationType === 'im_nail') {
      // Intramedullary nail inside central medullary canal (x = 0)
      const nailHalf = Math.min(innerRadius * 0.72, 3.6);
      const xL = xToPx(-nailHalf);
      const xR = xToPx(nailHalf);
      const grad = ctx.createLinearGradient(xL, 0, xR, 0);
      grad.addColorStop(0, '#475569');
      grad.addColorStop(0.45, '#cbd5e1');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.fillRect(xL, p.y + 2, xR - xL, p.h - 4);
      ctx.strokeRect(xL, p.y + 2, xR - xL, p.h - 4);
    } else if (params.fixationType === 'external_fixator') {
      // Subtle top/bottom status badge inside magnified frame
      const badgeTxt = data.fixatorActive
        ? 'External Fixator Active (Out-of-Plane Pins)'
        : 'External Fixator Removed (Unrestricted Gait)';
      this._drawBadgePill(ctx, p.x + p.w * 0.5, p.y + 13, badgeTxt, {
        bg: data.fixatorActive ? 'rgba(241, 245, 249, 0.88)' : 'rgba(220, 252, 231, 0.92)',
        fg: data.fixatorActive ? '#334155' : '#166534',
        border: data.fixatorActive ? '#cbd5e1' : '#22c55e',
        font: '600 9px "Inter", sans-serif',
        padX: 7,
        padY: 2.5
      });
    }
    ctx.restore();
  }

  _drawFluidVelocityVectors(ctx, data, p) {
    const { nx, nz, fields } = data;
    const stepX = Math.max(2, Math.round(nx / 12));
    const stepZ = Math.max(2, Math.round(nz / 12));

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.lineWidth = 1.2;

    for (let iz = 1; iz < nz - 1; iz += stepZ) {
      const sy = p.y + ((nz - 0.5 - iz) / nz) * p.h;
      for (let ix = 1; ix < nx - 1; ix += stepX) {
        const idx = iz * nx + ix;
        const pKey = fields.phenotype[idx];
        if (pKey === 'outside' || pKey === 'cortical' || pKey === 'scaffold') continue;

        const vx = fields.vecX[idx];
        const vz = fields.vecZ[idx];
        const mag = Math.hypot(vx, vz);
        if (mag < 0.08) continue;

        const sx = p.x + ((ix + 0.5) / nx) * p.w;
        const ux = vx / mag;
        const uy = -vz / mag; // Screen Y points downward
        const len = Math.min(14, Math.max(5, 4.5 + Math.sqrt(mag) * 3.2));

        this._drawArrow(ctx, sx - ux * len * 0.45, sy - uy * len * 0.45, sx + ux * len * 0.55, sy + uy * len * 0.55, 3.4);
      }
    }
    ctx.restore();
  }

  _drawCellGlyphsOverlay(ctx, data, p) {
    const { nx, nz, fields } = data;
    const cellW = p.w / nx;
    const cellH = p.h / nz;
    const isCellsMode = this.fieldMode === 'cells';

    // In phenotype mode, draw subtle sparse markers so tissue colors stay crystal clear
    const stride = isCellsMode ? 1 : 2;
    const radiusScale = isCellsMode ? 1.0 : 0.72;

    ctx.save();
    ctx.globalAlpha = isCellsMode ? 0.96 : 0.72;

    for (let iz = 0; iz < nz; iz += stride) {
      const baseY = p.y + ((nz - 1 - iz) / nz) * p.h;
      for (let ix = 0; ix < nx; ix += stride) {
        const idx = iz * nx + ix;
        const pKey = fields.phenotype[idx];
        if (pKey === 'outside' || pKey === 'cortical' || pKey === 'scaffold') continue;

        const cKey = fields.cellType[idx];
        if (!cKey || cKey === 'none') continue;

        // Deterministic sub-cell jitter from grid index
        const hash = ((ix * 73856093) ^ (iz * 19349663)) & 255;
        const jx = ((hash & 15) / 15 - 0.5) * cellW * 0.42;
        const jy = (((hash >> 4) & 15) / 15 - 0.5) * cellH * 0.42;
        const cx = p.x + ((ix + 0.5) / nx) * p.w + jx;
        const cy = baseY + cellH * 0.5 + jy;
        const r = Math.max(1.8, Math.min(4.8, Math.min(cellW, cellH) * 0.28 * radiusScale));

        if (cKey === 'msc') {
          // Amber circle with tiny pseudopodia
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 0.9;
          const angle = (hash / 255) * Math.PI * 2;
          for (let k = 0; k < 3; k++) {
            const a = angle + k * 2.1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * r * 1.75, cy + Math.sin(a) * r * 1.75);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.stroke();
        } else if (cKey === 'fibroblast') {
          // Red elongated spindle
          const a = ((hash & 31) / 31 - 0.5) * 0.9;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.7, r * 0.55, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#dc2626';
          ctx.fill();
          ctx.strokeStyle = '#7f1d1d';
          ctx.lineWidth = 0.7;
          ctx.stroke();
          ctx.restore();
        } else if (cKey === 'chondrocyte') {
          // Purple rounded cell inside pale lacuna
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(237, 233, 254, 0.85)';
          ctx.fill();
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
          ctx.fillStyle = '#7c3aed';
          ctx.fill();
        } else if (cKey === 'osteoblast') {
          // Emerald cuboidal cluster
          const s = r * 1.5;
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#065f46';
          ctx.lineWidth = 0.8;
          ctx.fillRect(cx - s * 0.5, cy - s * 0.5, s, s);
          ctx.strokeRect(cx - s * 0.5, cy - s * 0.5, s, s);
        } else if (cKey === 'osteoclast') {
          // Blue multi-nucleated dot
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.45, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
          ctx.strokeStyle = '#0369a1';
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.fillStyle = '#0c4a6e';
          for (let n = 0; n < 3; n++) {
            const na = n * 2.1;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(na) * r * 0.55, cy + Math.sin(na) * r * 0.55, Math.max(0.8, r * 0.25), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  _drawRegionLabelsAndScaleBar(ctx, data, p, pf) {
    const xToPx = (xMm) => p.x + ((xMm - data.xMinMm) / data.widthMm) * p.w;
    const zToPx = (zMm) => p.y + (1 - (zMm - data.zMinMm) / data.heightMm) * p.h;

    ctx.save();
    const badges = [
      { text: 'Posterior Gap', x: xToPx(-data.outerRadius * 0.72), y: zToPx(0) },
      { text: 'Anterior Gap', x: xToPx(data.outerRadius * 0.72), y: zToPx(0) },
      { text: 'Medullary Canal', x: xToPx(0), y: zToPx(data.zMaxMm * 0.52) },
      { text: 'External Callus', x: xToPx(-data.outerRadius * 1.28), y: zToPx(-data.heightMm * 0.20) }
    ];

    for (const b of badges) {
      if (b.x < pf.x + 35 || b.x > pf.x + pf.w - 35 || b.y < pf.y + 18 || b.y > pf.y + pf.h - 24) continue;
      this._drawBadgePill(ctx, b.x, b.y, b.text, {
        bg: 'rgba(255, 255, 255, 0.84)',
        fg: '#0f172a',
        border: 'rgba(100, 116, 139, 0.55)',
        font: '600 8.5px "Inter", sans-serif',
        padX: 5,
        padY: 2
      });
    }

    // Millimeter scale bar at bottom-right of plotFrame
    const pxPerMm = p.w / Math.max(1, data.widthMm);
    const barMm = pxPerMm * 10 > 95 ? 5 : 10;
    const barPx = barMm * pxPerMm;
    const sbX2 = pf.x + pf.w - 12;
    const sbX1 = sbX2 - barPx;
    const sbY = pf.y + pf.h - 12;

    this._roundRect(ctx, sbX1 - 6, sbY - 16, barPx + 12, 22, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sbX1, sbY - 3);
    ctx.lineTo(sbX1, sbY);
    ctx.lineTo(sbX2, sbY);
    ctx.lineTo(sbX2, sbY - 3);
    ctx.stroke();

    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${barMm} mm`, (sbX1 + sbX2) * 0.5, sbY - 2);

    ctx.restore();
  }

  _drawRightAxes(ctx, data, pf, p) {
    ctx.save();

    // Outer frame border
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(pf.x, pf.y, pf.w, pf.h);

    // Bottom X-axis: Posterior (-x) to Anterior (+x)
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const nTicksX = 4;
    for (let i = 0; i <= nTicksX; i++) {
      const tx = pf.x + (i / nTicksX) * pf.w;
      const xMm = data.xMinMm + ((tx - p.x) / Math.max(1, p.w)) * data.widthMm;
      ctx.beginPath();
      ctx.moveTo(tx, pf.y + pf.h);
      ctx.lineTo(tx, pf.y + pf.h + 4);
      ctx.stroke();
      ctx.fillText(`${xMm.toFixed(0)}`, tx, pf.y + pf.h + 6);
    }

    ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('← Posterior (-x, mm)   Sagittal Width   Anterior (+x, mm) →', pf.x + pf.w * 0.5, pf.y + pf.h + 20);

    // Left Y-axis: Distal (-z) at bottom to Proximal (+z) at top
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const nTicksZ = 4;
    for (let i = 0; i <= nTicksZ; i++) {
      const ty = pf.y + pf.h - (i / nTicksZ) * pf.h;
      const zMm = data.zMinMm + (1 - (ty - p.y) / Math.max(1, p.h)) * data.heightMm;
      ctx.beginPath();
      ctx.moveTo(pf.x - 4, ty);
      ctx.lineTo(pf.x, ty);
      ctx.stroke();
      ctx.fillText(`${zMm.toFixed(0)}`, pf.x - 6, ty);
    }

    ctx.save();
    ctx.translate(pf.x - 36, pf.y + pf.h * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← Distal (-z)   Axial (mm)   Proximal (+z) →', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  // ===========================================================================
  // RIGHT-EDGE COLORBAR & PHENOTYPE LEGEND
  // ===========================================================================

  _drawRightLegendOrColorbar(ctx, data, cb) {
    ctx.save();

    if (this.fieldMode === 'phenotype' || this.fieldMode === 'cells') {
      const items = this.fieldMode === 'cells'
        ? [
            { label: 'MSC (Progenitor)', color: CELL_META.msc.color },
            { label: 'Fibroblast', color: CELL_META.fibroblast.color },
            { label: 'Chondrocyte', color: CELL_META.chondrocyte.color },
            { label: 'Osteoblast', color: CELL_META.osteoblast.color },
            { label: 'Osteoclast', color: CELL_META.osteoclast.color },
            { label: 'Cortical Bone', color: PHENOTYPE_META.cortical.color }
          ]
        : [
            { label: 'Granulation', color: PHENOTYPE_META.granulation.color },
            { label: 'Fibrous', color: PHENOTYPE_META.fibrous.color },
            { label: 'Cartilage', color: PHENOTYPE_META.cartilage.color },
            { label: 'Immature Bone', color: PHENOTYPE_META.immature_bone.color },
            { label: 'Mature Bone', color: PHENOTYPE_META.mature_bone.color },
            { label: 'Cortical Bone', color: PHENOTYPE_META.cortical.color },
            { label: 'Marrow / Resorb', color: PHENOTYPE_META.marrow.color }
          ];
      if (data.hasScaffold) {
        items.push({ label: '3D Scaffold', color: PHENOTYPE_META.scaffold.color });
      }

      ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.fieldMode === 'cells' ? 'Cell Types' : 'Tissue Phenotype', cb.x - 4, cb.y + 4);

      let iy = cb.y + 16;
      const rowH = Math.min(26, (cb.h - 20) / items.length);
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 0.8;
        this._roundRect(ctx, cb.x - 2, iy, 12, 12, 2.5);
        ctx.fill();
        ctx.stroke();

        ctx.font = '600 9.5px "Inter", system-ui, sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.label, cb.x + 15, iy + 6);
        iy += rowH;
      }
      ctx.restore();
      return;
    }

    if (this.fieldMode === 'stimulus') {
      // 5 Prendergast Stimulus S Bands
      const bands = [
        { label: '> 3.0 Fibrous', min: 3.0, max: 5.0, color: '#ef4444' },
        { label: '1.0–3.0 Cartilage', min: 1.0, max: 3.0, color: '#8b5cf6' },
        { label: '0.53–1.0 Immature', min: 0.53, max: 1.0, color: '#84cc16' },
        { label: '0.01–0.53 Mature', min: 0.01, max: 0.53, color: '#15803d' },
        { label: '≤ 0.01 Resorb', min: 0.0, max: 0.01, color: '#38bdf8' }
      ];

      ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Stimulus S', cb.x - 4, cb.y - 4);

      const bandH = cb.h / bands.length;
      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        const by = cb.y + i * bandH;
        ctx.fillStyle = b.color;
        ctx.fillRect(cb.x, by, cb.w, bandH);

        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, cb.x + cb.w + 6, by + bandH * 0.5);
      }

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);

      // Hover indicator triangle
      if (this.hoverProbe) {
        const s = this.hoverProbe.stimulusS;
        let bandIdx = 4;
        if (s > 3.0) bandIdx = 0;
        else if (s > 1.0) bandIdx = 1;
        else if (s > 0.53) bandIdx = 2;
        else if (s > 0.01) bandIdx = 3;
        const py = cb.y + (bandIdx + 0.5) * bandH;
        this._drawColorbarTriangle(ctx, cb.x, py);
      }
      ctx.restore();
      return;
    }

    // 'strain_flow': Continuous Shear Strain γ (%) colorbar
    ctx.font = '700 9.5px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Shear γ (%)', cb.x - 4, cb.y - 4);

    const maxStrain = 15.0;
    const steps = 64;
    const stepH = cb.h / steps;
    for (let i = 0; i < steps; i++) {
      const val = (1 - i / (steps - 1)) * maxStrain;
      const rgb = this._mapStrainToRGB(val);
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.fillRect(cb.x, cb.y + i * stepH, cb.w, Math.ceil(stepH) + 0.5);
    }

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);

    const ticks = [0, 3.75, 7.5, 11.25, 15];
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const tv of ticks) {
      const ty = cb.y + (1 - tv / maxStrain) * cb.h;
      ctx.beginPath();
      ctx.moveTo(cb.x + cb.w, ty);
      ctx.lineTo(cb.x + cb.w + 4, ty);
      ctx.stroke();
      ctx.fillText(`${tv}%`, cb.x + cb.w + 6, ty);
    }

    if (this.hoverProbe) {
      const frac = Math.max(0, Math.min(1, this.hoverProbe.shearStrainPct / maxStrain));
      this._drawColorbarTriangle(ctx, cb.x, cb.y + (1 - frac) * cb.h);
    }

    ctx.restore();
  }

  _drawColorbarTriangle(ctx, x, py) {
    ctx.beginPath();
    ctx.moveTo(x - 1, py);
    ctx.lineTo(x - 7, py - 4.5);
    ctx.lineTo(x - 7, py + 4.5);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ===========================================================================
  // COLORMAPS & BILINEAR SAMPLING
  // ===========================================================================

  _mapStimulusToRGB(s) {
    if (s <= 0.01) return [56, 189, 248]; // Blue resorption (#38bdf8)
    if (s <= 0.53) {
      const u = (s - 0.01) / 0.52;
      return this._lerpRGB([21, 128, 61], [34, 197, 94], u); // Deep green mature bone
    }
    if (s <= 1.0) {
      const u = (s - 0.53) / 0.47;
      return this._lerpRGB([132, 204, 22], [190, 242, 100], u); // Lime immature bone
    }
    if (s <= 3.0) {
      const u = (s - 1.0) / 2.0;
      return this._lerpRGB([139, 92, 246], [245, 158, 11], u); // Purple -> amber cartilage
    }
    const u = Math.min(1, (s - 3.0) / 3.0);
    return this._lerpRGB([239, 68, 68], [153, 27, 27], u); // Crimson fibrous
  }

  _mapStrainToRGB(gammaPct) {
    const t = Math.max(0, Math.min(1, gammaPct / 15.0));
    const stops = [
      { p: 0.00, c: [14, 116, 144] },
      { p: 0.25, c: [16, 185, 129] },
      { p: 0.50, c: [250, 204, 21] },
      { p: 0.75, c: [249, 115, 22] },
      { p: 1.00, c: [185, 28, 28] }
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].p && t <= stops[i + 1].p) {
        const u = (t - stops[i].p) / (stops[i + 1].p - stops[i].p);
        return this._lerpRGB(stops[i].c, stops[i + 1].c, u);
      }
    }
    return stops[stops.length - 1].c;
  }

  _lerpRGB(c0, c1, u) {
    return [
      Math.round(c0[0] + u * (c1[0] - c0[0])),
      Math.round(c0[1] + u * (c1[1] - c0[1])),
      Math.round(c0[2] + u * (c1[2] - c0[2]))
    ];
  }

  _sampleFlatBilinear(arr, nx, nz, xNorm, zNorm) {
    const fx = Math.max(0, Math.min(nx - 1, xNorm * (nx - 1)));
    const fz = Math.max(0, Math.min(nz - 1, zNorm * (nz - 1)));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(nx - 1, x0 + 1);
    const z1 = Math.min(nz - 1, z0 + 1);
    const tx = fx - x0;
    const tz = fz - z0;

    const v00 = arr[z0 * nx + x0];
    const v10 = arr[z0 * nx + x1];
    const v01 = arr[z1 * nx + x0];
    const v11 = arr[z1 * nx + x1];

    return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz;
  }

  // ===========================================================================
  // INTERACTIVE HOVER PROBE & GLASSMORPHIC TOOLTIP
  // ===========================================================================

  _updateHoverProbeFromMouse() {
    if (!this.lastSimResult) return;
    this._updateCursor();

    const { x, y } = this.mousePos;
    const pf = this._layout.plotFrame;
    const p = this._layout.plot2D;

    const inFrame = (x >= pf.x && x <= pf.x + pf.w && y >= pf.y && y <= pf.y + pf.h);
    const inPlot = (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);

    if (inFrame && inPlot) {
      const data = this._extractRenderData(this.lastSimResult, this.day);
      const xNorm = Math.max(0, Math.min(0.9999, (x - p.x) / Math.max(1, p.w)));
      const zNorm = Math.max(0, Math.min(0.9999, 1 - (y - p.y) / Math.max(1, p.h)));

      const ix = Math.floor(xNorm * data.nx);
      const iz = Math.floor(zNorm * data.nz);
      const idx = iz * data.nx + ix;

      const xMm = data.xMinMm + ((ix + 0.5) / data.nx) * data.widthMm;
      const zMm = data.zMinMm + ((iz + 0.5) / data.nz) * data.heightMm;

      const pKey = data.fields.phenotype[idx];
      const cKey = data.fields.cellType[idx];
      const pMeta = PHENOTYPE_META[pKey] || PHENOTYPE_META.granulation;
      const cMeta = CELL_META[cKey] || CELL_META.none;

      const probe = {
        ix,
        iz,
        xMm,
        zMm,
        regionName: data.fields.regionName[idx],
        phenotypeName: pMeta.name,
        modulusMPa: data.fields.modulus[idx],
        stimulusS: data.fields.stimulus[idx],
        shearStrainPct: data.fields.strain[idx],
        fluidVelocityUmS: data.fields.fluid[idx],
        mscDensity: data.fields.msc[idx],
        cellTypeName: cMeta.name
      };

      this.hoverProbe = probe;
      if (typeof this.onHoverProbe === 'function') {
        this.onHoverProbe(probe);
      }
    } else if (this.hoverProbe !== null) {
      this.hoverProbe = null;
      if (typeof this.onHoverProbe === 'function') {
        this.onHoverProbe(null);
      }
    }
  }

  _drawHoverProbeOverlay(ctx, data, probe) {
    const pf = this._layout.plotFrame;
    const p = this._layout.plot2D;

    const cellW = p.w / data.nx;
    const cellH = p.h / data.nz;
    const cellX = p.x + probe.ix * cellW;
    const cellY = p.y + (data.nz - 1 - probe.iz) * cellH;
    const px = cellX + cellW * 0.5;
    const py = cellY + cellH * 0.5;

    ctx.save();

    // 1. Precision Crosshair & Cell Highlight clipped to plotFrame
    ctx.save();
    ctx.beginPath();
    ctx.rect(pf.x, pf.y, pf.w, pf.h);
    ctx.clip();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px, pf.y);
    ctx.lineTo(px, pf.y + pf.h);
    ctx.moveTo(pf.x, py);
    ctx.lineTo(pf.x + pf.w, py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(cellX, cellY, cellW, cellH);

    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 2. Glassmorphic Floating Tooltip (clamped strictly inside canvas bounds)
    const cardW = 228;
    const cardH = 148;
    const margin = 12;

    let tx = px + 14;
    let ty = py - cardH - 12;

    if (tx + cardW > this.width - margin) {
      tx = px - cardW - 14;
    }
    if (tx < margin) {
      tx = margin;
    }
    if (ty < 46) {
      ty = py + 14;
    }
    if (ty + cardH > this.height - 46) {
      ty = Math.max(46, this.height - 46 - cardH);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    this._roundRect(ctx, tx, ty, cardW, cardH, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.restore();

    this._roundRect(ctx, tx, ty, cardW, cardH, 8);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Header: Coordinates & Region
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`x=${probe.xMm.toFixed(1)}mm · z=${probe.zMm.toFixed(1)}mm`, tx + 10, ty + 9);

    ctx.font = '600 9px "Inter", sans-serif';
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText(probe.regionName, tx + 10, ty + 22);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 10, ty + 36);
    ctx.lineTo(tx + cardW - 10, ty + 36);
    ctx.stroke();

    const modStr = probe.modulusMPa >= 1000
      ? `${(probe.modulusMPa / 1000).toFixed(1)} GPa`
      : `${probe.modulusMPa.toFixed(1)} MPa`;

    const rows = [
      { label: 'Tissue Phenotype:', val: probe.phenotypeName, color: '#86efac' },
      { label: 'Young Modulus (E):', val: modStr, color: '#cbd5e1' },
      { label: 'Stimulus (S):', val: `${probe.stimulusS.toFixed(3)}`, color: '#fcd34d' },
      { label: 'Shear Strain (γ):', val: `${probe.shearStrainPct.toFixed(2)}%`, color: '#fda4af' },
      { label: 'Fluid Flow (v):', val: `${probe.fluidVelocityUmS.toFixed(2)} µm/s`, color: '#7dd3fc' },
      { label: 'Cell / MSC Dens.:', val: `${probe.cellTypeName.split(' ')[0]} (${(probe.mscDensity * 100).toFixed(0)}%)`, color: '#c4b5fd' }
    ];

    let ry = ty + 42;
    for (const row of rows) {
      ctx.font = '500 9px "Inter", system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(row.label, tx + 10, ry);

      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.fillStyle = row.color;
      ctx.textAlign = 'right';
      ctx.fillText(row.val, tx + cardW - 10, ry);
      ry += 17;
    }

    ctx.restore();
  }

  // ===========================================================================
  // VECTOR & SHAPE PRIMITIVES
  // ===========================================================================

  _drawArrow(ctx, x1, y1, x2, y2, headLen = 4.5) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    this._drawArrowHead(ctx, x2, y2, Math.atan2(y2 - y1, x2 - x1), headLen);
  }

  _drawArrowHead(ctx, ex, ey, angle, headLen) {
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(angle - 0.5), ey - headLen * Math.sin(angle - 0.5));
    ctx.lineTo(ex - headLen * Math.cos(angle + 0.5), ey - headLen * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
  }

  _drawBadgePill(ctx, x, y, text, opts = {}) {
    const font = opts.font || '600 9.5px "Inter", sans-serif';
    const padX = opts.padX ?? 7;
    const padY = opts.padY ?? 3;
    ctx.save();
    ctx.font = font;
    const m = ctx.measureText(text);
    const w = m.width + padX * 2;
    const h = 12 + padY * 2;
    this._roundRect(ctx, x - w * 0.5, y - h * 0.5, w, h, 4.5);
    ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = opts.fg || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.max(0, w * 0.5), Math.max(0, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
