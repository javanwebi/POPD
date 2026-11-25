import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { isValidWebpOnDisk } from './realWebBeltEngine';
import {
  isNonBeltHardwareItem,
  type BeltEngineeringProfile,
} from './beltEngineeringJudgment';

// =============================================================================
// Universal 24-Master Industrial Belt Base Enhancement & Surgical Marking Studio
// Uses sharp (Lanczos3 + luminance silhouette masking + texture-sampled patch
// blending + authentic factory stencil rendering) to produce crisp, watermark-free
// SKU-specific photographs across ALL 1,088 belt families & 8,010 catalog SKUs.
// Zero paid API dependency — 100% deterministic & permanently cached as WebP.
// =============================================================================

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const ADAPTED_DIR = path.resolve(PUBLIC_DIR, 'belt-catalog/skus-adapted');
const MASTERS_DIR = path.resolve(PUBLIC_DIR, 'belt-catalog/masters');
const OVERRIDES_FILE = path.resolve(process.cwd(), 'server/data/masterCalibrationOverrides.json');

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MasterAnchorCalibration {
  id: string;
  masterWebpAbsPath: string;
  masterWebpPublicPath: string;
  masterBrand: string;
  masterProfile: string;
  masterMarkingCode: string;
  /** True if the verified real master photo already carries this brand's factory logo on the belt body */
  isBrandedMaster: boolean;
  /** True if an existing size marking in `eraseRect` must be texture-patched before printing */
  eraseBeforePrint: boolean;
  /** Surface tone drives luminance silhouette protection & ink blending */
  surfaceTone: 'dark' | 'light' | 'colored';
  /** Protected bounding box of the manufacturer brand/series logo (0% overlap enforced by visual validator) */
  brandLogoSafeZone?: NormalizedRect;
  /** Normalized 0..1 coordinates of the marking zone (to erase if eraseBeforePrint, then print into) */
  eraseRect: NormalizedRect;
  /** Clean adjacent rubber/belt texture sample region on the same belt band (0..1) */
  textureSampleRect: NormalizedRect;
  /** Optional fallback dark rubber RGB when using zero-seam scanline-matched local rubber inpainting */
  solidEraseColor?: [number, number, number];
  /** Protect vivid red manufacturer stripes (e.g. Optibelt Super X-POWER M=S) during erasure */
  protectRedStripe?: boolean;
  /** When set on steeply angled diagonal belts, uses a rotated feathered erase band of this thickness ratio (0..1) */
  eraseBandThicknessRatio?: number;
  /** Optional extra old size markings on other coils to cleanly erase before printing */
  extraEraseRects?: Array<{
    eraseRect: NormalizedRect;
    textureSampleRect: NormalizedRect;
    solidEraseColor?: [number, number, number];
  }>;
  /** Text rendering geometry for surgical industrial stencil replacement */
  textStyle: {
    doubleLine?: boolean;
    lineCount?: number;
    /** Optional fractional Y bounds inside eraseRect for stacked rows (0..1) */
    lineStartFrac?: number;
    lineEndFrac?: number;
    rotateDeg: number;
    skewXDeg: number;
    fillColor: string;
    opacity: number;
    fontSizeRatio: number; // relative to eraseRect height
    letterSpacing: number;
    blendMode?: 'screen' | 'over' | 'multiply';
    polygonSlope?: 'rising' | 'falling' | 'flat';
    /** Subtle cylindrical arc sag (+ curves downward like front lower coil, - curves upward) */
    curveSagRatio?: number;
  };
}

// =============================================================================
// All 24 Visually Verified & Pixel-Grid Calibrated Master Belt Anchors
// =============================================================================

export const SWR_A_MASTER_CALIBRATION: MasterAnchorCalibration = {
  id: 'SWR-WRAPPED',
  masterWebpAbsPath: path.join(MASTERS_DIR, 'SWR-A-master.webp'),
  masterWebpPublicPath: '/belt-catalog/masters/SWR-A-master.webp',
  masterBrand: 'SWR',
  masterProfile: 'A',
  masterMarkingCode: 'A-49',
  isBrandedMaster: true,
  eraseBeforePrint: true,
  surfaceTone: 'dark',
  brandLogoSafeZone: { x: 0.14, y: 0.44, w: 0.28, h: 0.30 },
  eraseRect: { x: 0.732, y: 0.494, w: 0.132, h: 0.184 },
  textureSampleRect: { x: 0.542, y: 0.556, w: 0.132, h: 0.168 },
  solidEraseColor: [44, 46, 50],
  textStyle: {
    doubleLine: true,
    lineCount: 2,
    lineStartFrac: 0.34,
    lineEndFrac: 0.67,
    rotateDeg: -19.5,
    skewXDeg: -6,
    fillColor: '#B2B8BE',
    opacity: 0.85,
    fontSizeRatio: 0.33,
    letterSpacing: 1.4,
    blendMode: 'screen',
    polygonSlope: 'rising',
    curveSagRatio: 0.035,
  },
};

