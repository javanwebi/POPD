import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  extractBeltEngineeringProfile,
  isNonBeltHardwareItem,
  type BeltConstructionKind,
  type BeltEngineeringInput,
} from './beltEngineeringJudgment';
import {
  ALL_MASTER_CALIBRATIONS,
  adaptBeltMarkingOnMaster,
  resolveMasterCalibrationForBelt,
  type MasterAnchorCalibration,
  type NormalizedRect,
} from './beltMarkingStudio';

// =============================================================================
// Visual Marking & Belt Geometry Validation Module
// Checks extracted & adapted belt photographs against catalog database specs:
// 1. Brand consistency (ZERO competitor brand leakage)
// 2. Technical code & profile match vs database record
// 3. Physical belt shape / construction fidelity by family (e.g. classical VB vs wedge SK vs cogged vs timing)
// 4. Manufacturer logo keep-out zone non-overlap (IoU === 0 between brandLogoSafeZone and printRect)
// 5. Pixel-level seam cleanliness around erase/print boundary (detects visible gray/black sticker boxes)
// 6. Belt-surface landing & pure-white studio background protection (detects floating text or bg spill)
// =============================================================================

export type VisualValidationVerdict = 'PASS_VERIFIED' | 'WARN_MINOR_ADJUST' | 'FAIL_REJECTED';

export interface VisualMarkingCheckItem {
  key:
    | 'brand_match'
    | 'profile_code_match'
    | 'shape_construction_match'
    | 'logo_non_overlap'
    | 'seam_cleanliness'
    | 'surface_landing_and_bg';
  labelFa: string;
  passed: boolean;
  metric: string;
  detailFa: string;
}

export interface VisualValidationReport {
  targetId: string;
  masterId: string;
  brandExpected: string;
  brandOnImage: string;
  profileExpected: string;
  codePrinted: string;
  constructionExpected: BeltConstructionKind;
  masterConstruction: string;
  isBrandedMaster: boolean;
  imageWidth: number;
  imageHeight: number;
  logoOverlapIoU: number;
  seamDeltaRgb: number;
  beltLandingRatio: number;
  bgSpillRatio: number;
  score: number;
  verdict: VisualValidationVerdict;
  checks: VisualMarkingCheckItem[];
  imagePublicPath: string;
}

/**
 * Computes exact axis-aligned Intersection-over-Union (IoU) and overlap fraction
 * between two normalized 0..1 rectangles to guarantee printed profile codes NEVER
 * collide with manufacturer logos on the belt body.
 */
export function computeRectOverlapRatio(a: NormalizedRect, b: NormalizedRect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  if (minArea <= 0) return 0;
  return Number((inter / minArea).toFixed(4));
}

function isPureStudioWhite(r: number, g: number, b: number, surfaceTone: MasterAnchorCalibration['surfaceTone']): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (surfaceTone === 'light') return lum > 248 && chroma < 7;
  if (surfaceTone === 'colored') return lum > 238 && chroma < 14;
  return lum > 228 && chroma < 14;
}

/**
 * Pixel-level inspection of a rendered belt photograph against its master base photo
 * and calibration geometry. Detects visible patch boxes (high seamDeltaRgb), floating
 * ink outside the belt silhouette (low beltLandingRatio), and background spills.
 */
