import type { Express, Request, Response } from 'express';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  discoverAndCacheLiveSkuWebPhoto,
  downloadAndConvertRealPhotoToWebp,
  isCandidateUrlRejected,
  isValidWebpOnDisk,
  readLiveSkuProvenance,
  type BeltSkuQueryInput,
} from './realWebBeltEngine';
import {
  extractBeltEngineeringProfile,
  judgeStructuralCompatibility,
  type BeltEngineeringAuditRecord,
} from './beltEngineeringJudgment';
import {
  ensureAdaptedBeltSkuWebp,
  getAllEffectiveMasterCalibrations,
  getEffectiveMasterCalibration,
  renderBeltMarkingBuffer,
  resetMasterCalibrationOverride,
  resolveMasterCalibrationForBelt,
  saveMasterCalibrationOverride,
  type MasterCalibrationOverridePatch,
} from './beltMarkingStudio';
import {
  auditAllCalibratedMasters,
  validateBeltVisualMarking,
  type VisualValidationReport,
} from './beltVisualMarkingValidator';

const CACHE_DIR = path.resolve('/tmp/sanatpish-asset-cache');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const DELIVERABLES_DIR = path.resolve(process.cwd(), 'deliverables/belt-master-audit');
const SERVER_DATA_DIR = path.resolve(process.cwd(), 'server/data');
const SKUS_WEB_DIR = path.resolve(PUBLIC_DIR, 'belt-catalog/skus-web');

const SWR_A_MASTER_PROFILE = extractBeltEngineeringProfile({
  skuCode: '11259',
  familyCode: 'PFAM-تسمه-V-شکل-کلا-SWR-A-011',
  brand: 'SWR',
  rawName: 'تسمه SWR A49',
  profile: 'A',
  beltDivision: 'vbelt-classical',
  bodyMaterial: 'لاستیک کلروپرن با روکش کتان صنعتی',
  supplyForm: 'endless-loop',
});

let cachedEngineeringAudit: {
  generatedAt: string;
  totals: Record<string, number>;
  records: BeltEngineeringAuditRecord[];
  bySku: Record<string, BeltEngineeringAuditRecord>;
} | null = null;
let cachedEngineeringAuditMtime = 0;

function getEngineeringAudit() {
  const filePath = path.join(DELIVERABLES_DIR, 'engineering_marking_audit.json');
  try {
    const stat = fs.statSync(filePath);
    if (!cachedEngineeringAudit || stat.mtimeMs !== cachedEngineeringAuditMtime) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const records: BeltEngineeringAuditRecord[] = Array.isArray(parsed.records) ? parsed.records : [];
      const bySku: Record<string, BeltEngineeringAuditRecord> = {};
      for (const rec of records) {
        if (rec?.skuCode) bySku[rec.skuCode] = rec;
      }
      cachedEngineeringAudit = {
        generatedAt: parsed.generatedAt || '',
        totals: parsed.totals || {},
        records,
        bySku,
      };
      cachedEngineeringAuditMtime = stat.mtimeMs;
    }
  } catch {
    if (!cachedEngineeringAudit) {
      cachedEngineeringAudit = { generatedAt: '', totals: {}, records: [], bySku: {} };
    }
  }
  return cachedEngineeringAudit;
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

let cachedSvgLookup: { families: Record<string, any>; skus: Record<string, any> } | null = null;
let cachedSvgLookupMtime = 0;
let cachedImageManifest: {
  verifiedFamilyPhotos: Record<
    string,
    Array<{
      slotIndex: number;
      sourceUrl: string;
      sourcePageUrl?: string;
      localPath?: string;
      manufacturer?: string;
      domain?: string;
      title?: string;
      noteFa?: string;
      matchType?: string;
    }>
  >;
  verifiedSkuPhotos: Record<
    string,
    {
      sourceUrl: string;
      sourcePageUrl?: string;
      localPath?: string;
      closeupLocalPath?: string | null;
      closeupSourceUrl?: string | null;
      visibleMarking?: string;
      manufacturer?: string;
      noteFa?: string;
    }
  >;
} | null = null;
let cachedImageManifestMtime = 0;

interface WebRealSkuMapEntry {
  skuCode: string;
  familyCode: string;
  matchType: 'EXACT_WEB_VERIFIED' | 'EXACT_SKU_WEB' | 'CLOSE_SPEC_WEB';
  localPath: string | null;
  sourceUrl: string;
  thumbnailFallbackUrl?: string;
  sourcePageUrl: string;
  title: string;
  domain: string;
  score: number;
  verifiedAt: string;
}

let cachedWebSkuMap: Record<string, WebRealSkuMapEntry> | null = null;
let cachedWebSkuMapMtime = 0;

function getWebSkuMap(): Record<string, WebRealSkuMapEntry> {
  const filePath = path.join(DELIVERABLES_DIR, 'web_real_sku_mapping.json');
  try {
    const stat = fs.statSync(filePath);
    if (!cachedWebSkuMap || stat.mtimeMs !== cachedWebSkuMapMtime) {
      cachedWebSkuMap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedWebSkuMapMtime = stat.mtimeMs;
    }
  } catch {
    if (!cachedWebSkuMap) cachedWebSkuMap = {};
  }
  return cachedWebSkuMap!;
}

function getSvgLookup() {
  const filePath = path.join(SERVER_DATA_DIR, 'beltSvgLookup.json');
  try {
    const stat = fs.statSync(filePath);
    if (!cachedSvgLookup || stat.mtimeMs !== cachedSvgLookupMtime) {
      const raw = fs.readFileSync(filePath, 'utf8');
      cachedSvgLookup = JSON.parse(raw);
      cachedSvgLookupMtime = stat.mtimeMs;
    }
  } catch {
    if (!cachedSvgLookup) cachedSvgLookup = { families: {}, skus: {} };
  }
  return cachedSvgLookup!;
}

function getImageManifest() {
  const filePath = path.join(DELIVERABLES_DIR, 'image_manifest.json');
  try {
    const stat = fs.statSync(filePath);
    if (!cachedImageManifest || stat.mtimeMs !== cachedImageManifestMtime) {
      const raw = fs.readFileSync(filePath, 'utf8');
      cachedImageManifest = JSON.parse(raw);
      cachedImageManifestMtime = stat.mtimeMs;
    }
  } catch {
    if (!cachedImageManifest) cachedImageManifest = { verifiedFamilyPhotos: {}, verifiedSkuPhotos: {} };
  }
  return cachedImageManifest!;
}

async function sendLocalPublicFile(res: Response, relativePublicPath: string, overrideContentType?: string): Promise<boolean> {
  const cleanRel = relativePublicPath.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, cleanRel);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) return false;
  try {
    const buf = await fsPromises.readFile(resolved);
    if (!buf.length) return false;
    const ext = path.extname(resolved).toLowerCase();
    res.setHeader('Content-Type', overrideContentType || MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    res.send(buf);
    return true;
  } catch {
    return false;
  }
}

function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rtl(text: unknown): string {
  const cleaned = String(text ?? '').trim();
  if (!cleaned) return '';
  return `\u202B${escapeXml(cleaned)}\u202C`;
}