export const ALL_MASTER_CALIBRATIONS: Record<string, MasterAnchorCalibration> = {
  'SWR-WRAPPED': SWR_A_MASTER_CALIBRATION,

  'SWR-COGGED': {
    id: 'SWR-COGGED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'SWR-COGGED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/SWR-COGGED-master.webp',
    masterBrand: 'SWR',
    masterProfile: 'AX',
    masterMarkingCode: 'AX-46',
    isBrandedMaster: true,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.24, y: 0.66, w: 0.36, h: 0.18 },
    eraseRect: { x: 0.635, y: 0.672, w: 0.190, h: 0.122 },
    textureSampleRect: { x: 0.635, y: 0.672, w: 0.190, h: 0.122 },
    textStyle: {
      lineCount: 2,
      lineStartFrac: 0.34,
      lineEndFrac: 0.70,
      rotateDeg: -17.5,
      skewXDeg: -6,
      fillColor: '#BAC4CE',
      opacity: 0.84,
      fontSizeRatio: 0.28,
      letterSpacing: 1.1,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.035,
    },
  },

  'DONGIL-WRAPPED': {
    id: 'DONGIL-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'DONGIL-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/DONGIL-WRAPPED-master.webp',
    masterBrand: 'DONGIL',
    masterProfile: 'A',
    masterMarkingCode: 'A-75',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.08, y: 0.48, w: 0.31, h: 0.28 },
    eraseRect: { x: 0.428, y: 0.548, w: 0.106, h: 0.168 },
    textureSampleRect: { x: 0.556, y: 0.555, w: 0.088, h: 0.180 },
    solidEraseColor: [40, 42, 46],
    textStyle: {
      lineCount: 3,
      lineStartFrac: 0.20,
      lineEndFrac: 0.84,
      rotateDeg: 0,
      skewXDeg: 0,
      fillColor: '#E6EAF0',
      opacity: 0.90,
      fontSizeRatio: 0.27,
      letterSpacing: 0.6,
      blendMode: 'screen',
      polygonSlope: 'flat',
    },
  },

  'OPTIBELT-WRAPPED': {
    id: 'OPTIBELT-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'OPTIBELT-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/OPTIBELT-WRAPPED-master.webp',
    masterBrand: 'OPTIBELT',
    masterProfile: 'B',
    masterMarkingCode: 'B-68',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.26, y: 0.36, w: 0.33, h: 0.42 },
    eraseRect: { x: 0.614, y: 0.205, w: 0.168, h: 0.145 },
    textureSampleRect: { x: 0.680, y: 0.220, w: 0.090, h: 0.080 },
    solidEraseColor: [44, 62, 54],
    eraseBandThicknessRatio: 0.32,
    extraEraseRects: [
      {
        eraseRect: { x: 0.588, y: 0.336, w: 0.062, h: 0.062 },
        textureSampleRect: { x: 0.680, y: 0.220, w: 0.090, h: 0.080 },
        solidEraseColor: [44, 62, 54],
      },
    ],
    textStyle: {
      lineCount: 1,
      rotateDeg: -41.1,
      skewXDeg: -4,
      fillColor: '#E4E9EE',
      opacity: 0.91,
      fontSizeRatio: 0.20,
      letterSpacing: 0.9,
      blendMode: 'screen',
      polygonSlope: 'rising',
    },
  },

  'OPTIBELT-WEDGE': {
    id: 'OPTIBELT-WEDGE',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'OPTIBELT-WEDGE-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/OPTIBELT-WEDGE-master.webp',
    masterBrand: 'OPTIBELT',
    masterProfile: 'SPB',
    masterMarkingCode: 'SPB 2000',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.12, y: 0.20, w: 0.37, h: 0.56 },
    eraseRect: { x: 0.487, y: 0.048, w: 0.140, h: 0.145 },
    textureSampleRect: { x: 0.487, y: 0.048, w: 0.140, h: 0.145 },
    solidEraseColor: [38, 43, 42],
    eraseBandThicknessRatio: 0.34,
    textStyle: {
      lineCount: 1,
      rotateDeg: -52.5,
      skewXDeg: -4,
      fillColor: '#E2E8EE',
      opacity: 0.90,
      fontSizeRatio: 0.18,
      letterSpacing: 0.7,
      blendMode: 'screen',
      polygonSlope: 'rising',
    },
  },

  'OPTIBELT-COGGED': {
    id: 'OPTIBELT-COGGED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'OPTIBELT-COGGED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/OPTIBELT-COGGED-master.webp',
    masterBrand: 'OPTIBELT',
    masterProfile: 'XPB',
    masterMarkingCode: 'XPB 1900',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    protectRedStripe: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.04, y: 0.29, w: 0.43, h: 0.66 },
    eraseRect: { x: 0.490, y: 0.048, w: 0.224, h: 0.224 },
    textureSampleRect: { x: 0.720, y: 0.010, w: 0.090, h: 0.080 },
    solidEraseColor: [34, 36, 40],
    eraseBandThicknessRatio: 0.54,
    textStyle: {
      lineCount: 2,
      lineStartFrac: 0.38,
      lineEndFrac: 0.63,
      rotateDeg: -47.5,
      skewXDeg: -3,
      fillColor: '#EDF1F5',
      opacity: 0.93,
      fontSizeRatio: 0.162,
      letterSpacing: 0.8,
      blendMode: 'screen',
      polygonSlope: 'rising',
    },
  },

  'OPTIBELT-TIMING': {
    id: 'OPTIBELT-TIMING',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'OPTIBELT-TIMING-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/OPTIBELT-TIMING-master.webp',
    masterBrand: 'OPTIBELT',
    masterProfile: '8M',
    masterMarkingCode: '640 8M',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.18, y: 0.22, w: 0.468, h: 0.42 },
    eraseRect: { x: 0.652, y: 0.228, w: 0.194, h: 0.372 },
    textureSampleRect: { x: 0.855, y: 0.240, w: 0.085, h: 0.340 },
    solidEraseColor: [38, 40, 44],
    textStyle: {
      lineCount: 5,
      lineStartFrac: 0.12,
      lineEndFrac: 0.88,
      rotateDeg: -4.5,
      skewXDeg: -3,
      fillColor: '#CFD5DB',
      opacity: 0.87,
      fontSizeRatio: 0.158,
      letterSpacing: 0.8,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.03,
    },
  },

  'OPTIBELT-POLYV': {
    id: 'OPTIBELT-POLYV',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'OPTIBELT-POLYV-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/OPTIBELT-POLYV-master.webp',
    masterBrand: 'OPTIBELT',
    masterProfile: 'PL',
    masterMarkingCode: 'PL 1803',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.36, y: 0.33, w: 0.255, h: 0.55 },
    eraseRect: { x: 0.620, y: 0.388, w: 0.205, h: 0.468 },
    textureSampleRect: { x: 0.845, y: 0.340, w: 0.080, h: 0.420 },
    solidEraseColor: [34, 36, 40],
    extraEraseRects: [
      {
        eraseRect: { x: 0.618, y: 0.315, w: 0.215, h: 0.098 },
        textureSampleRect: { x: 0.845, y: 0.340, w: 0.080, h: 0.120 },
        solidEraseColor: [34, 36, 40],
      },
      {
        eraseRect: { x: 0.615, y: 0.840, w: 0.205, h: 0.098 },
        textureSampleRect: { x: 0.845, y: 0.720, w: 0.080, h: 0.120 },
        solidEraseColor: [34, 36, 40],
      },
    ],
    textStyle: {
      lineCount: 6,
      lineStartFrac: 0.09,
      lineEndFrac: 0.91,
      rotateDeg: -10.6,
      skewXDeg: -2,
      fillColor: '#E0C454',
      opacity: 0.89,
      fontSizeRatio: 0.126,
      letterSpacing: 0.8,
      blendMode: 'over',
      polygonSlope: 'rising',
    },
  },

  'MEGADYNE-WRAPPED': {
    id: 'MEGADYNE-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'MEGADYNE-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/MEGADYNE-WRAPPED-master.webp',
    masterBrand: 'MEGADYNE',
    masterProfile: 'C',
    masterMarkingCode: 'C 60',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.11, y: 0.68, w: 0.390, h: 0.20 },
    eraseRect: { x: 0.506, y: 0.720, w: 0.244, h: 0.165 },
    textureSampleRect: { x: 0.250, y: 0.485, w: 0.240, h: 0.110 },
    solidEraseColor: [32, 34, 38],
    textStyle: {
      lineCount: 4,
      lineStartFrac: 0.15,
      lineEndFrac: 0.85,
      rotateDeg: -6.5,
      skewXDeg: -4,
      fillColor: '#B2D0EC',
      opacity: 0.88,
      fontSizeRatio: 0.185,
      letterSpacing: 0.9,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.035,
    },
  },

  'MEGADYNE-TIMING': {
    id: 'MEGADYNE-TIMING',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'MEGADYNE-TIMING-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/MEGADYNE-TIMING-master.webp',
    masterBrand: 'MEGADYNE',
    masterProfile: '14M',
    masterMarkingCode: '1400 GLD 14',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.08, y: 0.52, w: 0.540, h: 0.25 },
    eraseRect: { x: 0.632, y: 0.564, w: 0.198, h: 0.204 },
    textureSampleRect: { x: 0.865, y: 0.475, w: 0.080, h: 0.155 },
    solidEraseColor: [48, 51, 56],
    textStyle: {
      lineCount: 4,
      lineStartFrac: 0.14,
      lineEndFrac: 0.84,
      rotateDeg: -13.5,
      skewXDeg: -5,
      fillColor: '#BDD5EC',
      opacity: 0.86,
      fontSizeRatio: 0.152,
      letterSpacing: 0.8,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.03,
    },
  },

  'BANDO-WRAPPED': {
    id: 'BANDO-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'BANDO-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/BANDO-WRAPPED-master.webp',
    masterBrand: 'BANDO',
    masterProfile: 'B',
    masterMarkingCode: 'B-60',
    isBrandedMaster: true,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.18, y: 0.68, w: 0.62, h: 0.28 },
    eraseRect: { x: 0.34, y: 0.594, w: 0.28, h: 0.068 },
    textureSampleRect: { x: 0.34, y: 0.594, w: 0.28, h: 0.068 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -4,
      skewXDeg: -4,
      fillColor: '#CFD6DD',
      opacity: 0.84,
      fontSizeRatio: 0.44,
      letterSpacing: 1.4,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.05,
    },
  },

  'MITSUBOSHI-WRAPPED': {
    id: 'MITSUBOSHI-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'MITSUBOSHI-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/MITSUBOSHI-WRAPPED-master.webp',
    masterBrand: 'MITSUBOSHI',
    masterProfile: 'A',
    masterMarkingCode: 'A-40',
    isBrandedMaster: true,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    brandLogoSafeZone: { x: 0.22, y: 0.36, w: 0.40, h: 0.20 },
    eraseRect: { x: 0.634, y: 0.374, w: 0.180, h: 0.154 },
    textureSampleRect: { x: 0.450, y: 0.305, w: 0.155, h: 0.085 },
    solidEraseColor: [44, 46, 50],
    extraEraseRects: [
      {
        eraseRect: { x: 0.392, y: 0.568, w: 0.118, h: 0.095 },
        textureSampleRect: { x: 0.450, y: 0.305, w: 0.155, h: 0.085 },
        solidEraseColor: [44, 46, 50],
      },
      {
        eraseRect: { x: 0.506, y: 0.625, w: 0.120, h: 0.145 },
        textureSampleRect: { x: 0.450, y: 0.305, w: 0.155, h: 0.085 },
        solidEraseColor: [44, 46, 50],
      },
      {
        eraseRect: { x: 0.738, y: 0.582, w: 0.112, h: 0.100 },
        textureSampleRect: { x: 0.450, y: 0.305, w: 0.155, h: 0.085 },
        solidEraseColor: [44, 46, 50],
      },
    ],
    textStyle: {
      lineCount: 3,
      lineStartFrac: 0.18,
      lineEndFrac: 0.82,
      rotateDeg: -6.5,
      skewXDeg: -4,
      fillColor: '#E0E5EA',
      opacity: 0.88,
      fontSizeRatio: 0.22,
      letterSpacing: 0.9,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.03,
    },
  },

  // --- CLEAN UNBRANDED REAL CONSTRUCTION MASTERS (Zero Competitor Logos) ---

  'CLEAN-WRAPPED': {
    id: 'CLEAN-WRAPPED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-WRAPPED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-WRAPPED-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'B',
    masterMarkingCode: 'B-80',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.25, y: 0.708, w: 0.48, h: 0.132 },
    textureSampleRect: { x: 0.25, y: 0.708, w: 0.48, h: 0.132 },
    extraEraseRects: [
      {
        eraseRect: { x: 0.085, y: 0.500, w: 0.130, h: 0.115 },
        textureSampleRect: { x: 0.260, y: 0.720, w: 0.180, h: 0.140 },
        solidEraseColor: [82, 86, 90],
      },
      {
        eraseRect: { x: 0.630, y: 0.335, w: 0.215, h: 0.072 },
        textureSampleRect: { x: 0.450, y: 0.340, w: 0.160, h: 0.060 },
        solidEraseColor: [84, 87, 91],
      },
    ],
    textStyle: {
      lineCount: 2,
      lineStartFrac: 0.30,
      lineEndFrac: 0.72,
      rotateDeg: 1.5,
      skewXDeg: -3,
      fillColor: '#D4DAE0',
      opacity: 0.85,
      fontSizeRatio: 0.33,
      letterSpacing: 1.3,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.06,
    },
  },

  'CLEAN-COGGED': {
    id: 'CLEAN-COGGED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-COGGED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-COGGED-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AX',
    masterMarkingCode: 'AX-40',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.24, y: 0.768, w: 0.44, h: 0.090 },
    textureSampleRect: { x: 0.24, y: 0.768, w: 0.44, h: 0.090 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 1.5,
      skewXDeg: -3,
      fillColor: '#D6DCE2',
      opacity: 0.86,
      fontSizeRatio: 0.40,
      letterSpacing: 1.3,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.07,
    },
  },

  'CLEAN-TIMING-TRAP': {
    id: 'CLEAN-TIMING-TRAP',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-TRAP-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-TRAP-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'H',
    masterMarkingCode: '390H100',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.25, y: 0.625, w: 0.48, h: 0.108 },
    textureSampleRect: { x: 0.25, y: 0.625, w: 0.48, h: 0.108 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -1.5,
      skewXDeg: -3,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.42,
      letterSpacing: 1.3,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.075,
    },
  },

  'CLEAN-TIMING-DOUBLE': {
    id: 'CLEAN-TIMING-DOUBLE',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-DOUBLE-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-DOUBLE-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'DH',
    masterMarkingCode: '600DH',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.500, y: 0.728, w: 0.270, h: 0.125 },
    textureSampleRect: { x: 0.500, y: 0.728, w: 0.270, h: 0.125 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -5.5,
      skewXDeg: -3,
      fillColor: '#D6DEE6',
      opacity: 0.85,
      fontSizeRatio: 0.28,
      letterSpacing: 1.1,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: 0.04,
    },
  },

  'CLEAN-TIMING-HTD': {
    id: 'CLEAN-TIMING-HTD',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-HTD-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-HTD-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: '8M',
    masterMarkingCode: '1200-8M',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.46, y: 0.785, w: 0.34, h: 0.145 },
    textureSampleRect: { x: 0.46, y: 0.785, w: 0.34, h: 0.145 },
    textStyle: {
      lineCount: 2,
      lineStartFrac: 0.34,
      lineEndFrac: 0.68,
      rotateDeg: 1.5,
      skewXDeg: -3,
      fillColor: '#D4DBE1',
      opacity: 0.85,
      fontSizeRatio: 0.28,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.07,
    },
  },

  'CLEAN-TIMING-PU': {
    id: 'CLEAN-TIMING-PU',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-PU-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-PU-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AT10',
    masterMarkingCode: 'AT10-1200',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'light',
    eraseRect: { x: 0.240, y: 0.265, w: 0.235, h: 0.145 },
    textureSampleRect: { x: 0.240, y: 0.265, w: 0.235, h: 0.145 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 22,
      skewXDeg: 3,
      fillColor: '#2E343D',
      opacity: 0.82,
      fontSizeRatio: 0.28,
      letterSpacing: 1.0,
      blendMode: 'over',
      polygonSlope: 'falling',
    },
  },

  'CLEAN-TIMING-COATED': {
    id: 'CLEAN-TIMING-COATED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-COATED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-COATED-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AT20',
    masterMarkingCode: '150AT20',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.315, y: 0.848, w: 0.350, h: 0.084 },
    textureSampleRect: { x: 0.315, y: 0.848, w: 0.350, h: 0.084 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -6.5,
      skewXDeg: -3,
      fillColor: '#F6E8E8',
      opacity: 0.82,
      fontSizeRatio: 0.40,
      letterSpacing: 1.0,
      blendMode: 'over',
      polygonSlope: 'rising',
      curveSagRatio: 0.05,
    },
  },

  'CLEAN-POLYV': {
    id: 'CLEAN-POLYV',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-POLYV-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-POLYV-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'PK',
    masterMarkingCode: '8PK1825',
    isBrandedMaster: false,
    eraseBeforePrint: true,
    surfaceTone: 'dark',
    eraseRect: { x: 0.420, y: 0.654, w: 0.245, h: 0.162 },
    textureSampleRect: { x: 0.260, y: 0.660, w: 0.145, h: 0.145 },
    solidEraseColor: [40, 42, 48],
    textStyle: {
      lineCount: 3,
      lineStartFrac: 0.26,
      lineEndFrac: 0.80,
      rotateDeg: 4.5,
      skewXDeg: -2,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.19,
      letterSpacing: 0.8,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.04,
    },
  },

  'CLEAN-HEX': {
    id: 'CLEAN-HEX',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-HEX-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-HEX-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'BB',
    masterMarkingCode: 'BB-99',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.26, y: 0.565, w: 0.48, h: 0.175 },
    textureSampleRect: { x: 0.26, y: 0.565, w: 0.48, h: 0.175 },
    textStyle: {
      lineCount: 2,
      rotateDeg: 0,
      skewXDeg: -2,
      fillColor: '#CFD5DC',
      opacity: 0.84,
      fontSizeRatio: 0.28,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.08,
    },
  },

  'CLEAN-PU-ROUND': {
    id: 'CLEAN-PU-ROUND',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-PU-ROUND-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-PU-ROUND-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'CRC',
    masterMarkingCode: 'PU-8MM',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.35, y: 0.875, w: 0.32, h: 0.072 },
    textureSampleRect: { x: 0.35, y: 0.875, w: 0.32, h: 0.072 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -1.5,
      skewXDeg: 0,
      fillColor: '#E4F2E8',
      opacity: 0.78,
      fontSizeRatio: 0.32,
      letterSpacing: 1.0,
      blendMode: 'over',
      polygonSlope: 'flat',
      curveSagRatio: 0.12,
    },
  },

  'CLEAN-PU-VBELT': {
    id: 'CLEAN-PU-VBELT',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-PU-VBELT-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-PU-VBELT-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'A',
    masterMarkingCode: 'PU A-13',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.09, y: 0.38, w: 0.43, h: 0.24 },
    textureSampleRect: { x: 0.09, y: 0.38, w: 0.43, h: 0.24 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 24.5,
      skewXDeg: 5,
      fillColor: '#E2F0E6',
      opacity: 0.78,
      fontSizeRatio: 0.21,
      letterSpacing: 1.2,
      blendMode: 'over',
      polygonSlope: 'falling',
    },
  },

  'CLEAN-CROWNED': {
    id: 'CLEAN-CROWNED',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-CROWNED-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-CROWNED-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'CRC_CROWNED',
    masterMarkingCode: 'CROWN PU',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.38, y: 0.542, w: 0.42, h: 0.130 },
    textureSampleRect: { x: 0.38, y: 0.542, w: 0.42, h: 0.130 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -15.5,
      skewXDeg: -8,
      fillColor: '#F5E8E8',
      opacity: 0.78,
      fontSizeRatio: 0.25,
      letterSpacing: 1.1,
      blendMode: 'over',
      polygonSlope: 'rising',
    },
  },

  'CLEAN-CONVEYOR': {
    id: 'CLEAN-CONVEYOR',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-CONVEYOR-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-CONVEYOR-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'PVC',
    masterMarkingCode: 'PVC 2MM',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.135, y: 0.305, w: 0.235, h: 0.185 },
    textureSampleRect: { x: 0.135, y: 0.305, w: 0.235, h: 0.185 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 15,
      skewXDeg: 4,
      fillColor: '#E4F3E8',
      opacity: 0.76,
      fontSizeRatio: 0.21,
      letterSpacing: 1.0,
      blendMode: 'over',
      polygonSlope: 'falling',
      curveSagRatio: 0.035,
    },
  },

  // ===========================================================================
  // 12 Diverse Studio Master Variants (Preventing Repetitive Family Cards)
  // ===========================================================================

  'CLEAN-WRAPPED-SINGLE': {
    id: 'CLEAN-WRAPPED-SINGLE',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-WRAPPED-SINGLE-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-WRAPPED-SINGLE-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'B',
    masterMarkingCode: 'B-68',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.302, y: 0.320, w: 0.088, h: 0.360 },
    textureSampleRect: { x: 0.302, y: 0.320, w: 0.088, h: 0.360 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -89,
      skewXDeg: 0,
      fillColor: '#D6DCE2',
      opacity: 0.86,
      fontSizeRatio: 0.34,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: -0.14,
    },
  },

  'CLEAN-WRAPPED-WEDGE': {
    id: 'CLEAN-WRAPPED-WEDGE',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-WRAPPED-WEDGE-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-WRAPPED-WEDGE-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'SPB',
    masterMarkingCode: 'SPB 2000',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.250, y: 0.180, w: 0.340, h: 0.260 },
    textureSampleRect: { x: 0.250, y: 0.180, w: 0.340, h: 0.260 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -32.0,
      skewXDeg: -6,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.15,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'rising',
      curveSagRatio: -0.04,
    },
  },

  'CLEAN-WRAPPED-STACK': {
    id: 'CLEAN-WRAPPED-STACK',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-WRAPPED-STACK-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-WRAPPED-STACK-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'C',
    masterMarkingCode: 'C-85',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.240, y: 0.238, w: 0.520, h: 0.138 },
    textureSampleRect: { x: 0.240, y: 0.238, w: 0.520, h: 0.138 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 0,
      skewXDeg: -2,
      fillColor: '#D6DCE2',
      opacity: 0.86,
      fontSizeRatio: 0.42,
      letterSpacing: 1.3,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.05,
    },
  },

  'CLEAN-COGGED-SINGLE': {
    id: 'CLEAN-COGGED-SINGLE',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-COGGED-SINGLE-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-COGGED-SINGLE-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AX',
    masterMarkingCode: 'AX-42',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.225, y: 0.340, w: 0.115, h: 0.370 },
    textureSampleRect: { x: 0.225, y: 0.340, w: 0.115, h: 0.370 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -86,
      skewXDeg: 0,
      fillColor: '#D6DCE2',
      opacity: 0.86,
      fontSizeRatio: 0.28,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: -0.16,
    },
  },

  'CLEAN-TIMING-TRAP-UPRIGHT': {
    id: 'CLEAN-TIMING-TRAP-UPRIGHT',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-TRAP-UPRIGHT-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-TRAP-UPRIGHT-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'H',
    masterMarkingCode: '420H100',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.335, y: 0.300, w: 0.125, h: 0.400 },
    textureSampleRect: { x: 0.335, y: 0.300, w: 0.125, h: 0.400 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -89,
      skewXDeg: 0,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.28,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: -0.14,
    },
  },

  'CLEAN-TIMING-TRAP-PAIR': {
    id: 'CLEAN-TIMING-TRAP-PAIR',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-TRAP-PAIR-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-TRAP-PAIR-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'L',
    masterMarkingCode: '300L075',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.250, y: 0.640, w: 0.500, h: 0.130 },
    textureSampleRect: { x: 0.250, y: 0.640, w: 0.500, h: 0.130 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 0,
      skewXDeg: -2,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.40,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.11,
    },
  },

  'CLEAN-TIMING-HTD-UPRIGHT': {
    id: 'CLEAN-TIMING-HTD-UPRIGHT',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-HTD-UPRIGHT-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-HTD-UPRIGHT-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: '8M',
    masterMarkingCode: '1200-8M',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.305, y: 0.310, w: 0.120, h: 0.400 },
    textureSampleRect: { x: 0.305, y: 0.310, w: 0.120, h: 0.400 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -89,
      skewXDeg: 0,
      fillColor: '#D6DCE2',
      opacity: 0.86,
      fontSizeRatio: 0.28,
      letterSpacing: 1.2,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: -0.15,
    },
  },

  'CLEAN-POLYV-UPRIGHT': {
    id: 'CLEAN-POLYV-UPRIGHT',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-POLYV-UPRIGHT-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-POLYV-UPRIGHT-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'PK',
    masterMarkingCode: '8PK1825',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'dark',
    eraseRect: { x: 0.555, y: 0.300, w: 0.120, h: 0.400 },
    textureSampleRect: { x: 0.555, y: 0.300, w: 0.120, h: 0.400 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -89,
      skewXDeg: 0,
      fillColor: '#D8DEE4',
      opacity: 0.86,
      fontSizeRatio: 0.28,
      letterSpacing: 1.1,
      blendMode: 'screen',
      polygonSlope: 'flat',
      curveSagRatio: 0.14,
    },
  },

  'CLEAN-TIMING-PU-LOOP': {
    id: 'CLEAN-TIMING-PU-LOOP',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-PU-LOOP-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-PU-LOOP-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AT10',
    masterMarkingCode: 'AT10-1200',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'light',
    eraseRect: { x: 0.240, y: 0.648, w: 0.480, h: 0.128 },
    textureSampleRect: { x: 0.240, y: 0.648, w: 0.480, h: 0.128 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -2.0,
      skewXDeg: 0,
      fillColor: '#2A3038',
      opacity: 0.82,
      fontSizeRatio: 0.38,
      letterSpacing: 1.1,
      blendMode: 'over',
      polygonSlope: 'flat',
      curveSagRatio: 0.13,
    },
  },

  'CLEAN-TIMING-COATED-GREEN': {
    id: 'CLEAN-TIMING-COATED-GREEN',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-COATED-GREEN-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-COATED-GREEN-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'T10',
    masterMarkingCode: 'T10-1200 SG',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.240, y: 0.608, w: 0.500, h: 0.132 },
    textureSampleRect: { x: 0.240, y: 0.608, w: 0.500, h: 0.132 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 0,
      skewXDeg: -2,
      fillColor: '#EAF6EE',
      opacity: 0.84,
      fontSizeRatio: 0.38,
      letterSpacing: 1.1,
      blendMode: 'over',
      polygonSlope: 'flat',
      curveSagRatio: 0.10,
    },
  },

  'CLEAN-TIMING-COATED-YELLOW': {
    id: 'CLEAN-TIMING-COATED-YELLOW',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-TIMING-COATED-YELLOW-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-TIMING-COATED-YELLOW-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'AT10',
    masterMarkingCode: 'AT10 APL',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.200, y: 0.595, w: 0.500, h: 0.130 },
    textureSampleRect: { x: 0.200, y: 0.595, w: 0.500, h: 0.130 },
    textStyle: {
      lineCount: 1,
      rotateDeg: -4.5,
      skewXDeg: -2,
      fillColor: '#2A241C',
      opacity: 0.84,
      fontSizeRatio: 0.38,
      letterSpacing: 1.1,
      blendMode: 'over',
      polygonSlope: 'rising',
      curveSagRatio: 0.10,
    },
  },

  'CLEAN-PU-VBELT-COIL': {
    id: 'CLEAN-PU-VBELT-COIL',
    masterWebpAbsPath: path.join(MASTERS_DIR, 'CLEAN-PU-VBELT-COIL-master.webp'),
    masterWebpPublicPath: '/belt-catalog/masters/CLEAN-PU-VBELT-COIL-master.webp',
    masterBrand: 'GENERIC',
    masterProfile: 'B',
    masterMarkingCode: 'PU B-17',
    isBrandedMaster: false,
    eraseBeforePrint: false,
    surfaceTone: 'colored',
    eraseRect: { x: 0.165, y: 0.652, w: 0.290, h: 0.152 },
    textureSampleRect: { x: 0.165, y: 0.652, w: 0.290, h: 0.152 },
    textStyle: {
      lineCount: 1,
      rotateDeg: 22.0,
      skewXDeg: 5,
      fillColor: '#ECF8F0',
      opacity: 0.84,
      fontSizeRatio: 0.20,
      letterSpacing: 1.1,
      blendMode: 'over',
      polygonSlope: 'falling',
      curveSagRatio: 0.04,
    },
  },
};

