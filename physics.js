// physics.js — Coupled Mechanoregulation & Lattice Cell-Activity Bone Fracture Healing Simulator
// Pure ES module (zero external dependencies)
//
// Primary models:
// 1. Byrne, Lacroix, & Prendergast (2011), "Simulation of Fracture Healing in the Tibia:
//    Mechanoregulation of Cell Activity Using a Lattice Modeling Approach",
//    Journal of Orthopaedic Research 29:1496-1503.
// 2. Perier-Metz, Duda, & Checa (2020), "Mechano-Biological Computer Model of Scaffold-Supported
//    Bone Regeneration: Effect of Genetic Disorders and Scaffold Structure / Bone Graft",
//    Frontiers in Bioengineering and Biotechnology 8:585799.

export const TISSUE_ID = {
  OUTSIDE: 0,
  GRANULATION: 1,
  FIBROUS: 2,
  CARTILAGE: 3,
  IMMATURE_BONE: 4,
  MATURE_BONE: 5,
  CORTICAL: 6,
  MARROW: 7,
  RESORBED: 8
};

export const REGION_ID = {
  OUTSIDE: 0,
  INTACT_CORTEX: 1,
  MARROW_CAVITY: 2,
  FRACTURE_GAP: 3,
  EXTERNAL_CALLUS: 4
};

export const DEFAULT_PARAMS = {
  loadMultiplier: 1.0,
  rehabProtocol: 'cautious_ramp', // 'cautious_ramp' | 'immediate_full' | 'delayed_weight' | 'minimal_load'
  gapSizeMm: 3.0,                 // 1.0 to 25.0 mm
  callusIndex: 1.4,               // 1.0 to 1.8
  fixationType: 'external_fixator', // 'external_fixator' | 'locking_plate' | 'im_nail' | 'cast_unfixed'
  fixationStiffnessPct: 100,      // 10 to 300 (%)
  autoRemoveFixator: true,
  mscActivity: 1.0,               // 0.2 to 2.0
  graftType: 'none',              // 'none' | 'autograft' | 'osteoconductive_scaffold' | 'osteoinductive_bmp2' | 'msc_scaffold'
  currentDay: 122
};

export const PRESETS = {
  byrne_baseline: {
    id: 'byrne_baseline',
    name: '1. Standard Tibia (Byrne 2011)',
    description: '3.0 mm tibial fracture with unilateral external fixator (100%), cautious weight-bearing ramp, clinical union at ~15 Nm/deg, and subsequent callus remodeling.',
    params: { ...DEFAULT_PARAMS }
  },
  unstable_cast: {
    id: 'unstable_cast',
    name: '2. Unstable Motion (Cast)',
    description: 'Low-stiffness functional cast (25% stiffness) with 4.0 mm gap produces excessive interfragmentary strain (>10%), delaying ossification into hypertrophic fibrous/cartilage tissue.',
    params: {
      ...DEFAULT_PARAMS,
      gapSizeMm: 4.0,
      callusIndex: 1.6,
      fixationType: 'cast_unfixed',
      fixationStiffnessPct: 25,
      loadMultiplier: 1.1,
      autoRemoveFixator: false,
      currentDay: 180
    }
  },
  rigid_plate: {
    id: 'rigid_plate',
    name: '3. Rigid Locking Plate (250%)',
    description: 'Stiff medial locking plate (250%) creates strong stress shielding directly beneath the plate (medial/anterior cortex) while the far cortex heals asymmetrically.',
    params: {
      ...DEFAULT_PARAMS,
      fixationType: 'locking_plate',
      fixationStiffnessPct: 250,
      autoRemoveFixator: false,
      currentDay: 180
    }
  },
  large_defect_nograft: {
    id: 'large_defect_nograft',
    name: '4. Large Defect (15 mm, No Graft)',
    description: 'Critical-size 15 mm segmental defect without osteoconductive support: endogenous MSCs stall after the 15-day latency window, causing marrow capping and atrophic non-union.',
    params: {
      ...DEFAULT_PARAMS,
      gapSizeMm: 15.0,
      callusIndex: 1.3,
      fixationType: 'external_fixator',
      fixationStiffnessPct: 120,
      currentDay: 240
    }
  },
  large_defect_autograft: {
    id: 'large_defect_autograft',
    name: '5. 15 mm Defect + Autograft',
    description: 'Autologous bone graft supplies osteoconductive matrix, osteoinductive signals (0.5/d differentiation), and seeded MSCs to bridge a 15 mm critical defect.',
    params: {
      ...DEFAULT_PARAMS,
      gapSizeMm: 15.0,
      callusIndex: 1.4,
      fixationType: 'external_fixator',
      fixationStiffnessPct: 120,
      graftType: 'autograft',
      currentDay: 180
    }
  },
  large_defect_scaffold: {
    id: 'large_defect_scaffold',
    name: '6. 15 mm Defect + 3D Scaffold',
    description: '3D osteoconductive honeycomb scaffold eliminates the 15-day latency block and guides surface-templated ECM bridging across the 15 mm defect.',
    params: {
      ...DEFAULT_PARAMS,
      gapSizeMm: 15.0,
      callusIndex: 1.4,
      fixationType: 'external_fixator',
      fixationStiffnessPct: 120,
      graftType: 'osteoconductive_scaffold',
      currentDay: 200
    }
  },
  early_full_load: {
    id: 'early_full_load',
    name: '7. Immediate Full Load',
    description: '100% body-weight gait loading from Day 0 elevates early shear strain and fluid flow, driving transient fibrous/cartilaginous tissue and delaying bony bridging.',
    params: {
      ...DEFAULT_PARAMS,
      rehabProtocol: 'immediate_full',
      loadMultiplier: 1.0,
      fixationStiffnessPct: 100,
      currentDay: 140
    }
  },
  impaired_msc: {
    id: 'impaired_msc',
    name: '8. Impaired MSCs (0.35x)',
    description: 'Reduced MSC migration and proliferation (0.35x, modeling aging/metabolic impairment) slows cellular invasion and delays union.',
    params: {
      ...DEFAULT_PARAMS,
      mscActivity: 0.35,
      currentDay: 180
    }
  }
};