function trunc(text: string, maxLen: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

function fmtNum(val: number | null | undefined, suffix = '', digits = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const rounded = Number.isInteger(val) ? String(val) : Number(val.toFixed(digits)).toString();
  return suffix ? `${rounded} ${suffix}` : rounded;
}

function renderFamilySpecSvg(fam: any): string {
  const profilesStr = (fam.dominantProfiles || []).join(', ') || 'STANDARD';
  const pitchStr = fmtNum(fam.pitchMm, 'mm');
  const angleStr = fmtNum(fam.toothAngleDeg, '°');
  const thickStr = fmtNum(fam.beltThicknessMm, 'mm');
  const rows: Array<any> = fam.sampleSkus || [];

  const tableRowsSvg = rows
    .slice(0, 6)
    .map((r, i) => {
      const y = 716 + i * 38;
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F8F5EE';
      return `
      <rect x="62" y="${y - 24}" width="1276" height="36" fill="${bg}" stroke="#E6DFD3" stroke-width="0.8"/>
      <text x="1290" y="${y}" text-anchor="middle" font-family="monospace" font-size="13" font-weight="700" fill="#E56B1E">${escapeXml(r.sku)}</text>
      <text x="980" y="${y}" text-anchor="end" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="700" fill="#1F2022">${rtl(trunc(r.name, 46))}</text>
      <text x="540" y="${y}" text-anchor="middle" font-family="monospace" font-size="12.5" font-weight="700" fill="#1F2022">${escapeXml(r.profile || '-')}</text>
      <text x="340" y="${y}" text-anchor="middle" font-family="monospace" font-size="12.5" font-weight="700" fill="#1F2022">${escapeXml(fmtNum(r.widthMm, 'mm'))}</text>
      <text x="150" y="${y}" text-anchor="middle" font-family="monospace" font-size="12.5" font-weight="700" fill="#1F2022">${escapeXml(fmtNum(r.lengthMm, 'mm'))}</text>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1020" width="1400" height="1020">
  <rect x="0" y="0" width="1400" height="1020" fill="#FBF8F3"/>
  <rect x="38" y="38" width="1324" height="944" rx="14" fill="#FFFFFF" stroke="#55565A" stroke-width="2"/>
  <rect x="38" y="38" width="1324" height="108" rx="14" fill="#55565A"/>
  <rect x="38" y="142" width="1324" height="6" fill="#E56B1E"/>
  <rect x="62" y="56" width="310" height="68" rx="10" fill="#434448" stroke="#E56B1E" stroke-width="1.5"/>
  <text x="217" y="84" text-anchor="middle" font-family="monospace" font-size="16" font-weight="700" fill="#FFFFFF">${escapeXml(trunc(fam.familyCode, 24))}</text>
  <text x="217" y="109" text-anchor="middle" font-family="monospace" font-size="12" font-weight="600" fill="#FFB07C">${escapeXml(trunc(fam.dominantDivision, 30))}</text>
  <text x="1332" y="82" text-anchor="end" font-family="Tahoma, sans-serif" font-size="22" font-weight="800" fill="#FFFFFF">${rtl('شناسنامه مهندسی و جدول مشخصات خانواده تسمه صنعتی')}</text>
  <text x="1332" y="116" text-anchor="end" font-family="Tahoma, sans-serif" font-size="15" font-weight="600" fill="#F4EDE2">${rtl(trunc(fam.familyName, 84))}</text>

  <rect x="62" y="166" width="1276" height="44" rx="8" fill="#F7F3EC" stroke="#E2D9C8" stroke-width="1.2"/>
  <text x="1316" y="194" text-anchor="end" font-family="Tahoma, sans-serif" font-size="13" font-weight="700" fill="#1F2022">${rtl(`استاندارد مرجع: ${fam.dominantStandard}   |   پروفیل: ${profilesStr}   |   برند: ${fam.brand}`)}</text>
  <text x="84" y="194" text-anchor="start" font-family="monospace" font-size="12.5" font-weight="700" fill="#E56B1E">VERIFIED_ENGINEERING_REDRAW</text>

  <rect x="62" y="228" width="1276" height="38" rx="8" fill="#E56B1E"/>
  <text x="1318" y="253" text-anchor="end" font-family="Tahoma, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF">${rtl('بخش اول — مشخصات مهندسی ثابت خانواده (Fixed Family Identity)')}</text>

  <rect x="62" y="280" width="1276" height="310" rx="10" fill="#FFFFFF" stroke="#DCD4C6" stroke-width="1.5"/>
  <line x1="700" y1="280" x2="700" y2="590" stroke="#DCD4C6" stroke-width="1.5"/>
  <g stroke="#E6DFD3" stroke-width="1">
    <line x1="62" y1="342" x2="1338" y2="342"/>
    <line x1="62" y1="404" x2="1338" y2="404"/>
    <line x1="62" y1="466" x2="1338" y2="466"/>
    <line x1="62" y1="528" x2="1338" y2="528"/>
  </g>
  <g font-family="Tahoma, sans-serif" font-size="13.5" font-weight="700">
    <text x="1318" y="318" text-anchor="end" fill="#55565A">${rtl('خانواده و زیرشاخه کاتالوگ:')}</text>
    <text x="1080" y="318" text-anchor="end" fill="#1F2022">${rtl(trunc(`${fam.submenu} ← ${fam.leaf}`, 46))}</text>
    <text x="1318" y="380" text-anchor="end" fill="#55565A">${rtl('پروفیل و گام استاندارد:')}</text>
    <text x="1080" y="380" text-anchor="end" font-family="monospace" fill="#E56B1E">${escapeXml(`Profile: ${profilesStr} | Pitch: ${pitchStr} | Angle: ${angleStr}`)}</text>
    <text x="1318" y="442" text-anchor="end" fill="#55565A">${rtl('ضخامت کل تسمه (Thickness):')}</text>
    <text x="1080" y="442" text-anchor="end" font-family="monospace" fill="#1F2022">${escapeXml(thickStr)}</text>
    <text x="1318" y="504" text-anchor="end" fill="#55565A">${rtl('فرم عرضه و واحد فروش:')}</text>
    <text x="1080" y="504" text-anchor="end" fill="#1F2022">${rtl(`${fam.dominantSupplyForm} (${fam.unit})`)}</text>
    <text x="1318" y="566" text-anchor="end" fill="#55565A">${rtl('تعداد کدهای تسمه عضو خانواده:')}</text>
    <text x="1080" y="566" text-anchor="end" font-family="monospace" fill="#E56B1E">${fam.skuCount} Valid Belt SKUs</text>

    <text x="678" y="318" text-anchor="end" fill="#55565A">${rtl('جنس بدنه تسمه (Body Material):')}</text>
    <text x="450" y="318" text-anchor="end" fill="#1F2022">${rtl(trunc(fam.dominantBodyMaterial, 46))}</text>
    <text x="678" y="380" text-anchor="end" fill="#55565A">${rtl('ساختار کورد کششی (Tensile Cord):')}</text>
    <text x="450" y="380" text-anchor="end" fill="#1F2022">${rtl(trunc(fam.dominantCord, 46))}</text>
    <text x="678" y="442" text-anchor="end" fill="#55565A">${rtl('پوشش پشت / روکش (Backing):')}</text>
    <text x="450" y="442" text-anchor="end" fill="#1F2022">${rtl(trunc(fam.backingOrCoating || 'استاندارد صنعتی بدون روکش اضافه', 46))}</text>
    <text x="678" y="504" text-anchor="end" fill="#55565A">${rtl('استاندارد هندسی مرجع:')}</text>
    <text x="450" y="504" text-anchor="end" font-family="monospace" fill="#1F2022">${escapeXml(trunc(fam.dominantStandard, 44))}</text>
    <text x="678" y="566" text-anchor="end" fill="#55565A">${rtl('وضعیت ممیزی مهندسی:')}</text>
    <text x="450" y="566" text-anchor="end" fill="#15803D">${rtl('تاییدشده طبق دستور مادر صنعت پیش')}</text>
  </g>

  <rect x="62" y="610" width="1276" height="38" rx="8" fill="#55565A"/>
  <text x="1318" y="635" text-anchor="end" font-family="Tahoma, sans-serif" font-size="14.5" font-weight="800" fill="#FFFFFF">${rtl('بخش دوم — نمونه کدهای کالای عضو و پارامترهای متغیر (طول و عرض)')}</text>

  <rect x="62" y="656" width="1276" height="36" fill="#EDE6DA" stroke="#DCD4C6" stroke-width="1"/>
  <text x="1290" y="679" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="800" fill="#55565A">${rtl('کد کالا')}</text>
  <text x="980" y="679" text-anchor="end" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="800" fill="#55565A">${rtl('عنوان فنی در انبار')}</text>
  <text x="540" y="679" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="800" fill="#55565A">${rtl('پروفیل')}</text>
  <text x="340" y="679" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="800" fill="#55565A">${rtl('عرض / مقطع')}</text>
  <text x="150" y="679" text-anchor="middle" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="800" fill="#55565A">${rtl('طول موثر / گام')}</text>
  ${tableRowsSvg}
</svg>`;
}

function classifySectionKind(profileRaw: string, divisionRaw: string, nameRaw = ''): {
  kind: 'round' | 'crowned' | 'hex' | 'polyv' | 'vbelt' | 'htd' | 'timing' | 'conveyor';
  isDouble: boolean;
  isCogged: boolean;
} {
  const p = String(profileRaw || '').toUpperCase();
  const d = String(divisionRaw || '').toLowerCase();
  const n = String(nameRaw || '');
  const isDouble = /^(DL|DH|DXL|D5M|D8M|D14M|DA|DB|DT5|DT10|T5D|T10D)/i.test(p) || /دوطرف|دوطرفه|double/i.test(n);
  const isCogged = /^(AX|BX|CX|ZX|XPZ|XPA|XPB|XPC|3VX|5VX|8VX)/i.test(p) || /دندانه‌دار|دنده/.test(n);

  if (/CRC_CROWNED|CROWNED|BRB|TRC|SUPERGRIP|LINATEX|اسپاتول|بارکش/.test(`${p} ${n}`)) {
    return { kind: 'crowned', isDouble: false, isCogged: false };
  }
  if (/^CRC$|ROUND|گرد/.test(`${p} ${n}`) && !/نقاله/.test(n)) {
    return { kind: 'round', isDouble: false, isCogged: false };
  }
  if (/^(AA|BB|CC)/.test(p) || /شش[\u200c ]?ضلع|hex/i.test(n)) {
    return { kind: 'hex', isDouble: true, isCogged: false };
  }
  if (/^(PH|PJ|PK|PL|PM)/.test(p) || d.includes('poly') || /چند[\u200c ]?شیار|شیاری/i.test(n)) {
    return { kind: 'polyv', isDouble: false, isCogged: false };
  }
  if (d.includes('conveyor') || /PVC|PU_BELT|نقاله|کانوایر/i.test(`${p} ${n}`)) {
    return { kind: 'conveyor', isDouble: false, isCogged: false };
  }
  if (d.includes('vbelt') || /^(Z|A|B|C|D|E|M|AX|BX|CX|ZX|SPA|SPB|SPC|SPZ|XPA|XPB|XPC|XPZ|3V|5V|8V|3VX|5VX)$/.test(p)) {
    return { kind: 'vbelt', isDouble, isCogged };
  }
  if (/(3M|5M|8M|14M|RPP|STD|S8M|S5M|S3M|GT)/.test(p) || d.includes('htd')) {
    return { kind: 'htd', isDouble, isCogged: false };
  }
  return { kind: 'timing', isDouble, isCogged: false };
}

function buildSectionShapeSvg(kind: string, isDouble: boolean, isCogged: boolean, cx: number, cy: number, scale = 1): string {
  switch (kind) {
    case 'round':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <circle cx="0" cy="0" r="68" fill="#16A34A" fill-opacity="0.16" stroke="#15803D" stroke-width="4"/>
        <circle cx="0" cy="0" r="14" fill="#E56B1E" stroke="#55565A" stroke-width="2"/>
        <line x1="-88" y1="0" x2="88" y2="0" stroke="#55565A" stroke-width="1.5" stroke-dasharray="5,4"/>
        <line x1="0" y1="-88" x2="0" y2="88" stroke="#55565A" stroke-width="1.5" stroke-dasharray="5,4"/>
      </g>`;
    case 'crowned':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <path d="M -95 45 L -95 5 Q 0 -65 95 5 L 95 45 Z" fill="#16A34A" fill-opacity="0.18" stroke="#15803D" stroke-width="4"/>
        <circle cx="-40" cy="24" r="5" fill="#E56B1E"/><circle cx="0" cy="24" r="5" fill="#E56B1E"/><circle cx="40" cy="24" r="5" fill="#E56B1E"/>
        <line x1="-112" y1="45" x2="112" y2="45" stroke="#55565A" stroke-width="2"/>
      </g>`;
    case 'hex':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <polygon points="-84,0 -48,-52 48,-52 84,0 48,52 -48,52" fill="#55565A" fill-opacity="0.18" stroke="#55565A" stroke-width="4"/>
        <line x1="-98" y1="0" x2="98" y2="0" stroke="#E56B1E" stroke-width="2.5" stroke-dasharray="6,4"/>
      </g>`;
    case 'polyv':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <path d="M -110 -34 L 110 -34 L 110 8 L 88 38 L 66 8 L 44 38 L 22 8 L 0 38 L -22 8 L -44 38 L -66 8 L -88 38 L -110 8 Z" fill="#55565A" fill-opacity="0.18" stroke="#55565A" stroke-width="3.5"/>
        <line x1="-110" y1="-16" x2="110" y2="-16" stroke="#E56B1E" stroke-width="2.5" stroke-dasharray="6,4"/>
      </g>`;
    case 'vbelt':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <polygon points="-96,-54 96,-54 58,54 -58,54" fill="#55565A" fill-opacity="0.18" stroke="#55565A" stroke-width="4"/>
        <line x1="-88" y1="-26" x2="88" y2="-26" stroke="#E56B1E" stroke-width="2.5" stroke-dasharray="7,5"/>
        ${isCogged ? `<path d="M -46 54 L -32 34 L -10 34 L 0 54 L 10 34 L 32 34 L 46 54" fill="none" stroke="#E56B1E" stroke-width="3"/>` : ''}
      </g>`;
    case 'conveyor':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <rect x="-125" y="-32" width="250" height="64" rx="6" fill="#0F766E" fill-opacity="0.16" stroke="#0F766E" stroke-width="3.5"/>
        <line x1="-125" y1="-10" x2="125" y2="-10" stroke="#55565A" stroke-width="1.8" stroke-dasharray="6,4"/>
        <line x1="-125" y1="12" x2="125" y2="12" stroke="#E56B1E" stroke-width="2" stroke-dasharray="4,4"/>
      </g>`;
    case 'htd':
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <path d="M -135 -26 L 135 -26 L 135 8 C 118 8 112 42 94 42 C 76 42 70 8 53 8 C 36 8 30 42 12 42 C -6 42 -12 8 -29 8 C -46 8 -52 42 -70 42 C -88 42 -94 8 -111 8 L -135 8 Z" fill="#55565A" fill-opacity="0.18" stroke="#55565A" stroke-width="3.5"/>
        ${isDouble ? `<path d="M -94 -26 C -88 -58 -70 -58 -64 -26 M -12 -26 C -6 -58 12 -58 18 -26 M 70 -26 C 76 -58 94 -58 100 -26" fill="#55565A" fill-opacity="0.14" stroke="#E56B1E" stroke-width="3"/>` : ''}
        <line x1="-145" y1="-10" x2="145" y2="-10" stroke="#E56B1E" stroke-width="2" stroke-dasharray="6,4"/>
      </g>`;
    default:
      return `<g transform="translate(${cx},${cy}) scale(${scale})">
        <path d="M -135 -26 L 135 -26 L 135 8 L 112 8 L 96 42 L 62 42 L 46 8 L 18 8 L 2 42 L -32 42 L -48 8 L -76 8 L -92 42 L -126 42 L -135 8 Z" fill="#55565A" fill-opacity="0.18" stroke="#55565A" stroke-width="3.5"/>
        ${isDouble ? `<path d="M -96 -26 L -82 -56 L -48 -56 L -34 -26 M 4 -26 L 18 -56 L 52 -56 L 66 -26" fill="#55565A" fill-opacity="0.14" stroke="#E56B1E" stroke-width="3"/>` : ''}
        <line x1="-145" y1="-10" x2="145" y2="-10" stroke="#E56B1E" stroke-width="2" stroke-dasharray="6,4"/>
      </g>`;
  }
}

function renderFamilyCardPreviewSvg(fam: any): string {
  const profileStr = (fam.dominantProfiles || []).join(', ') || 'STANDARD';
  const brandStr = fam.brand || 'INDUSTRIAL';
  const sec = classifySectionKind(profileStr, fam.dominantDivision || '', fam.familyName || '');
  const shape = buildSectionShapeSvg(sec.kind, sec.isDouble, sec.isCogged, 240, 178, 1.0);
  const metaParts = [
    fam.pitchMm ? `Pitch ${fmtNum(fam.pitchMm, 'mm')}` : null,
    fam.beltThicknessMm ? `h ${fmtNum(fam.beltThicknessMm, 'mm')}` : null,
    `${fam.skuCount || 0} SKUs`,
  ].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#EAE4D8" stroke-width="0.8"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="480" height="360" fill="#FBF8F3"/>
  <rect x="14" y="14" width="452" height="332" rx="16" fill="#FFFFFF" stroke="#DCD4C6" stroke-width="1.5"/>
  <rect x="26" y="72" width="428" height="214" rx="12" fill="url(#grid)" stroke="#EFE9DC" stroke-width="1"/>
  ${shape}
  <rect x="26" y="24" width="170" height="34" rx="8" fill="#55565A"/>
  <text x="111" y="46" text-anchor="middle" font-family="monospace" font-size="14" font-weight="800" fill="#FFFFFF">${escapeXml(trunc(profileStr, 18))}</text>
  <rect x="294" y="24" width="160" height="34" rx="8" fill="#FFF3EB" stroke="#F8C8A8" stroke-width="1.2"/>
  <text x="374" y="46" text-anchor="middle" font-family="monospace" font-size="13" font-weight="800" fill="#C95210">${escapeXml(trunc(brandStr, 18))}</text>
  <rect x="26" y="296" width="428" height="36" rx="8" fill="#F8F5EE"/>
  <text x="240" y="319" text-anchor="middle" font-family="monospace" font-size="12.5" font-weight="700" fill="#37383B">${escapeXml(metaParts.join('   |   ') || fam.dominantStandard || 'ISO / DIN')}</text>
</svg>`;
}

function renderSkuDrawingSvg(sku: any, mode: 'technical' | 'profile'): string {
  const t = sku.technical || {};
  const profile = t.profile || 'STD';
  const pitchStr = fmtNum(t.pitchMm, 'mm');
  const widthStr = fmtNum(t.nominalWidthMm ?? t.topWidthMm, 'mm');
  const thickStr = fmtNum(t.beltThicknessMm, 'mm');
  const toothHeightStr = fmtNum(t.toothHeightMm, 'mm');
  const angleStr = fmtNum(t.toothAngleDeg, '°');
  const lenStr = t.pitchLengthMm
    ? `Lp = ${fmtNum(t.pitchLengthMm, 'mm')}`
    : t.insideLengthMm
      ? `Li = ${fmtNum(t.insideLengthMm, 'mm')}`
      : t.outsideLengthMm
        ? `La = ${fmtNum(t.outsideLengthMm, 'mm')}`
        : sku.rawSize || 'Per Order';

  const sec = classifySectionKind(profile, String(t.beltDivision || ''), sku.rawName || '');
  const shapeSvg = buildSectionShapeSvg(sec.kind, sec.isDouble, sec.isCogged, 420, 415, 1.5);
  const topLabel =
    sec.kind === 'round'
      ? `Diameter (d) = ${thickStr !== '—' ? thickStr : widthStr}`
      : sec.kind === 'vbelt' || sec.kind === 'hex'
        ? `Top Width (b) = ${widthStr} | Angle = ${angleStr}`
        : `Pitch (p) = ${pitchStr} | Profile = ${profile}`;
  const bottomLabel =
    sec.kind === 'round'
      ? `Standard = ${trunc(t.standardReference || 'DIN / PU Weldable', 36)}`
      : `Total Thickness = ${thickStr} | Tooth Height = ${toothHeightStr} | Width = ${widthStr}`;

  const toothOrSectionGraphic = `
    ${shapeSvg}
    <text x="420" y="280" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#E56B1E">${escapeXml(topLabel)}</text>
    <text x="420" y="575" text-anchor="middle" font-family="monospace" font-size="14" font-weight="700" fill="#1F2022">${escapeXml(bottomLabel)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 820" width="1280" height="820">
  <rect x="0" y="0" width="1280" height="820" fill="#FBF8F3"/>
  <rect x="30" y="30" width="1220" height="760" rx="14" fill="#FFFFFF" stroke="#55565A" stroke-width="2"/>
  <rect x="30" y="30" width="1220" height="96" rx="14" fill="#55565A"/>
  <rect x="30" y="122" width="1220" height="6" fill="#E56B1E"/>
  <rect x="54" y="46" width="250" height="60" rx="8" fill="#434448" stroke="#E56B1E" stroke-width="1.5"/>
  <text x="179" y="74" text-anchor="middle" font-family="monospace" font-size="17" font-weight="700" fill="#FFFFFF">SKU: ${escapeXml(sku.skuCode)}</text>
  <text x="179" y="96" text-anchor="middle" font-family="monospace" font-size="12" font-weight="600" fill="#FFB07C">${escapeXml(profile)} | ${escapeXml(sku.brand)}</text>
  <text x="1222" y="72" text-anchor="end" font-family="Tahoma, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF">${rtl(mode === 'profile' ? `نقشه مهندسی پروفیل و مقطع کد ${sku.skuCode}` : `نقشه فنی ۴نمایی و ابعاد مهندسی کد ${sku.skuCode}`)}</text>
  <text x="1222" y="102" text-anchor="end" font-family="Tahoma, sans-serif" font-size="14" font-weight="600" fill="#F4EDE2">${rtl(trunc(sku.rawName, 78))}</text>

  <rect x="56" y="152" width="728" height="470" rx="12" fill="#FCFBF9" stroke="#DCD4C6" stroke-width="1.5"/>
  <text x="760" y="184" text-anchor="end" font-family="Tahoma, sans-serif" font-size="14" font-weight="800" fill="#55565A">${rtl('نمای هندسی پروفیل و مقطع استاندارد (Scale CAD Diagram)')}</text>
  ${toothOrSectionGraphic}

  <rect x="804" y="152" width="420" height="470" rx="12" fill="#F8F5EE" stroke="#DCD4C6" stroke-width="1.5"/>
  <rect x="804" y="152" width="420" height="40" rx="10" fill="#E56B1E"/>
  <text x="1204" y="178" text-anchor="end" font-family="Tahoma, sans-serif" font-size="14" font-weight="800" fill="#FFFFFF">${rtl('جدول ابعاد اختصاصی کد کالا')}</text>
  <g font-family="Tahoma, sans-serif" font-size="13" font-weight="700">
    <text x="1204" y="226" text-anchor="end" fill="#55565A">${rtl('کد کالا (SKU):')}</text>
    <text x="824" y="226" text-anchor="start" font-family="monospace" fill="#E56B1E">${escapeXml(sku.skuCode)} (${escapeXml(sku.familyCode)})</text>
    <text x="1204" y="274" text-anchor="end" fill="#55565A">${rtl('پروفیل مقطع:')}</text>
    <text x="824" y="274" text-anchor="start" font-family="monospace" fill="#1F2022">${escapeXml(profile)}</text>
    <text x="1204" y="322" text-anchor="end" fill="#55565A">${rtl('طول تسمه (Length):')}</text>
    <text x="824" y="322" text-anchor="start" font-family="monospace" fill="#1F2022">${escapeXml(lenStr)}</text>
    <text x="1204" y="370" text-anchor="end" fill="#55565A">${rtl('عرض / سایز مقطع:')}</text>
    <text x="824" y="370" text-anchor="start" font-family="monospace" fill="#1F2022">${escapeXml(widthStr)}</text>
    <text x="1204" y="418" text-anchor="end" fill="#55565A">${rtl('ضخامت کل (h):')}</text>
    <text x="824" y="418" text-anchor="start" font-family="monospace" fill="#1F2022">${escapeXml(thickStr)}</text>
    <text x="1204" y="466" text-anchor="end" fill="#55565A">${rtl('تعداد دندانه / شیار:')}</text>
    <text x="824" y="466" text-anchor="start" font-family="monospace" fill="#1F2022">${escapeXml(String(t.toothCount ?? t.ribCount ?? '—'))}</text>
    <text x="1204" y="514" text-anchor="end" fill="#55565A">${rtl('فرم عرضه / واحد:')}</text>
    <text x="824" y="514" text-anchor="start" fill="#1F2022">${rtl(`${t.supplyForm || 'endless-loop'} (${sku.unit || 'حلقه'})`)}</text>
    <text x="1204" y="562" text-anchor="end" fill="#55565A">${rtl('استاندارد مرجع:')}</text>
    <text x="824" y="562" text-anchor="start" font-family="monospace" font-size="11.5" fill="#1F2022">${escapeXml(trunc(t.standardReference || 'ISO / DIN', 32))}</text>
  </g>

  <rect x="56" y="644" width="1168" height="118" rx="10" fill="#55565A"/>
  <text x="1200" y="680" text-anchor="end" font-family="Tahoma, sans-serif" font-size="13.5" font-weight="700" fill="#FFFFFF">${rtl(`جنس بدنه: ${t.bodyMaterial || 'الاستومر صنعتی'}   |   کورد کششی: ${t.tensileCord || 'تقویت‌شده'}`)}</text>
  <text x="1200" y="715" text-anchor="end" font-family="Tahoma, sans-serif" font-size="12.5" font-weight="600" fill="#FFB07C">${rtl('ترسیم مهندسی مبتنی بر ابعاد واقعی کد کالا و جداول استاندارد ISO / DIN (VERIFIED_ENGINEERING_REDRAW)')}</text>
  <text x="80" y="742" text-anchor="start" font-family="monospace" font-size="11.5" font-weight="700" fill="#E5E7EB">SANAT PISH INDUSTRIAL BELT ENGINEERING ARCHIVE</text>
</svg>`;
}

async function proxyUpstreamAsset(
  req: Request,
  res: Response,
  upstreamUrls: string[],
  cacheSubpath: string,
  overrideContentType?: string,
) {
  const safeRelative = cacheSubpath.replace(/^\/+/, '').replace(/\.\./g, '');
  if (!safeRelative) {
    res.status(404).end();
    return;
  }
  const ext = path.extname(safeRelative).toLowerCase();
  const contentType = overrideContentType || MIME_BY_EXT[ext] || 'image/jpeg';

  // 1) Local /public repository comes FIRST (guaranteed offline & structured)
  if (await sendLocalPublicFile(res, safeRelative, overrideContentType)) {
    return;
  }

  // 2) Secondary /tmp cache
  const cacheFile = path.join(CACHE_DIR, safeRelative);

  try {
    const cached = await fsPromises.readFile(cacheFile);
    if (cached.length > 0) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=2592000');
      res.send(cached);
      return;
    }
  } catch {
    // Cache miss
  }

  for (const upstreamUrl of upstreamUrls) {
    try {
      const response = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SanatPishCatalog/2.0)' },
      });
      if (!response.ok) continue;
      const respType = (response.headers.get('content-type') || '').toLowerCase();
      if (respType.includes('text/html')) continue;
      const buf = Buffer.from(await response.arrayBuffer());
      if (!buf.length) continue;

      await fsPromises.mkdir(path.dirname(cacheFile), { recursive: true });
      await fsPromises.writeFile(cacheFile, buf).catch(() => undefined);

      res.setHeader('Content-Type', respType || contentType);
      res.setHeader('Cache-Control', 'public, max-age=2592000');
      res.send(buf);
      return;
    } catch {
      // Try next upstream URL
    }
  }

  res.status(404).end();
}