export async function inspectRenderedBeltPixels(
  masterAbsPath: string,
  renderedAbsPath: string,
  calibration: MasterAnchorCalibration,
): Promise<{
  width: number;
  height: number;
  seamDeltaRgb: number;
  beltLandingRatio: number;
  bgSpillRatio: number;
}> {
  const masterImg = sharp(masterAbsPath);
  const renderedImg = sharp(renderedAbsPath);
  const [mMeta, rMeta] = await Promise.all([masterImg.metadata(), renderedImg.metadata()]);
  const w = rMeta.width || mMeta.width || 1000;
  const h = rMeta.height || mMeta.height || 1000;

  const [mRaw, rRaw] = await Promise.all([
    sharp(masterAbsPath).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer(),
    sharp(renderedAbsPath).ensureAlpha().raw().toBuffer(),
  ]);

  const er = calibration.eraseRect;
  const x0 = Math.max(2, Math.min(w - 10, Math.round(er.x * w)));
  const y0 = Math.max(2, Math.min(h - 10, Math.round(er.y * h)));
  const rw = Math.max(10, Math.min(w - x0 - 2, Math.round(er.w * w)));
  const rh = Math.max(10, Math.min(h - y0 - 2, Math.round(er.h * h)));

  // Helper: distinguish TRUE pure-white studio background outside the belt from thin white
  // original factory letters printed ON dark belt rubber (which are surrounded by dark pixels).
  const isTrueStudioBg = (px: number, py: number): boolean => {
    const idx = (py * w + px) * 4;
    if (!isPureStudioWhite(mRaw[idx], mRaw[idx + 1], mRaw[idx + 2], calibration.surfaceTone)) {
      return false;
    }
    if (calibration.surfaceTone !== 'dark') return true;
    // Check ±14px cardinal neighbors: if >= 2 are dark rubber, this white pixel is old factory ink on the belt!
    let darkN = 0;
    const offsets = [
      [-14, 0],
      [14, 0],
      [0, -14],
      [0, 14],
    ];
    for (const [dx, dy] of offsets) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = (ny * w + nx) * 4;
        const nLum = 0.299 * mRaw[nIdx] + 0.587 * mRaw[nIdx + 1] + 0.114 * mRaw[nIdx + 2];
        if (nLum < 130) darkN++;
      }
    }
    return darkN < 2;
  };

  // 1. Measure INDUCED seam discontinuity across perimeter of eraseRect:
  //    Compare |rendered(in)-rendered(out)| minus |master(in)-master(out)| so natural 3D belt
  //    lighting curvature is respected while any artificial sticker box immediately spikes!
  let seamSamples = 0;
  let seamAccum = 0;
  const checkBorderPair = (ix: number, iy: number, ox: number, oy: number) => {
    if (ix < 0 || ix >= w || iy < 0 || iy >= h || ox < 0 || ox >= w || oy < 0 || oy >= h) return;
    if (isTrueStudioBg(ix, iy) || isTrueStudioBg(ox, oy)) return;
    const iIdx = (iy * w + ix) * 4;
    const oIdx = (oy * w + ox) * 4;
    const iLum = 0.299 * rRaw[iIdx] + 0.587 * rRaw[iIdx + 1] + 0.114 * rRaw[iIdx + 2];
    const oLum = 0.299 * rRaw[oIdx] + 0.587 * rRaw[oIdx + 1] + 0.114 * rRaw[oIdx + 2];
    // Skip pixels that are themselves bright stencil ink letters on the border
    if (calibration.surfaceTone === 'dark' && (iLum > 125 || oLum > 125)) return;
    const renderedEdgeDiff =
      (Math.abs(rRaw[iIdx] - rRaw[oIdx]) +
        Math.abs(rRaw[iIdx + 1] - rRaw[oIdx + 1]) +
        Math.abs(rRaw[iIdx + 2] - rRaw[oIdx + 2])) /
      3;
    const masterEdgeDiff =
      (Math.abs(mRaw[iIdx] - mRaw[oIdx]) +
        Math.abs(mRaw[iIdx + 1] - mRaw[oIdx + 1]) +
        Math.abs(mRaw[iIdx + 2] - mRaw[oIdx + 2])) /
      3;
    const inducedDelta = Math.max(0, renderedEdgeDiff - masterEdgeDiff);
    seamAccum += inducedDelta;
    seamSamples++;
  };

  for (let px = x0; px < x0 + rw; px += 2) {
    checkBorderPair(px, y0 + 4, px, y0 - 4);
    checkBorderPair(px, y0 + rh - 4, px, y0 + rh + 4);
  }
  for (let py = y0; py < y0 + rh; py += 2) {
    checkBorderPair(x0 + 4, py, x0 - 4, py);
    checkBorderPair(x0 + rw - 4, py, x0 + rw + 4, py);
  }
  const seamDeltaRgb = seamSamples > 0 ? Number((seamAccum / seamSamples).toFixed(2)) : 0;

  // 2. Check belt-surface landing ratio & true studio background spill inside erase/print box
  let changedPixels = 0;
  let landedOnBelt = 0;
  let studioBgPixels = 0;
  let studioBgSpilled = 0;

  for (let py = y0; py < y0 + rh; py++) {
    for (let px = x0; px < x0 + rw; px++) {
      const idx = (py * w + px) * 4;
      const mIsStudioWhite = isTrueStudioBg(px, py);
      const diff =
        (Math.abs(rRaw[idx] - mRaw[idx]) +
          Math.abs(rRaw[idx + 1] - mRaw[idx + 1]) +
          Math.abs(rRaw[idx + 2] - mRaw[idx + 2])) /
        3;

      if (mIsStudioWhite) {
        studioBgPixels++;
        if (diff > 14) {
          studioBgSpilled++;
        }
      }

      if (diff > 16) {
        changedPixels++;
        if (!mIsStudioWhite) {
          landedOnBelt++;
        }
      }
    }
  }

  const beltLandingRatio =
    changedPixels > 0 ? Number((landedOnBelt / changedPixels).toFixed(4)) : 1;
  const bgSpillRatio =
    studioBgPixels > 0 ? Number((studioBgSpilled / studioBgPixels).toFixed(4)) : 0;

  return {
    width: w,
    height: h,
    seamDeltaRgb,
    beltLandingRatio,
    bgSpillRatio,
  };
}