// =============================================================================
// Persistent User Calibration Overrides (for Interactive Marking Studio)
// =============================================================================

export interface MasterCalibrationOverridePatch {
  eraseRect?: Partial<NormalizedRect>;
  textStyle?: Partial<MasterAnchorCalibration['textStyle']>;
  eraseBeforePrint?: boolean;
}

let cachedOverrides: Record<string, MasterCalibrationOverridePatch> | null = null;

function loadCalibrationOverrides(): Record<string, MasterCalibrationOverridePatch> {
  if (cachedOverrides) return cachedOverrides;
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const loaded = parsed as Record<string, MasterCalibrationOverridePatch>;
        cachedOverrides = loaded;
        return loaded;
      }
    }
  } catch {
    // ignore corrupt file
  }
  cachedOverrides = {};
  return cachedOverrides;
}

export function getEffectiveMasterCalibration(id: string): MasterAnchorCalibration | null {
  const base = ALL_MASTER_CALIBRATIONS[id];
  if (!base) return null;
  const ov = loadCalibrationOverrides()[id];
  if (!ov) return base;
  return {
    ...base,
    eraseBeforePrint: typeof ov.eraseBeforePrint === 'boolean' ? ov.eraseBeforePrint : base.eraseBeforePrint,
    eraseRect: {
      ...base.eraseRect,
      ...(ov.eraseRect || {}),
    },
    textStyle: {
      ...base.textStyle,
      ...(ov.textStyle || {}),
    },
  };
}

