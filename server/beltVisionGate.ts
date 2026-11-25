import { GoogleGenAI, Type } from '@google/genai';

// =============================================================================
// Physical Belt Marking Verification Pixel Gate (Free-Tier Gemini 4 Hydrogen)
// Inspects the ACTUAL PIXELS of a belt photograph to verify:
//   - Physical marking printed directly on the belt body (not packaging/title)
//   - Brand logo/name, profile code, SKU/size code, technical markings
//   - Physical construction (wrapped vs cogged, timing teeth, coating, weave)
//   - Absence of third-party seller watermarks or competitor brands
// Strictly uses server-side free-tier `gemini-4-hydrogen` only.
// =============================================================================

export type VisionPhysicalStructure =
  | 'wrapped-vbelt'
  | 'cogged-raw-edge-vbelt'
  | 'timing-trapezoidal-rubber'
  | 'timing-htd-rubber'
  | 'timing-pu-steel'
  | 'timing-double-sided'
  | 'timing-coated'
  | 'poly-v-ribbed'
  | 'pu-round-welded'
  | 'pu-vbelt-welded'
  | 'crowned-ridge'
  | 'conveyor-flat'
  | 'unknown';

export type VisionGateVerdict =
  | 'VERIFIED_EXACT_MARKING'
  | 'VERIFIED_FAMILY_BASE_CANDIDATE'
  | 'REJECTED_COMPETITOR_BRAND'
  | 'REJECTED_WATERMARK'
  | 'REJECTED_UNREADABLE'
  | 'REJECTED_NOT_ON_BODY'
  | 'REJECTED_WRONG_STRUCTURE'
  | 'VISION_UNAVAILABLE';

export interface MarkingRegionBox {
  x: number; // 0..1000 normalized left
  y: number; // 0..1000 normalized top
  width: number; // 0..1000 normalized width
  height: number; // 0..1000 normalized height
}

export interface BeltVisionInspectionResult {
  visionChecked: boolean;
  model: string;
  isRealBeltPhoto: boolean;
  hasWatermarkOrSellerLogo: boolean;
  watermarkDetails: string;
  markingOnBeltBody: boolean;
  isReadable: boolean;
  detectedBrand: string;
  detectedProfile: string;
  detectedSkuCode: string;
  detectedTechSpecs: string[];
  rawPrintedText: string;
  physicalStructure: VisionPhysicalStructure;
  markingRegionBox: MarkingRegionBox | null;
  verdict: VisionGateVerdict;
  reasonFa: string;
}

export interface ExpectedBeltVisionContext {
  brand?: string;
  profile?: string;
  expectedCode?: string;
  expectedStructure?: VisionPhysicalStructure | string;
}

const VISION_MODEL = 'gemini-4-hydrogen';

const BRAND_EQUIVALENTS: Record<string, string[]> = {
  DONGIL: ['DONGIL', 'DRB'],
  DRB: ['DONGIL', 'DRB'],
  MITSUBISHI: ['MITSUBISHI', 'MITSUBOSHI'],
  MITSUBOSHI: ['MITSUBOSHI', 'MITSUBISHI'],
  CONTITECH: ['CONTITECH', 'CONTINENTAL'],
  CONTINENTAL: ['CONTINENTAL', 'CONTITECH'],
  OPTIBELT: ['OPTIBELT'],
  MEGADYNE: ['MEGADYNE', 'ISORAN', 'MEGALINEAR', 'MEGASYNC'],
  SWR: ['SWR'],
  BANDO: ['BANDO'],
  GATES: ['GATES'],
  VOLTA: ['VOLTA'],
  HABASIT: ['HABASIT'],
  HANCHANG: ['HANCHANG'],
  MARSHAL: ['MARSHAL'],
  FORZA: ['FORZA'],
  PIX: ['PIX'],
  SKF: ['SKF'],
  FENNER: ['FENNER'],
};

function normalizeToken(val: string | undefined | null): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

function brandsMatch(detected: string, expected: string): boolean {
  const d = normalizeToken(detected);
  const e = normalizeToken(expected);
  if (!e || ['UNSPECIFIED', 'GENERIC', 'FOREIGN', 'FOREIGNOEM', 'UNKNOWN'].includes(e)) return true;
  if (!d) return false;
  if (d === e || d.includes(e) || e.includes(d)) return true;
  const eq = BRAND_EQUIVALENTS[e] || [e];
  return eq.some((alias) => d.includes(alias) || alias.includes(d));
}