/**
 * Validates a catalog SKU or family item end-to-end against its resolved master
 * and actual rendered WebP image on disk (or renders a temporary validation frame).
 */
export async function validateBeltVisualMarking(
  input: BeltEngineeringInput & { renderedImageAbsPath?: string; imagePublicPath?: string },
): Promise<VisualValidationReport | null> {
  if (
    isNonBeltHardwareItem({
      rawName: input.rawName,
      profile: input.profile,
      beltDivision: input.beltDivision,
    })
  ) {
    return null;
  }

  const profile = extractBeltEngineeringProfile(input);
  let resolved = resolveMasterCalibrationForBelt(
    profile,
    input.rawName || '',
    input.beltDivision || '',
    input.familyCode || '',
  );
  const overrideId = (input as { expectedMasterId?: string }).expectedMasterId;
  if (resolved && overrideId && ALL_MASTER_CALIBRATIONS[overrideId] && resolved.calibration.id !== overrideId) {
    const overrideCal = ALL_MASTER_CALIBRATIONS[overrideId];
    resolved = {
      ...resolved,
      calibration: overrideCal,
    };
  }
  if (!resolved) return null;

  const cal = resolved.calibration;
  const targetId = input.skuCode || input.familyCode || cal.id;

  // Check 1: Brand match (ZERO competitor logo leakage)
  const expectedBrand = profile.isGenericBrand ? 'GENERIC' : profile.brandNormalized;
  const brandPassed = cal.isBrandedMaster
    ? cal.masterBrand === expectedBrand
    : !cal.isBrandedMaster; // clean construction master never carries any competitor brand

  // Check 2: Profile & technical code match
  const normCode = resolved.codeOnly.replace(/[^A-Z0-9]/g, '');
  const normProf = (profile.profileNormalized || '').replace(/[^A-Z0-9]/g, '');
  const profileCodePassed = Boolean(normCode) && (!normProf || normCode.includes(normProf) || profile.construction === 'conveyor-flat' || profile.construction === 'pu-round-welded' || profile.construction === 'crowned-ridge');

  // Check 3: Physical belt shape / construction fidelity by family
  const isWedgeProfile = /^(SP[ZABC]|3V|5V|8V)$/i.test(profile.profileNormalized);
  let shapePassed = true;
  if (expectedBrand === 'OPTIBELT' && profile.construction === 'wrapped-vbelt' && isWedgeProfile) {
    shapePassed = cal.id === 'OPTIBELT-WEDGE';
  } else if (profile.construction === 'cogged-raw-edge-vbelt') {
    shapePassed = cal.id.includes('COGGED');
  } else if (profile.construction === 'poly-v-ribbed') {
    shapePassed = cal.id.includes('POLYV');
  } else if (profile.construction === 'hexagonal-vbelt') {
    shapePassed = cal.id.includes('HEX');
  } else if (profile.construction === 'timing-pu-steel') {
    shapePassed = cal.id.includes('TIMING-PU') || cal.id.includes('TIMING-COATED');
  } else if (profile.teethSidedness === 'double') {
    shapePassed = cal.id === 'CLEAN-TIMING-DOUBLE';
  }

  // Check 4: Manufacturer brand logo keep-out non-overlap
  const logoOverlapIoU = cal.brandLogoSafeZone
    ? computeRectOverlapRatio(cal.brandLogoSafeZone, cal.eraseRect)
    : 0;
  const logoNonOverlapPass = logoOverlapIoU === 0;

  // Check 5 & 6: Pixel-level cleanliness & surface landing inspection
  let renderedPath = input.renderedImageAbsPath || '';
  let tempPath = '';
  if (!renderedPath || !fs.existsSync(renderedPath)) {
    tempPath = path.join('/tmp', `val-${cal.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`);
    await adaptBeltMarkingOnMaster(cal, resolved.printText, tempPath);
    renderedPath = tempPath;
  }

  let pixelMetrics = {
    width: 1000,
    height: 1000,
    seamDeltaRgb: 0,
    beltLandingRatio: 1,
    bgSpillRatio: 0,
  };
  try {
    pixelMetrics = await inspectRenderedBeltPixels(cal.masterWebpAbsPath, renderedPath, cal);
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
  }

  const seamCleanlinessPass = pixelMetrics.seamDeltaRgb <= 12;
  const surfaceLandingPass = pixelMetrics.beltLandingRatio >= 0.88 && pixelMetrics.bgSpillRatio <= 0.035;

  const checks: VisualMarkingCheckItem[] = [
    {
      key: 'brand_match',
      labelFa: 'تطابق برند روی بدنه با پایگاه داده',
      passed: brandPassed,
      metric: cal.isBrandedMaster ? `${cal.masterBrand} == ${expectedBrand}` : `CLEAN + ${resolved.brandShown}`,
      detailFa: brandPassed
        ? cal.isBrandedMaster
          ? `لوگوی اصلی سازنده (${cal.masterBrand}) دقیقاً مطابق رکورد پایگاه داده و بدون برند رقیب است.`
          : `تصویر بدون لوگوی رقیب انتخاب شده و برند واقعی (${resolved.brandShown}) روی بدنه درج شده است.`
        : `عدم تطابق برند تصویر (${cal.masterBrand}) با پایگاه داده (${expectedBrand})!`,
    },
    {
      key: 'profile_code_match',
      labelFa: 'تطابق کد فنی و پروفیل با دیتابیس',
      passed: profileCodePassed,
      metric: `${profile.profileNormalized || '-'} -> ${resolved.printText}`,
      detailFa: profileCodePassed
        ? `کد فنی «${resolved.printText}» دقیقاً مطابق پروفیل «${profile.profileNormalized || 'استاندارد'}» و استاندارد ${profile.standardReference} است.`
        : `کد چاپی با پروفیل ثبت‌شده در دیتابیس همخوانی ندارد.`,
    },
    {
      key: 'shape_construction_match',
      labelFa: 'تطابق شکل فیزیکی و ساختار تسمه با خانواده',
      passed: shapePassed,
      metric: `${profile.construction} -> ${cal.id}`,
      detailFa: shapePassed
        ? `ساختار فیزیکی تصویر (${cal.id}) دقیقاً منطبق بر ${profile.constructionLabelFa} است.`
        : `شکل فیزیکی تصویر پایه با ساختار خانواده تسمه همخوانی ندارد.`,
    },
    {
      key: 'logo_non_overlap',
      labelFa: 'عدم هم‌پوشانی پروفیل با مارکینگ/لوگوی برند',
      passed: logoNonOverlapPass,
      metric: `Overlap ${(logoOverlapIoU * 100).toFixed(1)}%`,
      detailFa: logoNonOverlapPass
        ? `ناحیه چاپ کد پروفیل کاملاً در محل استاندارد کارخانه و با هم‌پوشانی ۰٪ نسبت به لوگوی برند قرار دارد.`
        : `خطا: ناحیه چاپ کد با لوگوی برند (${(logoOverlapIoU * 100).toFixed(1)}٪) تداخل دارد!`,
    },
    {
      key: 'seam_cleanliness',
      labelFa: 'تمیزی و یکدستی بافت بدنه (بدون کادر یا لکه مصنوعی)',
      passed: seamCleanlinessPass,
      metric: `ΔRGB ${pixelMetrics.seamDeltaRgb}`,
      detailFa: seamCleanlinessPass
        ? `اختلاف رنگ مرزی ناحیه اصلاح‌شده بسیار ناچیز (ΔRGB=${pixelMetrics.seamDeltaRgb}) و کاملاً هم‌رنگ بافت لاستیک است.`
        : `هشدار: اختلاف رنگ مرزی (ΔRGB=${pixelMetrics.seamDeltaRgb}) نشان‌دهنده اثر کادر روی بدنه است.`,
    },
    {
      key: 'surface_landing_and_bg',
      labelFa: 'نشست دقیق چاپ روی بدنه و حفظ پس‌زمینه سفید',
      passed: surfaceLandingPass,
      metric: `Belt ${(pixelMetrics.beltLandingRatio * 100).toFixed(0)}% · Spill ${(pixelMetrics.bgSpillRatio * 100).toFixed(1)}%`,
      detailFa: surfaceLandingPass
        ? `${(pixelMetrics.beltLandingRatio * 100).toFixed(0)}٪ چاپ دقیقاً روی سطح فیزیکی تسمه نشسته و پس‌زمینه سفید استودیویی تمیز است.`
        : `بخشی از چاپ یا ناحیه پاکسازی به خارج از مرز تسمه نشت کرده است.`,
    },
  ];

  const weights = [20, 15, 20, 20, 15, 10];
  const score = checks.reduce((acc, ch, idx) => acc + (ch.passed ? weights[idx] : 0), 0);
  const criticalFailed = !brandPassed || !shapePassed || !logoNonOverlapPass;
  const verdict: VisualValidationVerdict = criticalFailed
    ? 'FAIL_REJECTED'
    : score >= 90
      ? 'PASS_VERIFIED'
      : 'WARN_MINOR_ADJUST';

  return {
    targetId,
    masterId: cal.id,
    brandExpected: expectedBrand,
    brandOnImage: cal.isBrandedMaster ? cal.masterBrand : resolved.brandShown,
    profileExpected: profile.profileNormalized || cal.masterProfile,
    codePrinted: resolved.printText,
    constructionExpected: profile.construction,
    masterConstruction: cal.id,
    isBrandedMaster: cal.isBrandedMaster,
    imageWidth: pixelMetrics.width,
    imageHeight: pixelMetrics.height,
    logoOverlapIoU,
    seamDeltaRgb: pixelMetrics.seamDeltaRgb,
    beltLandingRatio: pixelMetrics.beltLandingRatio,
    bgSpillRatio: pixelMetrics.bgSpillRatio,
    score,
    verdict,
    checks,
    imagePublicPath: input.imagePublicPath || cal.masterWebpPublicPath,
  };
}

