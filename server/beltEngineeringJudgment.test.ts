import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  extractBeltEngineeringProfile,
  formatOfficialOnBodyMarking,
  isNonBeltHardwareItem,
  judgeStructuralCompatibility,
} from './beltEngineeringJudgment';
import { evaluateVisionVsTarget } from './beltVisionGate';
import {
  adaptBeltMarkingOnMaster,
  ALL_MASTER_CALIBRATIONS,
  resolveMasterCalibrationForBelt,
  SWR_A_MASTER_CALIBRATION,
} from './beltMarkingStudio';
import {
  computeRectOverlapRatio,
  validateBeltVisualMarking,
} from './beltVisualMarkingValidator';
import { hasExactTokenBoundaryDesignationMatch, isCandidateUrlRejected } from './realWebBeltEngine';

const swrA49Master = extractBeltEngineeringProfile({
  skuCode: '11259',
  familyCode: 'PFAM-تسمه-V-شکل-کلا-SWR-A-011',
  brand: 'SWR',
  rawName: 'تسمه SWR A49',
  profile: 'A',
  beltDivision: 'vbelt-classical',
  bodyMaterial: 'لاستیک کلروپرن با روکش کتان صنعتی',
  supplyForm: 'endless-loop',
});

test('hasExactTokenBoundaryDesignationMatch prevents false substring hits (A19 != XPA1900, A16 != A160)', () => {
  assert.equal(hasExactTokenBoundaryDesignationMatch('SWR XPA 1900 Cogged Belt', 'A19'), false);
  assert.equal(hasExactTokenBoundaryDesignationMatch('Optibelt SPA1900 V-Belt', 'A19'), false);
  assert.equal(hasExactTokenBoundaryDesignationMatch('Classical V-Belt A160 DIN 2215', 'A16'), false);
  assert.equal(hasExactTokenBoundaryDesignationMatch('SWR Classical V-Belt A-19 13x480 Li', 'A19'), true);
  assert.equal(hasExactTokenBoundaryDesignationMatch('SWR A 16 13x406 Li', 'A16'), true);
  assert.equal(hasExactTokenBoundaryDesignationMatch('Keilriemen 13x480 Li SWR', '13x480'), true);
});

test('isCandidateUrlRejected blocks newly discovered watermarked B2B portals', () => {
  assert.ok(isCandidateUrlRejected('https://www.aajjo.com/img/v-belt.jpg', 'V-belt', 'https://www.aajjo.com/p/1'));
  assert.ok(isCandidateUrlRejected('https://oceanproperty.co.th/img/bb68.jpg', 'BB68 V-Belt', 'https://oceanproperty.co.th/p'));
  assert.ok(isCandidateUrlRejected('https://cf.shopee.ph/file/belt.jpg', 'V-Belt A49', 'https://shopee.ph/item'));
});

test('formatOfficialOnBodyMarking formats SWR classical V-belts with hyphenated factory print', () => {
  assert.equal(formatOfficialOnBodyMarking('SWR', 'A', 'تسمه SWR A49', ''), 'A-49');
  assert.equal(formatOfficialOnBodyMarking('SWR', 'A', 'تسمه SWR A16', ''), 'A-16');
  assert.equal(formatOfficialOnBodyMarking('SWR', 'A', 'تسمه SWR A19', ''), 'A-19');
  assert.equal(formatOfficialOnBodyMarking('OPTIBELT', 'SPB', 'تسمه اپتی بلت SPB 2500', ''), 'SPB 2500');
  assert.equal(formatOfficialOnBodyMarking('OPTIBELT', '8M', 'تسمه تایمینگ 1200-8M-30', ''), '1200-8M');
});

test('9-factor engineering judgment approves exact SWR A-49 master and structurally identical SWR A-16 / A-19', () => {
  const exact = judgeStructuralCompatibility(swrA49Master, swrA49Master);
  assert.equal(exact.verdict, 'COMPATIBLE_EXACT_MASTER');
  assert.equal(exact.canUseMasterPhoto, true);
  assert.equal(exact.requiresMarkingAdaptation, false);

  const swrA16 = extractBeltEngineeringProfile({
    skuCode: '11226',
    familyCode: 'PFAM-تسمه-V-شکل-کلا-SWR-A-011',
    brand: 'SWR',
    rawName: 'تسمه SWR A16',
    profile: 'A',
    beltDivision: 'vbelt-classical',
    bodyMaterial: 'لاستیک کلروپرن با روکش کتان صنعتی',
    supplyForm: 'endless-loop',
  });
  const res16 = judgeStructuralCompatibility(swrA16, swrA49Master);
  assert.equal(res16.verdict, 'COMPATIBLE_MARKING_ADAPTABLE');
  assert.equal(res16.canUseMasterPhoto, true);
  assert.equal(res16.requiresMarkingAdaptation, true);
  assert.equal(res16.targetMarkingCode, 'A-16');
  assert.equal(res16.standardReference, 'DIN 2215 / ISO 4184');
});

