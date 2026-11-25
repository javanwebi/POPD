// =============================================================================
// Autonomous 9-Factor Belt Engineering Compatibility & Marking Rules Engine
// Pure, deterministic, zero-I/O engineering module.
// Evaluates whether a member SKU can inherit & surgically adapt a verified
// family master base photo (same brand + profile + construction + material +
// coating + sidedness + supply form + rib range), or must reject the base
// photo and resolve a distinct real photograph matching its actual structure.
// =============================================================================

export type BeltConstructionKind =
  | 'wrapped-vbelt'
  | 'cogged-raw-edge-vbelt'
  | 'hexagonal-vbelt'
  | 'timing-trapezoidal-rubber'
  | 'timing-htd-rubber'
  | 'timing-pu-steel'
  | 'poly-v-ribbed'
  | 'pu-round-welded'
  | 'pu-vbelt-welded'
  | 'crowned-ridge'
  | 'conveyor-flat'
  | 'unknown';

export type BeltSupplyForm = 'endless-loop' | 'open-length' | 'uncut-sleeve';
export type BeltMaterialClass = 'cr-epdm-rubber' | 'pu-thermoplastic' | 'pvc-fabric' | 'unknown';
export type BeltTeethSidedness = 'none' | 'single' | 'double';

export type EngineeringVerdict =
  | 'COMPATIBLE_EXACT_MASTER'
  | 'COMPATIBLE_MARKING_ADAPTABLE'
  | 'INCOMPATIBLE_BRAND'
  | 'INCOMPATIBLE_STRUCTURE';

export interface BeltEngineeringInput {
  skuCode?: string;
  familyCode?: string;
  brand?: string;
  rawName?: string;
  rawSize?: string;
  profile?: string;
  beltDivision?: string;
  bodyMaterial?: string;
  backingOrCoating?: string | null;
  supplyForm?: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  ribCount?: number | null;
}

export interface BeltEngineeringProfile {
  skuCode: string;
  familyCode: string;
  brandNormalized: string;
  isGenericBrand: boolean;
  profileNormalized: string;
  construction: BeltConstructionKind;
  coatingType: string; // 'none' | 'linatex' | 'apl' | 'supergrip' | 'foam' | 'coated-other'
  teethSidedness: BeltTeethSidedness;
  supplyForm: BeltSupplyForm;
  ribCount: number | null;
  materialClass: BeltMaterialClass;
  lengthMm: number | null;
  isBanded: boolean;
  targetMarkingCode: string;
  standardReference: string;
  constructionLabelFa: string;
}

export interface EngineeringJudgmentResult {
  verdict: EngineeringVerdict;
  canUseMasterPhoto: boolean;
  requiresMarkingAdaptation: boolean;
  targetMarkingCode: string;
  masterMarkingCode: string;
  standardReference: string;
  mismatchFactors: string[];
  reasonFa: string;
}

export interface BeltEngineeringAuditRecord {
  skuCode: string;
  familyCode: string;
  brand: string;
  profile: string;
  targetMarkingCode: string;
  standardReference: string;
  constructionFa: string;
  masterAnchorSku: string;
  masterBasePhotoPath: string;
  masterSourceUrl: string;
  masterReadMarking: string;
  engineeringVerdict: EngineeringVerdict;
  finalImageClassification:
    | 'EXACT_PHYSICAL_MARKING'
    | 'MASTER_ENHANCED_MARKING_ADAPTED'
    | 'FAMILY_VERIFIED_REAL_PHOTO'
    | 'DEDICATED_REAL_WEB_PHOTO';
  finalImagePath: string;
  mismatchFactors: string[];
  reasonFa: string;
}

const GENERIC_BRAND_SET = new Set([
  '',
  'UNSPECIFIED',
  'GENERIC',
  'GENERIC_INDUSTRIAL',
  'FOREIGN',
  'FOREIGN-OEM',
  'IRANIAN-OEM',
  'CHINA-OEM',
  'GERMAN-OEM',
  'GERMANY-OEM',
  'JAPAN-OEM',
  'KOREA-OEM',
  'ITALY-OEM',
  'ENGLAND-OEM',
  'UNKNOWN',
  'N/A',
  'NA',
  'خارجی',
  'ثبت نشده',
  'نامشخص',
]);