export const BYRNE_BENCHMARKS = {
  // Digitized from Byrne, Lacroix & Prendergast (2011) Fig. 4
  ifsSeries: [
    { week: 0, ifsPct: 2.8 },
    { week: 1, ifsPct: 4.9 },
    { week: 2, ifsPct: 6.4 },
    { week: 3, ifsPct: 6.3 },
    { week: 4, ifsPct: 4.5 },
    { week: 5, ifsPct: 3.1 },
    { week: 6, ifsPct: 2.0 },
    { week: 8, ifsPct: 1.3 },
    { week: 10, ifsPct: 1.0 },
    { week: 12, ifsPct: 0.7 },
    { week: 16, ifsPct: 0.4 },
    { week: 20, ifsPct: 0.2 },
    { week: 30, ifsPct: 0.15 },
    { week: 50, ifsPct: 0.12 }
  ],
  // Digitized from Byrne, Lacroix & Prendergast (2011) Fig. 5 (solid simulation curve)
  stiffnessSimSeries: [
    { week: 0, stiffness: 0.38 },
    { week: 2, stiffness: 0.6 },
    { week: 4, stiffness: 1.8 },
    { week: 6, stiffness: 4.2 },
    { week: 8, stiffness: 6.5 },
    { week: 10, stiffness: 8.8 },
    { week: 12, stiffness: 10.6 },
    { week: 15, stiffness: 13.0 },
    { week: 17.4, stiffness: 15.0 },
    { week: 20, stiffness: 42 },
    { week: 22, stiffness: 68 },
    { week: 24, stiffness: 81 },
    { week: 30, stiffness: 78 },
    { week: 40, stiffness: 75 },
    { week: 55, stiffness: 73 },
    { week: 75, stiffness: 73 }
  ],
  // Digitized from Richardson et al. (1994) dashed curve in Byrne Fig. 5
  stiffnessExpRichardson: [
    { week: 2, stiffness: 0.8 },
    { week: 6, stiffness: 2.5 },
    { week: 10, stiffness: 5.5 },
    { week: 14, stiffness: 9.5 },
    { week: 18, stiffness: 14.5 },
    { week: 22, stiffness: 20 },
    { week: 26, stiffness: 26 },
    { week: 30, stiffness: 32 },
    { week: 35, stiffness: 38 },
    { week: 40, stiffness: 45 },
    { week: 48, stiffness: 55 },
    { week: 55, stiffness: 60 }
  ],
  // Table 1 from Byrne et al. (2011) (rates per day unless otherwise noted)
  cellParams: {
    iterationDurationHours: 48,
    historyIterations: 10,
    stimulusConstants: { a_shearStrain: 0.0375, b_fluidVelUmS: 3.0 },
    msc: {
      differentiationRatePerDay: 0.3,
      criticalAgeDays: 6,
      proliferationRatePerDay: 0.5,
      migrationRateUmPerHr: 30,
      migrationStepsPerIteration: 9
    },
    fibroblast: {
      proliferationRatePerDay: 0.3,
      migrationRateUmPerHr: 30,
      apoptosisRatePerDay: 0.15
    },
    chondrocyte: {
      proliferationRatePerDay: 0.3,
      maturationTimeDays: 16,
      apoptosisRatePerDay: 0.15
    },
    osteoblast: {
      proliferationRatePerDay: 0.3,
      maturationTimeDays: 30,
      apoptosisRatePerDay: 0.15,
      resorptionRatePerDay: 0.15
    },
    activeProliferatingFraction: 0.6
  },
  // Table 2 from Byrne et al. (2011)
  tissueProps: {
    granulation: { name: 'Granulation', E_MPa: 0.2, nu: 0.167, permeability_1e14: 1.0, porosity: 0.8, bulkModulusGrain_MPa: 2300, stimulusBand: 'Initial (Day 0)' },
    fibrous: { name: 'Fibrous', E_MPa: 2.0, nu: 0.167, permeability_1e14: 1.0, porosity: 0.8, bulkModulusGrain_MPa: 2300, stimulusBand: 'S > 3.0' },
    marrow: { name: 'Marrow', E_MPa: 2.0, nu: 0.167, permeability_1e14: 1.0, porosity: 0.8, bulkModulusGrain_MPa: 2300, stimulusBand: 'Medullary Equilibrium' },
    cartilage: { name: 'Cartilage', E_MPa: 10.0, nu: 0.167, permeability_1e14: 0.5, porosity: 0.8, bulkModulusGrain_MPa: 3400, stimulusBand: '1.0 < S <= 3.0' },
    immatureBone: { name: 'Immature Bone', E_MPa: 1000.0, nu: 0.3, permeability_1e14: 10.0, porosity: 0.8, bulkModulusGrain_MPa: 13920, stimulusBand: '0.53 < S <= 1.0' },
    matureBone: { name: 'Mature Bone', E_MPa: 6000.0, nu: 0.3, permeability_1e14: 1.02, porosity: 0.8, bulkModulusGrain_MPa: 13920, stimulusBand: '0.01 < S <= 0.53' },
    corticalBone: { name: 'Cortical Bone', E_MPa: 17000.0, nu: 0.3, permeability_1e14: null, porosity: null, bulkModulusGrain_MPa: null, stimulusBand: 'Intact / Remodeled' },
    fixator: { name: 'Fixator (Steel)', E_MPa: 200000.0, nu: 0.3, permeability_1e14: null, porosity: null, bulkModulusGrain_MPa: null, stimulusBand: 'Hardware' }
  },
  // Electronic Supplement jor_21362_sm_suppdata.pdf (45% gait cycle, 80 kg BW, adapted from Duda et al.)
  gaitForces: [
    { id: 1, name: 'Iliotibial tract I', forceX: -8.5, forceY: -8.8, forceZ: 61.3, attachX: -19.8, attachY: 39.1, attachZ: 369.9 },
    { id: 2, name: 'Iliotibial tract II', forceX: -97.4, forceY: -64.4, forceZ: 291.5, attachX: -27.1, attachY: 28.2, attachZ: 370.5 },
    { id: 3, name: 'Quadriceps femoris m.', forceX: 13.6, forceY: -328.0, forceZ: 303.5, attachX: 34.8, attachY: 19.3, attachZ: 353.4 },
    { id: 4, name: 'Tibialis anterior m. I', forceX: 17.2, forceY: 38.7, forceZ: -327.7, attachX: -4.9, attachY: 9.9, attachZ: 251.8 },
    { id: 5, name: 'Tibialis anterior m. II', forceX: 25.9, forceY: 53.6, forceZ: -191.8, attachX: -7.6, attachY: 9.9, attachZ: 127.9 },
    { id: 6, name: 'Soleus m.', forceX: -63.1, forceY: -47.1, forceZ: -697.0, attachX: -7.4, attachY: 15.0, attachZ: 332.2 },
    { id: 7, name: 'Ant. tibiofibular lig.', forceX: -132.4, forceY: -111.2, forceZ: -56.8, attachX: -7.3, attachY: 11.1, attachZ: 0.9 },
    { id: 8, name: 'Ant. cruciate lig.', forceX: 87.5, forceY: 101.5, forceZ: 41.1, attachX: 10.3, attachY: -5.0, attachZ: 390.5 },
    { id: 9, name: 'Deltoid lig.', forceX: 44.9, forceY: 9.7, forceZ: 15.7, attachX: -1.5, attachY: -16.5, attachZ: -0.3 },
    { id: 10, name: 'Knee joint contact', forceX: 232.3, forceY: 214.9, forceZ: -1528.1, attachX: 1.5, attachY: -2.0, attachZ: 288.2 },
    { id: 11, name: 'Ankle joint contact', forceX: -120.0, forceY: 154.4, forceZ: 2070.4, attachX: 0.8, attachY: 0.6, attachZ: 0.4 }
  ]
};