test('9-factor engineering judgment REJECTS competitor brands and structural differences', () => {
  // 1. Competitor brand (Optibelt A16 vs SWR A49 master)
  const optiA16 = extractBeltEngineeringProfile({
    skuCode: '99001',
    brand: 'OPTIBELT',
    rawName: 'تسمه Optibelt A16',
    profile: 'A',
    beltDivision: 'vbelt-classical',
  });
  assert.equal(judgeStructuralCompatibility(optiA16, swrA49Master).verdict, 'INCOMPATIBLE_BRAND');

  // 2. Cogged raw-edge (AX49) vs Wrapped (A49)
  const swrAX49 = extractBeltEngineeringProfile({
    skuCode: '99002',
    brand: 'SWR',
    rawName: 'تسمه SWR AX49 دندانه‌دار',
    profile: 'A', // even if warehouse mislabeled profile as A, rawName AX49 overrides!
    beltDivision: 'vbelt-classical',
  });
  const coggedVerdict = judgeStructuralCompatibility(swrAX49, swrA49Master);
  assert.equal(coggedVerdict.verdict, 'INCOMPATIBLE_STRUCTURE');
  assert.equal(coggedVerdict.canUseMasterPhoto, false);

  // 3. Different profile (SWR B49 vs SWR A49)
  const swrB49 = extractBeltEngineeringProfile({
    skuCode: '99003',
    brand: 'SWR',
    rawName: 'تسمه SWR B49',
    profile: 'B',
    beltDivision: 'vbelt-classical',
  });
  assert.equal(judgeStructuralCompatibility(swrB49, swrA49Master).verdict, 'INCOMPATIBLE_STRUCTURE');

  // 4. Coated vs uncoated timing belt
  const puPlain = extractBeltEngineeringProfile({
    skuCode: '99004',
    brand: 'MEGADYNE',
    rawName: 'تسمه مگاداین 50AT10',
    profile: 'AT10',
    beltDivision: 'timing-metric-single',
    supplyForm: 'endless-loop',
  });
  const puCoated = extractBeltEngineeringProfile({
    skuCode: '99005',
    brand: 'MEGADYNE',
    rawName: 'تسمه مگاداین 50AT10 روکش Linatex',
    profile: 'AT10',
    beltDivision: 'timing-metric-single',
    backingOrCoating: 'Linatex',
    supplyForm: 'endless-loop',
  });
  assert.equal(judgeStructuralCompatibility(puCoated, puPlain).verdict, 'INCOMPATIBLE_STRUCTURE');

  // 5. Double-sided vs single-sided timing belt
  const singleH = extractBeltEngineeringProfile({
    skuCode: '99006',
    brand: 'OPTIBELT',
    rawName: 'تسمه اپتی بلت 390H100',
    profile: 'H',
    beltDivision: 'timing-imperial-single',
  });
  const doubleDH = extractBeltEngineeringProfile({
    skuCode: '99007',
    brand: 'OPTIBELT',
    rawName: 'تسمه دوطرفه اپتی بلت 390DH100',
    profile: 'DH',
    beltDivision: 'timing-imperial-double',
  });
  assert.equal(judgeStructuralCompatibility(doubleDH, singleH).verdict, 'INCOMPATIBLE_STRUCTURE');

  // 6. Uncut sleeve vs endless-loop
  const sleeveH = extractBeltEngineeringProfile({
    skuCode: '99008',
    brand: 'OPTIBELT',
    rawName: 'تسمه آستین اپتی بلت 390H',
    profile: 'H',
    beltDivision: 'timing-imperial-single',
  });
  assert.equal(judgeStructuralCompatibility(sleeveH, singleH).verdict, 'INCOMPATIBLE_STRUCTURE');

  // 7. Poly-V rib count divergence (4PK vs 12PK)
  const pk4 = extractBeltEngineeringProfile({
    skuCode: '99009',
    brand: 'BANDO',
    rawName: 'تسمه باندو 4PK1100',
    profile: 'PK',
    beltDivision: 'ribbed-poly-v',
  });
  const pk12 = extractBeltEngineeringProfile({
    skuCode: '99010',
    brand: 'BANDO',
    rawName: 'تسمه باندو 12PK1100',
    profile: 'PK',
    beltDivision: 'ribbed-poly-v',
  });
  assert.equal(judgeStructuralCompatibility(pk12, pk4).verdict, 'INCOMPATIBLE_STRUCTURE');
});