export function getAllEffectiveMasterCalibrations(): Array<{
  calibration: MasterAnchorCalibration;
  hasOverride: boolean;
}> {
  const ovs = loadCalibrationOverrides();
  return Object.keys(ALL_MASTER_CALIBRATIONS).map((id) => ({
    calibration: getEffectiveMasterCalibration(id)!,
    hasOverride: Boolean(ovs[id]),
  }));
}

export async function saveMasterCalibrationOverride(
  id: string,
  patch: MasterCalibrationOverridePatch,
): Promise<MasterAnchorCalibration> {
  if (!ALL_MASTER_CALIBRATIONS[id]) {
    throw new Error(`Unknown master calibration id: ${id}`);
  }
  const ovs = { ...loadCalibrationOverrides() };
  const prev = ovs[id] || {};
  ovs[id] = {
    eraseBeforePrint: typeof patch.eraseBeforePrint === 'boolean' ? patch.eraseBeforePrint : prev.eraseBeforePrint,
    eraseRect: { ...(prev.eraseRect || {}), ...(patch.eraseRect || {}) },
    textStyle: { ...(prev.textStyle || {}), ...(patch.textStyle || {}) },
  };
  cachedOverrides = ovs;
  await fsPromises.mkdir(path.dirname(OVERRIDES_FILE), { recursive: true });
  await fsPromises.writeFile(OVERRIDES_FILE, JSON.stringify(ovs, null, 2), 'utf8');
  return getEffectiveMasterCalibration(id)!;
}

export async function resetMasterCalibrationOverride(id: string): Promise<MasterAnchorCalibration> {
  if (!ALL_MASTER_CALIBRATIONS[id]) {
    throw new Error(`Unknown master calibration id: ${id}`);
  }
  const ovs = { ...loadCalibrationOverrides() };
  delete ovs[id];
  cachedOverrides = ovs;
  await fsPromises.mkdir(path.dirname(OVERRIDES_FILE), { recursive: true });
  await fsPromises.writeFile(OVERRIDES_FILE, JSON.stringify(ovs, null, 2), 'utf8');
  return getEffectiveMasterCalibration(id)!;
}

export interface ResolvedBeltMaster {
  calibration: MasterAnchorCalibration;
  /** Exact text to print on the belt body (code only for branded masters; BRAND + CODE for clean masters) */
  printText: string;
  /** Clean short SKU/profile code alone */
  codeOnly: string;
  /** Brand shown on belt */
  brandShown: string;
}

function pickDeterministicVariant(pool: string[], seed: string): string {
  if (pool.length <= 1) return pool[0];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return pool[(h >>> 0) % pool.length];
}

function resolveCoatedTimingVariant(rawText: string, seed: string): string {
  const t = rawText.toLowerCase();
  if (/(سبز|پوست\s*ماری|سوپر\s*گریپ|super\s*grip|pvc|green)/i.test(t)) {
    return 'CLEAN-TIMING-COATED-GREEN';
  }
  if (/(زرد|نارنجی|اسفنج|فوم|سلولار|apl|yellow|orange|foam|sponge)/i.test(t)) {
    return 'CLEAN-TIMING-COATED-YELLOW';
  }
  if (/(قرمز|لیناتکس|linatex|red)/i.test(t)) {
    return 'CLEAN-TIMING-COATED';
  }
  return pickDeterministicVariant(
    ['CLEAN-TIMING-COATED', 'CLEAN-TIMING-COATED-GREEN', 'CLEAN-TIMING-COATED-YELLOW'],
    seed,
  );
}

/**
 * Pure, deterministic resolver matching ANY catalog belt SKU or family to its
 * exact visually verified & pixel-calibrated real master photograph.
 *
 * Guarantees:
 * - ZERO competitor brand leakage (branded masters are ONLY used for their exact brand).
 * - ZERO belt photos placed on non-belt hardware items (bearings, wire mesh, moulds, strips).
 * - Exact physical construction match (wrapped vs wedge vs cogged vs timing vs double-sided vs HTD vs PU vs coated vs poly-V vs PU-round vs crowned vs conveyor).
 * - Deterministic visual variety across families (37 calibrated studio masters) while keeping all SKUs in the same family 100% visually coherent.
 */