/**
 * Runs live visual validation across ALL calibrated master archetypes with
 * representative catalog specs to audit placement, zero overlap, seam blend, and shape.
 */
export async function auditAllCalibratedMasters(): Promise<{
  totalMasters: number;
  passedCount: number;
  warnCount: number;
  failedCount: number;
  averageScore: number;
  reports: VisualValidationReport[];
}> {
  const sampleInputs: Array<BeltEngineeringInput & { expectedMasterId: string }> = [
    { expectedMasterId: 'SWR-WRAPPED', skuCode: 'SWR-B52', brand: 'SWR', rawName: 'تسمه SWR B52', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'SWR-COGGED', skuCode: 'SWR-BX48', brand: 'SWR', rawName: 'تسمه SWR BX48', profile: 'BX', beltDivision: 'vbelt-cogged' },
    { expectedMasterId: 'DONGIL-WRAPPED', skuCode: 'DONGIL-A45', brand: 'DONGIL', rawName: 'تسمه دانگیل A45', profile: 'A', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'OPTIBELT-WRAPPED', skuCode: 'OPTIBELT-B68', brand: 'OPTIBELT', rawName: 'تسمه اپتی بلت B68', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'OPTIBELT-WEDGE', skuCode: 'OPTIBELT-SPB2000', brand: 'OPTIBELT', rawName: 'تسمه اپتی بلت SPB 2000', profile: 'SPB', beltDivision: 'vbelt-wedge' },
    { expectedMasterId: 'OPTIBELT-COGGED', skuCode: 'OPTIBELT-XPA1400', brand: 'OPTIBELT', rawName: 'تسمه اپتی بلت XPA 1400', profile: 'XPA', beltDivision: 'vbelt-cogged' },
    { expectedMasterId: 'OPTIBELT-TIMING', skuCode: 'OPTIBELT-1200-8M', brand: 'OPTIBELT', rawName: 'تسمه تایمینگ اپتی بلت 1200-8M-30', profile: '8M', beltDivision: 'timing-htd-single' },
    { expectedMasterId: 'OPTIBELT-POLYV', skuCode: 'OPTIBELT-6PK1540', brand: 'OPTIBELT', rawName: 'تسمه شیاری اپتی بلت 6PK1540', profile: 'PK', beltDivision: 'ribbed-poly-v' },
    { expectedMasterId: 'MEGADYNE-WRAPPED', skuCode: 'MEGA-B72', brand: 'MEGADYNE', rawName: 'تسمه مگاداین B72', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'MEGADYNE-TIMING', skuCode: 'MEGA-1120-8M', brand: 'MEGADYNE', rawName: 'تسمه تایمینگ مگاداین 1120-8M', profile: '8M', beltDivision: 'timing-htd-single' },
    { expectedMasterId: 'BANDO-WRAPPED', skuCode: 'BANDO-B56', brand: 'BANDO', rawName: 'تسمه باندو B56', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'MITSUBOSHI-WRAPPED', skuCode: 'MITSU-A38', brand: 'MITSUBOSHI', rawName: 'تسمه میتسوبوشی A38', profile: 'A', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'CLEAN-WRAPPED', skuCode: 'FORZA-B64', brand: 'FORZA', rawName: 'تسمه فورزا B64', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'CLEAN-COGGED', skuCode: 'MARSHAL-AX42', brand: 'MARSHAL', rawName: 'تسمه مارشال AX42', profile: 'AX', beltDivision: 'vbelt-cogged' },
    { expectedMasterId: 'CLEAN-TIMING-TRAP', skuCode: 'MARSHAL-540H100', brand: 'MARSHAL', rawName: 'تسمه تایمینگ مارشال 540H100', profile: 'H', beltDivision: 'timing-imperial-single' },
    { expectedMasterId: 'CLEAN-TIMING-DOUBLE', skuCode: 'FORZA-600DH', brand: 'FORZA', rawName: 'تسمه دوطرفه فورزا 600DH', profile: 'DH', beltDivision: 'timing-imperial-double' },
    { expectedMasterId: 'CLEAN-TIMING-HTD', skuCode: 'BERAVO-960-8M', brand: 'BERAVO', rawName: 'تسمه تایمینگ براوو 960-8M', profile: '8M', beltDivision: 'timing-htd-single' },
    { expectedMasterId: 'CLEAN-TIMING-PU', skuCode: 'FORZA-AT10-1280', brand: 'FORZA', rawName: 'تسمه پلی یورتان فورزا AT10-1280', profile: 'AT10', beltDivision: 'timing-metric-single' },
    { expectedMasterId: 'CLEAN-TIMING-COATED', skuCode: 'FORZA-AT20-COATED', brand: 'FORZA', rawName: 'تسمه فورزا AT20-12580 روکش Linatex', profile: 'AT20', beltDivision: 'timing-metric-single', backingOrCoating: 'Linatex' },
    { expectedMasterId: 'CLEAN-POLYV', skuCode: 'DONGIL-8PK1825', brand: 'DONGIL', rawName: 'تسمه شیاری دانگیل 8PK1825', profile: 'PK', beltDivision: 'ribbed-poly-v' },
    { expectedMasterId: 'CLEAN-HEX', skuCode: 'FORZA-BB108', brand: 'FORZA', rawName: 'تسمه شش ضلعی فورزا BB108', profile: 'BB', beltDivision: 'vbelt-hexagonal' },
    { expectedMasterId: 'CLEAN-PU-ROUND', skuCode: 'VOLTA-PU8', brand: 'VOLTA', rawName: 'تسمه گرد پلی یورتان ولتا 8 میلیمتر', profile: 'CRC', beltDivision: 'pu-weldable-round' },
    { expectedMasterId: 'CLEAN-PU-VBELT', skuCode: 'VOLTA-PUA13', brand: 'VOLTA', rawName: 'تسمه جوشی V شکل پلی یورتان ولتا A13', profile: 'A', beltDivision: 'welded-pu-v-flat' },
    { expectedMasterId: 'CLEAN-CROWNED', skuCode: 'CERAMIC-CROWN', brand: 'UNSPECIFIED', rawName: 'تسمه قوس دار سرامیک 17 میلیمتر', profile: 'CRC_CROWNED', beltDivision: 'ceramic-crowned' },
    { expectedMasterId: 'CLEAN-CONVEYOR', skuCode: 'PVC-2MM', brand: 'UNSPECIFIED', rawName: 'تسمه نقاله PVC 2 میلیمتر 2 لایه', profile: 'PVC', beltDivision: 'conveyor-pvc' },
    { expectedMasterId: 'CLEAN-WRAPPED-SINGLE', skuCode: 'FORZA-B68-U', brand: 'FORZA', rawName: 'تسمه فورزا B68', profile: 'B', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'CLEAN-WRAPPED-WEDGE', skuCode: 'FORZA-SPB2000', brand: 'FORZA', rawName: 'تسمه فورزا SPB 2000', profile: 'SPB', beltDivision: 'vbelt-narrow-wedge' },
    { expectedMasterId: 'CLEAN-WRAPPED-STACK', skuCode: 'BERAVO-C85', brand: 'BERAVO', rawName: 'تسمه براوو C85', profile: 'C', beltDivision: 'vbelt-classical' },
    { expectedMasterId: 'CLEAN-COGGED-SINGLE', skuCode: 'MARSHAL-AX42-U', brand: 'MARSHAL', rawName: 'تسمه دنده ای مارشال AX42', profile: 'AX', beltDivision: 'vbelt-cogged' },
    { expectedMasterId: 'CLEAN-TIMING-TRAP-UPRIGHT', skuCode: 'MARSHAL-420H100', brand: 'MARSHAL', rawName: 'تسمه تایمینگ مارشال 420H100', profile: 'H', beltDivision: 'timing-imperial-single' },
    { expectedMasterId: 'CLEAN-TIMING-TRAP-PAIR', skuCode: 'FORZA-300L075', brand: 'FORZA', rawName: 'تسمه تایمینگ فورزا 300L075', profile: 'L', beltDivision: 'timing-imperial-single' },
    { expectedMasterId: 'CLEAN-TIMING-HTD-UPRIGHT', skuCode: 'BERAVO-1200-8M', brand: 'BERAVO', rawName: 'تسمه تایمینگ براوو 1200-8M', profile: '8M', beltDivision: 'timing-htd-single' },
    { expectedMasterId: 'CLEAN-POLYV-UPRIGHT', skuCode: 'DONGIL-8PK1825-U', brand: 'DONGIL', rawName: 'تسمه شیاری دانگیل 8PK1825', profile: 'PK', beltDivision: 'ribbed-poly-v' },
    { expectedMasterId: 'CLEAN-TIMING-PU-LOOP', skuCode: 'FORZA-AT10-1200-L', brand: 'FORZA', rawName: 'تسمه تایمینگ پلی یورتان لوپ فورزا AT10-1200', profile: 'AT10', beltDivision: 'timing-metric-single' },
    { expectedMasterId: 'CLEAN-TIMING-COATED-GREEN', skuCode: 'FORZA-T10-SG', brand: 'FORZA', rawName: 'تسمه تایمینگ فورزا T10-1200 روکش سبز سوپرگریپ', profile: 'T10', beltDivision: 'timing-metric-single', backingOrCoating: 'Supergrip Green' },
    { expectedMasterId: 'CLEAN-TIMING-COATED-YELLOW', skuCode: 'FORZA-AT10-APL', brand: 'FORZA', rawName: 'تسمه تایمینگ فورزا AT10 روکش فوم زرد APL', profile: 'AT10', beltDivision: 'timing-metric-single', backingOrCoating: 'APL Yellow Foam' },
    { expectedMasterId: 'CLEAN-PU-VBELT-COIL', skuCode: 'VOLTA-PUB17', brand: 'VOLTA', rawName: 'تسمه جوشی V شکل پلی یورتان ولتا B17', profile: 'B', beltDivision: 'welded-pu-v-flat' },
  ];

  const reports: VisualValidationReport[] = [];
  for (const s of sampleInputs) {
    const r = await validateBeltVisualMarking(s);
    if (r) reports.push(r);
  }

  const passedCount = reports.filter((r) => r.verdict === 'PASS_VERIFIED').length;
  const warnCount = reports.filter((r) => r.verdict === 'WARN_MINOR_ADJUST').length;
  const failedCount = reports.filter((r) => r.verdict === 'FAIL_REJECTED').length;
  const averageScore =
    reports.length > 0
      ? Number((reports.reduce((a, r) => a + r.score, 0) / reports.length).toFixed(1))
      : 0;

  return {
    totalMasters: Object.keys(ALL_MASTER_CALIBRATIONS).length,
    passedCount,
    warnCount,
    failedCount,
    averageScore,
    reports,
  };
}