test('evaluateVisionVsTarget enforces pixel-level watermark, competitor brand, readability, and exact marking gates', () => {
  const baseReading = {
    visionChecked: true,
    model: 'gemini-4-hydrogen',
    isRealBeltPhoto: true,
    hasWatermarkOrSellerLogo: false,
    watermarkDetails: '',
    markingOnBeltBody: true,
    isReadable: true,
    detectedBrand: 'SWR',
    detectedProfile: 'A',
    detectedSkuCode: 'A-49',
    detectedTechSpecs: ['OIL-HEAT RESISTANT', 'STATIC DISSIPATING'],
    rawPrintedText: 'SWR OIL-HEAT RESISTANT STATIC DISSIPATING A-49',
    physicalStructure: 'wrapped-vbelt' as const,
    markingRegionBox: { x: 720, y: 510, width: 130, height: 180 },
  };

  assert.equal(
    evaluateVisionVsTarget(baseReading, { brand: 'SWR', profile: 'A', expectedCode: 'A-49' }).verdict,
    'VERIFIED_EXACT_MARKING',
  );
  assert.equal(
    evaluateVisionVsTarget(baseReading, { brand: 'SWR', profile: 'A', expectedCode: 'A-16' }).verdict,
    'VERIFIED_FAMILY_BASE_CANDIDATE',
  );
  assert.equal(
    evaluateVisionVsTarget({ ...baseReading, hasWatermarkOrSellerLogo: true, watermarkDetails: 'IndiaMART' }, { brand: 'SWR' }).verdict,
    'REJECTED_WATERMARK',
  );
  assert.equal(
    evaluateVisionVsTarget({ ...baseReading, detectedBrand: 'OPTIBELT' }, { brand: 'SWR' }).verdict,
    'REJECTED_COMPETITOR_BRAND',
  );
  assert.equal(
    evaluateVisionVsTarget({ ...baseReading, isReadable: false }, { brand: 'SWR' }).verdict,
    'REJECTED_UNREADABLE',
  );
  assert.equal(
    evaluateVisionVsTarget({ ...baseReading, visionChecked: false }, { brand: 'SWR' }).verdict,
    'VISION_UNAVAILABLE',
  );
});