function codesMatch(detectedCode: string, rawText: string, expectedCode?: string): boolean {
  const exp = normalizeToken(expectedCode);
  if (!exp || exp.length < 2) return false;
  const det = normalizeToken(detectedCode);
  if (det && det === exp) return true;
  // Strict token-boundary check on raw printed text so A19 never matches XPA1900 or A190
  const esc = String(expectedCode || '')
    .trim()
    .toUpperCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[\s-]+/g, '[\\s-]?');
  if (!esc) return false;
  const re = new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`, 'i');
  return re.test(rawText.toUpperCase()) || re.test(detectedCode.toUpperCase());
}

/**
 * Pure, deterministic evaluation of Vision inspection JSON against expected belt identity.
 * Unit-testable without network calls.
 */
export function evaluateVisionVsTarget(
  raw: Omit<BeltVisionInspectionResult, 'verdict' | 'reasonFa'>,
  expected: ExpectedBeltVisionContext,
): BeltVisionInspectionResult {
  if (!raw.visionChecked) {
    return {
      ...raw,
      verdict: 'VISION_UNAVAILABLE',
      reasonFa: 'سرویس بررسی بینایی تصویر در این لحظه در دسترس نبود؛ تصمیم بر اساس قوانین مهندسی و ممیزی ثبت‌شده انجام شد.',
    };
  }

  if (!raw.isRealBeltPhoto) {
    return {
      ...raw,
      verdict: 'REJECTED_WRONG_STRUCTURE',
      reasonFa: 'تصویر بررسی‌شده عکس واقعی تسمه صنعتی نیست (گرافیک، نمودار یا محصول غیرمرتبط).',
    };
  }

  if (raw.hasWatermarkOrSellerLogo) {
    return {
      ...raw,
      verdict: 'REJECTED_WATERMARK',
      reasonFa: `تصویر دارای واترمارک یا لوگوی فروشنده ثالث است (${raw.watermarkDetails || 'Watermark'}) و رد شد.`,
    };
  }

  if (!raw.markingOnBeltBody) {
    return {
      ...raw,
      verdict: 'REJECTED_NOT_ON_BODY',
      reasonFa: 'مارکینگ قابل استناد روی بدنه خود تسمه چاپ نشده است (فقط بسته‌بندی یا بدون مارکینگ بدنه).',
    };
  }

  if (!raw.isReadable) {
    return {
      ...raw,
      verdict: 'REJECTED_UNREADABLE',
      reasonFa: 'نوشته‌های چاپ‌شده روی بدنه تسمه ناخوانا یا تار هستند و برای تأیید نهایی پذیرفته نشدند.',
    };
  }

  const expBrand = String(expected.brand || '').trim().toUpperCase();
  const hasSpecificBrand =
    Boolean(expBrand) &&
    !['UNSPECIFIED', 'GENERIC', 'FOREIGN', 'FOREIGN-OEM', 'UNKNOWN', 'خارجی'].includes(expBrand);

  if (hasSpecificBrand && !brandsMatch(raw.detectedBrand, expBrand)) {
    return {
      ...raw,
      verdict: 'REJECTED_COMPETITOR_BRAND',
      reasonFa: `عدم تطابق برند روی بدنه تسمه: برند خوانده‌شده «${raw.detectedBrand || 'نامشخص'}» با برند هدف «${expected.brand}» مطابقت ندارد.`,
    };
  }

  const expStruct = String(expected.expectedStructure || '').trim().toLowerCase();
  if (expStruct && raw.physicalStructure !== 'unknown' && expStruct !== raw.physicalStructure) {
    // Allow wrapped-vbelt vs unknown, reject cogged vs wrapped or timing vs vbelt
    const incompatiblePairs: Array<[string, string]> = [
      ['wrapped-vbelt', 'cogged-raw-edge-vbelt'],
      ['wrapped-vbelt', 'timing-htd-rubber'],
      ['wrapped-vbelt', 'timing-trapezoidal-rubber'],
      ['wrapped-vbelt', 'timing-pu-steel'],
      ['wrapped-vbelt', 'poly-v-ribbed'],
      ['cogged-raw-edge-vbelt', 'timing-htd-rubber'],
      ['timing-htd-rubber', 'timing-double-sided'],
      ['timing-pu-steel', 'timing-coated'],
    ];
    const isHardConflict = incompatiblePairs.some(
      ([a, b]) =>
        (expStruct === a && raw.physicalStructure === b) ||
        (expStruct === b && raw.physicalStructure === a),
    );
    if (isHardConflict) {
      return {
        ...raw,
        verdict: 'REJECTED_WRONG_STRUCTURE',
        reasonFa: `ساختار فیزیکی تسمه در تصویر (${raw.physicalStructure}) با ساختار مهندسی محصول هدف (${expStruct}) مغایرت دارد.`,
      };
    }
  }

  const expProf = normalizeToken(expected.profile);
  const detProf = normalizeToken(raw.detectedProfile);
  if (expProf && detProf && expProf !== detProf) {
    return {
      ...raw,
      verdict: 'REJECTED_WRONG_STRUCTURE',
      reasonFa: `پروفیل چاپ‌شده روی تسمه (${raw.detectedProfile}) با پروفیل هدف (${expected.profile}) یکسان نیست.`,
    };
  }

  if (codesMatch(raw.detectedSkuCode, raw.rawPrintedText, expected.expectedCode)) {
    return {
      ...raw,
      verdict: 'VERIFIED_EXACT_MARKING',
      reasonFa: `تأیید دقیق مارکینگ فیزیکی روی بدنه تسمه: برند ${raw.detectedBrand || expected.brand || '—'}، پروفیل ${raw.detectedProfile || expected.profile || '—'} و کد ${raw.detectedSkuCode || expected.expectedCode}.`,
    };
  }

  return {
    ...raw,
    verdict: 'VERIFIED_FAMILY_BASE_CANDIDATE',
    reasonFa: `تصویر واقعی و خوانا با برند (${raw.detectedBrand || '—'}) و پروفیل (${raw.detectedProfile || '—'}) منطبق است؛ نامزد معتبر تصویر پایه خانواده برای ارزیابی مهندسی و انطباق کد.`,
  };
}

let cachedClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

/**
 * Inspects a real belt image buffer via free-tier `gemini-4-hydrogen` multimodal vision.
 * Never fabricates readings if API key is missing or call fails.
 */
export async function inspectBeltPhysicalMarking(
  imageBuffer: Buffer,
  mimeType: string,
  expected: ExpectedBeltVisionContext = {},
): Promise<BeltVisionInspectionResult> {
  const client = getGeminiClient();
  if (!client) {
    return evaluateVisionVsTarget(
      {
        visionChecked: false,
        model: VISION_MODEL,
        isRealBeltPhoto: true,
        hasWatermarkOrSellerLogo: false,
        watermarkDetails: '',
        markingOnBeltBody: false,
        isReadable: false,
        detectedBrand: '',
        detectedProfile: '',
        detectedSkuCode: '',
        detectedTechSpecs: [],
        rawPrintedText: '',
        physicalStructure: 'unknown',
        markingRegionBox: null,
      },
      expected,
    );
  }

  try {
    const prompt = [
      'You are an industrial power-transmission belt quality inspector.',
      'Examine ONLY the physical belt pixels in this photograph. Do NOT guess from filenames or metadata.',
      'Read all text printed directly on the rubber/PU body of the belt (brand name/logo, profile such as A/B/C/SPA/SPB/AX/8M/H/L/PJ/PK, size/SKU code such as A-49 or 1200-8M, technical specs such as OIL-HEAT RESISTANT, STATIC DISSIPATING, DIN/ISO codes).',
      'Check strictly for any third-party seller watermark, corner store logo, B2B website stamp (e.g. IndiaMART, Made-in-China, Alibaba, Simmering, text overlay).',
      'Classify the physical construction accurately (wrapped V-belt smooth fabric cover vs cogged raw-edge V-belt with inner notches vs trapezoidal timing vs HTD curvilinear timing vs PU steel-cord timing vs double-sided toothed vs coated backing vs multi-rib Poly-V vs round PU vs flat conveyor).',
      'If the size/SKU code is clearly visible on the belt body, estimate its normalized bounding box (0-1000 scale for x, y, width, height).',
    ].join('\n');

    const response = await client.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/webp',
                data: imageBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isRealBeltPhoto: { type: Type.BOOLEAN },
            hasWatermarkOrSellerLogo: { type: Type.BOOLEAN },
            watermarkDetails: { type: Type.STRING },
            markingOnBeltBody: { type: Type.BOOLEAN },
            isReadable: { type: Type.BOOLEAN },
            detectedBrand: { type: Type.STRING },
            detectedProfile: { type: Type.STRING },
            detectedSkuCode: { type: Type.STRING },
            detectedTechSpecs: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            rawPrintedText: { type: Type.STRING },
            physicalStructure: { type: Type.STRING },
            markingRegionBox: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
              },
            },
          },
          required: [
            'isRealBeltPhoto',
            'hasWatermarkOrSellerLogo',
            'markingOnBeltBody',
            'isReadable',
            'detectedBrand',
            'detectedProfile',
            'detectedSkuCode',
            'rawPrintedText',
            'physicalStructure',
          ],
        },
      },
    });

    const jsonText = response.text?.trim();
    if (!jsonText) {
      throw new Error('Empty vision response');
    }
    const parsed = JSON.parse(jsonText) as Record<string, any>;
    const validStructures = new Set<VisionPhysicalStructure>([
      'wrapped-vbelt',
      'cogged-raw-edge-vbelt',
      'timing-trapezoidal-rubber',
      'timing-htd-rubber',
      'timing-pu-steel',
      'timing-double-sided',
      'timing-coated',
      'poly-v-ribbed',
      'pu-round-welded',
      'pu-vbelt-welded',
      'crowned-ridge',
      'conveyor-flat',
      'unknown',
    ]);
    const structureRaw = String(parsed.physicalStructure || 'unknown').toLowerCase() as VisionPhysicalStructure;
    const physicalStructure: VisionPhysicalStructure = validStructures.has(structureRaw)
      ? structureRaw
      : 'unknown';

    const box = parsed.markingRegionBox;
    const validBox: MarkingRegionBox | null =
      box &&
      Number.isFinite(Number(box.x)) &&
      Number.isFinite(Number(box.y)) &&
      Number.isFinite(Number(box.width)) &&
      Number.isFinite(Number(box.height)) &&
      Number(box.width) > 10 &&
      Number(box.height) > 10
        ? {
            x: Math.max(0, Math.min(1000, Number(box.x))),
            y: Math.max(0, Math.min(1000, Number(box.y))),
            width: Math.max(10, Math.min(1000, Number(box.width))),
            height: Math.max(10, Math.min(1000, Number(box.height))),
          }
        : null;

    return evaluateVisionVsTarget(
      {
        visionChecked: true,
        model: VISION_MODEL,
        isRealBeltPhoto: Boolean(parsed.isRealBeltPhoto),
        hasWatermarkOrSellerLogo: Boolean(parsed.hasWatermarkOrSellerLogo),
        watermarkDetails: String(parsed.watermarkDetails || ''),
        markingOnBeltBody: Boolean(parsed.markingOnBeltBody),
        isReadable: Boolean(parsed.isReadable),
        detectedBrand: String(parsed.detectedBrand || '').trim(),
        detectedProfile: String(parsed.detectedProfile || '').trim(),
        detectedSkuCode: String(parsed.detectedSkuCode || '').trim(),
        detectedTechSpecs: Array.isArray(parsed.detectedTechSpecs)
          ? parsed.detectedTechSpecs.map((s: unknown) => String(s).trim()).filter(Boolean)
          : [],
        rawPrintedText: String(parsed.rawPrintedText || '').trim(),
        physicalStructure,
        markingRegionBox: validBox,
      },
      expected,
    );
  } catch {
    return evaluateVisionVsTarget(
      {
        visionChecked: false,
        model: VISION_MODEL,
        isRealBeltPhoto: true,
        hasWatermarkOrSellerLogo: false,
        watermarkDetails: '',
        markingOnBeltBody: false,
        isReadable: false,
        detectedBrand: '',
        detectedProfile: '',
        detectedSkuCode: '',
        detectedTechSpecs: [],
        rawPrintedText: '',
        physicalStructure: 'unknown',
        markingRegionBox: null,
      },
      expected,
    );
  }
}