export function resolveMasterCalibrationForBelt(
  profile: BeltEngineeringProfile,
  rawName = '',
  beltDivision = '',
  diversitySeed = '',
): ResolvedBeltMaster | null {
  if (
    isNonBeltHardwareItem({
      rawName,
      profile: profile.profileNormalized,
      beltDivision,
    })
  ) {
    return null;
  }

  if (profile.construction === 'unknown') {
    return null;
  }

  const brand = profile.isGenericBrand ? 'GENERIC' : profile.brandNormalized;
  const c = profile.construction;
  const isDouble = profile.teethSidedness === 'double';
  const isCoated = profile.coatingType !== 'none';
  const isNarrowWedge = /^(SP[ZABC]|3V|5V|8V)$/i.test(profile.profileNormalized);
  const seed =
    diversitySeed.trim() ||
    `${brand}|${profile.profileNormalized}|${c}|${profile.supplyForm}|${profile.coatingType}`;
  const coatingHint = `${rawName} ${profile.coatingType} ${beltDivision}`;

  let calId: string | null = null;

  // 1. Exact Brand + Construction real manufacturer master match
  if (brand === 'SWR') {
    if (c === 'wrapped-vbelt' && !isCoated) calId = 'SWR-WRAPPED';
    else if (c === 'cogged-raw-edge-vbelt') calId = 'SWR-COGGED';
  } else if (brand === 'DONGIL') {
    if (c === 'wrapped-vbelt' && !isCoated) calId = 'DONGIL-WRAPPED';
  } else if (brand === 'OPTIBELT') {
    if (c === 'wrapped-vbelt' && !isCoated) {
      calId = isNarrowWedge ? 'OPTIBELT-WEDGE' : 'OPTIBELT-WRAPPED';
    } else if (c === 'cogged-raw-edge-vbelt') calId = 'OPTIBELT-COGGED';
    else if ((c === 'timing-trapezoidal-rubber' || c === 'timing-htd-rubber') && !isDouble && !isCoated) {
      calId = 'OPTIBELT-TIMING';
    } else if (c === 'poly-v-ribbed') calId = 'OPTIBELT-POLYV';
  } else if (brand === 'MEGADYNE') {
    if (c === 'wrapped-vbelt' && !isCoated) calId = 'MEGADYNE-WRAPPED';
    else if ((c === 'timing-trapezoidal-rubber' || c === 'timing-htd-rubber') && !isDouble && !isCoated) {
      calId = 'MEGADYNE-TIMING';
    }
  } else if (brand === 'BANDO') {
    if (c === 'wrapped-vbelt' && !isCoated) calId = 'BANDO-WRAPPED';
  } else if (brand === 'MITSUBOSHI') {
    if (c === 'wrapped-vbelt' && !isCoated) calId = 'MITSUBOSHI-WRAPPED';
  }

  // 2. Clean zero-competitor-logo construction master with deterministic family pose variety
  if (!calId) {
    if (c === 'timing-pu-steel') {
      if (isCoated) {
        calId = resolveCoatedTimingVariant(coatingHint, seed);
      } else if (/(متری|باز|open|roll)/i.test(`${rawName} ${profile.supplyForm}`)) {
        calId = 'CLEAN-TIMING-PU';
      } else if (/(لوپ|حلقه|بسته|endless)/i.test(`${rawName} ${profile.supplyForm}`)) {
        calId = 'CLEAN-TIMING-PU-LOOP';
      } else {
        calId = pickDeterministicVariant(['CLEAN-TIMING-PU', 'CLEAN-TIMING-PU-LOOP'], seed);
      }
    } else if (c === 'timing-trapezoidal-rubber') {
      if (isCoated) calId = resolveCoatedTimingVariant(coatingHint, seed);
      else if (isDouble) calId = 'CLEAN-TIMING-DOUBLE';
      else {
        calId = pickDeterministicVariant(
          ['CLEAN-TIMING-TRAP', 'CLEAN-TIMING-TRAP-UPRIGHT', 'CLEAN-TIMING-TRAP-PAIR'],
          seed,
        );
      }
    } else if (c === 'timing-htd-rubber') {
      if (isCoated) calId = resolveCoatedTimingVariant(coatingHint, seed);
      else if (isDouble) calId = 'CLEAN-TIMING-DOUBLE';
      else {
        calId = pickDeterministicVariant(['CLEAN-TIMING-HTD', 'CLEAN-TIMING-HTD-UPRIGHT'], seed);
      }
    } else if (c === 'cogged-raw-edge-vbelt') {
      calId = pickDeterministicVariant(['CLEAN-COGGED', 'CLEAN-COGGED-SINGLE'], seed);
    } else if (c === 'hexagonal-vbelt') {
      calId = 'CLEAN-HEX';
    } else if (c === 'poly-v-ribbed') {
      calId = pickDeterministicVariant(['CLEAN-POLYV', 'CLEAN-POLYV-UPRIGHT'], seed);
    } else if (c === 'pu-round-welded') {
      calId = 'CLEAN-PU-ROUND';
    } else if (c === 'pu-vbelt-welded') {
      calId = pickDeterministicVariant(['CLEAN-PU-VBELT', 'CLEAN-PU-VBELT-COIL'], seed);
    } else if (c === 'crowned-ridge') {
      calId = 'CLEAN-CROWNED';
    } else if (c === 'conveyor-flat') {
      calId = 'CLEAN-CONVEYOR';
    } else if (c === 'wrapped-vbelt') {
      if (isNarrowWedge) {
        calId = pickDeterministicVariant(['CLEAN-WRAPPED-WEDGE', 'CLEAN-WRAPPED-SINGLE'], seed);
      } else {
        calId = pickDeterministicVariant(
          ['CLEAN-WRAPPED', 'CLEAN-WRAPPED-SINGLE', 'CLEAN-WRAPPED-STACK'],
          seed,
        );
      }
    }
  }

  if (!calId) return null;
  const calibration = getEffectiveMasterCalibration(calId);
  if (!calibration) return null;

  const cleanCode = (profile.targetMarkingCode || profile.profileNormalized || '')
    .replace(/[^A-Za-z0-9./ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const codeOnly = cleanCode || calibration.masterMarkingCode;

  // Branded masters already carry the real manufacturer logo on the belt pixels -> print ONLY the SKU code!
  // Clean unbranded masters print "BRAND  CODE" (or CODE alone if generic/unspecified).
  const safeBrand = !profile.isGenericBrand
    ? profile.brandNormalized.replace(/[^A-Za-z0-9. -]/g, '').trim().toUpperCase().slice(0, 12)
    : '';

  let printText = codeOnly;
  if (!calibration.isBrandedMaster && safeBrand) {
    printText = `${safeBrand} ${codeOnly}`.trim();
  }

  return {
    calibration,
    printText,
    codeOnly,
    brandShown: safeBrand || (calibration.isBrandedMaster ? calibration.masterBrand : 'INDUSTRIAL'),
  };
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Enhances a verified real belt photograph into a crisp, high-resolution,
 * studio-balanced WebP without altering the belt geometry or physical markings.
 */
export async function enhanceBeltBasePhoto(
  inputBuffer: Buffer,
  targetWidth = 1200,
): Promise<Buffer> {
  const meta = await sharp(inputBuffer).metadata();
  const srcW = meta.width || 800;

  let pipe = sharp(inputBuffer).rotate();
  if (srcW < targetWidth) {
    pipe = pipe.resize({
      width: targetWidth,
      kernel: sharp.kernel.lanczos3,
    });
  } else if (srcW > 1400) {
    pipe = pipe.resize({
      width: 1200,
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    });
  }

  return pipe
    .sharpen({ sigma: 1.15, m1: 1.1, m2: 2.2 })
    .modulate({ brightness: 1.01, saturation: 1.04 })
    .webp({ quality: 88, effort: 5, smartSubsample: false })
    .toBuffer();
}

/**
 * Builds a perspective-matched feathered parallelogram mask so sampled rubber texture
 * stays strictly inside the belt face and never spills onto the background.
 */
function buildCurvedBandMaskSvg(
  w: number,
  h: number,
  slope: 'rising' | 'falling' | 'flat' = 'rising',
  rotateDeg?: number,
  bandThicknessRatio?: number,
): Buffer {
  const blurStd = Math.max(2.5, Math.round(Math.min(w, h) * 0.042));

  // For steeply angled diagonal belts (Optibelt VB/SK/Super X-POWER), use a true
  // rotated feathered band aligned strictly with the narrow belt diagonal so adjacent
  // manufacturer logo boxes (e.g. s=C plus / M=S) are NEVER clipped.
  if (bandThicknessRatio && Math.abs(rotateDeg || 0) >= 15) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const bandLen = Math.hypot(w, h) * 0.94;
    const bandH = Math.max(14, Math.min(w, h) * bandThicknessRatio);
    const rx = Math.round(bandH * 0.2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <filter id="bandFeather" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="${blurStd}" />
        </filter>
      </defs>
      <g transform="rotate(${(rotateDeg || 0).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})">
        <rect
          x="${(cx - bandLen / 2).toFixed(1)}"
          y="${(cy - bandH / 2).toFixed(1)}"
          width="${bandLen.toFixed(1)}"
          height="${bandH.toFixed(1)}"
          rx="${rx}"
          fill="#FFFFFF"
          filter="url(#bandFeather)"
        />
      </g>
    </svg>`;
    return Buffer.from(svg);
  }

  let tlY = Math.round(h * 0.05);
  let trY = Math.round(h * 0.05);
  let brY = Math.round(h * 0.95);
  let blY = Math.round(h * 0.95);

  if (slope === 'rising') {
    tlY = Math.round(h * 0.09);
    trY = Math.round(h * 0.03);
    brY = Math.round(h * 0.91);
    blY = Math.round(h * 0.97);
  } else if (slope === 'falling') {
    tlY = Math.round(h * 0.03);
    trY = Math.round(h * 0.09);
    brY = Math.round(h * 0.97);
    blY = Math.round(h * 0.91);
  }

  const padX = Math.round(w * 0.03);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <filter id="bandFeather" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="${blurStd}" />
      </filter>
    </defs>
    <polygon
      points="${padX},${tlY} ${w - padX},${trY} ${w - padX},${brY} ${padX},${blY}"
      fill="#FFFFFF"
      filter="url(#bandFeather)"
    />
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Renders the replacement factory stencil code in matching condensed industrial ink
 * with perspective slant, multi-line factory repetition (1..6 lines), slight ink
 * blur, and automatic width-fitting so long codes never clip.
 */
function buildIndustrialStencilSvg(
  w: number,
  h: number,
  targetText: string,
  style: MasterAnchorCalibration['textStyle'],
): Buffer {
  const safeCode = escapeXml(targetText.trim().toUpperCase());
  const charCount = targetText.trim().length;
  const lineCount = style.lineCount ?? (style.doubleLine ? 2 : 1);

  // Auto-scale font size vertically (by belt cross-band thickness) AND along the rotated text axis
  const absRot = Math.abs(style.rotateDeg || 0);
  const isVerticalBand = absRot >= 65;
  const rad = ((style.rotateDeg || 0) * Math.PI) / 180;
  const absCos = Math.max(0.38, Math.abs(Math.cos(rad)));
  const absSin = Math.max(0.38, Math.abs(Math.sin(rad)));
  const thicknessSpan = isVerticalBand ? w : h;
  const alongAxisSpan = isVerticalBand
    ? h * 0.82
    : absRot >= 25
      ? Math.min(w / absCos, h / absSin) * 0.78
      : w * 0.84;
  const heightBasedSize = thicknessSpan * style.fontSizeRatio;
  const maxWidthBasedSize = alongAxisSpan / Math.max(3.2, charCount * 0.56);
  const fontSize = Math.max(10, Math.round(Math.min(heightBasedSize, maxWidthBasedSize)));

  const cx = Math.round(w * 0.50);
  const cy = Math.round(h * 0.50);
  const sag = style.curveSagRatio ? Math.round(thicknessSpan * style.curveSagRatio) : 0;

  // Compute balanced vertical positions for 1..6 stacked factory lines.
  // When curveSagRatio is set, position each character along an exact quadratic arc
  // with local tangent rotation (100% librsvg/sharp compatible, natural cylindrical wrap!).
  const linesSvg: string[] = [];
  const rawChars = targetText.trim().toUpperCase().split('');
  const pushLine = (y: number, rowSize: number, rowOpacity: number) => {
    if (Math.abs(sag) >= 2 && rawChars.length >= 3) {
      const charAdvance = rowSize * 0.48 + style.letterSpacing;
      const totalSpan = Math.min(alongAxisSpan, charAdvance * Math.max(1, rawChars.length - 1));
      const stepX = totalSpan / Math.max(1, rawChars.length - 1);
      const startX = cx - totalSpan / 2;
      const charElems: string[] = [];
      for (let ci = 0; ci < rawChars.length; ci++) {
        const ch = rawChars[ci];
        if (ch === ' ') continue;
        const u = rawChars.length > 1 ? (ci / (rawChars.length - 1)) * 2 - 1 : 0; // -1 .. +1
        const px = startX + ci * stepX;
        const py = y + sag * (1 - u * u) - sag * 0.4;
        // Derivative of sag*(1 - u^2) w.r.t. x -> tangent tilt in degrees
        const slopeDyDx = (-2 * sag * u) / Math.max(20, totalSpan / 2);
        const tangentDeg = Math.atan(slopeDyDx) * (180 / Math.PI);
        charElems.push(
          `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${tangentDeg.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" font-family="'Arial Narrow', 'Roboto Condensed', 'DejaVu Sans Condensed', 'Liberation Sans Narrow', sans-serif" font-size="${rowSize}" font-weight="700" fill="url(#inkGrad)" opacity="${rowOpacity.toFixed(2)}">${escapeXml(ch)}</text>`,
        );
      }
      linesSvg.push(charElems.join('\n      '));
    } else {
      linesSvg.push(
        `<text x="${cx}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="'Arial Narrow', 'Roboto Condensed', 'DejaVu Sans Condensed', 'Liberation Sans Narrow', sans-serif" font-size="${rowSize}" font-weight="700" letter-spacing="${style.letterSpacing}" fill="url(#inkGrad)" opacity="${rowOpacity.toFixed(2)}">${safeCode}</text>`,
      );
    }
  };

  if (lineCount <= 1) {
    pushLine(isVerticalBand ? cy : Math.round(h * 0.52), fontSize, 1.0);
  } else {
    const startFrac =
      style.lineStartFrac ?? (lineCount === 2 ? 0.36 : lineCount === 3 ? 0.24 : 0.14);
    const endFrac =
      style.lineEndFrac ?? (lineCount === 2 ? 0.72 : lineCount === 3 ? 0.78 : 0.88);
    const step = (endFrac - startFrac) / (lineCount - 1);
    for (let i = 0; i < lineCount; i++) {
      const y = Math.round(h * (startFrac + i * step));
      const rowOpacity = i === 0 ? 1.0 : Math.max(0.80, 0.97 - i * 0.025);
      const rowScale = i === 0 ? 1.0 : 0.98;
      pushLine(y, Math.round(fontSize * rowScale), rowOpacity);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <filter id="inkSoft" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0.55" />
      </filter>
      <linearGradient id="inkGrad" x1="0%" y1="0%" x2="100%" y2="20%">
        <stop offset="0%" stop-color="${style.fillColor}" stop-opacity="${(style.opacity * 0.90).toFixed(2)}" />
        <stop offset="45%" stop-color="${style.fillColor}" stop-opacity="${style.opacity}" />
        <stop offset="100%" stop-color="${style.fillColor}" stop-opacity="${(style.opacity * 0.82).toFixed(2)}" />
      </linearGradient>
    </defs>
    <g transform="translate(${cx}, ${cy}) rotate(${style.rotateDeg}) skewX(${style.skewXDeg}) translate(${-cx}, ${-cy})" filter="url(#inkSoft)">
      ${linesSvg.join('\n      ')}
    </g>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Determines belt surface presence (0..1) from underlying master RGB pixel so
 * neither texture patches nor stencil ink EVER bleed onto the white studio background.
 */
function computeBeltPresence(
  r: number,
  g: number,
  b: number,
  surfaceTone: MasterAnchorCalibration['surfaceTone'],
): number {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);

  if (surfaceTone === 'light') {
    // White PU belt is slightly off-white / warm-grey (lum ~ 160..242) while pure white studio bg is > 248
    if (lum > 247 && chroma < 8) return 0;
    if (lum > 238 && chroma < 10) return (247 - lum) / 9;
    return 1;
  }

  if (surfaceTone === 'colored') {
    // Colored belts (red Linatex, green PU, yellow Optibelt-VB stripe) have clear chroma or lum < 228
    if (lum > 236 && chroma < 16) return 0;
    if (lum > 218 && chroma < 18) return (236 - lum) / 18;
    return 1;
  }

  // Dark rubber belts: hard-protect pure white studio background & bright specular gaps between coils
  if (lum > 205) return 0;
  if (lum > 170) return (205 - lum) / 35;
  return 1;
}

/**
 * Computes a border-connected studio background mask (1 = true outside studio white, 0 = interior belt/ink)
 * via fast BFS flood-fill from all 4 image edges. This guarantees 100% erasure of dense multi-line white
 * factory codes printed INSIDE dark belts (like CLEAN-POLYV, MITSUBOSHI, OPTIBELT) while preserving
 * 100% of true studio white background outside the belt silhouette!
 */
function computeStudioBackgroundMask(
  fullPixels: Buffer,
  imgW: number,
  imgH: number,
  surfaceTone: MasterAnchorCalibration['surfaceTone'],
): Uint8Array {
  const bgMask = new Uint8Array(imgW * imgH);
  const visited = new Uint8Array(imgW * imgH);
  const queue = new Int32Array(imgW * imgH);
  let head = 0;
  let tail = 0;

  const isBgPixel = (idx4: number): boolean => {
    const r = fullPixels[idx4];
    const g = fullPixels[idx4 + 1];
    const b = fullPixels[idx4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (surfaceTone === 'light') return lum > 244 && chroma < 10;
    if (surfaceTone === 'colored') return lum > 224 && chroma < 20;
    return lum > 195 && chroma < 24;
  };

  const enqueue = (x: number, y: number) => {
    const idx = y * imgW + x;
    if (visited[idx]) return;
    if (!isBgPixel(idx * 4)) return;
    visited[idx] = 1;
    bgMask[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < imgW; x++) {
    enqueue(x, 0);
    enqueue(x, imgH - 1);
  }
  for (let y = 0; y < imgH; y++) {
    enqueue(0, y);
    enqueue(imgW - 1, y);
  }

  while (head < tail) {
    const cur = queue[head++];
    const px = cur % imgW;
    const py = (cur - px) / imgW;
    if (px > 0) enqueue(px - 1, py);
    if (px + 1 < imgW) enqueue(px + 1, py);
    if (py > 0) enqueue(px, py - 1);
    if (py + 1 < imgH) enqueue(px, py + 1);
  }

  return bgMask;
}

async function buildFeatheredTexturePatch(
  masterBuf: Buffer,
  imgW: number,
  imgH: number,
  eraseRect: NormalizedRect,
  textureSampleRect: NormalizedRect,
  surfaceTone: MasterAnchorCalibration['surfaceTone'],
  slope: 'rising' | 'falling' | 'flat',
  solidEraseColor?: [number, number, number],
  studioBgMask?: Uint8Array,
  fullRawPixels?: Buffer,
  protectRedStripe = false,
  rotateDeg?: number,
  bandThicknessRatio?: number,
): Promise<{ png: Buffer; left: number; top: number; width: number; height: number; masterRegionPixels: Buffer }> {
  const left = Math.max(0, Math.min(imgW - 24, Math.round(eraseRect.x * imgW)));
  const top = Math.max(0, Math.min(imgH - 24, Math.round(eraseRect.y * imgH)));
  const width = Math.max(24, Math.min(imgW - left, Math.round(eraseRect.w * imgW)));
  const height = Math.max(24, Math.min(imgH - top, Math.round(eraseRect.h * imgH)));

  const masterRegionPixels = await sharp(masterBuf)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // For zero-seam scanline-matched rubber inpainting, extract a slightly wider strip
  // (16px left & right of eraseRect) so every row samples the EXACT underlying curved
  // belt shading and gradient instead of pasting a flat uniform gray box!
  let leftEdgeRgb: Array<[number, number, number]> | null = null;
  let rightEdgeRgb: Array<[number, number, number]> | null = null;
  let texturePixels: Buffer | null = null;

  if (solidEraseColor) {
    const padX = 16;
    const extLeft = Math.max(0, left - padX);
    const extRight = Math.min(imgW, left + width + padX);
    const extW = extRight - extLeft;
    const extPixels = await sharp(masterBuf)
      .extract({ left: extLeft, top, width: extW, height })
      .ensureAlpha()
      .raw()
      .toBuffer();

    leftEdgeRgb = new Array(height);
    rightEdgeRgb = new Array(height);
    const fallback = solidEraseColor;
    const sampleDarkRubber = (py: number, xStart: number, xEnd: number): [number, number, number] | null => {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      const yMin = Math.max(0, py - 2);
      const yMax = Math.min(height - 1, py + 2);
      for (let yy = yMin; yy <= yMax; yy++) {
        for (let xx = Math.max(0, xStart); xx < Math.min(extW, xEnd); xx++) {
          const pIdx = (yy * extW + xx) * 4;
          const r = extPixels[pIdx];
          const g = extPixels[pIdx + 1];
          const b = extPixels[pIdx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (lum >= 12 && lum <= 96 && chroma < 28) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
      }
      if (count >= 3) {
        return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
      }
      return null;
    };

    const innerStart = left - extLeft;
    const innerEnd = innerStart + width;
    for (let py = 0; py < height; py++) {
      const lCol = sampleDarkRubber(py, 0, Math.max(4, innerStart + 4));
      const rCol = sampleDarkRubber(py, Math.min(extW - 4, innerEnd - 4), extW);
      const midCol = !lCol && !rCol ? sampleDarkRubber(py, innerStart, innerEnd) : null;
      leftEdgeRgb[py] = lCol || rCol || midCol || fallback;
      rightEdgeRgb[py] = rCol || lCol || midCol || fallback;
    }
  } else {
    const sLeft = Math.max(0, Math.min(imgW - 16, Math.round(textureSampleRect.x * imgW)));
    const sTop = Math.max(0, Math.min(imgH - 16, Math.round(textureSampleRect.y * imgH)));
    const sW = Math.max(16, Math.min(imgW - sLeft, Math.round(textureSampleRect.w * imgW)));
    const sH = Math.max(16, Math.min(imgH - sTop, Math.round(textureSampleRect.h * imgH)));

    texturePixels = await sharp(masterBuf)
      .extract({ left: sLeft, top: sTop, width: sW, height: sH })
      .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer();
  }

  const featherMask = await sharp(
    buildCurvedBandMaskSvg(width, height, slope, rotateDeg, bandThicknessRatio),
  )
    .resize(width, height)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const featheredPatch = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const px = i % width;
    const py = (i - px) / width;

    const mr = masterRegionPixels[idx];
    const mg = masterRegionPixels[idx + 1];
    const mb = masterRegionPixels[idx + 2];
    const fullX = left + px;
    const fullY = top + py;
    const fullIdx = fullY * imgW + fullX;
    let presence = computeBeltPresence(mr, mg, mb, surfaceTone);

    // Protect vivid red manufacturer stripes/badges AND white lettering inside them (Optibelt red M=S box)
    // ONLY when explicitly enabled so pink/red size codes on other brands (e.g. Megadyne C 60) still erase 100%!
    let isProtectedRed = protectRedStripe && surfaceTone === 'dark' && mr > 135 && mr - mg > 65;
    if (!isProtectedRed && protectRedStripe && surfaceTone === 'dark' && fullRawPixels) {
      for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, 4]]) {
        const nx = fullX + dx;
        const ny = fullY + dy;
        if (nx >= 0 && nx < imgW && ny >= 0 && ny < imgH) {
          const ni = (ny * imgW + nx) * 4;
          if (fullRawPixels[ni] > 140 && fullRawPixels[ni] - fullRawPixels[ni + 1] > 70) {
            isProtectedRed = true;
            break;
          }
        }
      }
    }
    if (isProtectedRed) {
      presence = 0;
    }

    // Distinguish thin white factory letters printed ON dark belt rubber from wide enclosed
    // white studio gaps between coils (like CLEAN-HEX). A white stroke has dark rubber on
    // BOTH opposite sides along at least one of the 4 axes within ±22px; a wide white coil gap does not!
    if (studioBgMask) {
      if (studioBgMask[fullIdx] === 1) {
        presence = 0;
      } else if (surfaceTone === 'dark' && presence < 1 && !isProtectedRed) {
        if (fullRawPixels) {
          const isDarkAt = (x: number, y: number): boolean => {
            if (x < 0 || x >= imgW || y < 0 || y >= imgH) return false;
            const fi = (y * imgW + x) * 4;
            const l = 0.299 * fullRawPixels[fi] + 0.587 * fullRawPixels[fi + 1] + 0.114 * fullRawPixels[fi + 2];
            return l < 125;
          };
          const hasDarkAxis = (dx: number, dy: number): boolean => {
            let neg = false;
            let pos = false;
            for (const step of [5, 10, 16, 22]) {
              if (!neg && isDarkAt(fullX - dx * step, fullY - dy * step)) neg = true;
              if (!pos && isDarkAt(fullX + dx * step, fullY + dy * step)) pos = true;
              if (neg && pos) return true;
            }
            return false;
          };
          if (
            hasDarkAxis(1, 0) ||
            hasDarkAxis(0, 1) ||
            hasDarkAxis(1, 1) ||
            hasDarkAxis(1, -1)
          ) {
            presence = 1;
          } else {
            presence = 0;
          }
        } else {
          presence = 1;
        }
      }
    }

    if (leftEdgeRgb && rightEdgeRgb) {
      const t = width > 1 ? px / (width - 1) : 0.5;
      const l = leftEdgeRgb[py];
      const r = rightEdgeRgb[py];
      const baseR = l[0] * (1 - t) + r[0] * t;
      const baseG = l[1] * (1 - t) + r[1] * t;
      const baseB = l[2] * (1 - t) + r[2] * t;
      const weave = ((px * 7 + py * 13) % 5) - 2;
      featheredPatch[idx] = Math.max(0, Math.min(255, Math.round(baseR + weave)));
      featheredPatch[idx + 1] = Math.max(0, Math.min(255, Math.round(baseG + weave)));
      featheredPatch[idx + 2] = Math.max(0, Math.min(255, Math.round(baseB + weave)));
    } else if (texturePixels) {
      featheredPatch[idx] = texturePixels[idx];
      featheredPatch[idx + 1] = texturePixels[idx + 1];
      featheredPatch[idx + 2] = texturePixels[idx + 2];
    }
    featheredPatch[idx + 3] = Math.round(featherMask[i] * presence);
  }

  // Build post-erase blended surface buffer so downstream stencil clipping & fabric-lighting
  // modulation see clean dark rubber where old white letters were erased (ZERO ghost punch-through!)
  const postErasePixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const a = featheredPatch[idx + 3] / 255;
    postErasePixels[idx] = Math.round(masterRegionPixels[idx] * (1 - a) + featheredPatch[idx] * a);
    postErasePixels[idx + 1] = Math.round(masterRegionPixels[idx + 1] * (1 - a) + featheredPatch[idx + 1] * a);
    postErasePixels[idx + 2] = Math.round(masterRegionPixels[idx + 2] * (1 - a) + featheredPatch[idx + 2] * a);
    postErasePixels[idx + 3] = 255;
  }

  const png = await sharp(featheredPatch, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return { png, left, top, width, height, masterRegionPixels: postErasePixels };
}

/**
 * Renders the marking onto the master belt photograph and returns the WebP Buffer + dimensions
 * (used both by permanent disk writers and by the live Interactive Marking Studio preview API).
 */
export async function renderBeltMarkingBuffer(
  calibration: MasterAnchorCalibration,
  targetCode: string,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (!fs.existsSync(calibration.masterWebpAbsPath)) {
    throw new Error(`Master belt base photo not found: ${calibration.masterWebpAbsPath}`);
  }

  const masterBuf = await fsPromises.readFile(calibration.masterWebpAbsPath);
  const { data: fullRaw, info: fullInfo } = await sharp(masterBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const imgW = fullInfo.width || 1000;
  const imgH = fullInfo.height || 1000;
  const studioBgMask = computeStudioBackgroundMask(fullRaw, imgW, imgH, calibration.surfaceTone);

  const slope = calibration.textStyle.polygonSlope || 'rising';
  const composites: OverlayOptions[] = [];

  // 1. Optional extra erase patches (removes secondary old size codes on other coils)
  if (calibration.extraEraseRects?.length) {
    for (const extra of calibration.extraEraseRects) {
      const p = await buildFeatheredTexturePatch(
        masterBuf,
        imgW,
        imgH,
        extra.eraseRect,
        extra.textureSampleRect,
        calibration.surfaceTone,
        'flat',
        extra.solidEraseColor,
        studioBgMask,
        fullRaw,
      );
      composites.push({ input: p.png, left: p.left, top: p.top, blend: 'over' });
    }
  }

  // 2. Primary target marking region
  const left = Math.max(0, Math.min(imgW - 24, Math.round(calibration.eraseRect.x * imgW)));
  const top = Math.max(0, Math.min(imgH - 24, Math.round(calibration.eraseRect.y * imgH)));
  const width = Math.max(24, Math.min(imgW - left, Math.round(calibration.eraseRect.w * imgW)));
  const height = Math.max(24, Math.min(imgH - top, Math.round(calibration.eraseRect.h * imgH)));

  let surfaceRegionPixels: Buffer;
  if (calibration.eraseBeforePrint) {
    const mainPatch = await buildFeatheredTexturePatch(
      masterBuf,
      imgW,
      imgH,
      calibration.eraseRect,
      calibration.textureSampleRect,
      calibration.surfaceTone,
      slope,
      calibration.solidEraseColor,
      studioBgMask,
      fullRaw,
      Boolean(calibration.protectRedStripe),
      calibration.textStyle.rotateDeg,
      calibration.eraseBandThicknessRatio,
    );
    surfaceRegionPixels = mainPatch.masterRegionPixels;
    composites.push({ input: mainPatch.png, left: mainPatch.left, top: mainPatch.top, blend: 'over' });
  } else {
    surfaceRegionPixels = await sharp(masterBuf)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer();
  }

  // 3. Render replacement industrial stencil text & apply Photorealistic Fabric-Absorbed Ink Compositing
  const stencilPixels = await sharp(
    buildIndustrialStencilSvg(width, height, targetCode, calibration.textStyle),
  )
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Compute reference median luminance of actual belt pixels inside the print region
  let lumSum = 0;
  let lumCount = 0;
  for (let i = 0; i < width * height; i += 3) {
    const idx = i * 4;
    const px = i % width;
    const py = (i - px) / width;
    if (studioBgMask[(top + py) * imgW + (left + px)] === 1) continue;
    const p = computeBeltPresence(
      surfaceRegionPixels[idx],
      surfaceRegionPixels[idx + 1],
      surfaceRegionPixels[idx + 2],
      calibration.surfaceTone,
    );
    if (p > 0.7) {
      lumSum +=
        0.299 * surfaceRegionPixels[idx] +
        0.587 * surfaceRegionPixels[idx + 1] +
        0.114 * surfaceRegionPixels[idx + 2];
      lumCount++;
    }
  }
  const refSurfaceLum = lumCount > 0 ? Math.max(24, lumSum / lumCount) : 52;

  const clippedStencil = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const rawAlpha = stencilPixels[idx + 3];
    if (rawAlpha === 0) continue;

    const px = i % width;
    const py = (i - px) / width;
    if (studioBgMask[(top + py) * imgW + (left + px)] === 1) continue;

    const sr = surfaceRegionPixels[idx];
    const sg = surfaceRegionPixels[idx + 1];
    const sb = surfaceRegionPixels[idx + 2];
    const presence = computeBeltPresence(sr, sg, sb, calibration.surfaceTone);
    if (presence <= 0.35) continue;

    const nPx = Math.min(width - 1, px + 2);
    const nPy = Math.min(height - 1, py + 2);
    const nIdx = (nPy * width + nPx) * 4;
    const sLum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
    const nLum =
      0.299 * surfaceRegionPixels[nIdx] +
      0.587 * surfaceRegionPixels[nIdx + 1] +
      0.114 * surfaceRegionPixels[nIdx + 2];

    // 3D surface lighting shading modulation for dark, colored, AND light PU/PVC belts
    const shadeFactor =
      calibration.surfaceTone === 'dark'
        ? Math.max(0.68, Math.min(1.16, 0.72 + 0.34 * (sLum / refSurfaceLum)))
        : calibration.surfaceTone === 'colored'
          ? Math.max(0.76, Math.min(1.08, 0.80 + 0.24 * (sLum / refSurfaceLum)))
          : Math.max(0.84, Math.min(1.06, 0.88 + 0.14 * (sLum / refSurfaceLum)));
    const weaveContrast = Math.max(0.84, Math.min(1.12, 1.0 + ((sLum - nLum) / 52) * 0.42));
    const grainHash = ((px * 37 + py * 17) ^ (px * 13 - py * 29)) & 15;
    const porosity = 0.89 + (grainHash / 15) * 0.11;

    clippedStencil[idx] = Math.min(255, Math.round(stencilPixels[idx] * shadeFactor));
    clippedStencil[idx + 1] = Math.min(255, Math.round(stencilPixels[idx + 1] * shadeFactor));
    clippedStencil[idx + 2] = Math.min(255, Math.round(stencilPixels[idx + 2] * shadeFactor));
    clippedStencil[idx + 3] = Math.min(
      255,
      Math.round(rawAlpha * presence * weaveContrast * porosity),
    );
  }

  const stencilPng = await sharp(clippedStencil, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  composites.push({
    input: stencilPng,
    left,
    top,
    blend: calibration.textStyle.blendMode || (calibration.surfaceTone === 'dark' ? 'screen' : 'over'),
  });

  const { data, info } = await sharp(masterBuf)
    .composite(composites)
    .webp({ quality: 88, effort: 5, smartSubsample: false })
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/**
 * Surgically adapts ONLY the printed profile/size (and brand on clean unbranded
 * masters) onto ANY calibrated verified master belt photograph, preserving the
 * real belt geometry, weave, lighting, and pure white studio background.
 */
export async function adaptBeltMarkingOnMaster(
  calibration: MasterAnchorCalibration,
  targetCode: string,
  outputAbsPath: string,
): Promise<{ width: number; height: number; outputAbsPath: string }> {
  const rendered = await renderBeltMarkingBuffer(calibration, targetCode);
  await fsPromises.mkdir(path.dirname(outputAbsPath), { recursive: true });
  await fsPromises.writeFile(outputAbsPath, rendered.data);
  return {
    width: rendered.width,
    height: rendered.height,
    outputAbsPath,
  };
}

/**
 * Generates (or serves cached) adapted SKU WebP for ANY compatible catalog belt SKU
 * using its exact resolved calibrated master anchor.
 */
export async function ensureAdaptedBeltSkuWebp(
  skuCode: string,
  resolved: ResolvedBeltMaster,
  forceRegenerate = false,
): Promise<{ localPath: string; absPath: string } | null> {
  if (!fs.existsSync(resolved.calibration.masterWebpAbsPath)) {
    return null;
  }
  const safeCode = String(skuCode || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!safeCode || !resolved.printText) return null;

  const absPath = path.join(ADAPTED_DIR, `${safeCode}.webp`);
  const localPath = `/belt-catalog/skus-adapted/${encodeURIComponent(safeCode)}.webp`;

  if (!forceRegenerate && isValidWebpOnDisk(absPath)) {
    return { localPath, absPath };
  }

  try {
    await adaptBeltMarkingOnMaster(resolved.calibration, resolved.printText, absPath);
    if (isValidWebpOnDisk(absPath)) {
      return { localPath, absPath };
    }
  } catch (err) {
    console.warn(
      'Belt marking studio adaptation error:',
      skuCode,
      resolved.calibration.id,
      err instanceof Error ? err.message : err,
    );
  }
  return null;
}

/**
 * Generates ALL 4 coherent, brand-locked studio gallery images for a calibrated belt family:
 * - 01-main.webp:      Full studio hero photo with exact brand + profile/size marking
 * - 02-angle.webp:     Balanced studio framing showcasing overall belt profile & geometry
 * - 03-structure.webp: Structural close-up (teeth / ribs / cogs / canvas wrap weave)
 * - 04-closeup.webp:   Macro detail centered on the printed brand + profile marking
 */
export async function generateCalibratedFamilyHeroAndCloseup(
  familyCode: string,
  resolved: ResolvedBeltMaster,
  forceRegenerate = false,
): Promise<{
  mainLocalPath: string;
  angleLocalPath: string;
  structureLocalPath: string;
  closeupLocalPath: string;
  width: number;
  height: number;
} | null> {
  if (!fs.existsSync(resolved.calibration.masterWebpAbsPath)) {
    return null;
  }
  const safeFamily = String(familyCode || '')
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_')
    .slice(0, 96);
  if (!safeFamily || !resolved.printText) return null;

  const outDir = path.join(PUBLIC_DIR, 'belt-catalog/families-calibrated', safeFamily);
  const mainAbs = path.join(outDir, '01-main.webp');
  const angleAbs = path.join(outDir, '02-angle.webp');
  const structureAbs = path.join(outDir, '03-structure.webp');
  const closeupAbs = path.join(outDir, '04-closeup.webp');

  const encFam = encodeURIComponent(safeFamily);
  const mainLocalPath = `/belt-catalog/families-calibrated/${encFam}/01-main.webp`;
  const angleLocalPath = `/belt-catalog/families-calibrated/${encFam}/02-angle.webp`;
  const structureLocalPath = `/belt-catalog/families-calibrated/${encFam}/03-structure.webp`;
  const closeupLocalPath = `/belt-catalog/families-calibrated/${encFam}/04-closeup.webp`;

  if (
    !forceRegenerate &&
    isValidWebpOnDisk(mainAbs) &&
    isValidWebpOnDisk(angleAbs) &&
    isValidWebpOnDisk(structureAbs) &&
    isValidWebpOnDisk(closeupAbs)
  ) {
    const m = await sharp(mainAbs).metadata();
    return {
      mainLocalPath,
      angleLocalPath,
      structureLocalPath,
      closeupLocalPath,
      width: m.width || 1000,
      height: m.height || 1000,
    };
  }

  const mainInfo = await adaptBeltMarkingOnMaster(resolved.calibration, resolved.printText, mainAbs);
  const imgW = mainInfo.width;
  const imgH = mainInfo.height;
  const er = resolved.calibration.eraseRect;

  // Slot 2 (02-angle.webp): Crisp studio 4:3 wide framing with subtle zoom-in on the full belt silhouette
  const angleW = Math.max(280, Math.round(imgW * 0.86));
  const angleH = Math.max(220, Math.round(imgH * 0.86));
  const angleLeft = Math.max(0, Math.round((imgW - angleW) / 2));
  const angleTop = Math.max(0, Math.round((imgH - angleH) / 2));
  await sharp(mainAbs)
    .extract({ left: angleLeft, top: angleTop, width: angleW, height: angleH })
    .resize(960, 720, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 }, kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.9 })
    .webp({ quality: 86, effort: 4 })
    .toFile(angleAbs);

  // Slot 3 (03-structure.webp): Macro view of the belt's structural profile (teeth/ribs/inner wall) opposite the text zone
  const structW = Math.max(240, Math.round(imgW * 0.56));
  const structH = Math.max(190, Math.round(imgH * 0.50));
  const targetStructY = er.y > 0.45 ? 0.30 : 0.65;
  const targetStructX = er.x > 0.5 ? 0.38 : 0.60;
  const sLeft = Math.max(0, Math.min(imgW - structW, Math.round(targetStructX * imgW - structW / 2)));
  const sTop = Math.max(0, Math.min(imgH - structH, Math.round(targetStructY * imgH - structH / 2)));
  await sharp(mainAbs)
    .extract({ left: sLeft, top: sTop, width: structW, height: structH })
    .resize(900, 680, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.0 })
    .webp({ quality: 85, effort: 4 })
    .toFile(structureAbs);

  // Slot 4 (04-closeup.webp): Crisp zoomed macro crop centered around the printed marking + adjacent brand logo
  const cropW = Math.max(240, Math.min(imgW, Math.round(imgW * 0.62)));
  const cropH = Math.max(180, Math.min(imgH, Math.round(imgH * 0.52)));
  const centerShiftX = resolved.calibration.isBrandedMaster ? -0.10 : 0;
  const cx = Math.round((er.x + er.w * 0.5 + centerShiftX) * imgW);
  const cy = Math.round((er.y + er.h * 0.5) * imgH);
  const cLeft = Math.max(0, Math.min(imgW - cropW, Math.round(cx - cropW / 2)));
  const cTop = Math.max(0, Math.min(imgH - cropH, Math.round(cy - cropH / 2)));

  await sharp(mainAbs)
    .extract({ left: cLeft, top: cTop, width: cropW, height: cropH })
    .resize(900, 680, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.0, m1: 1.0, m2: 1.8 })
    .webp({ quality: 86, effort: 4 })
    .toFile(closeupAbs);

  return {
    mainLocalPath,
    angleLocalPath,
    structureLocalPath,
    closeupLocalPath,
    width: imgW,
    height: imgH,
  };
}

/**
 * Backward-compatible helper for SWR Classical A SKUs.
 */
export async function ensureAdaptedSwrClassicalASkuWebp(
  skuCode: string,
  targetMarkingCode: string,
): Promise<{ localPath: string; absPath: string } | null> {
  return ensureAdaptedBeltSkuWebp(skuCode, {
    calibration: SWR_A_MASTER_CALIBRATION,
    printText: targetMarkingCode,
    codeOnly: targetMarkingCode,
    brandShown: 'SWR',
  });
}