export const QUIZ_QUESTIONS = [
  {
    question: 'In Prendergast’s mechanoregulation equation S = γ/a + v/b (with a = 0.0375 and b = 3 µm/s), what happens to a fracture callus element with octahedral shear strain γ = 3.0% (0.03) and interstitial fluid velocity v = 4.5 µm/s?',
    options: [
      'S = 0.45, favoring mature lamellar bone formation',
      'S = 2.30, favoring cartilaginous tissue differentiation (endochondral pathway)',
      'S = 3.50, favoring fibrous tissue and hypertrophic non-union',
      'S = 0.008, triggering osteoclastic bone resorption'
    ],
    correctIndex: 1,
    explanation: 'S = 0.03 / 0.0375 + 4.5 / 3.0 = 0.80 + 1.50 = 2.30. Because 1.0 < S ≤ 3.0, MSCs reaching the 6-day critical age differentiate into chondrocytes (cartilage), which stiffens the callus until S drops below 1.0.'
  },
  {
    question: 'Why does interfragmentary strain (IFS) initially rise from ~2.8% to ~6.4% during Weeks 0–2 in Byrne et al. (2011) before falling rapidly?',
    options: [
      'Osteoclasts immediately resorb intact cortical bone at Day 2',
      'Gait weight-bearing ramps upward while infiltrating MSCs have not yet passed the >6-day critical age and 30-day matrix synthesis lag',
      'The external fixator is automatically removed at Day 10',
      'Fibroblasts have a higher Young’s modulus (6,000 MPa) than cortical bone'
    ],
    correctIndex: 1,
    explanation: 'During the first 2 weeks, patient weight-bearing increases (10% → 14%) while migrating MSCs require >6 days to differentiate and newly formed tissue requires a 10-iteration history and maturation ramp to stiffen the granulation callus.'
  },
  {
    question: 'In Byrne et al. (2011), what happens mechanically and biologically right after the external fixator is removed at the 15 Nm/deg clinical union criterion (Richardson et al., 1994)?',
    options: [
      'All cortical bone inside the fracture gap liquefies back into granulation tissue',
      'Full gait loads transfer to the bridged callus, while unloaded distal external callus and medullary regions drop to S ≤ 0.01 and undergo osteoclastic resorption',
      'Cartilage instantly converts to steel with E = 200,000 MPa',
      'Interfragmentary strain jumps permanently above 20%'
    ],
    correctIndex: 1,
    explanation: 'Once peripheral bony bridging achieves 15 Nm/deg and the fixator is removed, physiological load passes primarily through the stiff cortical bridge. Unloaded outer external callus and the central medullary cavity experience S ≤ 0.01, activating osteoclast resorption until stiffness equilibrates near ~73 Nm/deg.'
  },
  {
    question: 'Under physiological tibial gait loading in the sagittal plane (Byrne et al., 2011), why does bone persist longer on the posterior side of the callus than the anterior side?',
    options: [
      'MSCs can only migrate toward negative x-coordinates',
      'Sagittal bending places higher compressive/shear strain on the posterior cortex (higher S) while the anterior side experiences lower strain and earlier resorption',
      'The anterior tibia contains no blood vessels or periosteum',
      'Cortical bone on the anterior side has a modulus of 0.2 MPa'
    ],
    correctIndex: 1,
    explanation: 'Sagittal A-P bending creates asymmetric strain across the fracture gap: higher posterior mechanical stimulus maintains osteogenic differentiation (0.01 < S ≤ 0.53), whereas reduced anterior stimulus drops into the resorption band (S ≤ 0.01) earlier.'
  },
  {
    question: 'According to Perier-Metz et al. (2020), what is the primary biomechanical risk of using an excessively rigid medial locking compression plate (e.g., 250% stiffness)?',
    options: [
      'It causes symmetric hyper-ossification inside the medullary canal',
      'It induces asymmetric stress shielding directly beneath the plate, lowering local stimulus S into the resorption/under-stimulated band while the far cortex carries the load',
      'It doubles the migration speed of fibroblasts to 600 µm/h',
      'It eliminates the 6-day critical age requirement for MSCs'
    ],
    correctIndex: 1,
    explanation: 'An overly rigid locking plate shares most of the axial and bending load on the medial (plate) side, reducing local strain beneath the plate (stress shielding) and producing asymmetric healing between the near and far cortices.'
  },
  {
    question: 'Why does an untreated 15 mm segmental bone defect typically result in an atrophic non-union in Perier-Metz et al. (2020), and how does an autograft or 3D osteoconductive scaffold rescue it?',
    options: [
      'Untreated defects exceed the ~15-day endogenous MSC latency window before cells reach the defect center (causing marrow capping); grafts restore continuous osteoconductive guidance (and osteoinduction/MSCs for autograft)',
      'Untreated 15 mm defects have zero mechanical strain so cartilage forms permanently',
      'Scaffolds turn fibroblasts directly into cortical bone without any mechanical stimulus',
      'Bone morphogenetic protein (BMP-2) alone replaces the mechanical stiffness of titanium'
    ],
    correctIndex: 0,
    explanation: 'In large defects without osteoconductive support, endogenous MSC migration and proliferation stall after ~15 days, capping the cortical ends and leaving central fibrous/granulation tissue. Osteoconductive scaffolds/autografts sustain cell migration across the gap, and autografts additionally provide osteoinductive stimulation (0.3 → 0.5/day) and viable MSCs.'
  }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function computeWeightBearing(day, protocol, loadMultiplier) {
  let wb = 0.1;
  if (protocol === 'immediate_full') {
    wb = 1.0;
  } else if (protocol === 'delayed_weight') {
    if (day <= 70) {
      wb = 0.08;
    } else if (day <= 190) {
      wb = 0.08 + 0.92 * ((day - 70) / 120);
    } else {
      wb = 1.0;
    }
  } else if (protocol === 'minimal_load') {
    wb = 0.12;
  } else {
    // 'cautious_ramp' (Byrne 2011: 10% -> 20% over days 0..48, then 20% -> 100% over days 48..174)
    if (day <= 48) {
      wb = 0.10 + 0.10 * (day / 48);
    } else if (day <= 174) {
      wb = 0.20 + 0.80 * ((day - 48) / 126);
    } else {
      wb = 1.0;
    }
    // Early postoperative mobilization ramp (days 0..14) as hematoma consolidates & gait resumes
    const earlyRamp = 0.58 + 0.42 * Math.min(1.0, day / 14.0);
    wb *= earlyRamp;
  }
  return clamp(wb * loadMultiplier, 0.02, 2.5);
}

function getFixationBaseline(fixationType, stiffPct) {
  const scale = clamp(stiffPct, 10, 300) / 100;
  if (fixationType === 'locking_plate') {
    return {
      kAxNmm: 3200 * scale,
      kBendNmDeg: 28.0 * scale,
      plateShieldStrength: clamp(0.46 * scale, 0.08, 0.94),
      canAutoRemove: false
    };
  }
  if (fixationType === 'im_nail') {
    return {
      kAxNmm: 2400 * scale,
      kBendNmDeg: 22.0 * scale,
      plateShieldStrength: 0.0,
      canAutoRemove: false
    };
  }
  if (fixationType === 'cast_unfixed') {
    return {
      kAxNmm: 360 * scale,
      kBendNmDeg: 3.2 * scale,
      plateShieldStrength: 0.0,
      canAutoRemove: false
    };
  }
  // 'external_fixator' (Byrne 2011)
  return {
    kAxNmm: 1450 * scale,
    kBendNmDeg: 12.5 * scale,
    plateShieldStrength: 0.0,
    canAutoRemove: true
  };
}

function classifyStimulusLabel(s) {
  if (s <= 0.01) return 'Resorption (S <= 0.01)';
  if (s <= 0.53) return 'Mature Bone (0.01 < S <= 0.53)';
  if (s <= 1.0) return 'Immature Bone (0.53 < S <= 1.0)';
  if (s <= 3.0) return 'Cartilage (1 < S <= 3)';
  return 'Fibrous Tissue (S > 3)';
}

/**
 * Solve the coupled 2D sagittal mechanoregulation + cellular lattice fracture healing model
 * over Days 0..380 (190 steps, dt = 2 days).
 */
export function solveFractureHealing(inputParams = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const params = { ...DEFAULT_PARAMS, ...inputParams };

  const loadMultiplier = clamp(Number(params.loadMultiplier) || 1.0, 0.2, 2.0);
  const rehabProtocol = params.rehabProtocol || 'cautious_ramp';
  const gapSizeMm = clamp(Number(params.gapSizeMm) || 3.0, 1.0, 25.0);
  const callusIndex = clamp(Number(params.callusIndex) || 1.4, 1.0, 1.8);
  const fixationType = params.fixationType || 'external_fixator';
  const fixationStiffnessPct = clamp(Number(params.fixationStiffnessPct) || 100, 10, 300);
  const autoRemoveFixator = Boolean(params.autoRemoveFixator);
  const mscActivity = clamp(Number(params.mscActivity) || 1.0, 0.2, 2.0);
  const graftType = params.graftType || 'none';

  // Geometry & Grid
  const nx = 30;
  const nz = 44;
  const N = nx * nz;
  const halfWidthMm = 18.0;
  const halfHeightMm = Math.max(26.0, gapSizeMm * 0.9 + 15.0);
  const dxMm = (2 * halfWidthMm) / nx;
  const dzMm = (2 * halfHeightMm) / nz;

  const gapHalfMm = gapSizeMm * 0.5;
  const rCortMm = 10.0;
  const rMarrowMm = 6.5;
  const rCallusMm = rCortMm * callusIndex;
  const callusHalfZMm = gapHalfMm + 11.0;
  const activeMarrowHalfZMm = gapHalfMm + 6.5;
  const rNailMm = 4.2;

  const xMm = new Float32Array(nx);
  const zMm = new Float32Array(nz);
  for (let ix = 0; ix < nx; ix++) xMm[ix] = -halfWidthMm + (ix + 0.5) * dxMm;
  for (let iz = 0; iz < nz; iz++) zMm[iz] = -halfHeightMm + (iz + 0.5) * dzMm;

  const regionMask = new Uint8Array(N);
  const activeCallusMask = new Uint8Array(N);
  const scaffoldMask = new Uint8Array(N);
  const graftMask = new Uint8Array(N);
  const implantMask = new Uint8Array(N);
  const distToCortMm = new Float32Array(N);
  const cellWeightMm = new Float32Array(N); // cylindrical out-of-plane chord width (mm)
  const isPeriostealSeed = new Uint8Array(N);
  const isEndostealSeed = new Uint8Array(N);

  const hasScaffold = graftType === 'osteoconductive_scaffold' || graftType === 'msc_scaffold';
  const hasAutograft = graftType === 'autograft';
  const hasBMP2 = graftType === 'osteoinductive_bmp2';
  const hasOsteoconduction = hasScaffold || hasAutograft;

  const chord = (r, x) => {
    const d = r * r - x * x;
    return d > 0 ? 2 * Math.sqrt(d) : 0;
  };

  for (let iz = 0; iz < nz; iz++) {
    const z = zMm[iz];
    const az = Math.abs(z);
    let rEnv = rCortMm;
    if (az <= callusHalfZMm && callusIndex > 1.0) {
      const frac = az / callusHalfZMm;
      rEnv = rCortMm + (rCallusMm - rCortMm) * Math.pow(Math.cos((Math.PI * 0.5) * frac), 1.15);
    }

    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = xMm[ix];
      const ax = Math.abs(x);

      // Distance along axial direction to nearest intact cortical bone end (0 inside intact cortex)
      const axialDist = az <= gapHalfMm ? Math.max(0, gapHalfMm - az) : 0;
      const radialDist = ax > rCortMm ? ax - rCortMm : ax < rMarrowMm ? rMarrowMm - ax : 0;
      distToCortMm[i] = Math.hypot(axialDist, radialDist);

      if (fixationType === 'im_nail' && ax <= rNailMm) {
        implantMask[i] = 1;
      }

      if (az > gapHalfMm) {
        if (ax >= rMarrowMm && ax <= rCortMm) {
          regionMask[i] = REGION_ID.INTACT_CORTEX;
          cellWeightMm[i] = Math.max(2.0, chord(rCortMm, x) - chord(rMarrowMm, x));
        } else if (ax < rMarrowMm) {
          regionMask[i] = REGION_ID.MARROW_CAVITY;
          cellWeightMm[i] = Math.max(2.0, chord(rMarrowMm, x));
          if (az <= activeMarrowHalfZMm && !implantMask[i]) {
            activeCallusMask[i] = 1;
          }
        } else if (az <= callusHalfZMm && ax <= rEnv) {
          regionMask[i] = REGION_ID.EXTERNAL_CALLUS;
          cellWeightMm[i] = Math.max(2.0, chord(rEnv, x) - chord(rCortMm, x));
          activeCallusMask[i] = 1;
        } else {
          regionMask[i] = REGION_ID.OUTSIDE;
        }
      } else {
        // Inside fracture gap axial span (|z| <= gapHalfMm)
        if (ax < rMarrowMm) {
          regionMask[i] = REGION_ID.MARROW_CAVITY;
          cellWeightMm[i] = Math.max(2.0, chord(rMarrowMm, x));
          if (!implantMask[i]) {
            activeCallusMask[i] = 1;
          }
        } else if (ax <= rCortMm) {
          regionMask[i] = REGION_ID.FRACTURE_GAP;
          cellWeightMm[i] = Math.max(2.0, chord(rCortMm, x) - chord(rMarrowMm, x));
          activeCallusMask[i] = 1;
        } else if (ax <= rEnv) {
          regionMask[i] = REGION_ID.EXTERNAL_CALLUS;
          cellWeightMm[i] = Math.max(2.0, chord(rEnv, x) - chord(rCortMm, x));
          activeCallusMask[i] = 1;
        } else {
          regionMask[i] = REGION_ID.OUTSIDE;
        }
      }

      // Scaffold & Autograft spatial masks inside the fracture defect
      if (activeCallusMask[i] && az <= gapHalfMm && ax <= rCortMm) {
        if (hasAutograft) {
          graftMask[i] = 1;
        }
        if (hasScaffold) {
          // Periodic 2D honeycomb/strut architecture
          if ((ix + iz) % 3 === 0 || (ix - iz + 60) % 4 === 0) {
            scaffoldMask[i] = 1;
          }
        }
      }

      // Periosteal & Endosteal/Marrow MSC source sites
      if (activeCallusMask[i]) {
        const nearPeriosteum = ax >= rCortMm - dxMm * 0.6 && ax <= rCortMm + dxMm * 1.1 && az > gapHalfMm * 0.85;
        const nearEndosteum = !implantMask[i] && ax <= rMarrowMm && az >= gapHalfMm * 0.85 && az <= activeMarrowHalfZMm;
        if (nearPeriosteum) isPeriostealSeed[i] = 1;
        if (nearEndosteum) isEndostealSeed[i] = 1;
      }
    }
  }

  // Cellular & material state arrays
  const rng = mulberry32(42);
  const cellNoise = new Float32Array(N);
  for (let i = 0; i < N; i++) cellNoise[i] = 0.92 + 0.16 * rng();

  const msc02 = new Float32Array(N);
  const msc24 = new Float32Array(N);
  const msc46 = new Float32Array(N);
  const mscReady = new Float32Array(N);
  const mscTotal = new Float32Array(N);

  const fibroblast = new Float32Array(N);
  const chondrocyte = new Float32Array(N);
  const osteoblast = new Float32Array(N);
  const matureFrac = new Float32Array(N); // fraction of osteoblast tissue matured into lamellar/mature bone
  const corticalFrac = new Float32Array(N); // mature -> cortical adaptation
  const osteoclast = new Float32Array(N);
  const resorbed = new Float32Array(N);
  const granulation = new Float32Array(N);

  // Scratch buffers for diffusion/migration
  const nextMsc02 = new Float32Array(N);
  const nextMsc24 = new Float32Array(N);
  const nextMsc46 = new Float32Array(N);
  const nextMscReady = new Float32Array(N);
  const nextFib = new Float32Array(N);
  const nextChond = new Float32Array(N);
  const nextOsteo = new Float32Array(N);

  const E_cell = new Float32Array(N);
  const E_mat = new Float32Array(N);
  const k_cell = new Float32Array(N);
  const nu_cell = new Float32Array(N);
  const S_cell = new Float32Array(N);
  const gamma_cell = new Float32Array(N);
  const vel_cell = new Float32Array(N);
  const pheno_cell = new Uint8Array(N);

  // 10-step history buffer (Byrne 2011 p. 1498)
  const HIST_LEN = 10;
  const E_hist = new Float32Array(HIST_LEN * N);

  // Initialize field state (Day 0)
  for (let i = 0; i < N; i++) {
    const reg = regionMask[i];
    if (reg === REGION_ID.INTACT_CORTEX) {
      E_cell[i] = 17000;
      E_mat[i] = 17000;
      nu_cell[i] = 0.3;
      k_cell[i] = 1.02;
      pheno_cell[i] = TISSUE_ID.CORTICAL;
    } else if (reg === REGION_ID.MARROW_CAVITY && !activeCallusMask[i]) {
      E_cell[i] = implantMask[i] ? 200000 : 2.0;
      E_mat[i] = E_cell[i];
      nu_cell[i] = implantMask[i] ? 0.3 : 0.167;
      k_cell[i] = 1.0;
      pheno_cell[i] = TISSUE_ID.MARROW;
    } else if (activeCallusMask[i]) {
      granulation[i] = 1.0;
      let eInit = 0.2;
      if (scaffoldMask[i]) eInit = 25.0; // porous scaffold strut baseline contribution
      if (hasAutograft && graftMask[i]) {
        eInit = 8.0; // bone chips in autograft
        msc24[i] = 0.08;
        mscReady[i] = 0.07;
        osteoblast[i] = 0.08;
        granulation[i] = 0.85;
      }
      if (graftType === 'msc_scaffold' && Math.abs(zMm[Math.floor(i / nx)]) <= gapHalfMm && Math.abs(xMm[i % nx]) <= rCortMm) {
        msc24[i] = 0.25;
        msc46[i] = 0.20;
      }
      if (isPeriostealSeed[i] || isEndostealSeed[i]) {
        msc02[i] = Math.max(msc02[i], 0.35 * mscActivity);
      }
      E_cell[i] = eInit;
      E_mat[i] = eInit;
      nu_cell[i] = 0.167;
      k_cell[i] = 1.0;
      pheno_cell[i] = TISSUE_ID.GRANULATION;
      for (let h = 0; h < HIST_LEN; h++) E_hist[h * N + i] = eInit;
    } else {
      E_cell[i] = 0;
      pheno_cell[i] = TISSUE_ID.OUTSIDE;
    }
    mscTotal[i] = msc02[i] + msc24[i] + msc46[i] + mscReady[i];
  }

  // Slice mechanics buffers
  const EA_slice = new Float32Array(nz);
  const EI_slice = new Float32Array(nz);
  const xNA_slice = new Float32Array(nz);
  const fBridge_slice = new Float32Array(nz);
  const EA_smooth = new Float32Array(nz);
  const EI_smooth = new Float32Array(nz);

  const fixBase = getFixationBaseline(fixationType, fixationStiffnessPct);
  let fixatorRemoved = false;
  let fixatorRemovedDay = null;
  let unionDay = null;
  let peakStiffnessNmDeg = 0;
  let peakStiffnessDay = 0;
  let initialIfsPct = 0;
  let peakIfsPct = 0;
  let peakIfsDay = 0;

  const dtDays = 2.0;
  const totalSteps = 190; // Day 0 .. Day 380
  const snapshots = [];

  // Reference intact cortex properties from actual discrete shaft slice (calibrated to Richardson 1994 / Byrne 2011: 73 Nm/deg)
  let EI_INTACT_NMM2 = 0;
  {
    const izRef = 0;
    for (let ix = 0; ix < nx; ix++) {
      const i = izRef * nx + ix;
      if (regionMask[i] === REGION_ID.INTACT_CORTEX) {
        const eaCell = 17000 * cellWeightMm[i] * dxMm;
        EI_INTACT_NMM2 += eaCell * ((dxMm * dxMm) / 12 + xMm[ix] * xMm[ix]);
      }
    }
  }
  const TEST_SPAN_MM = gapSizeMm <= 18 ? 26.2 : gapSizeMm + 8.2;
  const RAD_TO_DEG = Math.PI / 180;

  // Full 80 kg gait mid-diaphyseal axial & sagittal bending loads (Duda / Byrne Supplement)
  const FULL_AXIAL_LOAD_N = 1950;
  const FULL_SAGITTAL_MOMENT_NMM = 9000; // 9 Nm net sagittal A-P bending at midshaft

  // Precompute 4-neighbor indices for active callus cells (eliminates inner-loop array allocations)
  const nbrCount = new Uint8Array(N);
  const nbrOffset = new Int32Array(N * 4);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (!activeCallusMask[i]) continue;
      let d = 0;
      const base = i * 4;
      if (ix > 0 && activeCallusMask[i - 1]) nbrOffset[base + d++] = i - 1;
      if (ix < nx - 1 && activeCallusMask[i + 1]) nbrOffset[base + d++] = i + 1;
      if (iz > 0 && activeCallusMask[i - nx]) nbrOffset[base + d++] = i - nx;
      if (iz < nz - 1 && activeCallusMask[i + nx]) nbrOffset[base + d++] = i + nx;
      nbrCount[i] = d;
    }
  }

  // Helper to evaluate mechanics at current E_cell state
  function evaluateMechanics(day) {
    const wb = computeWeightBearing(day, rehabProtocol, loadMultiplier);
    const activeFix = !fixatorRemoved;
    const kFixAx = activeFix ? fixBase.kAxNmm : 0;
    const kFixBend = activeFix ? fixBase.kBendNmDeg : 0;

    // 1. Slice composite EA, EI, neutral axis, and cortical gap bridging fraction
    for (let iz = 0; iz < nz; iz++) {
      let sumEA = 0;
      let sumEAx = 0;
      let gapBridgeSum = 0;
      let gapBridgeCount = 0;

      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const reg = regionMask[i];
        if (reg === REGION_ID.OUTSIDE || implantMask[i]) continue;

        let eEff = E_cell[i];
        // Resorbed external callus does not bear load
        if (reg === REGION_ID.EXTERNAL_CALLUS) {
          eEff *= resorbed[i] > 0.5 ? Math.max(0.001, 1 - resorbed[i]) : 0.85;
          eEff = Math.max(0.05, eEff);
        }
        const eaCell = eEff * cellWeightMm[i] * dxMm;
        sumEA += eaCell;
        sumEAx += eaCell * xMm[ix];

        if ((reg === REGION_ID.FRACTURE_GAP || reg === REGION_ID.INTACT_CORTEX) &&
            Math.abs(xMm[ix]) >= rMarrowMm && Math.abs(xMm[ix]) <= rCortMm) {
          gapBridgeCount++;
          gapBridgeSum += clamp(Math.log10(Math.max(1, eEff)) / Math.log10(1500), 0, 1);
        }
      }

      const xNA = sumEA > 1e-3 ? sumEAx / sumEA : 0;
      let sumEI = 0;
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const reg = regionMask[i];
        if (reg === REGION_ID.OUTSIDE || implantMask[i]) continue;
        let eEffBend = E_cell[i];
        if (reg === REGION_ID.EXTERNAL_CALLUS) {
          // Porous/fenestrated periosteal cuff provides partial bending rigidity until cortical gap bridges
          eEffBend *= resorbed[i] > 0.5 ? Math.max(0.001, 1 - resorbed[i]) : 0.15;
          eEffBend = Math.max(0.05, eEffBend);
        }
        const eaCell = eEffBend * cellWeightMm[i] * dxMm;
        const dxNA = xMm[ix] - xNA;
        const iLocal = eaCell * ((dxMm * dxMm) / 12 + dxNA * dxNA);
        sumEI += iLocal;
      }

      EA_slice[iz] = Math.max(sumEA, 50);
      EI_slice[iz] = Math.max(sumEI, 1500);
      xNA_slice[iz] = xNA;
      fBridge_slice[iz] = gapBridgeCount > 0 ? gapBridgeSum / gapBridgeCount : 0;
    }

    // Use slice rigidity directly (no arithmetic smoothing across cortical-gap step discontinuity)
    for (let iz = 0; iz < nz; iz++) {
      EA_smooth[iz] = EA_slice[iz];
      EI_smooth[iz] = EI_slice[iz];
    }

    // 2. Callus 4-point sagittal bending stiffness (Nm/deg) & axial stiffness (N/mm) over test gauge span
    let bendCompliance = 0; // sum(dz / EI) in 1/(N*mm)
    let axCompliance = 0;   // sum(dz / EA) in mm/N
    let gapBendCompliance = 0;
    let gapAxCompliance = 0;
    let spanCount = 0;
    const halfTest = TEST_SPAN_MM * 0.5;
    for (let iz = 0; iz < nz; iz++) {
      if (Math.abs(zMm[iz]) <= halfTest) {
        const dBend = dzMm / EI_smooth[iz];
        const dAx = dzMm / EA_smooth[iz];
        bendCompliance += dBend;
        axCompliance += dAx;
        if (Math.abs(zMm[iz]) <= gapHalfMm + dzMm * 0.25) {
          gapBendCompliance += dBend;
          gapAxCompliance += dAx;
        }
        spanCount++;
      }
    }
    const spanCoveredMm = spanCount * dzMm;
    const normFactor = spanCoveredMm > 0 ? TEST_SPAN_MM / spanCoveredMm : 1.0;
    bendCompliance *= normFactor;
    axCompliance *= normFactor;

    // Normalize intact cortex calibration so pure cortical bone column = 73.0 Nm/deg (Byrne 2011 / Richardson 1994)
    const intactCompliance = TEST_SPAN_MM / EI_INTACT_NMM2;
    const intactK = 73.0;
    const kBeamBend = (intactCompliance / Math.max(bendCompliance, 1e-12)) * intactK;
    const kCapsuleSoft = 0.35 * (3.0 / Math.max(3.0, gapSizeMm)) * Math.pow(callusIndex / 1.4, 1.5);
    const kCallusBend = kBeamBend + kCapsuleSoft;
    const kCallusAx = 1.0 / Math.max(axCompliance, 1e-7) + 18.0 * (3.0 / Math.max(3.0, gapSizeMm));

    // Check union & automatic fixator removal (Byrne 2011: 15 Nm/deg)
    if (unionDay === null && kCallusBend >= 15.0) {
      unionDay = day;
    }
    if (fixBase.canAutoRemove && autoRemoveFixator && !fixatorRemoved && kCallusBend >= 15.0) {
      fixatorRemoved = true;
      fixatorRemovedDay = day;
    }

    const activeFixNow = !fixatorRemoved;
    const kFixAxNow = activeFixNow ? kFixAx : 0;
    const kFixBendNow = activeFixNow ? kFixBend : 0;

    // 3. Load sharing & interfragmentary motion
    const fAxApplied = FULL_AXIAL_LOAD_N * wb;
    const mSagApplied = FULL_SAGITTAL_MOMENT_NMM * wb;

    const totalAxK = kCallusAx + kFixAxNow;
    const totalBendK = kCallusBend + kFixBendNow;

    const gapAxFrac = clamp((gapAxCompliance * normFactor) / Math.max(axCompliance, 1e-12), gapSizeMm / TEST_SPAN_MM, 1.0);
    const gapBendFrac = clamp((gapBendCompliance * normFactor) / Math.max(bendCompliance, 1e-12), gapSizeMm / TEST_SPAN_MM, 1.0);

    const deltaAxMm = (fAxApplied / Math.max(totalAxK, 1.0)) * gapAxFrac;
    const thetaBendDeg = ((mSagApplied * 1e-3) / Math.max(totalBendK, 0.05)) * gapBendFrac;
    const thetaBendRad = thetaBendDeg * RAD_TO_DEG;

    const fixatorLoadSharePct = activeFixNow
      ? 100 * (0.5 * (kFixBendNow / totalBendK) + 0.5 * (kFixAxNow / totalAxK))
      : 0;

    // Callus-carried loads
    const fCallus = fAxApplied * (kCallusAx / totalAxK);
    const mCallus = mSagApplied * (kCallusBend / totalBendK);

    // Interfragmentary strain at Posterior (x = -rCort) and Anterior (x = +rCort)
    // Sagittal A-P bending increases compression on posterior cortex and reduces it on anterior cortex
    // Intact fibula & soft-tissue hydraulic containment gently limit extreme axial collapse under rigid hardware
    const rawBendDispMm = rCortMm * thetaBendRad * 0.72;
    let ifsPostPct = 100 * (deltaAxMm + rawBendDispMm) / gapSizeMm;
    let ifsAntPct = 100 * Math.max(0.12 * deltaAxMm, Math.abs(deltaAxMm - 0.65 * rawBendDispMm)) / gapSizeMm;

    if (fixationType !== 'cast_unfixed') {
      const cap = 15.0;
      ifsPostPct = cap * Math.tanh(ifsPostPct / cap);
      ifsAntPct = cap * Math.tanh(ifsAntPct / cap);
    }

    if (activeFixNow && fixBase.plateShieldStrength > 0) {
      // Medial locking plate on x > 0 strongly shields the anterior/medial side
      const shield = fixBase.plateShieldStrength;
      ifsAntPct *= (1 - 0.85 * shield);
      ifsPostPct *= (1 + 0.18 * shield);
    }

    const ifsMaxPct = Math.max(ifsPostPct, ifsAntPct);
    if (day === 0) initialIfsPct = ifsMaxPct;
    if (ifsMaxPct > peakIfsPct) {
      peakIfsPct = ifsMaxPct;
      peakIfsDay = day;
    }
    if (kCallusBend > peakStiffnessNmDeg) {
      peakStiffnessNmDeg = kCallusBend;
      peakStiffnessDay = day;
    }

    // 4. Local cell shear strain gamma, fluid velocity v (um/s), and Prendergast stimulus S
    // Determine average cortical gap bridging to drive shear-lag unloading of external/medullary callus
    let meanGapBridge = 0;
    let gapSliceCount = 0;
    for (let iz = 0; iz < nz; iz++) {
      if (Math.abs(zMm[iz]) <= gapHalfMm + dzMm * 0.5) {
        meanGapBridge += fBridge_slice[iz];
        gapSliceCount++;
      }
    }
    meanGapBridge = gapSliceCount > 0 ? meanGapBridge / gapSliceCount : 0;

    for (let iz = 0; iz < nz; iz++) {
      const z = zMm[iz];
      const az = Math.abs(z);
      const ea = EA_smooth[iz];
      const ei = EI_smooth[iz];
      const xNA = xNA_slice[iz];

      // Axial strain & curvature on this slice from compatible callus deformation
      const rawEps0 = (fCallus / ea) + 0.0018 * wb * (kFixAxNow > 0 ? 1200 / (kCallusAx + kFixAxNow) : 0);
      const compatCap = Math.max(0.008, 0.0125 * ifsMaxPct);
      const eps0 = az <= gapHalfMm + dzMm ? Math.min(rawEps0, compatCap) : rawEps0;
      const rawKappa = mCallus / ei;
      const kappa = az <= gapHalfMm + dzMm ? Math.min(rawKappa, (0.014 * Math.max(0.5, ifsPostPct - ifsAntPct * 0.4)) / rCortMm) : rawKappa;

      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (!activeCallusMask[i]) {
          S_cell[i] = 0;
          gamma_cell[i] = 0;
          vel_cell[i] = 0;
          continue;
        }

        const x = xMm[ix];
        const reg = regionMask[i];

        // Local axial strain with sagittal bending asymmetry (posterior x<0 higher, anterior x>0 lower)
        // Sagittal bending moment compresses posterior (x < 0) and reduces strain on anterior (x > 0)
        const apFactor = x < 0 ? 1.0 + 0.36 * (-x / rCallusMm) : 1.0 - 0.32 * (x / rCallusMm);
        let epsLocal = eps0 * apFactor + Math.abs(kappa * (x - xNA)) * (x < 0 ? 1.15 : 0.78);

        // Bending shear detour & cortical-bridge shielding (Saint-Venant shear lag)
        if (reg === REGION_ID.EXTERNAL_CALLUS) {
          const zFrac = clamp(az / callusHalfZMm, 0, 1);
          const dr = Math.max(0, Math.abs(x) - rCortMm);
          const rFrac = clamp(dr / Math.max(1.0, rCallusMm - rCortMm), 0, 1);
          // Outer periosteal callus bridges over a longer shear-transfer length than the narrow cortical gap
          const sleeveTransferRatio = gapSizeMm / (gapSizeMm + 2.4 * dr + 0.4);
          // Once cortical bridge forms, outer/distal external callus unloads -> S <= 0.01 (osteoclastic resorption)
          const detourFactor = (1.0 - 0.92 * meanGapBridge) * (1.0 - 0.35 * zFrac) * (1.0 - 0.12 * rFrac);
          const residualSurface = 0.008 * (1.0 - zFrac);
          epsLocal *= sleeveTransferRatio * (detourFactor + residualSurface);
          // Local cartilage/bone stiffening shields strain within maturing outer sleeve cells
          if (E_cell[i] > 2.0) {
            epsLocal *= Math.pow(2.5 / (E_cell[i] + 0.5), 0.22);
          }
          // Intramembranous periosteal baseline stimulus near intact cortical surface early on
          if (az > gapHalfMm && dr <= 2.4 && meanGapBridge < 0.7) {
            epsLocal = Math.max(epsLocal, 0.0028 * wb * (1 - 0.5 * zFrac));
          }
        } else if (reg === REGION_ID.MARROW_CAVITY) {
          // Medullary cavity near neutral axis is shielded once cortical + peripheral bridge forms
          const zMarrowFrac = clamp(az / activeMarrowHalfZMm, 0, 1);
          const shieldMarrow = (1.0 - 0.92 * meanGapBridge) * (1.0 - 0.45 * zMarrowFrac);
          epsLocal *= Math.max(0.015, shieldMarrow);
        } else if (reg === REGION_ID.FRACTURE_GAP) {
          // Intercortical fracture gap carries primary load when bridged; early on feels IFS directly
          const gapMotionStrain = (x < 0 ? ifsPostPct : ifsAntPct) * 0.01;
          const blend = clamp(E_cell[i] / 450, 0, 1);
          epsLocal = (1 - blend) * (0.70 * gapMotionStrain + 0.30 * epsLocal) + blend * epsLocal;
        }

        // Plate stress shielding under medial locking plate (x > 0)
        if (activeFixNow && fixBase.plateShieldStrength > 0 && x > 0) {
          const plateProximity = clamp(x / rCortMm, 0, 1);
          const shieldFrac = fixBase.plateShieldStrength * (0.72 + 0.28 * plateProximity);
          epsLocal *= Math.max(0.02, 1.0 - shieldFrac);
        }

        // Scaffold struts slightly distribute local pore strain
        if (scaffoldMask[i]) {
          epsLocal *= 0.85;
        }

        const nu = nu_cell[i];
        const gamma = (2 * Math.SQRT2 / 3) * (1 + nu) * epsLocal * cellNoise[i];

        // Biphasic Darcy interstitial fluid velocity (um/s)
        // Scales with volumetric strain rate, permeability ratio, and soft-tissue compressibility
        const kRatio = Math.pow(Math.max(0.2, k_cell[i]), 0.35);
        const softFactor = Math.pow(1.5 / (E_cell[i] + 1.5), 0.22);
        const fluidVel = 130.0 * gamma * (1 - 2 * nu) * kRatio * softFactor;

        const stim = gamma / 0.0375 + fluidVel / 3.0;

        gamma_cell[i] = gamma;
        vel_cell[i] = fluidVel;
        S_cell[i] = stim;
      }
    }

    return {
      wb,
      kCallusBend,
      kCallusAx,
      ifsAntPct,
      ifsPostPct,
      ifsMaxPct,
      fixatorLoadSharePct,
      fixatorRemovedNow: fixatorRemoved
    };
  }

  // Record a snapshot object at the given day
  function recordSnapshot(day, mech) {
    const phenoSnap = new Uint8Array(pheno_cell);
    const stimSnap = new Float32Array(S_cell);
    const gammaSnap = new Float32Array(gamma_cell);
    const shearStrainPctSnap = new Float32Array(N);
    for (let k = 0; k < N; k++) shearStrainPctSnap[k] = gammaSnap[k] * 100;
    const velSnap = new Float32Array(vel_cell);
    const eSnap = new Float32Array(E_cell);
    const mscSnap = new Float32Array(mscTotal);
    const fibSnap = new Float32Array(fibroblast);
    const chonSnap = new Float32Array(chondrocyte);
    const ostSnap = new Float32Array(osteoblast);
    const oclSnap = new Float32Array(osteoclast);
    const resSnap = new Float32Array(resorbed);

    // Composition & regional breakdown
    let countActive = 0;
    let cGran = 0, cFib = 0, cChon = 0, cImm = 0, cMat = 0, cRes = 0;
    let gapSSum = 0, gapCount = 0;
    let callusSSum = 0;

    const regStats = {
      fractureGap: { n: 0, bone: 0, cart: 0, fib: 0, gran: 0, res: 0, sSum: 0 },
      posteriorGap: { n: 0, bone: 0, cart: 0, fib: 0, gran: 0, res: 0, sSum: 0 },
      anteriorGap: { n: 0, bone: 0, cart: 0, fib: 0, gran: 0, res: 0, sSum: 0 },
      medullaryCavity: { n: 0, bone: 0, cart: 0, fib: 0, gran: 0, res: 0, sSum: 0 },
      externalCallus: { n: 0, bone: 0, cart: 0, fib: 0, gran: 0, res: 0, sSum: 0 }
    };

    const stimulusPoints = [];

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (!activeCallusMask[i]) continue;

        countActive++;
        const p = phenoSnap[i];
        const s = stimSnap[i];
        callusSSum += s;

        if (p === TISSUE_ID.GRANULATION) cGran++;
        else if (p === TISSUE_ID.FIBROUS) cFib++;
        else if (p === TISSUE_ID.CARTILAGE) cChon++;
        else if (p === TISSUE_ID.IMMATURE_BONE) cImm++;
        else if (p === TISSUE_ID.MATURE_BONE) cMat++;
        else if (p === TISSUE_ID.RESORBED || p === TISSUE_ID.MARROW) cRes++;

        const isBone = p === TISSUE_ID.IMMATURE_BONE || p === TISSUE_ID.MATURE_BONE;
        const isCart = p === TISSUE_ID.CARTILAGE;
        const isFib = p === TISSUE_ID.FIBROUS;
        const isGran = p === TISSUE_ID.GRANULATION;
        const isRes = p === TISSUE_ID.RESORBED || p === TISSUE_ID.MARROW;

        const reg = regionMask[i];
        const accum = (bucket) => {
          bucket.n++;
          if (isBone) bucket.bone++;
          if (isCart) bucket.cart++;
          if (isFib) bucket.fib++;
          if (isGran) bucket.gran++;
          if (isRes) bucket.res++;
          bucket.sSum += s;
        };

        if (reg === REGION_ID.FRACTURE_GAP) {
          accum(regStats.fractureGap);
          gapSSum += s;
          gapCount++;
          if (xMm[ix] < 0) accum(regStats.posteriorGap);
          else accum(regStats.anteriorGap);
        } else if (reg === REGION_ID.MARROW_CAVITY) {
          accum(regStats.medullaryCavity);
        } else if (reg === REGION_ID.EXTERNAL_CALLUS) {
          accum(regStats.externalCallus);
        }

        // Checkerboard downsample (~300 pts/frame) for fast Chart.js scatter rendering
        if (p !== TISSUE_ID.RESORBED && p !== TISSUE_ID.MARROW && ((ix + iz) & 1) === 0) {
          stimulusPoints.push({
            xMm: xMm[ix],
            zMm: zMm[iz],
            region: reg,
            shearStrainPct: gammaSnap[i] * 100,
            fluidVelUmS: velSnap[i],
            stimulus: s,
            phenotype: p
          });
        }
      }
    }

    const pct = (c) => (countActive > 0 ? (100 * c) / countActive : 0);
    const finalizeRegion = (b) => {
      const n = Math.max(1, b.n);
      const meanS = b.sSum / n;
      const bonePct = (100 * b.bone) / n;
      const cartPct = (100 * b.cart) / n;
      const fibPct = (100 * b.fib) / n;
      const resPct = (100 * b.res) / n;
      let dominantProcess = 'Granulation / Invading MSCs';
      if (resPct > 45) dominantProcess = 'Osteoclastic Resorption';
      else if (bonePct >= 50) dominantProcess = 'Ossification / Remodeling';
      else if (cartPct >= 25) dominantProcess = 'Endochondral Cartilage';
      else if (fibPct >= 30) dominantProcess = 'Fibrous Tissue (High Strain)';
      else if (meanS > 0.01 && meanS <= 1.0 && bonePct > 15) dominantProcess = 'Active Bone Formation';
      return {
        count: b.n,
        bonePct,
        cartilagePct: cartPct,
        cartPct,
        fibrousPct: fibPct,
        fibPct,
        granulationPct: (100 * b.gran) / n,
        resorbedPct: resPct,
        meanS,
        dominantProcess
      };
    };

    const meanGapS = gapCount > 0 ? gapSSum / gapCount : 0;
    const meanCallusS = countActive > 0 ? callusSSum / countActive : 0;
    const compObj = {
      granulationPct: pct(cGran),
      fibrousPct: pct(cFib),
      cartilagePct: pct(cChon),
      immatureBonePct: pct(cImm),
      matureBonePct: pct(cMat),
      bonePct: pct(cImm + cMat),
      resorbedPct: pct(cRes)
    };
    const medullaryRegion = finalizeRegion(regStats.medullaryCavity);

    let phaseLabel = 'Inflammation / Granulation';
    if (day > 200 && unionDay === null) {
      phaseLabel = 'Stalled / Non-Union';
    } else if (compObj.resorbedPct >= 30 && unionDay !== null) {
      phaseLabel = 'Remodeling & Resorption';
    } else if (mech.fixatorRemovedNow || (unionDay !== null && day - unionDay <= 20)) {
      phaseLabel = 'Bridging & Fixator Removal';
    } else if (compObj.bonePct >= 35) {
      phaseLabel = 'Hard Callus (Ossification)';
    } else if (compObj.cartilagePct >= 14 || day >= 16) {
      phaseLabel = 'Soft Callus (Endochondral)';
    }

    snapshots.push({
      day,
      week: day / 7,
      wbFactor: mech.wb,
      weightBearingPct: mech.wb * 100,
      bendingStiffnessNmDeg: mech.kCallusBend,
      axialStiffnessNmm: mech.kCallusAx,
      ifsMaxPct: mech.ifsMaxPct,
      ifsAntPct: mech.ifsAntPct,
      ifsPostPct: mech.ifsPostPct,
      fixatorLoadSharePct: mech.fixatorLoadSharePct,
      fixatorRemoved: mech.fixatorRemovedNow,
      fixatorActive: !mech.fixatorRemovedNow && fixationType !== 'cast_unfixed',
      meanGapStimulusS: meanGapS,
      centerStimulusS: meanGapS,
      meanCallusStimulusS: meanCallusS,
      stimulusRegimeLabel: classifyStimulusLabel(meanGapS),
      centerPhenotype: classifyStimulusLabel(meanGapS),
      phaseLabel,
      composition: compObj,
      boneFractionPct: compObj.bonePct,
      cartilageFractionPct: compObj.cartilagePct,
      fibrousFractionPct: compObj.fibrousPct,
      granulationFractionPct: compObj.granulationPct,
      resorbedFractionPct: compObj.resorbedPct,
      regions: {
        fractureGap: finalizeRegion(regStats.fractureGap),
        posteriorGap: finalizeRegion(regStats.posteriorGap),
        anteriorGap: finalizeRegion(regStats.anteriorGap),
        medullaryCavity: medullaryRegion,
        medullary: medullaryRegion,
        externalCallus: finalizeRegion(regStats.externalCallus)
      },
      stimulusPoints,
      phenotype: phenoSnap,
      stimulus: stimSnap,
      stimulusS: stimSnap,
      shearStrain: gammaSnap,
      shearStrainPct: shearStrainPctSnap,
      fluidVelocity: velSnap,
      fluidVelocityUmS: velSnap,
      modulusMPa: eSnap,
      msc: mscSnap,
      mscDensity: mscSnap,
      fibroblast: fibSnap,
      chondrocyte: chonSnap,
      osteoblast: ostSnap,
      osteoclast: oclSnap,
      resorbed: resSnap
    });
  }

  // Main 190-step coupled loop (Day 0 to Day 380, dt = 2 days)
  const mechDay0 = evaluateMechanics(0);
  recordSnapshot(0, mechDay0);

  for (let step = 1; step <= totalSteps; step++) {
    const day = step * dtDays;

    // 1. MSC & Fibroblast Random-Walk Migration (30 um/h -> 1.44 mm per 48 h step)
    nextMsc02.set(msc02);
    nextMsc24.set(msc24);
    nextMsc46.set(msc46);
    nextMscReady.set(mscReady);
    nextFib.set(fibroblast);
    nextChond.set(chondrocyte);
    nextOsteo.set(osteoblast);

    // Diffusion rate across grid spacing dx ~ 1.2 mm
    const mscRateScale = Math.pow(mscActivity, 0.65);
    const baseDiffMsc = clamp(0.22 * mscRateScale, 0.05, 0.42);
    const baseDiffFib = 0.20;

    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (!activeCallusMask[i]) continue;

        // Perier-Metz 15-day latency decay in large defects without osteoconductive support
        let latency = 1.0;
        if (gapSizeMm >= 8.0 && !hasOsteoconduction && day > 15 && distToCortMm[i] > 2.6) {
          latency = Math.exp(-(day - 15) / 8.0);
        }

        // Surface-guided scaffold migration boost
        const strutBoost = scaffoldMask[i] ? 1.38 : 1.0;
        const diffMsc = baseDiffMsc * latency * strutBoost;

        // 4-neighbor exchange with active callus neighbors (precomputed index table)
        const deg = nbrCount[i];
        const base = i * 4;
        if (deg > 0) {
          let sum02 = 0, sum24 = 0, sum46 = 0, sumR = 0, sumF = 0;
          for (let k = 0; k < deg; k++) {
            const j = nbrOffset[base + k];
            const w = scaffoldMask[j] ? 1.25 : 1.0;
            sum02 += w * (msc02[j] - msc02[i]);
            sum24 += w * (msc24[j] - msc24[i]);
            sum46 += w * (msc46[j] - msc46[i]);
            sumR += w * (mscReady[j] - mscReady[i]);
            sumF += (fibroblast[j] - fibroblast[i]);
          }
          const inv = 0.25;
          nextMsc02[i] = Math.max(0, msc02[i] + diffMsc * inv * sum02);
          nextMsc24[i] = Math.max(0, msc24[i] + diffMsc * inv * sum24);
          nextMsc46[i] = Math.max(0, msc46[i] + diffMsc * inv * sum46);
          nextMscReady[i] = Math.max(0, mscReady[i] + diffMsc * inv * sumR);
          nextFib[i] = Math.max(0, fibroblast[i] + baseDiffFib * latency * inv * sumF);
        }

        // Non-motile cell proliferation spillover into immediate neighbors when dense
        if (chondrocyte[i] > 0.35 && S_cell[i] > 1.0 && S_cell[i] <= 3.0 && deg > 0) {
          const spill = 0.04 * (chondrocyte[i] - 0.35) * latency / deg;
          for (let k = 0; k < deg; k++) {
            const j = nbrOffset[base + k];
            if (S_cell[j] > 0.8 && S_cell[j] <= 3.2) {
              nextChond[j] += spill;
            }
          }
        }
        if (osteoblast[i] > 0.35 && S_cell[i] > 0.01 && S_cell[i] <= 1.0 && deg > 0) {
          const spill = 0.05 * (osteoblast[i] - 0.35) * latency / deg;
          for (let k = 0; k < deg; k++) {
            const j = nbrOffset[base + k];
            if (S_cell[j] > 0.01 && S_cell[j] <= 1.2) {
              nextOsteo[j] += spill;
            }
          }
        }
      }
    }

    // 2. Cellular Aging, Proliferation, Differentiation, Apoptosis & Resorption (dt = 2 days)
    const diffBaseRate = (hasAutograft || graftType === 'msc_scaffold')
      ? 0.50
      : hasBMP2
        ? 0.55
        : 0.30;

    const histIdx = step % HIST_LEN;

    for (let i = 0; i < N; i++) {
      if (!activeCallusMask[i]) continue;

      const reg = regionMask[i];
      const s = S_cell[i];

      let latency = 1.0;
      if (gapSizeMm >= 8.0 && !hasOsteoconduction && day > 15 && distToCortMm[i] > 2.6) {
        latency = Math.exp(-(day - 15) / 8.0);
      }

      // MSC aging across 2-day bins (0-2d -> 2-4d -> 4-6d -> >6d ready)
      const agedReady = nextMscReady[i] + nextMsc46[i];
      const aged46 = nextMsc24[i];
      const aged24 = nextMsc02[i];

      // MSC proliferation (0.5 /day * 2 days = 1.0 cap-limited)
      const currTotal = agedReady + aged46 + aged24 + nextFib[i] + nextChond[i] + nextOsteo[i];
      const room = Math.max(0, 1.0 - currTotal);
      const mscSum = agedReady + aged46 + aged24;
      let newbornMsc = Math.min(room, 0.5 * dtDays * 0.6 * mscRateScale * latency * mscSum);

      // Continuous periosteal / endosteal physiological stem cell supply
      if (isPeriostealSeed[i] || isEndostealSeed[i]) {
        const minSeed = 0.25 * mscRateScale * (1.0 - resorbed[i]);
        if (mscSum + newbornMsc < minSeed) {
          newbornMsc = Math.max(newbornMsc, minSeed - mscSum);
        }
      }

      // MSC differentiation (critical age > 6 days -> only agedReady differentiates)
      const diffFrac = clamp(diffBaseRate * dtDays * mscRateScale * (scaffoldMask[i] ? 1.25 : 1.0) * latency, 0, 0.92);
      const diffAmount = agedReady * diffFrac;
      let remReady = agedReady - diffAmount;

      let fib = nextFib[i];
      let chon = nextChond[i];
      let ost = nextOsteo[i];
      let res = resorbed[i];
      let ocl = osteoclast[i];

      const prolifRate = 0.3 * 0.6 * dtDays * latency; // Byrne Table 1: 0.3/day * 60% active
      const apopRate = 0.15 * dtDays;                  // Byrne Table 1: 0.15/day

      if (s > 3.0) {
        // Fibrous band
        fib += diffAmount + Math.min(room, prolifRate * fib);
        chon = Math.max(0, chon * (1 - apopRate));
        ost = Math.max(0, ost * (1 - apopRate));
        ocl = Math.max(0, ocl * 0.5);
      } else if (s > 1.0) {
        // Cartilage band
        chon += diffAmount + Math.min(room, prolifRate * chon);
        fib = Math.max(0, fib * (1 - apopRate));
        ost = Math.max(0, ost * (1 - apopRate));
        ocl = Math.max(0, ocl * 0.5);
      } else if (s > 0.01) {
        // Bone band (0.53 < S <= 1.0 immature; 0.01 < S <= 0.53 mature)
        // Also allow endochondral replacement of dying chondrocytes
        const chonTurnover = chon * apopRate;
        chon = Math.max(0, chon - chonTurnover);
        fib = Math.max(0, fib * (1 - apopRate));
        const boneGain = diffAmount + Math.min(room, prolifRate * ost) + 0.65 * chonTurnover;
        ost += boneGain;
        ocl = Math.max(0, ocl * 0.4);
        // If previously partially resorbed in gap, bone can re-form
        if (reg === REGION_ID.FRACTURE_GAP && res > 0) {
          res = Math.max(0, res - 0.1 * dtDays);
        }
      } else {
        // Resorption band (S <= 0.01)
        fib = Math.max(0, fib * (1 - apopRate));
        chon = Math.max(0, chon * (1 - apopRate));

        // Resorption occurs strongly once healing is stabilized (fixator removed or late stage / plate shielding)
        const isPlateShieldedSide = fixationType === 'locking_plate' && fixationStiffnessPct >= 180 && xMm[i % nx] > 0;
        const canResorb = fixatorRemoved || day > 90 || isPlateShieldedSide;
        if (canResorb && ost > 0.02) {
          ocl = clamp(ocl + 0.25, 0, 1);
          const loss = ost * (0.15 * dtDays);
          // Protect core cortical gap from full disappearance (unless severely stress-shielded beneath a rigid locking plate)
          const minCortOst = (reg === REGION_ID.FRACTURE_GAP && !isPlateShieldedSide) ? 0.35 : 0.04;
          const actualLoss = Math.max(0, ost - Math.max(minCortOst, ost - loss));
          ost -= actualLoss;
          if (reg !== REGION_ID.FRACTURE_GAP || isPlateShieldedSide) {
            res = clamp(res + actualLoss * 1.15, 0, 1);
          }
        } else if (canResorb && (reg !== REGION_ID.FRACTURE_GAP || isPlateShieldedSide) && ost <= 0.05 && (day > 130 || isPlateShieldedSide)) {
          res = clamp(res + 0.05 * dtDays, 0, 1);
        }
      }

      // Normalize total density <= 1.0
      const sumPop = newbornMsc + aged24 + aged46 + remReady + fib + chon + ost;
      if (sumPop > 1.0) {
        const inv = 1.0 / sumPop;
        newbornMsc *= inv;
        // Keep proportional
        remReady *= inv;
        fib *= inv;
        chon *= inv;
        ost *= inv;
        msc02[i] = newbornMsc;
        msc24[i] = aged24 * inv;
        msc46[i] = aged46 * inv;
      } else {
        msc02[i] = newbornMsc;
        msc24[i] = aged24;
        msc46[i] = aged46;
      }

      mscReady[i] = remReady;
      mscTotal[i] = msc02[i] + msc24[i] + msc46[i] + remReady;
      fibroblast[i] = fib;
      chondrocyte[i] = chon;
      osteoblast[i] = ost;
      osteoclast[i] = ocl;
      resorbed[i] = res;
      granulation[i] = Math.max(0, 1.0 - fib - chon - ost - res - mscTotal[i]);

      // Update bone maturation fractions:
      // 0.53 < S <= 1.0 -> woven/immature bone; 0.01 < S <= 0.53 -> mature bone (60-day transition after woven ossification) -> cortical (17000 MPa)
      if (ost > 0.30 && E_mat[i] >= 420 && s > 0.01 && s <= 0.53) {
        matureFrac[i] = clamp(matureFrac[i] + (dtDays / 60.0), 0, 1);
        if (reg === REGION_ID.FRACTURE_GAP && matureFrac[i] > 0.45) {
          corticalFrac[i] = clamp(corticalFrac[i] + (dtDays / 90.0), 0, 1);
        }
      } else if (ost > 0.30 && E_mat[i] >= 300 && s > 0.53 && s <= 1.0) {
        // Slowly transitions toward mature if woven bone sits long enough
        matureFrac[i] = clamp(matureFrac[i] + (dtDays / 150.0), 0, 0.35);
      }

      // 3. Rule-of-mixtures instant modulus on solid ECM compartment, 10-step history average, and 30-day synthesis ramp
      const granF = granulation[i];
      const ecmDenom = Math.max(1e-4, granF + fib + chon + ost + res);
      const granW = granF / ecmDenom;
      const fibW = fib / ecmDenom;
      const chonW = chon / ecmDenom;
      const ostW = ost / ecmDenom;
      const resW = res / ecmDenom;

      const eBone = (1 - matureFrac[i]) * 1000.0 + matureFrac[i] * ((1 - corticalFrac[i]) * 6000.0 + corticalFrac[i] * 17000.0);
      let eMix = granW * 0.2 + fibW * 2.0 + chonW * 10.0 + ostW * eBone + resW * (reg === REGION_ID.MARROW_CAVITY ? 2.0 : 0.05);
      if (scaffoldMask[i]) {
        eMix = Math.max(eMix, 25.0);
      }

      E_hist[histIdx * N + i] = eMix;
      let eHistSum = 0;
      for (let h = 0; h < HIST_LEN; h++) {
        eHistSum += E_hist[h * N + i];
      }
      const eAvg10 = eHistSum / HIST_LEN;

      // Maturation synthesis ramp (Byrne 2011: 16 days cartilage, 30 days bone with osteoid mineralization lag)
      if (eAvg10 >= E_mat[i]) {
        const tauDays = ostW > chonW ? (E_mat[i] < 220 ? 185.0 : 35.0) : 18.0;
        const alpha = 1 - Math.exp(-dtDays / tauDays);
        E_mat[i] += alpha * (eAvg10 - E_mat[i]);
      } else {
        // Resorption / remodeling softening
        const alphaDown = 1 - Math.exp(-dtDays / 18.0);
        E_mat[i] += alphaDown * (eAvg10 - E_mat[i]);
      }

      E_cell[i] = clamp(E_mat[i], 0.05, 17000.0);

      // Update Poisson's ratio & Darcy permeability (Byrne Table 2)
      const boneWeight = clamp(ostW, 0, 1);
      nu_cell[i] = (1 - boneWeight) * 0.167 + boneWeight * 0.30;
      const kBone = (1 - matureFrac[i]) * 10.0 + matureFrac[i] * 1.02;
      k_cell[i] = granW * 1.0 + fibW * 1.0 + chonW * 0.5 + ostW * kBone + resW * 1.0;

      // Classify dominant tissue phenotype for visualization & regional tables
      if (res > 0.55) {
        pheno_cell[i] = reg === REGION_ID.MARROW_CAVITY ? TISSUE_ID.MARROW : TISSUE_ID.RESORBED;
      } else if (ost >= 0.28 || E_cell[i] >= 350) {
        pheno_cell[i] = (matureFrac[i] >= 0.45 && E_cell[i] >= 2200) ? TISSUE_ID.MATURE_BONE : TISSUE_ID.IMMATURE_BONE;
      } else if (chon >= 0.22 && chon >= fib) {
        pheno_cell[i] = TISSUE_ID.CARTILAGE;
      } else if (fib >= 0.22) {
        pheno_cell[i] = TISSUE_ID.FIBROUS;
      } else {
        pheno_cell[i] = TISSUE_ID.GRANULATION;
      }
    }

    // 4. Evaluate mechanics with updated E_cell
    const mech = evaluateMechanics(day);

    // 5. Record snapshot every 4 days (every 2 iterations -> 96 snapshots)
    if (step % 2 === 0) {
      recordSnapshot(day, mech);
    }
  }

  // Determine plain-English outcome summary
  const finalSnap = snapshots[snapshots.length - 1];
  const finalStiffness = finalSnap.bendingStiffnessNmDeg;
  const finalGapBone = finalSnap.regions.fractureGap.bonePct;
  const finalGapFib = finalSnap.regions.fractureGap.fibrousPct;
  const finalGapCart = finalSnap.regions.fractureGap.cartilagePct;

  let outcomeCode = 'union_remodeling';
  let outcomeLabel = 'Union & Remodeling';
  let outcomeTone = 'success';
  let outcomeDescription = `Tibial fracture achieves clinical union (>=15 Nm/deg) on Day ${unionDay} and remodels toward intact stiffness (${finalStiffness.toFixed(1)} Nm/deg).`;

  if (unionDay === null) {
    if (finalGapFib + finalGapCart > 35 || peakIfsPct > 10) {
      outcomeCode = 'hypertrophic_nonunion';
      outcomeLabel = 'Hypertrophic Non-Union / Severe Delay';
      outcomeTone = 'danger';
      outcomeDescription = `Excessive interfragmentary strain (peak ${peakIfsPct.toFixed(1)}%) keeps gap stimulus S > 1, stalling ossification in fibrous/cartilaginous tissue (${finalStiffness.toFixed(1)} Nm/deg at Day 380).`;
    } else {
      outcomeCode = 'atrophic_nonunion';
      outcomeLabel = 'Atrophic Non-Union';
      outcomeTone = 'danger';
      outcomeDescription = `Critical ${gapSizeMm.toFixed(1)} mm defect lacks osteoconductive guidance past the 15-day MSC latency window, leaving unbridged central tissue (${finalStiffness.toFixed(1)} Nm/deg).`;
    }
  } else if (fixationType === 'locking_plate' && fixationStiffnessPct >= 180) {
    const postBone = finalSnap.regions.posteriorGap.bonePct;
    const antBone = finalSnap.regions.anteriorGap.bonePct;
    outcomeCode = 'stress_shielded_union';
    outcomeLabel = 'Asymmetric Union (Plate Shielding)';
    outcomeTone = 'warning';
    outcomeDescription = `Bridging achieves 15 Nm/deg on Day ${unionDay}, but the rigid medial plate shields the near cortex (${antBone.toFixed(0)}% bone) compared to the far cortex (${postBone.toFixed(0)}% bone).`;
  } else if (gapSizeMm >= 8.0 && hasOsteoconduction) {
    outcomeCode = 'graft_bridged_union';
    outcomeLabel = 'Graft-Guided Union';
    outcomeTone = 'success';
    outcomeDescription = `Osteoconductive support overcomes the 15-day latency block across the ${gapSizeMm.toFixed(1)} mm defect, achieving union on Day ${unionDay} (${finalGapBone.toFixed(0)}% gap bone).`;
  } else if (unionDay > 165) {
    outcomeCode = 'delayed_union';
    outcomeLabel = 'Delayed Union';
    outcomeTone = 'warning';
    outcomeDescription = `Fracture heals slowly, reaching 15 Nm/deg on Day ${unionDay} (vs. ~122 d Byrne baseline) before stabilizing at ${finalStiffness.toFixed(1)} Nm/deg.`;
  }

  const computeTimeMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  const gridMeta = {
    nx,
    nz,
    widthMm: halfWidthMm * 2,
    heightMm: halfHeightMm * 2,
    xMinMm: -halfWidthMm,
    xMaxMm: halfWidthMm,
    zMinMm: -halfHeightMm,
    zMaxMm: halfHeightMm
  };

  return {
    TISSUE_TYPES: TISSUE_ID,
    gridMeta,
    params: {
      loadMultiplier,
      rehabProtocol,
      gapSizeMm,
      callusIndex,
      fixationType,
      fixationStiffnessPct,
      autoRemoveFixator,
      mscActivity,
      graftType,
      currentDay: clamp(Number(params.currentDay) || 122, 0, 380)
    },
    grid: {
      nx,
      nz,
      widthMm: halfWidthMm * 2,
      heightMm: halfHeightMm * 2,
      xMinMm: -halfWidthMm,
      xMaxMm: halfWidthMm,
      zMinMm: -halfHeightMm,
      zMaxMm: halfHeightMm,
      halfWidthMm,
      halfHeightMm,
      dxMm,
      dzMm,
      gapSizeMm,
      gapHalfMm,
      rCortMm,
      rMarrowMm,
      rCallusMm,
      callusHalfZMm,
      xMm,
      zMm,
      regionMask,
      activeCallusMask,
      scaffoldMask,
      graftMask,
      implantMask
    },
    snapshots,
    summary: {
      unionDay,
      unionWeek: unionDay !== null ? unionDay / 7 : null,
      fixatorRemovedDay,
      fixatorRemovalDay: fixatorRemovedDay,
      peakStiffnessNmDeg,
      peakStiffnessDay,
      finalStiffnessNmDeg: finalStiffness,
      finalBoneFractionPct: finalSnap.composition.bonePct,
      initialIfsPct,
      peakIfsPct,
      peakIfsDay,
      finalIfsPct: finalSnap.ifsMaxPct,
      outcomeCode,
      outcomeLabel,
      outcomeStatus: outcomeLabel,
      outcomeTone,
      outcomeDescription,
      outcomeSummary: outcomeDescription,
      computeTimeMs
    }
  };
}

/**
 * Return the snapshot closest to `day` (0..380).
 */
export function getSnapshotAtDay(simResult, day) {
  if (!simResult || !simResult.snapshots || simResult.snapshots.length === 0) return null;
  const clamped = clamp(Number(day) || 0, 0, 380);
  const idx = clamp(Math.round(clamped / 4), 0, simResult.snapshots.length - 1);
  return simResult.snapshots[idx];
}