test('adaptBeltMarkingOnMaster generates valid WebP preserving pure-white studio background around belt edge', async () => {
  if (!fs.existsSync(SWR_A_MASTER_CALIBRATION.masterWebpAbsPath)) {
    return;
  }
  const tmpOut = path.join(os.tmpdir(), `test-swr-a38-${Date.now()}.webp`);
  try {
    const res = await adaptBeltMarkingOnMaster(SWR_A_MASTER_CALIBRATION, 'A-38', tmpOut);
    assert.ok(res.width >= 1000 && res.height >= 600);
    const meta = await sharp(tmpOut).metadata();
    assert.equal(meta.format, 'webp');

    // Verify bottom-right studio white margin outside the belt remains pure white (no rectangular spill!)
    const px = await sharp(tmpOut)
      .extract({ left: Math.round(res.width * 0.86), top: Math.round(res.height * 0.72), width: 10, height: 10 })
      .raw()
      .toBuffer();
    assert.ok(px[0] > 240 && px[1] > 240 && px[2] > 240, 'White background outside belt edge must stay clean');
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

test('All 37 calibrated real master WebPs exist on disk and cover 12 branded + 25 clean studio constructions with 0% logo overlap', () => {
  const all = Object.values(ALL_MASTER_CALIBRATIONS);
  assert.equal(all.length, 37);
  assert.equal(all.filter((m) => m.isBrandedMaster).length, 12);
  assert.equal(all.filter((m) => !m.isBrandedMaster).length, 25);
  for (const cal of all) {
    assert.ok(fs.existsSync(cal.masterWebpAbsPath), `Missing master WebP: ${cal.masterWebpAbsPath}`);
    if (cal.isBrandedMaster) {
      assert.ok(cal.brandLogoSafeZone, `Branded master ${cal.id} must declare brandLogoSafeZone`);
      const overlap = computeRectOverlapRatio(cal.brandLogoSafeZone!, cal.eraseRect);
      assert.equal(overlap, 0, `Master ${cal.id} print zone overlaps manufacturer logo (${overlap})`);
    }
  }
});

test('resolveMasterCalibrationForBelt guarantees ZERO competitor brand leakage across regional and major brands', () => {
  const swrB52 = extractBeltEngineeringProfile({
    skuCode: '11500',
    brand: 'SWR',
    rawName: 'تسمه SWR B52',
    profile: 'B',
    beltDivision: 'vbelt-classical',
  });
  const resSwr = resolveMasterCalibrationForBelt(swrB52, 'تسمه SWR B52', 'vbelt-classical');
  assert.equal(resSwr?.calibration.id, 'SWR-WRAPPED');
  assert.equal(resSwr?.calibration.isBrandedMaster, true);
  assert.equal(resSwr?.printText, 'B-52');

  const dongilA45 = extractBeltEngineeringProfile({
    skuCode: '21001',
    brand: 'DONGIL',
    rawName: 'تسمه دانگیل A45',
    profile: 'A',
    beltDivision: 'vbelt-classical',
  });
  const resDongil = resolveMasterCalibrationForBelt(dongilA45, 'تسمه دانگیل A45', 'vbelt-classical');
  assert.equal(resDongil?.calibration.id, 'DONGIL-WRAPPED');
  assert.equal(resDongil?.calibration.isBrandedMaster, true);

  const optiB68 = extractBeltEngineeringProfile({
    skuCode: '31001',
    brand: 'OPTIBELT',
    rawName: 'تسمه اپتی بلت B68',
    profile: 'B',
    beltDivision: 'vbelt-classical',
  });
  const resOpti = resolveMasterCalibrationForBelt(optiB68, 'تسمه اپتی بلت B68', 'vbelt-classical');
  assert.equal(resOpti?.calibration.id, 'OPTIBELT-WRAPPED');

  // Regional brands MUST NEVER get SWR/Optibelt/Dongil competitor-branded masters!
  const marshalH = extractBeltEngineeringProfile({
    skuCode: '41001',
    brand: 'MARSHAL',
    rawName: 'تسمه تایمینگ مارشال 540H100',
    profile: 'H',
    beltDivision: 'timing-imperial-single',
  });
  const resMarshal = resolveMasterCalibrationForBelt(marshalH, 'تسمه تایمینگ مارشال 540H100', 'timing-imperial-single');
  assert.ok(
    ['CLEAN-TIMING-TRAP', 'CLEAN-TIMING-TRAP-UPRIGHT', 'CLEAN-TIMING-TRAP-PAIR'].includes(resMarshal?.calibration.id || ''),
    `Expected clean trapezoidal timing master, got ${resMarshal?.calibration.id}`,
  );
  assert.equal(resMarshal?.calibration.isBrandedMaster, false);
  assert.ok(resMarshal?.printText.startsWith('MARSHAL '));

  const forzaAt20 = extractBeltEngineeringProfile({
    skuCode: '51001',
    brand: 'FORZA',
    rawName: 'تسمه فورزا AT20-12580 روکش Linatex',
    profile: 'AT20',
    beltDivision: 'timing-metric-single',
    backingOrCoating: 'Linatex',
  });
  const resForza = resolveMasterCalibrationForBelt(forzaAt20, 'تسمه فورزا AT20-12580 روکش Linatex', 'timing-metric-single');
  assert.equal(resForza?.calibration.id, 'CLEAN-TIMING-COATED');
  assert.equal(resForza?.calibration.isBrandedMaster, false);
  assert.ok(resForza?.printText.startsWith('FORZA '));

  const beravo8M = extractBeltEngineeringProfile({
    skuCode: '61001',
    brand: 'BERAVO',
    rawName: 'تسمه براوو 960-8M-30',
    profile: '8M',
    beltDivision: 'timing-htd-single',
  });
  const resBeravo = resolveMasterCalibrationForBelt(beravo8M, 'تسمه براوو 960-8M-30', 'timing-htd-single');
  assert.ok(
    ['CLEAN-TIMING-HTD', 'CLEAN-TIMING-HTD-UPRIGHT'].includes(resBeravo?.calibration.id || ''),
    `Expected clean HTD timing master, got ${resBeravo?.calibration.id}`,
  );
  assert.equal(resBeravo?.calibration.isBrandedMaster, false);
});

test('Family-level pose diversification varies neighboring families while keeping SKUs in the same family coherent and coating colors accurate', () => {
  const baseVbelt = extractBeltEngineeringProfile({
    skuCode: '70001',
    brand: 'FORZA',
    rawName: 'تسمه کلاسیک فورزا B68',
    profile: 'B',
    beltDivision: 'vbelt-classical',
  });
  const chosenAcrossFamilies = new Set<string>();
  for (let i = 0; i < 18; i++) {
    const res = resolveMasterCalibrationForBelt(baseVbelt, 'تسمه کلاسیک فورزا B68', 'vbelt-classical', `PFAM-TEST-VBELT-${i}`);
    assert.ok(res);
    chosenAcrossFamilies.add(res!.calibration.id);
  }
  assert.ok(chosenAcrossFamilies.size >= 3, `Expected all 3 classical wrapped poses across families, got ${[...chosenAcrossFamilies].join(', ')}`);

  // Same familyCode MUST always return identical master pose for every SKU inside it
  const skuA = resolveMasterCalibrationForBelt(baseVbelt, 'تسمه کلاسیک فورزا B60', 'vbelt-classical', 'PFAM-SAME-01');
  const skuB = resolveMasterCalibrationForBelt(baseVbelt, 'تسمه کلاسیک فورزا B90', 'vbelt-classical', 'PFAM-SAME-01');
  assert.equal(skuA?.calibration.id, skuB?.calibration.id);

  // Coating color fidelity: green supergrip -> GREEN, yellow APL foam -> YELLOW, red Linatex -> RED
  const greenSg = extractBeltEngineeringProfile({
    skuCode: '70010',
    brand: 'FORZA',
    rawName: 'تسمه تایمینگ فورزا T10-1200 روکش سبز پوست ماری سوپرگریپ',
    profile: 'T10',
    beltDivision: 'timing-metric-single',
    backingOrCoating: 'Supergrip',
  });
  assert.equal(
    resolveMasterCalibrationForBelt(greenSg, 'تسمه تایمینگ فورزا T10-1200 روکش سبز پوست ماری سوپرگریپ', 'timing-metric-single', 'PFAM-SG')?.calibration.id,
    'CLEAN-TIMING-COATED-GREEN',
  );

  const yellowApl = extractBeltEngineeringProfile({
    skuCode: '70011',
    brand: 'FORZA',
    rawName: 'تسمه تایمینگ فورزا AT10 روکش اسفنج زرد APL',
    profile: 'AT10',
    beltDivision: 'timing-metric-single',
    backingOrCoating: 'APL Foam',
  });
  assert.equal(
    resolveMasterCalibrationForBelt(yellowApl, 'تسمه تایمینگ فورزا AT10 روکش اسفنج زرد APL', 'timing-metric-single', 'PFAM-APL')?.calibration.id,
    'CLEAN-TIMING-COATED-YELLOW',
  );
});

test('isNonBeltHardwareItem and resolveMasterCalibrationForBelt exclude non-belt hardware items', () => {
  assert.equal(isNonBeltHardwareItem({ rawName: 'بلبرینگ 6204-2RS SKF' }), true);
  assert.equal(isNonBeltHardwareItem({ rawName: 'توری استیل 304 مش 40' }), true);
  assert.equal(isNonBeltHardwareItem({ rawName: 'یاتاقان UCP 205' }), true);
  assert.equal(isNonBeltHardwareItem({ rawName: 'تسمه SWR B52' }), false);

  const bearingProf = extractBeltEngineeringProfile({
    skuCode: '99901',
    brand: 'UNSPECIFIED',
    rawName: 'بلبرینگ شیار عمیق 6205',
    profile: '',
    beltDivision: 'timing-industrial',
  });
  assert.equal(resolveMasterCalibrationForBelt(bearingProf, 'بلبرینگ شیار عمیق 6205', 'timing-industrial'), null);
});

test('Multi-master adaptation produces valid WebPs across Dongil, Optibelt, and Clean Timing masters', async () => {
  const cases: Array<[string, string]> = [
    ['DONGIL-WRAPPED', 'A-45'],
    ['OPTIBELT-WRAPPED', 'B-68'],
    ['CLEAN-TIMING-TRAP', 'MARSHAL 540H100'],
    ['CLEAN-CROWNED', 'CERAMIC CROWN-17'],
  ];
  for (const [id, text] of cases) {
    const cal = ALL_MASTER_CALIBRATIONS[id];
    const tmpOut = path.join(os.tmpdir(), `test-${id}-${Date.now()}.webp`);
    try {
      const out = await adaptBeltMarkingOnMaster(cal, text, tmpOut);
      assert.ok(out.width >= 600 && out.height >= 400);
      const meta = await sharp(tmpOut).metadata();
      assert.equal(meta.format, 'webp');
    } finally {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
  }
});

test('Explicit-profile-first classification separates Optibelt VB vs SK wedge and overrides noisy beltDivision', () => {
  const optiSpb = extractBeltEngineeringProfile({
    skuCode: '31050',
    brand: 'OPTIBELT',
    rawName: 'تسمه اپتی بلت SPB 2000',
    profile: 'SPB',
    beltDivision: 'vbelt-narrow-wedge',
  });
  const resSpb = resolveMasterCalibrationForBelt(optiSpb, 'تسمه اپتی بلت SPB 2000', 'vbelt-narrow-wedge');
  assert.equal(resSpb?.calibration.id, 'OPTIBELT-WEDGE');

  // Even if legacy division mistakenly says vbelt-crowned-crc, explicit profile H -> timing!
  const megaH = extractBeltEngineeringProfile({
    skuCode: '31051',
    brand: 'MEGADYNE',
    rawName: 'تسمه تایمینگ پروفیل H — برند Megadyne',
    profile: 'H',
    beltDivision: 'vbelt-crowned-crc',
  });
  assert.equal(megaH.construction, 'timing-trapezoidal-rubber');
  assert.equal(resolveMasterCalibrationForBelt(megaH, 'تسمه تایمینگ H', 'vbelt-crowned-crc')?.calibration.id, 'MEGADYNE-TIMING');

  // Foam sheets excluded as non-belt items
  assert.equal(isNonBeltHardwareItem({ rawName: 'فوم صنعتی', profile: 'INDUSTRIAL_FOAM_SHEET' }), true);
});

test('Visual Marking Validator passes SWR, Optibelt-VB, Optibelt-SK, Dongil, Marshal, and Forza with 0% logo overlap', async () => {
  const cases = [
    { skuCode: '11226', brand: 'SWR', rawName: 'تسمه SWR A16', profile: 'A', beltDivision: 'vbelt-classical', expectedMaster: 'SWR-WRAPPED' },
    { skuCode: 'OPT-B68', brand: 'OPTIBELT', rawName: 'تسمه اپتی بلت B68', profile: 'B', beltDivision: 'vbelt-classical', expectedMaster: 'OPTIBELT-WRAPPED' },
    { skuCode: 'OPT-SPB', brand: 'OPTIBELT', rawName: 'تسمه اپتی بلت SPB 2000', profile: 'SPB', beltDivision: 'vbelt-narrow-wedge', expectedMaster: 'OPTIBELT-WEDGE' },
    { skuCode: 'DNG-A45', brand: 'DONGIL', rawName: 'تسمه دانگیل A45', profile: 'A', beltDivision: 'vbelt-classical', expectedMaster: 'DONGIL-WRAPPED' },
    { skuCode: 'MRS-H', brand: 'MARSHAL', rawName: 'تسمه تایمینگ مارشال 540H100', profile: 'H', beltDivision: 'timing-imperial-single', expectedPrefix: 'CLEAN-TIMING-TRAP' },
    { skuCode: 'FRZ-PUV', brand: 'FORZA', rawName: 'تسمه جوشی V شکل متری پروفیل A — برند FORZA', profile: 'A', beltDivision: 'welded-pu-v-flat', expectedPrefix: 'CLEAN-PU-VBELT' },
  ];
  for (const c of cases) {
    const rep = await validateBeltVisualMarking(c);
    assert.ok(rep, `Expected visual validation report for ${c.skuCode}`);
    if ('expectedMaster' in c && c.expectedMaster) {
      assert.equal(rep!.masterId, c.expectedMaster);
    } else if ('expectedPrefix' in c && c.expectedPrefix) {
      assert.ok(rep!.masterId.startsWith(c.expectedPrefix), `Expected ${rep!.masterId} to start with ${c.expectedPrefix}`);
    }
    assert.equal(rep!.logoOverlapIoU, 0);
    assert.equal(rep!.verdict, 'PASS_VERIFIED', `Expected PASS_VERIFIED for ${c.skuCode}, got ${rep!.verdict} (score=${rep!.score})`);
  }
});