const BRAND_CANONICAL_MAP: Record<string, string> = {
  DRB: 'DONGIL',
  DONGIL: 'DONGIL',
  MITSUBISHI: 'MITSUBOSHI',
  MITSUBOSHI: 'MITSUBOSHI',
  CONTINENTAL: 'CONTITECH',
  CONTITECH: 'CONTITECH',
  SWR: 'SWR',
  OPTIBELT: 'OPTIBELT',
  MEGADYNE: 'MEGADYNE',
  BANDO: 'BANDO',
  GATES: 'GATES',
  VOLTA: 'VOLTA',
  HABASIT: 'HABASIT',
  HANCHANG: 'HANCHANG',
  MARSHAL: 'MARSHAL',
  FORZA: 'FORZA',
  BERAVO: 'BERAVO',
  GNR: 'GNR',
  PIX: 'PIX',
  SKF: 'SKF',
  FENNER: 'FENNER',
};

function normalizeDigits(text: string): string {
  return String(text || '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function normalizeCanonicalBrand(brand?: string | null): { normalized: string; isGeneric: boolean } {
  const clean = String(brand || '').trim().toUpperCase();
  if (!clean || GENERIC_BRAND_SET.has(clean) || GENERIC_BRAND_SET.has(String(brand || '').trim())) {
    return { normalized: 'GENERIC', isGeneric: true };
  }
  return {
    normalized: BRAND_CANONICAL_MAP[clean] || clean,
    isGeneric: false,
  };
}

export function inferStandardReference(profile: string, construction: BeltConstructionKind): string {
  const p = profile.toUpperCase();
  if (construction === 'wrapped-vbelt') {
    if (/^(SPZ|SPA|SPB|SPC)$/.test(p)) return 'DIN 7753 / ISO 4184';
    if (/^(3V|5V|8V)$/.test(p)) return 'RMA IP-22 / ISO 4184';
    return 'DIN 2215 / ISO 4184';
  }
  if (construction === 'cogged-raw-edge-vbelt') {
    if (/^(XPZ|XPA|XPB|XPC)$/.test(p)) return 'DIN 7753 Part 1 / ISO 4184';
    if (/^(AVX10|AVX13|AVX17)$/.test(p)) return 'DIN 7753 Part 3';
    if (/^(3VX|5VX|8VX)$/.test(p)) return 'RMA IP-22 Raw-Edge';
    return 'DIN 2215 / ISO 4184 (Raw-Edge Cogged)';
  }
  if (construction === 'hexagonal-vbelt') return 'DIN 7722 / ISO 5289';
  if (construction === 'timing-trapezoidal-rubber') return 'ISO 5296 / DIN 7721';
  if (construction === 'timing-htd-rubber') return 'ISO 13050 (HTD / RPP)';
  if (construction === 'timing-pu-steel') return 'DIN 7721 / ISO 17396 (PU Steel Cord)';
  if (construction === 'poly-v-ribbed') return 'ISO 9982 / DIN 7867';
  if (construction === 'pu-round-welded' || construction === 'pu-vbelt-welded') return 'DIN / ISO TPU Weldable';
  if (construction === 'crowned-ridge') return 'Ceramic Line Ridge-Top PU';
  if (construction === 'conveyor-flat') return 'ISO 21183 / FDA Industrial Conveyor';
  return 'ISO / DIN Industrial Standard';
}

export function constructionLabelFa(
  construction: BeltConstructionKind,
  sidedness: BeltTeethSidedness,
  coating: string,
  supplyForm: BeltSupplyForm,
): string {
  const baseMap: Record<BeltConstructionKind, string> = {
    'wrapped-vbelt': 'تسمه V-شکل با روکش کتان صنعتی (Wrapped)',
    'cogged-raw-edge-vbelt': 'تسمه V-شکل دندانه‌دار لبه خام (Raw-Edge Cogged)',
    'hexagonal-vbelt': 'تسمه شش‌ضلعی دوطرفه (Hexagonal)',
    'timing-trapezoidal-rubber': 'تسمه تایمینگ لاستیکی ذوزنقه‌ای',
    'timing-htd-rubber': 'تسمه تایمینگ لاستیکی دندانه گرد (HTD/RPP)',
    'timing-pu-steel': 'تسمه تایمینگ پلی‌یورتان با کورد فولادی',
    'poly-v-ribbed': 'تسمه چندشیار (Poly-V Ribbed)',
    'pu-round-welded': 'تسمه گرد پلی‌یورتان جوش‌پذیر',
    'pu-vbelt-welded': 'تسمه V-شکل پلی‌یورتان جوش‌پذیر',
    'crowned-ridge': 'تسمه بارکش / تاج‌دار سرامیکی',
    'conveyor-flat': 'تسمه نقاله تخت صنعتی',
    unknown: 'تسمه انتقال قدرت صنعتی',
  };
  const parts = [baseMap[construction]];
  if (sidedness === 'double' && construction.startsWith('timing')) parts.push('دوطرفه دندانه');
  if (coating !== 'none') parts.push(`روکش ${coating.toUpperCase()}`);
  if (supplyForm === 'open-length') parts.push('متری (باز)');
  else if (supplyForm === 'uncut-sleeve') parts.push('آستینی (برش‌نخورده)');
  return parts.join(' · ');
}

/**
 * Formats the official factory printed marking code that appears on the belt body.
 * Examples:
 *  - SWR A49 / تسمه SWR A49 -> "A-49"
 *  - SWR A16 / تسمه SWR A16 -> "A-16"
 *  - Optibelt SPB 2500 -> "SPB 2500"
 *  - Optibelt 1200-8M-30 -> "1200 8M"
 */
export function formatOfficialOnBodyMarking(
  brandNormalized: string,
  profileNormalized: string,
  rawName: string,
  rawSize: string,
): string {
  const raw = normalizeDigits(`${rawName || ''} ${rawSize || ''}`).replace(/[×]/g, '*');

  // 1. Classical & cogged V-belts (A49, A-16, B52, C120, AX38, BX60, SPB 2500, XPA 1432, 3V500, 5VX800)
  const vMatch = raw.match(
    /(?:^|[^A-Za-z0-9])(XP[ZABC]|SP[ZABC]|3VX|5VX|8VX|3V|5V|8V|[ABCZ]X|AA|BB|CC|[ABCDZ])\s*[-]?\s*(\d{2,4}(?:\.\d)?)(?:[^A-Za-z0-9]|$)/i,
  );
  if (vMatch) {
    const p = vMatch[1].toUpperCase();
    const num = vMatch[2];
    // SWR classical A/B/C/Z belts print with hyphen: "A-49", "A-16", "B-52"
    if (brandNormalized === 'SWR' && /^[ABCDZ]X?$/.test(p)) {
      return `${p}-${num}`;
    }
    if (/^[ABCDZ]$/.test(p) && Number(num) <= 250) {
      return `${p}-${num}`;
    }
    return `${p} ${num}`;
  }

  // 2. Metric AVX / Iranian width*length (e.g. "500 * 9/5", "10x1000")
  const avxRev = raw.match(/\b(\d{3,4})\s*\*\s*(9[./]5|9|10|13|17|22)\b/);
  const avxFwd = raw.match(/\b(9[./]5|10|13|17|22)\s*[x*]\s*(\d{3,4})\b/i);
  if (avxRev || avxFwd) {
    const w = avxRev ? avxRev[2] : avxFwd![1];
    const len = avxRev ? avxRev[1] : avxFwd![2];
    const stdW = w === '9' || w.startsWith('9') ? '10' : w;
    return `AVX ${stdW}x${len}`;
  }

  // 3. Imperial timing (e.g. 390H100, 1250DH, 240XL037)
  const imp = raw.match(/(?:^|[^A-Za-z0-9])(\d{2,4})\s*(MXL|XL|DL|DH|DXL|XXH|XH|L|H)\s*(\d{3})?(?:[^A-Za-z0-9]|$)/i);
  if (imp) {
    return `${imp[1]}${imp[2].toUpperCase()}${imp[3] || ''}`;
  }

  // 4. HTD / RPP timing (e.g. 1200-8M-30, 8M 1600)
  const htd1 = raw.match(/(?:^|[^A-Za-z0-9])(\d{3,4})\s*[-]?\s*(3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M)(?:[^A-Za-z0-9]|$)/i);
  const htd2 = raw.match(/(?:^|[^A-Za-z0-9])(3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M)\s*[*x-]?\s*(\d{3,4})(?:[^A-Za-z0-9]|$)/i);
  if (htd1) return `${htd1[1]}-${htd1[2].toUpperCase()}`;
  if (htd2) return `${htd2[2]}-${htd2[1].toUpperCase()}`;

  // 5. Metric PU timing (AT10, T10, AT20, T5)
  const pu2 = raw.match(/(?:^|[^A-Za-z0-9])(AT20|AT10|AT5|T20|T10|T5|T2\.5|DT10|DT5)\s*[-]?\s*(\d{3,5})(?:[^A-Za-z0-9]|$)/i);
  if (pu2) return `${pu2[1].toUpperCase()}-${pu2[2]}`;
  const pu1 = raw.match(/(?:^|[^A-Za-z0-9])(\d{1,3})\s*(AT20|AT10|AT5|T20|T10|T5|T2\.5|DT10|DT5)(?:[^A-Za-z0-9]|$)/i);
  if (pu1) return `${pu1[1]}${pu1[2].toUpperCase()}`;

  // 6. Poly-V multi-ribbed (6PJ1168, 8PK1420)
  const pv = raw.match(/(?:^|[^A-Za-z0-9])(\d{1,2})\s*(PH|PJ|PK|PL|PM)\s*[-]?\s*(\d{3,4})(?:[^A-Za-z0-9]|$)/i);
  if (pv) return `${pv[1]}${pv[2].toUpperCase()}${pv[3]}`;

  // 7. Crowned / ceramic ridge / welded PU round / PU V-belt / conveyor sizes
  const diaMatch = raw.match(/(?:^|[^A-Za-z0-9])(\d{1,2}(?:[./]\d)?)\s*(?:mm|میل|میلی)/i);
  const dimPair = raw.match(/(?:^|[^A-Za-z0-9])(\d{1,3}(?:[./]\d)?)\s*\*\s*(\d{1,4}(?:[./]\d)?)(?:[^A-Za-z0-9]|$)/);
  if (/CRC_CROWNED|CROWNED|BRB|TRC/i.test(`${profileNormalized} ${raw}`)) {
    if (dimPair) return `CROWN ${dimPair[1]}x${dimPair[2]}`;
    if (diaMatch) return `CROWN ${diaMatch[1]}MM`;
    return 'CROWN PU';
  }
  if (/^CRC$|ROUND/i.test(profileNormalized) || (/گرد/.test(raw) && !/نقاله/.test(raw))) {
    if (diaMatch) return `PU-${diaMatch[1]}MM`;
    const numOnly = raw.match(/(?:^|[^0-9])(\d{1,2}(?:\.\d)?)(?:[^0-9]|$)/);
    if (numOnly) return `PU-${numOnly[1]}MM`;
    return 'PU-ROUND';
  }
  if (/PVC|CONVEYOR/i.test(profileNormalized) || /نقاله|کانوایر/i.test(raw)) {
    const ply = raw.match(/(\d)\s*(?:لای|لایه|PLY)/i);
    const thick = raw.match(/(\d(?:\.\d)?)\s*(?:میل|MM)/i);
    if (thick && ply) return `PVC ${thick[1]}MM ${ply[1]}PLY`;
    if (thick) return `PVC ${thick[1]}MM`;
    if (dimPair) return `PVC ${dimPair[1]}x${dimPair[2]}`;
    return 'PVC CONVEYOR';
  }
  if (dimPair && profileNormalized && profileNormalized !== 'UNSPECIFIED') {
    const cleanP = profileNormalized.replace(/_/g, ' ').slice(0, 10);
    return `${cleanP} ${dimPair[1]}x${dimPair[2]}`.trim();
  }

  const cleanFallback = profileNormalized
    .replace(/_/g, ' ')
    .replace(/UNSPECIFIED|UNKNOWN/gi, '')
    .replace(/[^A-Za-z0-9./ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanFallback.slice(0, 16);
}

export function isNonBeltHardwareItem(input: {
  rawName?: string;
  profile?: string;
  beltDivision?: string;
}): boolean {
  const combined = `${input.rawName || ''} ${input.profile || ''} ${input.beltDivision || ''}`;
  return /کفی یاتاقان|یاتاقان|PILLOW[-_ ]?BLOCK|\bUC[PFTL]{1,2}\s*\d|بلبرینگ|DEEP_GROOVE|6000_SERIES|6200_SERIES|6300_SERIES|MINIATURE_600|توری.*مش|SS[-_ ]?WIRE[-_ ]?MESH|تیغه.*اسپاتول|SQUEEGEE|حفاظ.*یاتاقان|BEARING[-_ ]?SAFETY[-_ ]?GUARD|INDUSTRIAL_PART_MOULD|BRAND_LABEL_MOULD|INDUSTRIAL_FOAM_SHEET|ROLLER_FINGER|SPONGE_STRIP|قطعه-صنعتی_CODE|نوار اسفنجی|نوار سیلیکونی|انگشتی رولر|^\s*(?:فوم صنعتی|اسفنج)\s*$/i.test(
    combined,
  );
}

export function extractBeltEngineeringProfile(input: BeltEngineeringInput): BeltEngineeringProfile {
  const { normalized: brandNormalized, isGeneric: isGenericBrand } = normalizeCanonicalBrand(input.brand);
  const raw = normalizeDigits(`${input.rawName || ''} ${input.rawSize || ''}`).replace(/[×]/g, '*');
  const rawUpper = raw.toUpperCase();
  const divLower = String(input.beltDivision || '').toLowerCase();
  const matText = `${input.bodyMaterial || ''} ${raw}`;

  // Extract profile (prefer explicit token in rawName if profile input is generic)
  let profileNormalized = String(input.profile || '').trim().toUpperCase();
  if (!profileNormalized || profileNormalized === '-' || profileNormalized === 'UNSPECIFIED') {
    const m = rawUpper.match(
      /(?:^|[^A-Z0-9])(XP[ZABC]|SP[ZABC]|3VX|5VX|8VX|3V|5V|8V|[ABCZ]X|AA|BB|CC|MXL|XL|DL|DH|DXL|XXH|XH|AT20|AT10|AT5|DT10|DT5|T20|T10|T5|RPP14|RPP8|RPP5|S14M|S8M|S5M|S3M|D14M|D8M|D5M|14M|8M|5M|3M|PH|PJ|PK|PL|PM|[ABCDZM])(?=\s*[-]?\s*\d|[^A-Z0-9]|$)/,
    );
    profileNormalized = m ? m[1] : '';
  }

  // Override wrapped profile if rawName explicitly declares cogged variant (e.g. AX49 inside an A family!)
  const explicitCoggedInName = rawUpper.match(/(?:^|[^A-Z0-9])(XP[ZABC]|[ABCZ]X|3VX|5VX|8VX)\s*[-]?\s*\d/);
  if (explicitCoggedInName) {
    profileNormalized = explicitCoggedInName[1];
  }

  // Base profile stripped of -BANDED / -PERFORATED suffix for accurate cross-section classification
  const profileCore = profileNormalized.replace(/[-_ ]?(?:BANDED|PERFORATED)$/i, '');

  // Supply form
  let supplyForm: BeltSupplyForm = 'endless-loop';
  const sfRaw = `${input.supplyForm || ''} ${raw}`;
  if (/آستین|آستين|sleeve|slab|رول آستین/i.test(sfRaw)) {
    supplyForm = 'uncut-sleeve';
  } else if (/open|متری|متري|باز|open[- ]?end/i.test(sfRaw)) {
    supplyForm = 'open-length';
  }

  // Backing / Coating
  let coatingType = 'none';
  const coatRaw = `${input.backingOrCoating || ''} ${raw}`;
  if (/linatex|لیناتکس/i.test(coatRaw)) coatingType = 'linatex';
  else if (/\bAPL\b|چمفر/i.test(coatRaw)) coatingType = 'apl';
  else if (/supergrip|سوپرگریپ/i.test(coatRaw)) coatingType = 'supergrip';
  else if (/foam|اسفنج|فوم/i.test(coatRaw)) coatingType = 'foam';
  else if (
    (input.backingOrCoating && !/بدون|استاندارد|none|standard/i.test(input.backingOrCoating)) ||
    /روکش[\u200c ]?(قرمز|سبز|سفید|پلی|لاستیک|مخصوص|آجدار)/i.test(raw)
  ) {
    coatingType = 'coated-other';
  }

  // Teeth sidedness
  let teethSidedness: BeltTeethSidedness = 'none';
  const isDouble =
    /دوطرف|دوطرفه|دو\s*رو|double[- ]?sided|twin[- ]?power/i.test(`${raw} ${divLower}`) ||
    /^(DL|DH|DXL|D5M|D8M|D14M|DT5|DT10|T5D|T10D|AA|BB|CC)$/.test(profileCore);

  // Banded check
  const isBanded =
    /باندد|به‌پشت‌پیوسته|به پشت پیوسته|دوبل|چند[\u200c ]?تسمه|banded|kraftband|powerband/i.test(`${raw} ${profileNormalized}`) ||
    /\b[2-9]\s*(?:HB|HA|HC|SP[ZABC]|5V|3V|8V)\b/i.test(rawUpper);

  // Construction classification:
  // CRITICAL: Always trust EXPLICIT technical profile codes & explicit Persian/English construction names
  // BEFORE falling back to upstream `beltDivision` (which can contain legacy noise like `vbelt-crowned-crc` on an H timing belt).
  const isExplicitTimingProfile = /^(MXL|XL|L|H|XH|XXH|DL|DH|DXL|3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M|GT2|GT3|GT5|T2\.5|T5|T10|T20|AT5|AT10|AT20|DT5|DT10)$/.test(
    profileCore,
  );
  const isExplicitCoggedProfile = /^(AX|BX|CX|ZX|XPZ|XPA|XPB|XPC|3VX|5VX|8VX|AVX10|AVX13|AVX17)$/.test(profileCore);
  const isExplicitWrappedProfile = /^(Z|A|B|C|D|E|M|O|SPZ|SPA|SPB|SPC|3V|5V|8V)$/.test(profileCore);
  const isExplicitPolyVProfile = /^(PH|PJ|PK|PL|PM)$/.test(profileCore);
  const isExplicitHexProfile = /^(AA|BB|CC)$/.test(profileCore);
  const isExplicitPuWeldedV =
    /جوشی[\u200c ]*V|V[\u200c ]*شکل[\u200c ]*پلی[\u200c ]?یورتان|پلی[\u200c ]?یورتان.*V[\u200c ]*شکل|welded-pu-v|pu-weldable-vbelt|pu-vbelt/i.test(
      `${raw} ${divLower}`,
    );

  let construction: BeltConstructionKind = 'unknown';
  if (/نقاله|کانوایر|\bpvc\b|CONVEYOR|GRIP_TAPE/i.test(`${profileNormalized} ${raw}`) || divLower.includes('conveyor')) {
    construction = 'conveyor-flat';
  } else if (
    /CRC_CROWNED|CROWNED|BRB|بارکش|تاج[\u200c ]?دار/i.test(`${profileNormalized} ${raw}`) ||
    (divLower.includes('crowned') && !isExplicitTimingProfile && !isExplicitCoggedProfile && !isExplicitWrappedProfile)
  ) {
    construction = 'crowned-ridge';
  } else if (
    /^CRC$|ROUND/i.test(profileNormalized) ||
    (/گرد[\u200c ]?جوشی|تسمه[\u200c ]?گرد/i.test(raw) && !/نقاله/.test(raw)) ||
    (divLower.includes('round') && !isExplicitTimingProfile && !isExplicitCoggedProfile && !isExplicitWrappedProfile)
  ) {
    construction = 'pu-round-welded';
  } else if (isExplicitPuWeldedV && !isExplicitTimingProfile) {
    construction = 'pu-vbelt-welded';
  } else if (isExplicitHexProfile || divLower.includes('hex') || /شش[\u200c ]?ضلع/i.test(raw)) {
    construction = 'hexagonal-vbelt';
  } else if (isExplicitPolyVProfile || divLower.includes('poly') || divLower.includes('ribbed') || /چند[\u200c ]?شیار|شیاری/i.test(raw)) {
    construction = 'poly-v-ribbed';
  } else if (
    /^(T2\.5|T5|T10|T20|AT5|AT10|AT20|DT5|DT10)$/.test(profileCore) ||
    ((/تایمینگ|تایم/.test(raw) || divLower.includes('timing')) &&
      !isExplicitWrappedProfile &&
      !isExplicitCoggedProfile &&
      /پلی[\u200c ]?یورتان|\bPU\b|\bTPU\b|سیم[\u200c ]?دار/i.test(matText))
  ) {
    construction = 'timing-pu-steel';
    teethSidedness = isDouble ? 'double' : 'single';
  } else if (
    /^(3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M|GT2|GT3|GT5)$/.test(profileCore) ||
    (divLower.includes('htd') && !isExplicitWrappedProfile && !isExplicitCoggedProfile)
  ) {
    construction = 'timing-htd-rubber';
    teethSidedness = isDouble ? 'double' : 'single';
  } else if (/^(MXL|XL|L|H|XH|XXH|DL|DH|DXL)$/.test(profileCore)) {
    construction = 'timing-trapezoidal-rubber';
    teethSidedness = isDouble ? 'double' : 'single';
  } else if (
    isExplicitCoggedProfile ||
    divLower.includes('cogged') ||
    /دندانه[\u200c ]?دار|دنده[\u200c ]?ای|دنده[\u200c ]?دار|لبه‌خام|لبه خام|raw[- ]?edge|cogged/i.test(raw)
  ) {
    construction = 'cogged-raw-edge-vbelt';
  } else if (isExplicitWrappedProfile || /V[\u200c ]*شکل|vbelt/i.test(`${raw} ${divLower}`)) {
    construction = 'wrapped-vbelt';
  } else if (divLower.includes('timing') || /تایمینگ|تسمه[\u200c ]*تایم/i.test(raw)) {
    construction = 'timing-trapezoidal-rubber';
    teethSidedness = isDouble ? 'double' : 'single';
  }

  // Material class
  let materialClass: BeltMaterialClass = 'unknown';
  if (/pvc/i.test(matText)) {
    materialClass = 'pvc-fabric';
  } else if (
    /پلی[\u200c ]?یورتان|\bPU\b|\bTPU\b|polyurethane|urethane/i.test(matText) ||
    construction === 'timing-pu-steel' ||
    construction === 'pu-round-welded' ||
    construction === 'pu-vbelt-welded' ||
    construction === 'crowned-ridge'
  ) {
    materialClass = 'pu-thermoplastic';
  } else if (
    /لاستیک|نئوپرن|کلروپرن|CR|EPDM|rubber|neoprene/i.test(matText) ||
    construction === 'wrapped-vbelt' ||
    construction === 'cogged-raw-edge-vbelt' ||
    construction === 'hexagonal-vbelt' ||
    construction === 'timing-trapezoidal-rubber' ||
    construction === 'timing-htd-rubber' ||
    construction === 'poly-v-ribbed'
  ) {
    materialClass = 'cr-epdm-rubber';
  }

  // Rib count for Poly-V
  let ribCount: number | null = typeof input.ribCount === 'number' && input.ribCount > 0 ? input.ribCount : null;
  if (ribCount === null && construction === 'poly-v-ribbed') {
    const rm = rawUpper.match(/(?:^|[^A-Z0-9])(\d{1,2})\s*(?:PH|PJ|PK|PL|PM)/);
    if (rm) ribCount = Number(rm[1]);
  }

  const targetMarkingCode = formatOfficialOnBodyMarking(
    brandNormalized,
    profileNormalized,
    input.rawName || '',
    input.rawSize || '',
  );
  const standardReference = inferStandardReference(profileNormalized, construction);

  return {
    skuCode: String(input.skuCode || '').trim(),
    familyCode: String(input.familyCode || '').trim(),
    brandNormalized,
    isGenericBrand,
    profileNormalized,
    construction,
    coatingType,
    teethSidedness,
    supplyForm,
    ribCount,
    materialClass,
    lengthMm: typeof input.lengthMm === 'number' && Number.isFinite(input.lengthMm) ? input.lengthMm : null,
    isBanded,
    targetMarkingCode,
    standardReference,
    constructionLabelFa: constructionLabelFa(construction, teethSidedness, coatingType, supplyForm),
  };
}

/**
 * Autonomous 9-factor engineering structural compatibility judgment.
 * Decides whether `sku` can legitimately use & surgically adapt `masterAnchor`'s verified photo.
 */
export function judgeStructuralCompatibility(
  sku: BeltEngineeringProfile,
  master: BeltEngineeringProfile,
): EngineeringJudgmentResult {
  const mismatchFactors: string[] = [];

  // Factor 1: Brand Lock
  if (!sku.isGenericBrand && !master.isGenericBrand && sku.brandNormalized !== master.brandNormalized) {
    mismatchFactors.push(`BRAND_MISMATCH:${sku.brandNormalized}!=${master.brandNormalized}`);
    return {
      verdict: 'INCOMPATIBLE_BRAND',
      canUseMasterPhoto: false,
      requiresMarkingAdaptation: false,
      targetMarkingCode: sku.targetMarkingCode,
      masterMarkingCode: master.targetMarkingCode,
      standardReference: sku.standardReference,
      mismatchFactors,
      reasonFa: `عدم تطابق برند: برند کد کالا (${sku.brandNormalized}) با برند تصویر پایه (${master.brandNormalized}) متفاوت است؛ استفاده از تصویر برند رقیب اکیداً ممنوع است.`,
    };
  }

  // Factor 2: Exact Profile Match
  if (
    sku.profileNormalized &&
    master.profileNormalized &&
    sku.profileNormalized !== master.profileNormalized
  ) {
    mismatchFactors.push(`PROFILE_MISMATCH:${sku.profileNormalized}!=${master.profileNormalized}`);
  }

  // Factor 3: Physical Construction (Wrapped vs Cogged Raw-Edge vs Timing vs Poly-V, etc.)
  if (sku.construction !== 'unknown' && master.construction !== 'unknown' && sku.construction !== master.construction) {
    mismatchFactors.push(`CONSTRUCTION_MISMATCH:${sku.construction}!=${master.construction}`);
  }

  // Factor 4: Backing / Coating (e.g. APL / Linatex / Supergrip vs standard uncoated)
  if (sku.coatingType !== master.coatingType) {
    mismatchFactors.push(`COATING_MISMATCH:${sku.coatingType}!=${master.coatingType}`);
  }

  // Factor 5: Teeth Sidedness (single vs double sided)
  if (sku.teethSidedness !== master.teethSidedness) {
    mismatchFactors.push(`SIDEDNESS_MISMATCH:${sku.teethSidedness}!=${master.teethSidedness}`);
  }

  // Factor 6: Supply Form (endless-loop vs open-length roll vs uncut-sleeve)
  if (sku.supplyForm !== master.supplyForm) {
    mismatchFactors.push(`SUPPLY_FORM_MISMATCH:${sku.supplyForm}!=${master.supplyForm}`);
  }

  // Factor 7: Material Class (CR/EPDM black rubber vs PU thermoplastic vs PVC)
  if (sku.materialClass !== 'unknown' && master.materialClass !== 'unknown' && sku.materialClass !== master.materialClass) {
    mismatchFactors.push(`MATERIAL_MISMATCH:${sku.materialClass}!=${master.materialClass}`);
  }

  // Factor 8: Banded vs Single V-belt
  if (sku.isBanded !== master.isBanded) {
    mismatchFactors.push(`BANDED_MISMATCH:${sku.isBanded}!=${master.isBanded}`);
  }

  // Factor 9: Poly-V rib count visible divergence (e.g. 4PK vs 12PK)
  if (
    sku.construction === 'poly-v-ribbed' &&
    sku.ribCount !== null &&
    master.ribCount !== null &&
    Math.abs(sku.ribCount - master.ribCount) > 2
  ) {
    mismatchFactors.push(`RIB_COUNT_DIVERGENCE:${sku.ribCount}vs${master.ribCount}`);
  }

  if (mismatchFactors.length > 0) {
    return {
      verdict: 'INCOMPATIBLE_STRUCTURE',
      canUseMasterPhoto: false,
      requiresMarkingAdaptation: false,
      targetMarkingCode: sku.targetMarkingCode,
      masterMarkingCode: master.targetMarkingCode,
      standardReference: sku.standardReference,
      mismatchFactors,
      reasonFa: `تفاوت ساختار فیزیکی با تصویر پایه خانواده (${mismatchFactors.join('، ')})؛ تصویر پایه رد شد و تصویر واقعی منطبق با ساختار واقعی این کد جایگزین می‌شود.`,
    };
  }

  // All 9 engineering structure checks passed!
  const normSkuCode = sku.targetMarkingCode.replace(/[\s_-]+/g, '').toUpperCase();
  const normMasterCode = master.targetMarkingCode.replace(/[\s_-]+/g, '').toUpperCase();

  if (normSkuCode && normMasterCode && normSkuCode === normMasterCode) {
    return {
      verdict: 'COMPATIBLE_EXACT_MASTER',
      canUseMasterPhoto: true,
      requiresMarkingAdaptation: false,
      targetMarkingCode: sku.targetMarkingCode,
      masterMarkingCode: master.targetMarkingCode,
      standardReference: sku.standardReference,
      mismatchFactors: [],
      reasonFa: `تطابق ۱۰۰٪ مهندسی و مارکینگ فیزیکی با تصویر پایه تأییدشده (${master.brandNormalized} ${master.targetMarkingCode} — ${sku.standardReference}).`,
    };
  }

  return {
    verdict: 'COMPATIBLE_MARKING_ADAPTABLE',
    canUseMasterPhoto: true,
    requiresMarkingAdaptation: Boolean(sku.targetMarkingCode),
    targetMarkingCode: sku.targetMarkingCode,
    masterMarkingCode: master.targetMarkingCode,
    standardReference: sku.standardReference,
    mismatchFactors: [],
    reasonFa: `ساختار فیزیکی، برند (${sku.brandNormalized})، پروفیل (${sku.profileNormalized})، جنس بدنه و نوع روکش کاملاً یکسان است؛ تنها کد سایز چاپی روی بدنه از «${master.targetMarkingCode || 'پایه'}» به «${sku.targetMarkingCode || sku.skuCode}» تطبیق داده شد.`,
  };
}