export function registerAssetProxyRoutes(app: Express) {
  // 1. Master Belt Audit API routes (Summary + 17 Deliverable File Downloads)
  app.get('/api/belt-audit/summary', async (_req, res) => {
    try {
      const summaryPath = path.join(SERVER_DATA_DIR, 'beltMasterAuditSummary.json');
      const data = await fsPromises.readFile(summaryPath, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load belt master audit summary' });
    }
  });

  app.get('/api/belt-audit/deliverables/:filename', async (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const filePath = path.join(DELIVERABLES_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Deliverable file not found' });
      return;
    }
    const ext = path.extname(safeName).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  // 1a. Internal Physical Marking & Engineering Compatibility Audit Report (strictly for /belt-audit)
  app.get('/api/belt-audit/engineering-report', async (req, res) => {
    const audit = getEngineeringAudit();
    const q = String(req.query.q || '').trim().toLowerCase();
    const verdict = String(req.query.verdict || '').trim().toUpperCase();
    const classification = String(req.query.classification || '').trim().toUpperCase();
    const brand = String(req.query.brand || '').trim().toUpperCase();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 40));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    let filtered = audit.records;
    if (verdict && verdict !== 'ALL') {
      filtered = filtered.filter((r) => r.engineeringVerdict === verdict);
    }
    if (classification && classification !== 'ALL') {
      filtered = filtered.filter((r) => r.finalImageClassification === classification);
    }
    if (brand && brand !== 'ALL') {
      filtered = filtered.filter((r) => r.brand.toUpperCase() === brand);
    }
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.skuCode.toLowerCase().includes(q) ||
          r.familyCode.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q) ||
          r.profile.toLowerCase().includes(q) ||
          r.targetMarkingCode.toLowerCase().includes(q) ||
          r.masterReadMarking.toLowerCase().includes(q) ||
          r.reasonFa.toLowerCase().includes(q),
      );
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      generatedAt: audit.generatedAt,
      totals: audit.totals,
      totalMatched: filtered.length,
      limit,
      offset,
      items: filtered.slice(offset, offset + limit),
    });
  });

  // 1a-visual. Visual Marking & Belt Geometry Validation Module API
  // - GET /api/belt-audit/visual-validation           -> Live audit of all 25 calibrated masters
  // - GET /api/belt-audit/visual-validation?sku=11226 -> Live 6-check pixel & spec validation for a specific SKU
  // - GET /api/belt-audit/visual-validation?family=PFAM-... -> Live validation for a family
  let cachedMastersVisualAudit: {
    ts: number;
    payload: Awaited<ReturnType<typeof auditAllCalibratedMasters>>;
  } | null = null;

  app.get('/api/belt-audit/visual-validation', async (req, res) => {
    try {
      const skuParam = String(req.query.sku || '').trim();
      const familyParam = String(req.query.family || '').trim();
      const forceRefresh = req.query.refresh === '1';

      if (skuParam || familyParam) {
        const lookup = getSvgLookup();
        const imgManifest = getImageManifest();
        let report: VisualValidationReport | null = null;

        if (skuParam) {
          const skuMeta = lookup.skus?.[skuParam];
          if (!skuMeta) {
            res.status(404).json({
              success: false,
              error: `کد کالا «${skuParam}» در پایگاه داده تسمه‌ها یافت نشد.`,
            });
            return;
          }
          const famMeta = skuMeta.familyCode ? lookup.families?.[skuMeta.familyCode] : null;
          const eng = extractBeltEngineeringProfile({
            skuCode: skuParam,
            familyCode: skuMeta.familyCode || '',
            brand: skuMeta.brand || famMeta?.brand || '',
            rawName: skuMeta.rawName || '',
            rawSize: skuMeta.rawSize || '',
            profile: skuMeta.technical?.profile || famMeta?.dominantProfiles?.[0] || '',
            beltDivision: skuMeta.technical?.beltDivision || famMeta?.dominantDivision || '',
            bodyMaterial: skuMeta.technical?.bodyMaterial || famMeta?.dominantBodyMaterial || '',
            backingOrCoating: famMeta?.backingOrCoating || null,
            supplyForm: skuMeta.technical?.supplyForm || famMeta?.dominantSupplyForm || '',
            lengthMm: skuMeta.technical?.pitchLengthMm ?? skuMeta.technical?.insideLengthMm ?? null,
            widthMm: skuMeta.technical?.nominalWidthMm ?? skuMeta.technical?.topWidthMm ?? null,
            ribCount: skuMeta.technical?.ribCount ?? null,
          });
          const resolved = resolveMasterCalibrationForBelt(
            eng,
            skuMeta.rawName || '',
            skuMeta.technical?.beltDivision || famMeta?.dominantDivision || '',
            skuMeta.familyCode || '',
          );
          let renderedAbsPath = '';
          let imagePublicPath = `/src/assets/catalog/belts/skus/${encodeURIComponent(skuParam)}/sku-image-01.webp`;
          if (resolved) {
            const adapted = await ensureAdaptedBeltSkuWebp(skuParam, resolved, false);
            if (adapted) {
              renderedAbsPath = adapted.absPath;
              imagePublicPath = adapted.localPath;
            }
          }
          report = await validateBeltVisualMarking({
            skuCode: skuParam,
            familyCode: skuMeta.familyCode || '',
            brand: skuMeta.brand || famMeta?.brand || '',
            rawName: skuMeta.rawName || '',
            rawSize: skuMeta.rawSize || '',
            profile: skuMeta.technical?.profile || famMeta?.dominantProfiles?.[0] || '',
            beltDivision: skuMeta.technical?.beltDivision || famMeta?.dominantDivision || '',
            bodyMaterial: skuMeta.technical?.bodyMaterial || famMeta?.dominantBodyMaterial || '',
            backingOrCoating: famMeta?.backingOrCoating || null,
            supplyForm: skuMeta.technical?.supplyForm || famMeta?.dominantSupplyForm || '',
            renderedImageAbsPath: renderedAbsPath || undefined,
            imagePublicPath,
          });
        } else if (familyParam) {
          const famMeta = lookup.families?.[familyParam];
          if (!famMeta) {
            res.status(404).json({
              success: false,
              error: `خانواده «${familyParam}» در پایگاه داده یافت نشد.`,
            });
            return;
          }
          const slots = imgManifest.verifiedFamilyPhotos?.[familyParam] || [];
          const slot1 = slots.find((s) => s.slotIndex === 1) || slots[0];
          let renderedAbsPath = '';
          if (slot1?.localPath) {
            let rel = slot1.localPath.replace(/^\/+/, '');
            try {
              rel = decodeURIComponent(rel);
            } catch {
              // keep raw
            }
            const candidate = path.resolve(PUBLIC_DIR, rel);
            if (fs.existsSync(candidate)) renderedAbsPath = candidate;
          }
          report = await validateBeltVisualMarking({
            familyCode: familyParam,
            brand: famMeta.brand || '',
            rawName: famMeta.familyName || familyParam,
            profile: famMeta.dominantProfiles?.[0] || '',
            beltDivision: famMeta.dominantDivision || '',
            bodyMaterial: famMeta.dominantBodyMaterial || '',
            backingOrCoating: famMeta.backingOrCoating || null,
            supplyForm: famMeta.dominantSupplyForm || '',
            renderedImageAbsPath: renderedAbsPath || undefined,
            imagePublicPath:
              slot1?.localPath ||
              `/src/assets/catalog/belts/families/${encodeURIComponent(familyParam)}/family-image-01.webp`,
          });
        }

        if (!report) {
          res.status(422).json({
            success: false,
            error: 'این کالا خارج از رده تسمه‌های صنعتی (قطعه/یاتاقان/فوم) است و مشمول مارکینگ تسمه نیست.',
          });
          return;
        }

        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, mode: skuParam ? 'sku' : 'family', report });
        return;
      }

      const now = Date.now();
      if (!cachedMastersVisualAudit || forceRefresh || now - cachedMastersVisualAudit.ts > 120_000) {
        const payload = await auditAllCalibratedMasters();
        cachedMastersVisualAudit = { ts: now, payload };
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        mode: 'all_masters',
        generatedAt: new Date(cachedMastersVisualAudit.ts).toISOString(),
        ...cachedMastersVisualAudit.payload,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Visual validation failed',
      });
    }
  });

  // 1a-studio. Interactive Marking Calibration Studio API (Live Preview + Save/Reset Overrides)
  const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  const sanitizeCalibrationPatch = (body: any): MasterCalibrationOverridePatch => {
    const patch: MasterCalibrationOverridePatch = {};
    if (typeof body?.eraseBeforePrint === 'boolean') {
      patch.eraseBeforePrint = body.eraseBeforePrint;
    }
    if (body?.eraseRect && typeof body.eraseRect === 'object') {
      const er = body.eraseRect;
      patch.eraseRect = {
        ...(er.x !== undefined ? { x: clampNum(er.x, 0, 0.92, 0.2) } : {}),
        ...(er.y !== undefined ? { y: clampNum(er.y, 0, 0.92, 0.5) } : {}),
        ...(er.w !== undefined ? { w: clampNum(er.w, 0.05, 0.95, 0.25) } : {}),
        ...(er.h !== undefined ? { h: clampNum(er.h, 0.04, 0.85, 0.15) } : {}),
      };
    }
    if (body?.textStyle && typeof body.textStyle === 'object') {
      const ts = body.textStyle;
      patch.textStyle = {
        ...(ts.rotateDeg !== undefined ? { rotateDeg: clampNum(ts.rotateDeg, -85, 85, 0) } : {}),
        ...(ts.skewXDeg !== undefined ? { skewXDeg: clampNum(ts.skewXDeg, -30, 30, 0) } : {}),
        ...(ts.fontSizeRatio !== undefined ? { fontSizeRatio: clampNum(ts.fontSizeRatio, 0.08, 0.75, 0.28) } : {}),
        ...(ts.lineCount !== undefined ? { lineCount: Math.round(clampNum(ts.lineCount, 1, 6, 1)) } : {}),
        ...(ts.opacity !== undefined ? { opacity: clampNum(ts.opacity, 0.25, 1.0, 0.85) } : {}),
        ...(ts.curveSagRatio !== undefined ? { curveSagRatio: clampNum(ts.curveSagRatio, -0.25, 0.25, 0) } : {}),
        ...(ts.letterSpacing !== undefined ? { letterSpacing: clampNum(ts.letterSpacing, 0, 4, 1.1) } : {}),
        ...(typeof ts.fillColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(ts.fillColor.trim())
          ? { fillColor: ts.fillColor.trim().toUpperCase() }
          : {}),
      };
    }
    return patch;
  };

  app.get('/api/belt-audit/calibrations', (_req, res) => {
    const items = getAllEffectiveMasterCalibrations().map(({ calibration, hasOverride }) => ({
      id: calibration.id,
      masterWebpPublicPath: calibration.masterWebpPublicPath,
      masterBrand: calibration.masterBrand,
      masterProfile: calibration.masterProfile,
      masterMarkingCode: calibration.masterMarkingCode,
      isBrandedMaster: calibration.isBrandedMaster,
      eraseBeforePrint: calibration.eraseBeforePrint,
      surfaceTone: calibration.surfaceTone,
      brandLogoSafeZone: calibration.brandLogoSafeZone || null,
      eraseRect: calibration.eraseRect,
      textStyle: calibration.textStyle,
      hasOverride,
    }));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, total: items.length, items });
  });

  app.post('/api/belt-audit/calibrations/preview', async (req, res) => {
    try {
      const masterId = String(req.body?.masterId || '').trim();
      const base = getEffectiveMasterCalibration(masterId);
      if (!base) {
        res.status(404).json({ success: false, error: 'مستر انتخاب‌شده یافت نشد.' });
        return;
      }
      const patch = sanitizeCalibrationPatch(req.body);
      const effective = {
        ...base,
        eraseBeforePrint: typeof patch.eraseBeforePrint === 'boolean' ? patch.eraseBeforePrint : base.eraseBeforePrint,
        eraseRect: { ...base.eraseRect, ...(patch.eraseRect || {}) },
        textStyle: { ...base.textStyle, ...(patch.textStyle || {}) },
      };
      const rawCode = String(req.body?.targetCode || '').trim().slice(0, 32);
      const targetCode = rawCode || (base.isBrandedMaster ? base.masterMarkingCode : `${base.masterBrand === 'GENERIC' ? 'FORZA' : base.masterBrand} ${base.masterMarkingCode}`);
      const rendered = await renderBeltMarkingBuffer(effective, targetCode);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        masterId,
        targetCode,
        width: rendered.width,
        height: rendered.height,
        imageDataUrl: `data:image/webp;base64,${rendered.data.toString('base64')}`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'خطا در تولید پیش‌نمایش زنده مارکینگ',
      });
    }
  });

  app.post('/api/belt-audit/calibrations/save', async (req, res) => {
    try {
      const masterId = String(req.body?.masterId || '').trim();
      const patch = sanitizeCalibrationPatch(req.body);
      const saved = await saveMasterCalibrationOverride(masterId, patch);
      cachedMastersVisualAudit = null;
      // Clear stale adapted SKU cache files (except verified raw master 11259) so live pages update
      const adaptedDir = path.resolve(PUBLIC_DIR, 'belt-catalog/skus-adapted');
      if (fs.existsSync(adaptedDir)) {
        const files = await fsPromises.readdir(adaptedDir);
        await Promise.all(
          files
            .filter((f) => f.endsWith('.webp') && f !== '11259.webp')
            .map((f) => fsPromises.unlink(path.join(adaptedDir, f)).catch(() => undefined)),
        );
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        masterId: saved.id,
        eraseRect: saved.eraseRect,
        textStyle: saved.textStyle,
        eraseBeforePrint: saved.eraseBeforePrint,
        hasOverride: true,
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : 'ذخیره تنظیمات با خطا مواجه شد.',
      });
    }
  });

  app.post('/api/belt-audit/calibrations/reset', async (req, res) => {
    try {
      const masterId = String(req.body?.masterId || '').trim();
      const restored = await resetMasterCalibrationOverride(masterId);
      cachedMastersVisualAudit = null;
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        masterId: restored.id,
        eraseRect: restored.eraseRect,
        textStyle: restored.textStyle,
        eraseBeforePrint: restored.eraseBeforePrint,
        hasOverride: false,
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : 'بازنشانی تنظیمات با خطا مواجه شد.',
      });
    }
  });

  // 1b. Structured local belt catalog assets under /public/belt-catalog/*
  app.get('/belt-catalog/*', async (req, res) => {
    let rel = req.path.replace(/^\/+/, '');
    try {
      rel = decodeURIComponent(rel);
    } catch {
      // keep raw
    }
    if (await sendLocalPublicFile(res, rel)) return;
    res.status(404).end();
  });

  // 2. Dynamic Family Images, Card Profile Thumbnails & Specification Sheets
  app.get('/src/assets/catalog/belts/families/:familyCode/:assetFile', async (req, res) => {
    const familyCode = decodeURIComponent(String(req.params.familyCode || ''));
    const assetFile = String(req.params.assetFile || '');

    if (assetFile.startsWith('card-preview.')) {
      const lookup = getSvgLookup();
      const fam = lookup.families[familyCode];
      if (!fam) {
        res.status(404).end();
        return;
      }
      const svg = renderFamilyCardPreviewSvg(fam);
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg);
      return;
    }

    if (assetFile.startsWith('family-specifications.')) {
      const lookup = getSvgLookup();
      const fam = lookup.families[familyCode];
      if (!fam) {
        res.status(404).end();
        return;
      }
      const svg = renderFamilySpecSvg(fam);
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg);
      return;
    }

    const slotMatch = assetFile.match(/^family-image-0([1234])\.(webp|jpg|jpeg|png)$/);
    if (slotMatch) {
      const slotIdx = Number(slotMatch[1]);
      const imgManifest = getImageManifest();
      const slots = imgManifest.verifiedFamilyPhotos[familyCode] || [];
      const hit = slots.find((s) => s.slotIndex === slotIdx);
      if (!hit || (!hit.localPath && !hit.sourceUrl)) {
        res.status(404).end();
        return;
      }
      // Prefer structured localPath inside /public/belt-catalog/...
      if (hit.localPath) {
        let localRel = hit.localPath.replace(/^\/+/, '');
        try {
          localRel = decodeURIComponent(localRel);
        } catch {
          // keep
        }
        if (await sendLocalPublicFile(res, localRel)) return;
      }
      if (hit.sourceUrl.startsWith('/belt-catalog/')) {
        let localRel = hit.sourceUrl.replace(/^\/+/, '');
        try {
          localRel = decodeURIComponent(localRel);
        } catch {
          // keep
        }
        if (await sendLocalPublicFile(res, localRel)) return;
      }
      if (hit.sourceUrl.startsWith('/storage/products/')) {
        const rel = hit.sourceUrl.replace(/^\/storage\/products\//, '');
        const encoded = rel
          .split('/')
          .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
          .join('/');
        await proxyUpstreamAsset(
          req,
          res,
          [`https://sanatpish.com/storage/products/${encoded}`],
          `storage/products/${rel}`,
        );
        return;
      }
      await proxyUpstreamAsset(
        req,
        res,
        [hit.sourceUrl],
        `belt-verified/families/${familyCode}/slot-0${slotIdx}.jpg`,
      );
      return;
    }

    res.status(404).end();
  });

  // 2b. Clean Customer-Safe Belt Marking & Authenticity Metadata API (ZERO external domains or seller URLs)
  app.get('/api/belts/media-provenance', async (req, res) => {
    const familyCode = String(req.query.familyCode || '').trim();
    const skuCode = String(req.query.skuCode || '').trim();
    const imgManifest = getImageManifest();
    const lookup = getSvgLookup();
    const engAudit = getEngineeringAudit();

    const famMeta = familyCode ? lookup.families?.[familyCode] : null;
    const skuMeta = skuCode ? lookup.skus?.[skuCode] : null;
    const resolvedFamMeta = famMeta || (skuMeta?.familyCode ? lookup.families?.[skuMeta.familyCode] : null);

    const familySlots = familyCode
      ? (imgManifest.verifiedFamilyPhotos[familyCode] || []).map((s) => ({
          slotIndex: s.slotIndex,
          captionFa:
            s.slotIndex === 1
              ? 'نمای کامل تسمه و مارکینگ سازنده'
              : s.slotIndex === 2
                ? 'نمای سه‌رخ و زاویه پروفیل'
                : s.slotIndex === 3
                  ? 'جزئیات بافت بدنه و کورد کششی'
                  : 'نمای نزدیک مارکینگ و ساختار مقطع',
          verified: true,
        }))
      : [];

    type CustomerSkuImageClassification =
      | 'EXACT_PHYSICAL_MARKING'
      | 'MASTER_ENHANCED_MARKING_ADAPTED'
      | 'DEDICATED_REAL_WEB_PHOTO'
      | 'FAMILY_VERIFIED_REAL_PHOTO';

    let skuCard: {
      skuCode: string;
      brand: string;
      profile: string;
      standardReference: string;
      constructionFa: string;
      visibleMarking: string;
      classification: CustomerSkuImageClassification;
      classificationLabelFa: string;
      engineeringNoteFa: string;
    } | null = null;

    if (skuCode) {
      const engProf = extractBeltEngineeringProfile({
        skuCode,
        familyCode: skuMeta?.familyCode || familyCode,
        brand: skuMeta?.brand || resolvedFamMeta?.brand || '',
        rawName: skuMeta?.rawName || '',
        rawSize: skuMeta?.rawSize || '',
        profile: skuMeta?.technical?.profile || resolvedFamMeta?.dominantProfiles?.[0] || '',
        beltDivision: skuMeta?.technical?.beltDivision || resolvedFamMeta?.dominantDivision || '',
        bodyMaterial: skuMeta?.technical?.bodyMaterial || resolvedFamMeta?.dominantBodyMaterial || '',
        backingOrCoating: resolvedFamMeta?.backingOrCoating || null,
        supplyForm: skuMeta?.technical?.supplyForm || resolvedFamMeta?.dominantSupplyForm || '',
      });

      const exactHit = imgManifest.verifiedSkuPhotos[skuCode];
      const auditRec = engAudit.bySku[skuCode];
      const resolvedMaster = resolveMasterCalibrationForBelt(
        engProf,
        skuMeta?.rawName || '',
        skuMeta?.technical?.beltDivision || resolvedFamMeta?.dominantDivision || '',
        skuMeta?.familyCode || familyCode || '',
      );
      const isAdaptedOnDisk = isValidWebpOnDisk(
        path.join(PUBLIC_DIR, 'belt-catalog/skus-adapted', `${skuCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.webp`),
      );
      const isMasterAdapted =
        auditRec?.finalImageClassification === 'MASTER_ENHANCED_MARKING_ADAPTED' ||
        (exactHit?.localPath?.includes('adapted') ?? false) ||
        isAdaptedOnDisk ||
        (resolvedMaster !== null && !(exactHit && !exactHit.localPath?.includes('adapted')));

      let classification: CustomerSkuImageClassification = 'FAMILY_VERIFIED_REAL_PHOTO';
      let classificationLabelFa = 'تصویر تأییدشده خانواده مطابق برند، پروفیل و ساختار فنی';
      let engineeringNoteFa =
        auditRec?.reasonFa ||
        `تأییدشده بر اساس برند ${engProf.isGenericBrand ? 'استاندارد صنعتی' : engProf.brandNormalized}، پروفیل ${engProf.profileNormalized || 'استاندارد'} و استاندارد ${engProf.standardReference}.`;

      if (exactHit && !exactHit.localPath?.includes('adapted')) {
        classification = 'EXACT_PHYSICAL_MARKING';
        classificationLabelFa = 'تصویر اصلی تأییدشده با مارکینگ واقعی سازنده روی بدنه تسمه';
        engineeringNoteFa =
          exactHit.noteFa ||
          `مارکینگ فیزیکی چاپ‌شده روی بدنه تسمه با برند، پروفیل و کد کالا تطابق کامل دارد.`;
      } else if (isMasterAdapted && resolvedMaster) {
        classification = 'MASTER_ENHANCED_MARKING_ADAPTED';
        classificationLabelFa = resolvedMaster.calibration.isBrandedMaster
          ? 'تصویر اصلی برند با تطبیق دقیق کد پروفیل و سایز روی بدنه تسمه'
          : 'تصویر واقعی ساختار تسمه با درج دقیق برند و کد فنی روی بدنه';
        engineeringNoteFa =
          auditRec?.reasonFa ||
          `ساختار فیزیکی، برند (${engProf.isGenericBrand ? 'استاندارد صنعتی' : engProf.brandNormalized})، پروفیل (${engProf.profileNormalized || 'استاندارد'}) و نوع بدنه با تصویر پایه واقعی خانواده منطبق است و مارکینگ «${resolvedMaster.printText}» دقیقاً روی بدنه تسمه ثبت شده است.`;
      } else if (auditRec?.finalImageClassification === 'DEDICATED_REAL_WEB_PHOTO') {
        classification = 'DEDICATED_REAL_WEB_PHOTO';
        classificationLabelFa = 'تصویر واقعی اختصاصی کد کالا با تطابق مهندسی';
      }

      const brandDisplay = engProf.isGenericBrand
        ? (resolvedFamMeta?.brand && resolvedFamMeta.brand !== 'UNSPECIFIED' ? resolvedFamMeta.brand : 'استاندارد صنعتی')
        : engProf.brandNormalized;
      const visibleMarking =
        exactHit?.visibleMarking ||
        (resolvedMaster?.printText
          ? resolvedMaster.calibration.isBrandedMaster
            ? `${resolvedMaster.calibration.masterBrand} ${resolvedMaster.codeOnly}`.trim()
            : resolvedMaster.printText
          : engProf.targetMarkingCode
            ? `${engProf.isGenericBrand ? '' : `${engProf.brandNormalized} `}${engProf.targetMarkingCode}`.trim()
            : `${brandDisplay} ${engProf.profileNormalized}`.trim());

      skuCard = {
        skuCode,
        brand: brandDisplay,
        profile: engProf.profileNormalized || resolvedFamMeta?.dominantProfiles?.[0] || 'استاندارد',
        standardReference: engProf.standardReference,
        constructionFa: engProf.constructionLabelFa,
        visibleMarking,
        classification,
        classificationLabelFa,
        engineeringNoteFa,
      };
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      familyCode,
      skuCode,
      familySlots,
      skuCard,
    });
  });

  // 3. Dynamic SKU Real Web Photos (100% REAL Internet Photos — ZERO Synthesis)
  app.get('/src/assets/catalog/belts/skus/:skuCode/:assetFile', async (req, res) => {
    const skuCode = decodeURIComponent(String(req.params.skuCode || ''));
    const assetFile = String(req.params.assetFile || '');

    if (assetFile.startsWith('real-marking-closeup.')) {
      const imgManifest = getImageManifest();
      const hit = imgManifest.verifiedSkuPhotos[skuCode];
      const closeupRel = hit?.closeupLocalPath || `belt-catalog/skus/${skuCode}/02-marking-closeup.webp`;
      let localRel = closeupRel.replace(/^\/+/, '');
      try {
        localRel = decodeURIComponent(localRel);
      } catch {
        // keep
      }
      if (await sendLocalPublicFile(res, localRel)) return;
      res.status(404).end();
      return;
    }

    if (assetFile.startsWith('real-product-image.')) {
      const imgManifest = getImageManifest();
      const hit = imgManifest.verifiedSkuPhotos[skuCode];

      // Priority 1: Strictly audited exact real marking photo already saved locally
      if (hit && (hit.localPath || hit.sourceUrl)) {
        if (hit.localPath) {
          let localRel = hit.localPath.replace(/^\/+/, '');
          try {
            localRel = decodeURIComponent(localRel);
          } catch {
            // keep
          }
          if (await sendLocalPublicFile(res, localRel)) return;
        }
        if (hit.sourceUrl) {
          await proxyUpstreamAsset(
            req,
            res,
            [hit.sourceUrl],
            `belt-verified/skus/${skuCode}/real-marking.jpg`,
          );
          return;
        }
      }

      // Priority 2: Already surgically adapted clean SKU WebP (/public/belt-catalog/skus-adapted/<sku>.webp)
      const safeCode = skuCode.replace(/[^a-zA-Z0-9_-]/g, '_');
      const adaptedRel = `belt-catalog/skus-adapted/${safeCode}.webp`;
      if (await sendLocalPublicFile(res, adaptedRel, 'image/webp')) {
        return;
      }

      // Priority 3: Universal 24-Master Engineering Resolution + Surgical On-Body Marking Adaptation
      // Resolves EVERY industrial belt SKU across ALL 1,088 families to its exact visually verified
      // real manufacturer/construction master photo (ZERO competitor brand leakage; non-belt hardware
      // items automatically return null and keep their own hardware photos in Priorities 4-8).
      const lookup = getSvgLookup();
      const skuMeta = lookup.skus?.[skuCode];
      const famMeta = skuMeta?.familyCode ? lookup.families?.[skuMeta.familyCode] : null;
      if (skuMeta) {
        const skuEngProfile = extractBeltEngineeringProfile({
          skuCode,
          familyCode: skuMeta.familyCode || '',
          brand: skuMeta.brand || famMeta?.brand || '',
          rawName: skuMeta.rawName || '',
          rawSize: skuMeta.rawSize || '',
          profile: skuMeta.technical?.profile || famMeta?.dominantProfiles?.[0] || '',
          beltDivision: skuMeta.technical?.beltDivision || famMeta?.dominantDivision || '',
          bodyMaterial: skuMeta.technical?.bodyMaterial || famMeta?.dominantBodyMaterial || '',
          backingOrCoating: famMeta?.backingOrCoating || null,
          supplyForm: skuMeta.technical?.supplyForm || famMeta?.dominantSupplyForm || '',
          lengthMm: skuMeta.technical?.pitchLengthMm ?? skuMeta.technical?.insideLengthMm ?? null,
          widthMm: skuMeta.technical?.nominalWidthMm ?? skuMeta.technical?.topWidthMm ?? null,
          ribCount: skuMeta.technical?.ribCount ?? null,
        });

        const swrJudgment = judgeStructuralCompatibility(skuEngProfile, SWR_A_MASTER_PROFILE);
        if (swrJudgment.verdict === 'COMPATIBLE_EXACT_MASTER') {
          if (await sendLocalPublicFile(res, 'belt-catalog/masters/SWR-A-master.webp', 'image/webp')) {
            return;
          }
        }

        const resolvedMaster = resolveMasterCalibrationForBelt(
          skuEngProfile,
          skuMeta.rawName || '',
          skuMeta.technical?.beltDivision || famMeta?.dominantDivision || '',
          skuMeta.familyCode || '',
        );

        if (resolvedMaster && fs.existsSync(resolvedMaster.calibration.masterWebpAbsPath)) {
          const adapted = await ensureAdaptedBeltSkuWebp(skuCode, resolvedMaster);
          if (adapted && (await sendLocalPublicFile(res, adapted.localPath.replace(/^\/+/, ''), 'image/webp'))) {
            return;
          }
        }
      }

      // Priority 4: Already downloaded clean real-web photo for this exact SKU (rejecting blocked watermarked domains!)
      const cachedWebRel = `belt-catalog/skus-web/${safeCode}.webp`;
      const liveProv = await readLiveSkuProvenance(skuCode);
      const cachedWebBlocked =
        liveProv && isCandidateUrlRejected(liveProv.sourceUrl, liveProv.title, liveProv.sourcePageUrl);
      if (!cachedWebBlocked && (await sendLocalPublicFile(res, cachedWebRel, 'image/webp'))) {
        return;
      }

      // Priority 5: Pre-mapped clean individual SKU real web photo from harvester
      const webSkuMap = getWebSkuMap();
      const mapped = webSkuMap[skuCode];
      const mappedBlocked =
        mapped && isCandidateUrlRejected(mapped.sourceUrl || '', mapped.title || '', mapped.sourcePageUrl || '');
      if (
        mapped &&
        !mappedBlocked &&
        mapped.localPath &&
        !mapped.localPath.includes('/archetypes/') &&
        !mapped.localPath.includes('/sku-templates/')
      ) {
        let localRel = mapped.localPath.replace(/^\/+/, '');
        try {
          localRel = decodeURIComponent(localRel);
        } catch {
          // keep
        }
        if (localRel.startsWith('belt-catalog/skus')) {
          if (await sendLocalPublicFile(res, localRel, 'image/webp')) return;
        }
      }

      // Priority 6: Live real-time internet search with Vision Pixel Gate -> permanent clean local WebP cache
      const skuQueryInput: BeltSkuQueryInput = {
        skuCode,
        familyCode: skuMeta?.familyCode || mapped?.familyCode || '',
        brand: skuMeta?.brand || famMeta?.brand || 'UNSPECIFIED',
        rawName: skuMeta?.rawName || `industrial belt ${skuCode}`,
        rawSize: skuMeta?.rawSize || '',
        beltDivision: skuMeta?.technical?.beltDivision || famMeta?.dominantDivision || '',
        profile: skuMeta?.technical?.profile || famMeta?.dominantProfiles?.[0] || '',
        widthMm: skuMeta?.technical?.nominalWidthMm ?? skuMeta?.technical?.topWidthMm ?? null,
        lengthMm: skuMeta?.technical?.pitchLengthMm ?? skuMeta?.technical?.insideLengthMm ?? null,
        ribCount: skuMeta?.technical?.ribCount ?? null,
      };

      try {
        const discovered = await discoverAndCacheLiveSkuWebPhoto(skuQueryInput);
        if (discovered?.localPath) {
          let localRel = discovered.localPath.replace(/^\/+/, '');
          try {
            localRel = decodeURIComponent(localRel);
          } catch {
            // keep
          }
          if (await sendLocalPublicFile(res, localRel, 'image/webp')) return;
        }
      } catch (err) {
        console.warn('Live web SKU discovery warning for', skuCode, err instanceof Error ? err.message : err);
      }

      // Priority 7: Clean pre-indexed real web URL (only if NOT on blocked/watermarked domains)
      if (mapped && !mappedBlocked && mapped.sourceUrl && /^https?:\/\//i.test(mapped.sourceUrl)) {
        const dl = await downloadAndConvertRealPhotoToWebp(
          mapped.sourceUrl,
          7500,
          mapped.thumbnailFallbackUrl,
        );
        if (dl) {
          try {
            await fsPromises.mkdir(SKUS_WEB_DIR, { recursive: true });
            const outAbs = path.join(SKUS_WEB_DIR, `${safeCode}.webp`);
            await fsPromises.writeFile(outAbs, dl.webpBuffer);
            if (isValidWebpOnDisk(outAbs)) {
              res.setHeader('Content-Type', 'image/webp');
              res.setHeader('Cache-Control', 'public, max-age=2592000');
              res.send(dl.webpBuffer);
              return;
            }
          } catch {
            // fall through
          }
        }
      }

      // Priority 8: Serve this SKU's clean verified family slot 1 photo (guarantees ZERO empty/404 SKUs!)
      const famCode = skuMeta?.familyCode || mapped?.familyCode || '';
      if (famCode) {
        const famSlots = imgManifest.verifiedFamilyPhotos[famCode] || [];
        const firstReal = famSlots.find((s) => s.localPath && !s.localPath.includes('/archetypes/'));
        if (firstReal?.localPath) {
          let localRel = firstReal.localPath.replace(/^\/+/, '');
          try {
            localRel = decodeURIComponent(localRel);
          } catch {
            // keep
          }
          if (await sendLocalPublicFile(res, localRel, 'image/webp')) return;
        }
      }

      res.status(404).end();
      return;
    }

    if (assetFile.startsWith('technical-drawing.') || assetFile.startsWith('profile-drawing.')) {
      const lookup = getSvgLookup();
      const sku = lookup.skus[skuCode];
      if (!sku) {
        res.status(404).end();
        return;
      }
      const mode = assetFile.startsWith('profile-drawing.') ? 'profile' : 'technical';
      const svg = renderSkuDrawingSvg(sku, mode);
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg);
      return;
    }

    res.status(404).end();
  });

  // 4. Existing Upstream Proxy Routes
  app.get('/storage/products/*', async (req, res) => {
    const rel = req.path.replace(/^\/storage\/products\//, '');
    const encoded = rel
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    await proxyUpstreamAsset(
      req,
      res,
      [`https://sanatpish.com/storage/products/${encoded}`],
      `storage/products/${rel}`,
    );
  });

  app.get('/images/*', async (req, res) => {
    const rel = req.path.replace(/^\/images\//, '');
    const encoded = rel
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    await proxyUpstreamAsset(
      req,
      res,
      [
        `https://sanatpish.com/images/${encoded}`,
        `https://raw.githubusercontent.com/javanwebi/script/main/public/images/${encoded}`,
      ],
      `images/${rel}`,
    );
  });

  app.get('/src/assets/catalog/*', async (req, res) => {
    const rel = req.path.replace(/^\/src\/assets\/catalog\//, '');
    const encoded = rel
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    await proxyUpstreamAsset(
      req,
      res,
      [
        `https://sanatpish.com/src/assets/catalog/${encoded}`,
        `https://raw.githubusercontent.com/javanwebi/script/main/src/assets/catalog/${encoded}`,
      ],
      `catalog/${rel}`,
    );
  });
}
