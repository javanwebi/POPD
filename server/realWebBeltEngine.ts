import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { inspectBeltPhysicalMarking } from './beltVisionGate';

// =============================================================================
// Real Web Belt Image Discovery, Engineering Spec Translation, Filtering & Ranking
// ZERO image synthesis, ZERO SVG overlays, ZERO generic archetype fallbacks.
// Every accepted asset is a verified physical photograph fetched from the web.
// =============================================================================

export const REQUEST_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const MIN_PHOTO_WIDTH = 260;
export const MIN_PHOTO_HEIGHT = 180;
export const MAX_SAVED_WIDTH = 1200;
export const MIN_ASPECT_RATIO = 0.38;
export const MAX_ASPECT_RATIO = 2.8;

export const BLOCKED_DOMAINS: readonly string[] = [
  'shutterstock.com',
  'istockphoto.com',
  'gettyimages.com',
  'alamy.com',
  '123rf.com',
  'dreamstime.com',
  'vecteezy.com',
  'freepik.com',
  'depositphotos.com',
  'stock.adobe.com',
  'pinterest.com',
  'pinimg.com',
  'canva.com',
  'pngtree.com',
  'cleanpng.com',
  'clipartmax.com',
  'wikimedia.org',
  'wikipedia.org',
  'youtube.com',
  'ytimg.com',
  'tiktok.com',
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'twitter.com',
  'twimg.com',
  'x.com',
  'linkedin.com',
  'reddit.com',
  'redd.it',
  'quora.com',
  'slideshare.net',
  'scribd.com',
  'issuu.com',
  'pdfcoffee.com',
  'manualslib.com',
  'flaticon.com',
  'iconfinder.com',
  'icons8.com',
  'svgrepo.com',
  'vectorstock.com',
  'bigstockphoto.com',
  'pond5.com',
  'agefotostock.com',
  'dissolve.com',
  // Visually audited noisy/watermarked Chinese B2B / stock-overlay / CGI diagram domains:
  'made-in-china.com',
  'toothedbelt.com',
  'alibaba.com',
  'alicdn.com',
  'aliexpress.com',
  'dhgate.com',
  'globalsources.com',
  'indiamart.com',
  'imimg.com',
  'tradeindia.com',
  'exportersindia.com',
  'simmering.pl',
  'vbeltsupply.com',
  'aajjo.com',
  'oceanproperty.co.th',
  'shopee.ph',
  'shopee.com',
  'shopee.co.th',
  'shopee.co.id',
  'shopee.com.my',
  'shopee.vn',
  'lazada.com',
  'lazada.co.th',
  'lazada.com.my',
  'tokopedia.com',
  'indotrading.com',
  'ec21.com',
  'ecplaza.net',
  'madeinchina.com',
  'diytrade.com',
  'hktdc.com',
  'asianproducts.com',
  'b2bmit.com',
  '1688.com',
  'taobao.com',
  'jd.com',
  // Block Iranian local sites per strict foreign-source photography requirement:
  'torob.com',
  'digikala.com',
  'basalam.com',
  'apadanabelt.com',
  'maharfanabzar.com',
  'khodrosoft.com',
  'sariito.com',
  'mobilekomak.com',
  'tasmeh.com',
  'tasmekaran.com',
  'tasmehsanat.com',
  'sanatpish.com',
  // Unrelated gaming / clipart / wallpaper sites:
  'artstation.com',
  'deviantart.com',
  'fandom.com',
  'wikia.nocookie.net',
  'blizzard.com',
  'steampowered.com',
];

export const TRUSTED_BELT_DOMAINS: readonly string[] = [
  'allaoui.shop',
  'sw-media.fra1.cdn.digitaloceanspaces.com',
  'totallybelts.com',
  'cdn.shopify.com',
  'optibelt.com',
  'mediaplus3.optibelt.com',
  'megadynegroup.com',
  'ammega.com',
  'bandogrp.com',
  'bando.de',
  'bandousa.com',
  'behabelt.com',
  'beltingonline.com',
  '123courroies.com',
  'hug-technik.com',
  'plentyone.com',
  'zahnriemen24.de',
  'agrolager.de',
  'keilriemen24.de',
  'keilriemen24.eu',
  'atg-gommern.de',
  'ayback-technik.de',
  'kaufland.de',
  'media.cdn.kaufland.de',
  'antriebstechnik24.eu',
  'htm-shop.de',
  'csigecsapagy.hu',
  'riemen-profi.de',
  'ihb.ch',
  'rsu.de',
  'cdn.rsuit.net',
  'oldtimer-ersatzteile-hermel.de',
  'simplybearings.co.uk',
  'bearingboys.co.uk',
  'bearingshopuk.co.uk',
  'northwestbearings.co.uk',
  'airebearings.co.uk',
  'signetid.co.uk',
  'shop.slsbearings.com',
  'boydindustrialsupply.com',
  'texasbelting.com',
  'imssupply.com',
  'northpower.co.th',
  'industrialautomationcanada.com',
  'platinum-international.store',
  'fnsheppard.com',
  'puteken.com',
  'winstores.com',
  'iksonic.com',
  'willhaben.at',
  'ebelt.eu',
  'tyma.eu',
  'powerbelt.eu',
  'rs-online.com',
  'zoro.com',
  'motion.com',
  'grainger.com',
  'hvhindustrial.com',
  'vbeltguys.com',
  'fecconsulting.dk',
  'directindustry.com',
  'misumi-ec.com',
  'tranbelt.com',
  'bepltd.com',
  'drbworld.com',
  'swr-europe.com',
  'volta-belting.com',
  'mitsuboshi.com',
  'contitech.de',
  'continental-industry.com',
  'gates.com',
  'habasit.com',
  'ammeraalbeltech.com',
  'forbo.com',
  'chiorino.com',
  'breco.de',
  'mulco.net',
  'elatech.com',
  'sitspa.it',
  'frkpower.com',
  'protorque.net',
  'polyurethaneproduct.com',
  'ebayimg.com',
  'ebay.com',
  'ebay.co.uk',
  'ebay.de',
  'bigcommerce.com',
  'amazon.com',
  'media-amazon.com',
];

const GENERIC_BRANDS = new Set([
  '',
  'UNSPECIFIED',
  'GENERIC',
  'GENERIC_INDUSTRIAL',
  'FOREIGN',
  'FOREIGN-OEM',
  'IRANIAN-OEM',
  'ENGLAND-OEM',
  'ITALY-OEM',
  'CHINA-OEM',
  'GERMAN-OEM',
  'GERMANY-OEM',
  'JAPAN-OEM',
  'KOREA-OEM',
  'UNKNOWN',
  'N/A',
  'NA',
  'خارجی',
  'ثبت نشده',
  'نامشخص',
]);

const BRAND_SEARCH_ALIASES: Record<string, string[]> = {
  DONGIL: ['Dongil', 'DRB'],
  OPTIBELT: ['Optibelt'],
  MEGADYNE: ['Megadyne', 'Isoran', 'Megalinear', 'Megasync'],
  BANDO: ['Bando'],
  MITSUBISHI: ['Mitsuboshi', 'Mitsubishi'],
  MITSUBOSHI: ['Mitsuboshi'],
  SWR: ['SWR'],
  FORZA: ['Forza'],
  VOLTA: ['Volta'],
  MARSHAL: ['Marshal'],
  HANCHANG: ['Hanchang'],
  GATES: ['Gates'],
  CONTITECH: ['ContiTech', 'Continental'],
  CONTINENTAL: ['Continental', 'ContiTech'],
  HABASIT: ['Habasit'],
  CHIORINO: ['Chiorino'],
  AMERAAL: ['Ammeraal'],
  PIX: ['PIX'],
  SKF: ['SKF'],
  FENNER: ['Fenner'],
  SANLUX: ['Sanlux'],
  ROULUNDS: ['Roulunds'],
  DAYCO: ['Dayco'],
  HUTCHINSON: ['Hutchinson'],
  ELATECH: ['Elatech'],
  BRECO: ['Breco', 'BrecoFlex'],
  CANDRIVE: ['Candrive'],
  BERAVO: ['Beravo'],
  POWER: ['Power'],
  GNR: ['GNR'],
};

const PERSIAN_BRAND_LABELS: Record<string, string> = {
  DONGIL: 'دانگیل',
  OPTIBELT: 'اپتی بلت',
  MEGADYNE: 'مگاداین',
  BANDO: 'باندو',
  MITSUBISHI: 'میتسوبوشی',
  MITSUBOSHI: 'میتسوبوشی',
  SWR: 'SWR',
  FORZA: 'فورزا',
  VOLTA: 'ولتا',
  MARSHAL: 'مارشال',
  HANCHANG: 'هانچانگ',
  GATES: 'گیتس',
  CONTITECH: 'کنتی تک',
  HABASIT: 'هاباسیت',
  PIX: 'پیکس',
};

const KNOWN_COMPETITOR_BRANDS = [
  'OPTIBELT',
  'MEGADYNE',
  'BANDO',
  'GATES',
  'CONTITECH',
  'CONTINENTAL',
  'MITSUBOSHI',
  'DONGIL',
  'DRB',
  'SWR',
  'STRONGBELT',
  'BROWNING',
  'FENNER',
  'DAYCO',
  'SKF',
  'PIX',
  'GOODYEAR',
  'CARLISLE',
  'TIMKEN',
  'DUNLOP',
  'HABASIT',
  'VOLTA',
  'BEHABELT',
  'BRECO',
  'ELATECH',
  'TIANOU',
  'SANLUX',
  'BAOPOWER',
  'TRANSCO',
  'STOMIL',
  'HANCHANG',
  'FORZA',
];

const DIVISION_QUERY_LABELS: Record<string, string> = {
  'vbelt-classical': 'classical V-belt rubber drive belt',
  'vbelt-classical-cogged': 'raw edge cogged V-belt',
  'vbelt-narrow-wedge': 'narrow wedge V-belt',
  'vbelt-wedge-wrapped': 'narrow wedge wrapped V-belt',
  'vbelt-wedge-cogged': 'cogged wedge V-belt',
  'vbelt-hexagonal': 'double sided hexagonal V-belt',
  'vbelt-crowned-crc': 'crowned ridge polyurethane V-belt ceramic conveyor',
  'crowned-ceramic': 'ridge top polyurethane ceramic tile conveyor belt',
  'timing-imperial-single': 'trapezoidal rubber timing belt synchronous',
  'timing-imperial': 'imperial trapezoidal rubber timing belt',
  'timing-imperial-double': 'double sided toothed timing belt',
  'timing-double-sided': 'double sided toothed timing belt',
  'timing-htd-rpp-single': 'HTD rubber synchronous timing belt',
  'timing-htd': 'HTD rubber synchronous timing belt',
  'timing-metric-single': 'polyurethane steel cord timing belt',
  'timing-pu-steel': 'polyurethane steel cord timing belt',
  'timing-coated-pu': 'coated polyurethane timing belt linatex APL',
  'timing-industrial': 'industrial synchronous timing belt',
  'timing-automotive-ru': 'industrial rubber timing belt',
  'ribbed-poly-v': 'poly-V multi ribbed drive belt',
  'polyv-ribbed': 'poly-V multi ribbed drive belt',
  'welded-pu-round-crc': 'green polyurethane round welded belt',
  'pu-round-welded': 'green polyurethane round welded belt',
  'welded-pu-v-flat': 'green polyurethane V-belt weldable profile',
  'pu-vbelt-welded': 'green polyurethane V-belt weldable',
  'conveyor-pvc-pu': 'industrial PVC PU flat conveyor belt',
  'conveyor-grip': 'rough top grip PVC conveyor belt',
  'service-ambiguous': 'industrial power transmission belt',
  'non-belt-seal-strip': 'industrial polyurethane rubber strip',
  'non-belt-squeegee': 'industrial polyurethane squeegee blade',
};

const REJECT_URL_OR_TITLE_REGEX =
  /(watermark|shutterstock|istock|getty|alamy|123rf|dreamstime|vecteezy|freepik|depositphotos|clipart|cartoon|drawing|schematic|diagram|blueprint|cad[-_ ]|cross[-_ ]?section|cutaway|3d[-_ ]?render|dimension[-_ ]?chart|size[-_ ]?chart|spec[-_ ]?sheet|datasheet|table[-_ ]?chart|pdf[-_ ]?page|favicon|sprite|placeholder|no[-_ ]?image|coming[-_ ]?soon|avatar|banner[-_ ]?ad|trade[-_ ]?fair|event[-_ ]?202|leather[-_ ]?belt|waist[-_ ]?belt|fashion[-_ ]?belt|mens[-_ ]?belt|womens[-_ ]?belt|buckle|jeans|trouser|gucci|hermes|wwe[-_ ]?belt|championship[-_ ]?belt|karate[-_ ]?belt|seat[-_ ]?belt|safety[-_ ]?harness|tactical[-_ ]?belt|holster|dog[-_ ]?collar|timing[-_ ]?belt[-_ ]?kit|water[-_ ]?pump|tensioner[-_ ]?kit|pulley[-_ ]?kit|idler[-_ ]?bearing|v[-_ ]?belt[-_ ]?pulleys|تسمه دینام شاهین|تسمه دینام پژو|تسمه دینام پراید|تسمه دینام تیبا|تسمه دینام ام وی ام|تسمه تایم ال نود|تسمه تایم تیبا|تسمه تایم پراید|تسمه تایم پژو|ساینا|کوییک|سمند|206|405|toyota camry|honda sh|prelude|talbot|bmw|audi|mercedes|volkswagen|hyundai|kia|nissan|ford focus|opel)/i;

const REJECT_LOGO_REGEX = /(\/logo[s]?\/|[-_.]logo[-_.]|brand[-_ ]?logo|company[-_ ]?logo|favicon)/i;

const POSITIVE_BELT_SUBJECT_REGEX =
  /(belt|vbelt|v-belt|keilriemen|zahnriemen|flachriemen|rundriemen|riemen|courroie|cinghia|correa|ремен|pas klinowy|pasek|تسمه|optibelt|megadyne|bando|gates|contitech|mitsuboshi|dongil|fenner|behabelt|volta|habasit|forbo|chiorino|ammeraal|breco|mulco|elatech|htd|rpp|poly-v|synchronous|cogged|wedge|conveyor)/i;

const POSITIVE_HARDWARE_SUBJECT_REGEX =
  /(bearing|pillow[-_ ]?block|6000|6200|6300|2rs|zz|wire[-_ ]?mesh|stainless[-_ ]?mesh|squeegee|blade|guard|bushing|hub|seal[-_ ]?strip|بلبرینگ|یاتاقان|توری|تیغه)/i;

export interface WebImageCandidate {
  imageUrl: string;
  thumbnailFallbackUrl?: string;
  sourcePageUrl: string;
  title: string;
  domain: string;
  width?: number;
  height?: number;
  engine: 'bing' | 'allaoui' | 'totallybelts' | 'verified-local';
  extractedTokens?: string[];
}

export interface BeltFamilyQueryInput {
  familyCode: string;
  familyName: string;
  brand: string;
  beltDivision: string;
  profiles: string[];
  bodyMaterial?: string;
  backingOrCoating?: string | null;
  supplyForm?: string;
  sampleSkus?: Array<{ sku?: string; name?: string; profile?: string; widthMm?: number | null; lengthMm?: number | null }>;
}

export interface BeltSkuQueryInput {
  skuCode: string;
  familyCode?: string;
  brand: string;
  rawName: string;
  rawSize?: string;
  beltDivision?: string;
  profile?: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  ribCount?: number | null;
  backingOrCoating?: string | null;
}

export interface TranslatedWarehouseSpec {
  primaryDesignation: string;
  altDesignations: string[];
  normalizedProfile: string;
  primaryNumbers: string[];
  isSleeve: boolean;
  isCoated: boolean;
  isDoubleSided: boolean;
  isBanded: boolean;
  isHardware: boolean;
  hardwareKind: 'bearing' | 'pillow-block' | 'mesh' | 'squeegee' | 'guard' | null;
}

export function normalizeDigits(text: string): string {
  return String(text || '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function isGenericBrandName(brand?: string | null): boolean {
  const b = String(brand || '').trim().toUpperCase();
  return GENERIC_BRANDS.has(b) || GENERIC_BRANDS.has(String(brand || '').trim());
}

export function extractDomainFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function detectHardwareFamilyKind(
  name?: string,
  profile?: string,
  division?: string,
): 'bearing' | 'pillow-block' | 'mesh' | 'squeegee' | 'guard' | null {
  const combined = `${name || ''} ${profile || ''} ${division || ''}`;
  if (/کفی یاتاقان|PILLOW[-_ ]?BLOCK/i.test(combined)) return 'pillow-block';
  if (/بلبرینگ|DEEP_GROOVE|6000_SERIES|6200_SERIES|6300_SERIES|MINIATURE_600/i.test(combined)) return 'bearing';
  if (/توری.*مش|SS[-_ ]?WIRE[-_ ]?MESH/i.test(combined)) return 'mesh';
  if (/تیغه.*اسپاتول|SQUEEGEE/i.test(combined)) return 'squeegee';
  if (/حفاظ.*یاتاقان|BEARING[-_ ]?SAFETY[-_ ]?GUARD/i.test(combined)) return 'guard';
  return null;
}

/**
 * Translates Iranian warehouse belt notation (e.g. "تسمه دانگیل 500 * 9/5",
 * "تسمه SWR XPB 2500", "تسمه مارشال آستین 1630H", "تسمه چمفر 150AT20 * 12580 * 6APL")
 * into exact international DIN/ISO/RMA designations and structured spec tokens.
 */
export function translateWarehouseBeltSpec(input: {
  rawName?: string;
  rawSize?: string;
  profile?: string;
  beltDivision?: string;
  backingOrCoating?: string | null;
}): TranslatedWarehouseSpec {
  const raw = normalizeDigits(`${input.rawName || ''} ${input.rawSize || ''}`).replace(/[×]/g, '*');
  const prof = String(input.profile || '').trim().toUpperCase();
  const hardwareKind = detectHardwareFamilyKind(input.rawName, input.profile, input.beltDivision);

  const isSleeve = /آستین|آستين|sleeve|slab/i.test(raw);
  const isCoated = Boolean(input.backingOrCoating) || /چمفر|APL|LINATEX|SUPERGRIP|روکش|روكش/i.test(raw);
  const isDoubleSided =
    /دوطرف|دو\s*رو|double[- ]?sided/i.test(raw) || /^(DL|DH|DXL|D5M|D8M|D14M|DT5|DT10)$/.test(prof);
  const isBanded = /دوبل|باندد|banded|\d+\s*H?[ABC]|\d+\s*SP[ZABC]/i.test(raw);

  const altDesignations: string[] = [];
  const primaryNumbers: string[] = [];
  let primaryDesignation = '';

  // 1. Iranian 9.5mm / 10mm / 13mm / 17mm width*length notation: e.g. "500 * 9/5", "775*9", "1000 * 9/5", "950*13"
  const metricSectionMatch = raw.match(/\b(\d{3,4})\s*\*\s*(9[./]5|9|10|13|17|22)\b/);
  const metricRevMatch = raw.match(/\b(9[./]5|10|13|17|22)\s*[x*]\s*(\d{3,4})\b/i);
  if (metricSectionMatch || metricRevMatch) {
    const len = metricSectionMatch ? metricSectionMatch[1] : metricRevMatch![2];
    const rawW = metricSectionMatch ? metricSectionMatch[2] : metricRevMatch![1];
    const stdW = rawW === '9' || rawW.startsWith('9') || rawW === '10' ? '10' : rawW;
    primaryDesignation = `AVX ${stdW} x ${len}`;
    altDesignations.push(`${stdW}x${len}`, `AVX${stdW}x${len}`);
    if (stdW === '10') altDesignations.push(`9.5x${len}`, `Z${len}`);
    else if (stdW === '13') altDesignations.push(`A${Math.round(Number(len) / 25.4)}`);
    else if (stdW === '17') altDesignations.push(`B${Math.round(Number(len) / 25.4)}`);
    primaryNumbers.push(len);
  }

  // 2. Standard V-belt / narrow wedge / cogged codes with DIN 2215 metric equivalents (e.g. A19 -> 13x480 Li, A16 -> 13x406 Li, B62 -> 17x1575 Li, C48 -> 22x1220 Li)
  if (!primaryDesignation) {
    const vMatch = raw.match(/\b(XP[ZABC]|SP[ZABC]|3VX|5VX|8VX|3V|5V|8V|[ABCZ]X|AA|BB|CC|[ABCDZ])\s*[-]?\s*(\d{2,4}(?:\.\d)?)\b/i);
    if (vMatch) {
      const p = vMatch[1].toUpperCase();
      const num = vMatch[2];
      const numVal = Number(num);
      primaryDesignation = `${p}${num}`;
      altDesignations.push(`${p} ${num}`);
      primaryNumbers.push(num);
      const dinWidthMap: Record<string, string> = {
        Z: '10',
        A: '13',
        B: '17',
        C: '22',
        D: '32',
        ZX: 'X10',
        AX: 'X13',
        BX: 'X17',
        CX: 'X22',
      };
      if (dinWidthMap[p] && Number.isFinite(numVal) && numVal >= 10 && numVal <= 400) {
        const liMm = Math.round(numVal * 25.4);
        const liDin10 = Math.round(liMm / 10) * 10;
        const liDin5 = Math.round(liMm / 5) * 5;
        altDesignations.push(`${dinWidthMap[p]}x${liMm}`);
        primaryNumbers.push(String(liMm));
        if (liDin10 !== liMm && Math.abs(liDin10 - liMm) <= 4) {
          altDesignations.push(`${dinWidthMap[p]}x${liDin10}`);
          primaryNumbers.push(String(liDin10));
        } else if (liDin5 !== liMm) {
          altDesignations.push(`${dinWidthMap[p]}x${liDin5}`);
          primaryNumbers.push(String(liDin5));
        }
      }
    }
  }

  // 3. Imperial timing belt: e.g. "1250H150", "1630H", "1250DH", "390L100", "240XL037"
  if (!primaryDesignation) {
    const impMatch = raw.match(/\b(\d{2,4})\s*(MXL|XL|DL|DH|DXL|XXH|XH|L|H)\s*(\d{3})?\b/i);
    if (impMatch) {
      const len = impMatch[1];
      const p = impMatch[2].toUpperCase();
      const w = impMatch[3] || '';
      primaryDesignation = `${len}${p}${w}`;
      altDesignations.push(`${len}${p}`, `${len} ${p}`);
      primaryNumbers.push(len);
    }
  }

  // 4. Metric HTD/RPP/STD rubber timing: e.g. "1200-8M-30", "5M * 360 * 100", "8M 1600", "RPP8 1200"
  if (!primaryDesignation) {
    const htd1 = raw.match(/\b(\d{3,4})\s*[-]?\s*(3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M)\b/i);
    const htd2 = raw.match(/\b(3M|5M|8M|14M|20M|S3M|S5M|S8M|S14M|RPP5|RPP8|RPP14|D5M|D8M|D14M)\s*[*x-]?\s*(\d{3,4})\b/i);
    if (htd1) {
      primaryDesignation = `${htd1[1]}-${htd1[2].toUpperCase()}`;
      altDesignations.push(`${htd1[1]} ${htd1[2].toUpperCase()}`);
      primaryNumbers.push(htd1[1]);
    } else if (htd2) {
      primaryDesignation = `${htd2[2]}-${htd2[1].toUpperCase()}`;
      altDesignations.push(`${htd2[2]} ${htd2[1].toUpperCase()}`);
      primaryNumbers.push(htd2[2]);
    }
  }

  // 5. Metric PU timing: e.g. "150AT20", "50AT10", "25T10", "T5-610"
  if (!primaryDesignation) {
    const pu1 = raw.match(/\b(\d{1,3})\s*(AT20|AT10|AT5|T20|T10|T5|T2\.5|DT10|DT5)\b/i);
    const pu2 = raw.match(/\b(AT20|AT10|AT5|T20|T10|T5|T2\.5|DT10|DT5)\s*[-]?\s*(\d{3,5})\b/i);
    if (pu2) {
      primaryDesignation = `${pu2[1].toUpperCase()}-${pu2[2]}`;
      altDesignations.push(`${pu2[1].toUpperCase()} ${pu2[2]}`);
      primaryNumbers.push(pu2[2]);
    } else if (pu1) {
      primaryDesignation = `${pu1[1]}${pu1[2].toUpperCase()}`;
      altDesignations.push(`${pu1[2].toUpperCase()} ${pu1[1]}mm`);
      primaryNumbers.push(pu1[1]);
    }
  }

  // 6. Poly-V multi-ribbed: e.g. "6PJ1168", "8PK1420", "10PL1841"
  if (!primaryDesignation) {
    const pv = raw.match(/\b(\d{1,2})\s*(PH|PJ|PK|PL|PM)\s*[-]?\s*(\d{3,4})\b/i);
    if (pv) {
      primaryDesignation = `${pv[1]}${pv[2].toUpperCase()}${pv[3]}`;
      altDesignations.push(`${pv[1]} ${pv[2].toUpperCase()} ${pv[3]}`, `${pv[2].toUpperCase()}${pv[3]}`);
      primaryNumbers.push(pv[3]);
    }
  }

  return {
    primaryDesignation,
    altDesignations: Array.from(new Set(altDesignations)),
    normalizedProfile: prof,
    primaryNumbers: Array.from(new Set(primaryNumbers)),
    isSleeve,
    isCoated,
    isDoubleSided,
    isBanded,
    isHardware: Boolean(hardwareKind),
    hardwareKind,
  };
}

export function inferBrandSeriesHint(brand: string, division: string, profile: string): string {
  const b = brand.trim().toUpperCase();
  const d = division.trim().toLowerCase();
  const p = profile.trim().toUpperCase();

  if (b === 'OPTIBELT') {
    if (d.includes('htd') || /^(3M|5M|8M|14M|S8M)/.test(p)) return 'OMEGA';
    if (d.includes('imperial') || /^(MXL|XL|L|H|XH|XXH|DL|DH)/.test(p)) return 'ZR';
    if (d.includes('metric') || d.includes('pu') || /^(T2\.5|T5|T10|T20|AT5|AT10|AT20)/.test(p)) return 'ALPHA';
    if (d.includes('poly') || d.includes('ribbed') || /^P[HJKL]/.test(p)) return 'RB';
    if (/^XP[ZABC]|^[ABCZ]X/.test(p)) return 'SUPER X-POWER';
    if (/^SP[ZABC]/.test(p)) return 'SK';
    return 'VB';
  }
  if (b === 'MEGADYNE') {
    if (d.includes('htd') || d.includes('imperial') || /^(XL|L|H|XH|3M|5M|8M|14M|RPP)/.test(p)) return 'ISORAN';
    if (d.includes('metric') || d.includes('pu') || /^(T5|T10|T20|AT5|AT10|AT20)/.test(p)) return 'MEGALINEAR';
    if (d.includes('poly') || d.includes('ribbed') || /^P[HJKL]/.test(p)) return 'PV';
    if (/^XP[ZABC]|^[ABCZ]X/.test(p)) return 'LINEA-X';
    return 'OLEOSTATIC';
  }
  if (b === 'BANDO') {
    if (d.includes('timing')) return 'Synchro-Link';
    if (d.includes('poly') || d.includes('ribbed')) return 'Rib Ace';
    return 'Power King';
  }
  if (b === 'DONGIL') {
    return 'Super Star';
  }
  if (b === 'MITSUBISHI' || b === 'MITSUBOSHI') {
    return 'Mitsuboshi';
  }
  if (b === 'VOLTA') {
    return 'Volta';
  }
  return '';
}

export function extractAlphanumericSpecTokens(text: string): string[] {
  const norm = normalizeDigits(text)
    .replace(/[×*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const matches = norm.match(/[A-Za-z0-9][A-Za-z0-9.-]{0,18}/g) || [];
  const stop = new Set(['MM', 'CM', 'INCH', 'IN', 'BELT', 'THE', 'AND', 'FOR', 'WITH', 'NEW', 'OEM', 'NO', 'OF', 'TO']);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const clean = raw.replace(/^[-.]+|[-.]+$/g, '').toUpperCase();
    if (!clean || clean.length > 18 || stop.has(clean)) continue;
    if (/^\d{1}$/.test(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Strict token-boundary designation matching.
 * Prevents false substring hits such as:
 *  - "A19" matching "XPA1900" or "SPA1900" or "A190"
 *  - "A16" matching "A160" or "XPA1600"
 *  - "B52" matching "SPB5200"
 * Accepts exact boundaries with optional hyphen/space/underscore between letters & digits
 * (e.g., "A-19", "A 19", "A19", "13x480").
 */
export function hasExactTokenBoundaryDesignationMatch(text: string, designation: string): boolean {
  const cleanDes = String(designation || '').trim().toUpperCase();
  if (cleanDes.length < 2) return false;
  const upperText = normalizeDigits(text).toUpperCase();

  // Build boundary-aware regex allowing optional separator between letter/digit transitions
  const tokens = cleanDes.match(/[A-Z]+|\d+(?:\.\d+)?/g);
  if (!tokens || tokens.length === 0) return false;
  const pattern = tokens
    .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_-]?');
  const boundaryRe = new RegExp(`(?:^|[^A-Z0-9])${pattern}(?:[^A-Z0-9]|$)`);
  return boundaryRe.test(upperText);
}

/**
 * Extracts explicit belt profile+size pairs found in a candidate's title/URL
 * so we can detect CONFLICTING markings (e.g. candidate says "SPB 3150" when
 * target is "A14", or "B 1015" when target is "C48").
 */
export function extractMentionedBeltProfilesAndSizes(text: string): {
  profiles: Set<string>;
  profileSizes: Array<{ profile: string; size: string }>;
} {
  const upper = normalizeDigits(text).toUpperCase();
  const profiles = new Set<string>();
  const profileSizes: Array<{ profile: string; size: string }> = [];

  // Match V-belt / wedge / cogged codes with numbers (e.g. SPB 3150, XPA 1432, BX 50, B-90, C 48, A-52, 3VX 1420)
  const vRe = /(?:^|[^A-Z0-9])(XP[ZABC]|SP[ZABC]|3VX|5VX|8VX|3V|5V|8V|[ABCZ]X|AA|BB|CC|[ABCDZ])[\s-]?(\d{2,4})(?:[^A-Z0-9]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = vRe.exec(upper)) !== null) {
    profiles.add(m[1]);
    profileSizes.push({ profile: m[1], size: m[2] });
  }

  // Match HTD / RPP timing (e.g. 1200-8M, 1000 5MGT, 880 8M)
  const htdRe = /(?:^|[^A-Z0-9])(\d{3,4})[\s-]?(3M|5M|8M|14M|S5M|S8M|RPP5|RPP8|RPP14)(?:GT)?(?:[^A-Z0-9]|$)/g;
  while ((m = htdRe.exec(upper)) !== null) {
    profiles.add(m[2]);
    profileSizes.push({ profile: m[2], size: m[1] });
  }

  // Match Imperial timing (e.g. 390H, 1250DH, 284XL, 630L)
  const impRe = /(?:^|[^A-Z0-9])(\d{2,4})[\s-]?(MXL|XL|DL|DH|DXL|XXH|XH|L|H)(?:\d{3})?(?:[^A-Z0-9]|$)/g;
  while ((m = impRe.exec(upper)) !== null) {
    profiles.add(m[2]);
    profileSizes.push({ profile: m[2], size: m[1] });
  }

  // Match Metric PU timing (e.g. AT10, AT20, T10, T5)
  const puRe = /(?:^|[^A-Z0-9])(AT20|AT10|AT5|T20|T10|T5|T2\.5|DT10|DT5)(?:[^A-Z0-9]|$)/g;
  while ((m = puRe.exec(upper)) !== null) {
    profiles.add(m[1]);
  }

  // Match Poly-V (e.g. 6PJ1168, 5PK1020)
  const pvRe = /(?:^|[^A-Z0-9])(?:\d{1,2}[\s-]?)?(PH|PJ|PK|PL|PM)[\s-]?(\d{3,4})(?:[^A-Z0-9]|$)/g;
  while ((m = pvRe.exec(upper)) !== null) {
    profiles.add(m[1]);
    profileSizes.push({ profile: m[1], size: m[2] });
  }

  // Match AVX / metric section (e.g. AVX 10 x 1000, 10x775)
  const avxRe = /(?:AVX[\s-]?)?(10|13|17)[\s]*[X*][\s]*(\d{3,4})(?:[^A-Z0-9]|$)/g;
  while ((m = avxRe.exec(upper)) !== null) {
    const p = m[1] === '10' ? 'Z' : m[1] === '13' ? 'A' : 'B';
    profiles.add(p);
    profileSizes.push({ profile: p, size: m[2] });
  }

  return { profiles, profileSizes };
}

export function classifyBeltBroadKind(division?: string, profile?: string, name?: string):
  | 'timing-rubber'
  | 'timing-pu'
  | 'timing-coated'
  | 'timing-double'
  | 'vbelt-cogged'
  | 'vbelt-wedge'
  | 'vbelt-classical'
  | 'polyv'
  | 'pu-round'
  | 'pu-vbelt'
  | 'crowned'
  | 'conveyor' {
  const d = String(division || '').toLowerCase();
  const p = String(profile || '').toUpperCase();
  const n = String(name || '');

  if (d.includes('conveyor') || /نقاله|کانوایر|pvc/i.test(`${p} ${n}`)) return 'conveyor';
  if (d.includes('crowned') || /CROWNED|BRB|بارکش|تاج/i.test(`${p} ${n}`)) return 'crowned';
  if (d.includes('round') || (/\bCRC\b|گرد/i.test(`${p} ${n}`) && !/نقاله/.test(n))) return 'pu-round';
  if (d.includes('welded-pu-v') || d.includes('pu-vbelt')) return 'pu-vbelt';
  if (d.includes('poly') || d.includes('ribbed') || /\b(PH|PJ|PK|PL|PM)\b/.test(p) || /چند[\u200c ]?شیار|شیاری/.test(n)) {
    return 'polyv';
  }
  if (d.includes('coated') || /APL|LINATEX|SUPERGRIP|چمفر|روکش/i.test(n)) return 'timing-coated';
  if (d.includes('double') || /\b(DL|DH|DXL|D5M|D8M|D14M|DT5|DT10)\b/.test(p) || /دوطرف|دو\s*رو/.test(n)) {
    return 'timing-double';
  }
  if (
    d.includes('metric') ||
    d.includes('timing-pu') ||
    /\b(T2\.5|T5|T10|T20|AT5|AT10|AT20|ATK\d*)\b/.test(p) ||
    (d.includes('timing') && /پلی[\u200c ]?یورتان|PU|TPU|سیم[\u200c ]?دار/i.test(n))
  ) {
    return 'timing-pu';
  }
  if (d.includes('timing') || /\b(MXL|XL|L|H|XH|XXH|3M|5M|8M|14M|S3M|S5M|S8M|RPP\d*|HTD|GT\d*)\b/.test(p)) {
    return 'timing-rubber';
  }
  if (d.includes('cogged') || /\b(AX|BX|CX|ZX|XPZ|XPA|XPB|XPC|3VX|5VX|8VX)\b/.test(p) || /دنده|دندانه/.test(n)) {
    return 'vbelt-cogged';
  }
  if (d.includes('wedge') || /\b(SPZ|SPA|SPB|SPC|3V|5V|8V)\b/.test(p)) return 'vbelt-wedge';
  return 'vbelt-classical';
}

export function buildFamilyWebQueries(fam: BeltFamilyQueryInput): string[] {
  const hwKind = detectHardwareFamilyKind(fam.familyName, fam.profiles?.[0], fam.beltDivision);
  if (hwKind) {
    const prof = (fam.profiles || [])[0] || '';
    if (hwKind === 'bearing') {
      const ser = prof.includes('6200') ? '6200' : prof.includes('6300') ? '6300' : prof.includes('6000') ? '6000' : '6204';
      const seal = prof.includes('ZZ') ? 'ZZ metal shield' : '2RS rubber seal';
      return [
        `${ser} ${seal} deep groove ball bearing industrial`,
        `industrial ${ser} ball bearing ${seal} photo`,
      ];
    }
    if (hwKind === 'pillow-block') return ['UCP pillow block mounted ball bearing industrial', 'tapped base pillow block bearing unit'];
    if (hwKind === 'mesh') return ['304 stainless steel woven wire mesh roll industrial', 'stainless steel wire mesh screen industrial'];
    if (hwKind === 'squeegee') return ['industrial polyurethane squeegee rubber blade', 'floor scrubber polyurethane squeegee blade'];
    return ['industrial bearing safety guard cover shield', 'pillow block bearing protective end cap cover'];
  }

  const cleanBrand = isGenericBrandName(fam.brand) ? '' : fam.brand.trim();
  const brandUpper = cleanBrand.toUpperCase();
  const brandQueryToken = cleanBrand ? (BRAND_SEARCH_ALIASES[brandUpper]?.[0] || cleanBrand) : '';
  const profile = (fam.profiles || []).filter((p) => p && p !== '-' && p !== 'UNSPECIFIED')[0] || '';
  const series = cleanBrand ? inferBrandSeriesHint(cleanBrand, fam.beltDivision, profile) : '';
  const baseDivLabel = DIVISION_QUERY_LABELS[fam.beltDivision] || 'industrial power transmission belt';
  const spec = translateWarehouseBeltSpec({
    rawName: `${fam.familyName} ${(fam.sampleSkus || []).slice(0, 2).map((s) => s.name || '').join(' ')}`,
    profile,
    beltDivision: fam.beltDivision,
    backingOrCoating: fam.backingOrCoating,
  });
  const isOpenEnd = /open|متری|باز/i.test(`${fam.supplyForm || ''} ${fam.familyName}`);
  const broadKind = classifyBeltBroadKind(fam.beltDivision, profile, fam.familyName);
  const germanType = broadKind.startsWith('timing')
    ? 'Zahnriemen'
    : broadKind === 'polyv'
      ? 'Keilrippenriemen'
      : broadKind === 'pu-round'
        ? 'Rundriemen Polyurethan'
        : broadKind === 'conveyor'
          ? 'Förderband PVC'
          : 'Keilriemen';

  const queries: string[] = [];

  // Query 1: Most specific foreign English — Brand + Series + Profile + exact construction
  const q1: string[] = [];
  if (brandQueryToken) q1.push(brandQueryToken);
  if (series && series.toLowerCase() !== brandQueryToken.toLowerCase()) q1.push(series);
  if (profile) q1.push(profile);
  if (spec.isCoated) q1.push('red linatex APL coated');
  if (spec.isSleeve) q1.push('timing belt sleeve');
  if (isOpenEnd) q1.push('open end roll');
  q1.push(baseDivLabel);
  queries.push(q1.join(' ').replace(/\s+/g, ' ').trim());

  // Query 2: German/European industrial distributor query (high yield for SWR, Optibelt, Megadyne, Bando, ContiTech studio photos!)
  const q2: string[] = [];
  if (brandQueryToken) q2.push(brandQueryToken);
  if (profile) q2.push(profile);
  q2.push(germanType);
  if (brandUpper === 'SWR' || brandUpper === 'OPTIBELT') q2.push('ebay');
  queries.push(q2.join(' ').replace(/\s+/g, ' ').trim());

  // Query 3: Exact member SKU sample designation with brand on foreign industrial shops
  if (spec.primaryDesignation) {
    const q3: string[] = [];
    if (brandQueryToken) q3.push(brandQueryToken);
    q3.push(spec.primaryDesignation);
    if (spec.altDesignations[1] && /^\d|X\d/.test(spec.altDesignations[1])) {
      q3.push(spec.altDesignations[1]);
    }
    q3.push(broadKind.startsWith('timing') ? 'timing belt' : broadKind === 'polyv' ? 'poly-v belt' : 'v-belt');
    queries.push(q3.join(' ').replace(/\s+/g, ' ').trim());
  }

  // Query 4: Brand + broad belt type OR profile + construction (NEVER drops named brand on Query 4 if it's a major European/Asian brand!)
  const q4: string[] = [];
  if (
    brandQueryToken &&
    [
      'SWR',
      'OPTIBELT',
      'MEGADYNE',
      'DONGIL',
      'BANDO',
      'MITSUBOSHI',
      'MITSUBISHI',
      'HANCHANG',
      'VOLTA',
      'GATES',
      'CONTITECH',
      'MARSHAL',
      'FORZA',
      'BERAVO',
      'GNR',
    ].includes(brandUpper)
  ) {
    q4.push(brandQueryToken);
  }
  if (profile) q4.push(profile);
  if (spec.isCoated) q4.push('linatex APL coated');
  if (spec.isDoubleSided) q4.push('double sided');
  if (isOpenEnd) q4.push('open end');
  q4.push(baseDivLabel);
  if (fam.bodyMaterial && /پلی[\u200c ]?یورتان|PU/i.test(fam.bodyMaterial) && !baseDivLabel.includes('polyurethane')) {
    q4.push('polyurethane');
  }
  queries.push(q4.join(' ').replace(/\s+/g, ' ').trim());

  return Array.from(new Set(queries.filter((q) => q.length >= 4)));
}

export function buildSkuWebQueries(sku: BeltSkuQueryInput): string[] {
  const hwKind = detectHardwareFamilyKind(sku.rawName, sku.profile, sku.beltDivision);
  if (hwKind) {
    const toks = extractAlphanumericSpecTokens(`${sku.rawName} ${sku.rawSize || ''}`).slice(0, 3).join(' ');
    return [`${toks} ${hwKind} industrial`.trim()];
  }

  const cleanBrand = isGenericBrandName(sku.brand) ? '' : sku.brand.trim();
  const brandUpper = cleanBrand.toUpperCase();
  const brandToken = cleanBrand ? (BRAND_SEARCH_ALIASES[brandUpper]?.[0] || cleanBrand) : '';
  const profile = String(sku.profile || '').trim();
  const division = String(sku.beltDivision || '').trim();
  const series = cleanBrand ? inferBrandSeriesHint(cleanBrand, division, profile) : '';
  const spec = translateWarehouseBeltSpec({
    rawName: sku.rawName,
    rawSize: sku.rawSize,
    profile,
    beltDivision: division,
    backingOrCoating: sku.backingOrCoating,
  });

  const broadKind = classifyBeltBroadKind(division, profile, sku.rawName);
  const shortType = broadKind.startsWith('timing')
    ? 'timing belt'
    : broadKind === 'polyv'
      ? 'poly-V ribbed belt'
      : broadKind === 'conveyor'
        ? 'conveyor belt'
        : broadKind === 'pu-round'
          ? 'polyurethane round belt'
          : broadKind === 'pu-vbelt'
            ? 'polyurethane weldable V-belt'
            : broadKind === 'crowned'
              ? 'polyurethane ridge belt'
              : 'V-belt';

  const germanType = broadKind.startsWith('timing')
    ? 'Zahnriemen'
    : broadKind === 'polyv'
      ? 'Keilrippenriemen'
      : 'Keilriemen';

  const queries: string[] = [];

  if (spec.primaryDesignation) {
    // Query 1: Exact foreign English — Brand + Series + Exact SKU designation
    const q1: string[] = [];
    if (brandToken) q1.push(brandToken);
    if (series && series.toLowerCase() !== brandToken.toLowerCase()) q1.push(series);
    q1.push(spec.primaryDesignation);
    if (spec.isCoated) q1.push('linatex coated');
    q1.push(shortType);
    queries.push(q1.join(' ').replace(/\s+/g, ' ').trim());

    // Query 2: German/European DIN 2215 metric + imperial designation (e.g. "SWR Keilriemen 13x480 A19", "Optibelt 22x1220 C48 Keilriemen")
    const dinAlt = spec.altDesignations.find((d) => /^X?\d+x\d+$/i.test(d));
    const q2: string[] = [];
    if (brandToken) q2.push(brandToken);
    q2.push(germanType);
    if (dinAlt) q2.push(dinAlt);
    q2.push(spec.primaryDesignation);
    queries.push(q2.join(' ').replace(/\s+/g, ' ').trim());

    // Query 3: Brand + Profile on German/UK/US foreign belt shops (guarantees exact brand marking photo!)
    if (brandToken) {
      const q3 = [brandToken, profile || spec.primaryDesignation, germanType, 'ebay']
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      queries.push(q3);
    }

    // Query 4: Exact foreign SKU designation without brand (ONLY useful for generic/unbranded SKUs)
    if (!brandToken) {
      const q4 = [spec.primaryDesignation, dinAlt || '', shortType, 'industrial']
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      queries.push(q4);
    }
  } else {
    const qFallback: string[] = [];
    if (brandToken) qFallback.push(brandToken);
    if (series && series.toLowerCase() !== brandToken.toLowerCase()) qFallback.push(series);
    if (profile && profile !== '-' && profile !== 'UNSPECIFIED') qFallback.push(profile);
    if (sku.lengthMm) qFallback.push(String(Math.round(sku.lengthMm)));
    qFallback.push(shortType);
    queries.push(qFallback.join(' ').replace(/\s+/g, ' ').trim());
  }

  return Array.from(new Set(queries.filter((q) => q.length >= 4)));
}

export function isCandidateUrlRejected(imageUrl: string, title = '', sourcePageUrl = ''): string | null {
  const url = String(imageUrl || '').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'non-http';
  }
  if (/\.(svg|gif|ico|bmp|pdf)(\?|#|$)/i.test(url)) {
    return 'unsupported-ext';
  }
  const imgDom = extractDomainFromUrl(url);
  const pageDom = extractDomainFromUrl(sourcePageUrl);
  // Strictly foreign websites only: block all .ir Iranian domains
  if (imgDom.endsWith('.ir') || pageDom.endsWith('.ir')) {
    return 'blocked-iranian-tld';
  }
  for (const blocked of BLOCKED_DOMAINS) {
    if (imgDom === blocked || imgDom.endsWith(`.${blocked}`) || pageDom === blocked || pageDom.endsWith(`.${blocked}`)) {
      return `blocked-domain:${blocked}`;
    }
  }
  const combined = `${url} ${title} ${sourcePageUrl}`;
  if (REJECT_URL_OR_TITLE_REGEX.test(combined)) {
    return 'rejected-keyword';
  }
  if (REJECT_LOGO_REGEX.test(url)) {
    return 'logo-url';
  }
  return null;
}

export function scoreWebCandidate(
  candidate: WebImageCandidate,
  target: {
    brand?: string;
    profile?: string;
    beltDivision?: string;
    name?: string;
    specTokens?: string[];
    strictSkuMode?: boolean;
    rawSize?: string;
  },
  globalUseCounts?: Map<string, number>,
): number {
  const rejectReason = isCandidateUrlRejected(candidate.imageUrl, candidate.title, candidate.sourcePageUrl);
  if (rejectReason) return -1000;

  const text = `${candidate.title || ''} ${candidate.imageUrl || ''} ${candidate.sourcePageUrl || ''}`;
  const textLower = text.toLowerCase();
  const textUpper = text.toUpperCase();
  const imgDom = extractDomainFromUrl(candidate.imageUrl);
  const pageDom = extractDomainFromUrl(candidate.sourcePageUrl);

  // HARD SUBJECT GUARD: eliminate non-belt off-topic leaks (e.g. game screenshots, unrelated pages)
  const hwKind = detectHardwareFamilyKind(target.name, target.profile, target.beltDivision);
  if (hwKind) {
    if (!POSITIVE_HARDWARE_SUBJECT_REGEX.test(textLower)) return -900;
  } else {
    if (!POSITIVE_BELT_SUBJECT_REGEX.test(textLower)) return -900;
  }

  let score = 40;

  // Trusted industrial belt distributor / manufacturer domain bonus
  const isTrusted = TRUSTED_BELT_DOMAINS.some(
    (d) => imgDom === d || imgDom.endsWith(`.${d}`) || pageDom === d || pageDom.endsWith(`.${d}`),
  );
  if (isTrusted) score += 55;
  if (
    imgDom.includes('sw-media.fra1.cdn.digitaloceanspaces.com') ||
    pageDom.includes('allaoui.shop') ||
    imgDom.includes('ebayimg.com') ||
    pageDom.includes('ebay.') ||
    imgDom.includes('ayback-technik.de') ||
    pageDom.includes('ayback-technik.de') ||
    imgDom.includes('kaufland') ||
    pageDom.includes('kaufland.de') ||
    imgDom.includes('keilriemen24.eu') ||
    pageDom.includes('keilriemen24.eu')
  ) {
    score += 45; // Real physical studio belt photos with readable front-facing brand/size markings
  }
  if (imgDom.includes('mediaplus3.optibelt.com') || imgDom.includes('bandogrp.com') || imgDom.includes('megadyne')) {
    score += 40; // Official manufacturer studio photos
  }
  if (imgDom.includes('atg-gommern.de') || pageDom.includes('atg-gommern.de')) {
    score -= 90; // Prefer real studio camera photos over cutaway/generic renders on atg-gommern
  }

  // STRICT BRAND LOCK: massive bonus for matching the exact brand, hard rejection for competitor brands!
  const cleanBrand = isGenericBrandName(target.brand) ? '' : String(target.brand || '').trim().toUpperCase();
  if (cleanBrand) {
    const aliases = (BRAND_SEARCH_ALIASES[cleanBrand] || [cleanBrand]).map((a) => a.toUpperCase());
    const matchedOwnBrand = aliases.some((a) => {
      const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`).test(textUpper);
    });
    if (matchedOwnBrand) {
      score += 260;
    } else {
      // Reject competitor brand photos (e.g. Optibelt/Gates/Strongbelt/Browning on an SWR or Dongil belt!)
      const mentionsOtherBrand = KNOWN_COMPETITOR_BRANDS.some((cb) => {
        if (aliases.includes(cb)) return false;
        const esc = cb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`).test(textUpper);
      });
      if (mentionsOtherBrand) {
        score -= 450;
      } else if (['SWR', 'OPTIBELT', 'MEGADYNE', 'DONGIL', 'BANDO', 'MITSUBOSHI', 'MITSUBISHI', 'GATES', 'CONTITECH'].includes(cleanBrand)) {
        // Strongly prefer photos explicitly branded as the target manufacturer over unmarked generic belts
        score -= target.strictSkuMode ? 120 : 75;
      }
    }
  }

  // Translated warehouse spec & profile/size conflict detection
  const spec = translateWarehouseBeltSpec({
    rawName: target.name,
    rawSize: target.rawSize,
    profile: target.profile,
    beltDivision: target.beltDivision,
  });
  const mentioned = extractMentionedBeltProfilesAndSizes(text);
  const prof = String(target.profile || '').trim().toUpperCase();

  if (prof && prof !== '-' && prof !== 'UNSPECIFIED' && !hwKind) {
    const escaped = prof.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactProfRe = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`);
    const hasTargetProf = exactProfRe.test(textUpper) || mentioned.profiles.has(prof);
    if (hasTargetProf) {
      score += 75;
    } else if (mentioned.profiles.size > 0) {
      // Candidate explicitly mentions a DIFFERENT belt profile (e.g. SPB or A or BX when target is C or B!)
      // Check if compatible family (e.g., Z <-> AVX10)
      const isCompatibleZ = prof === 'Z' && (mentioned.profiles.has('Z') || /10\s*[x*]\s*\d{3,4}|avx\s*10/i.test(textLower));
      if (!isCompatibleZ) {
        score -= target.strictSkuMode ? 320 : 180;
      }
    }
  }

  // Exact SKU designation / size number verification & anti-conflicting-size gate
  const allTargetDesignations = [spec.primaryDesignation, ...spec.altDesignations]
    .filter(Boolean)
    .map((d) => d.toUpperCase());

  let exactDesignationHit = false;
  for (const des of allTargetDesignations) {
    if (des.length >= 2 && hasExactTokenBoundaryDesignationMatch(textUpper, des)) {
      exactDesignationHit = true;
      break;
    }
  }

  if (exactDesignationHit) {
    score += 360;
  } else if (spec.primaryNumbers.length > 0 && target.strictSkuMode) {
    const primaryNum = spec.primaryNumbers[0];
    const hasPrimaryNum = new RegExp(`(^|[^0-9])${primaryNum}([^0-9]|$)`).test(textUpper);
    if (hasPrimaryNum) {
      score += 140;
    } else if (mentioned.profileSizes.length > 0) {
      // Candidate explicitly displays a DIFFERENT size number (e.g. SPB 3150 when target is A14, BX 50 when target is BX 25!)
      score -= 220;
    }
  }

  // Additional spec token matches
  for (const tok of (target.specTokens || []).slice(0, 4)) {
    if (tok.length < 2) continue;
    if (textUpper.includes(tok.toUpperCase())) {
      score += /[A-Z]/.test(tok) && /\d/.test(tok) ? 80 : 30;
    }
  }

  // Belt kind consistency check (strictly prevent timing belt on V-belt, poly-V on classical V-belt, etc.)
  if (!hwKind) {
    const targetKind = classifyBeltBroadKind(target.beltDivision, target.profile, target.name);
    const looksLikeTiming = /(timing|toothed|zahnriemen|synchro|htd|rpp|at20|at10|at5|t10|t5|xl|mxl|courroie[- ]crant)/i.test(textLower);
    const looksLikeVbelt = /(v-belt|vbelt|keilriemen|wedge[- ]belt|wrapped[- ]belt|cogged[- ]belt|\bspa\b|\bspb\b|\bspc\b|\bspz\b|\bax\d|\bbx\d|\bcx\d|\bavx)/i.test(textLower);
    const looksLikePolyV = /(poly[- ]?v|ribbed[- ]?belt|multi[- ]?rib|keilrippenriemen|\bpj\b|\bpk\b|\bpl\b|\bph\b)/i.test(textLower);
    const looksLikeRound = /(round[- ]?belt|rundriemen|rundschnur|urethane[- ]?round|pu[- ]?round)/i.test(textLower);
    const looksLikeConveyor = /(conveyor[- ]?belt|transportband|förderband|pvc[- ]?belt|flat[- ]?belt)/i.test(textLower);
    const looksLikeBanded = /(banded[- ]?v[- ]?belt|kraftband|powerband|multi[- ]?band)/i.test(textLower);

    if (!spec.isBanded && looksLikeBanded) {
      score -= 140; // Don't show multi-band banded belt on single V-belt!
    }

    if (targetKind.startsWith('timing')) {
      if (looksLikeTiming) score += 35;
      if (looksLikeVbelt && !looksLikeTiming) score -= 180;
      if (looksLikeConveyor && !looksLikeTiming && targetKind !== 'timing-coated') score -= 140;
      if (targetKind === 'timing-pu' && /(polyurethane|pu\b|steel[- ]?cord|white|breco|megalinear|alpha)/i.test(textLower)) {
        score += 45;
      }
      if (targetKind === 'timing-double' && /(double[- ]?sided|twin|dual|doppel|dl\b|dh\b|d5m|d8m|dt5|dt10)/i.test(textLower)) {
        score += 55;
      }
      if (targetKind === 'timing-coated' && /(coat|linatex|apl|supergrip|red|sponge|foam|backing)/i.test(textLower)) {
        score += 65;
      }
    } else if (targetKind.startsWith('vbelt')) {
      if (looksLikeVbelt) score += 35;
      if (looksLikeTiming && !looksLikeVbelt) score -= 220;
      if (looksLikePolyV && !looksLikeVbelt) score -= 160;
      if (looksLikeConveyor && !looksLikeVbelt) score -= 160;
      if (targetKind === 'vbelt-cogged' && /(cogged|notched|raw[- ]?edge|xp[zabc]|[abcz]x|super[- ]?tx|super[- ]?x-power|linea-x)/i.test(textLower)) {
        score += 55;
      }
      if (targetKind === 'vbelt-classical' && /(cogged|notched|raw[- ]?edge|xp[zabc]|[abcz]x)/i.test(textLower)) {
        score -= 70; // Classical wrapped belt shouldn't prefer cogged photos
      }
    } else if (targetKind === 'polyv') {
      if (looksLikePolyV) score += 50;
      if (looksLikeTiming && !looksLikePolyV) score -= 180;
      if (looksLikeVbelt && !looksLikePolyV) score -= 90;
    } else if (targetKind === 'pu-round') {
      if (looksLikeRound) score += 55;
      if (looksLikeTiming && !looksLikeRound) score -= 180;
    } else if (targetKind === 'conveyor') {
      if (looksLikeConveyor) score += 55;
      if (looksLikeTiming && !looksLikeConveyor) score -= 160;
    }
  }

  // Resolution hint bonus
  if (candidate.width && candidate.width >= 600) score += 15;
  else if (candidate.width && candidate.width < MIN_PHOTO_WIDTH) score -= 80;

  // Diversity penalty: prefer unused URLs across families/SKUs
  if (globalUseCounts) {
    const uses = globalUseCounts.get(candidate.imageUrl) || 0;
    if (uses > 0) {
      score -= Math.min(320, uses * 110);
    }
  }

  return score;
}

// =============================================================================
// Live Web Image Search Adapters (Bing Images + Allaoui Shop)
// =============================================================================

export function parseBingImagesAsyncHtml(html: string): WebImageCandidate[] {
  const results: WebImageCandidate[] = [];
  const seen = new Set<string>();
  const regex = /m="(\{[^"]+&quot;murl&quot;[^"]+\})"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const obj = JSON.parse(decoded) as {
        murl?: string;
        turl?: string;
        purl?: string;
        t?: string;
        desc?: string;
      };
      const imageUrl = String(obj.murl || '').trim();
      if (!imageUrl || seen.has(imageUrl)) continue;
      seen.add(imageUrl);

      const thumbnailFallbackUrl = String(obj.turl || '').trim() || undefined;
      const sourcePageUrl = String(obj.purl || '').trim();
      const title = String(obj.t || obj.desc || '').trim();
      if (isCandidateUrlRejected(imageUrl, title, sourcePageUrl)) continue;

      results.push({
        imageUrl,
        thumbnailFallbackUrl,
        sourcePageUrl,
        title,
        domain: extractDomainFromUrl(sourcePageUrl || imageUrl),
        engine: 'bing',
        extractedTokens: extractAlphanumericSpecTokens(`${title} ${imageUrl}`),
      });
    } catch {
      // Ignore malformed attribute JSON
    }
  }
  return results;
}

export async function searchBingImages(query: string, count = 35, timeoutMs = 9000): Promise<WebImageCandidate[]> {
  const url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=0&count=${count}&qft=+filterui:photo-photo&mmasync=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': REQUEST_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9,de;q=0.8,fa;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return [];
  const html = await res.text();
  return parseBingImagesAsyncHtml(html);
}

export function parseAllaouiSearchHtml(html: string): WebImageCandidate[] {
  const results: WebImageCandidate[] = [];
  const seen = new Set<string>();
  const imgRegex = /https:\/\/sw-media\.fra1\.cdn\.digitaloceanspaces\.com\/prod\/sw6\/public\/media\/[^"'\s<>]+?\.(?:jpe?g|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(html)) !== null) {
    const imageUrl = m[0];
    if (seen.has(imageUrl)) continue;
    if (/favicon|logo|icon|banner/i.test(imageUrl)) continue;
    seen.add(imageUrl);
    const filename = path.basename(imageUrl).replace(/[_-]/g, ' ');
    if (isCandidateUrlRejected(imageUrl, filename, 'https://allaoui.shop')) continue;
    results.push({
      imageUrl,
      sourcePageUrl: 'https://allaoui.shop',
      title: filename,
      domain: 'allaoui.shop',
      engine: 'allaoui',
      extractedTokens: extractAlphanumericSpecTokens(filename),
    });
  }
  return results;
}

export async function searchAllaouiBelts(query: string, timeoutMs = 8000): Promise<WebImageCandidate[]> {
  try {
    const url = `https://allaoui.shop/search?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': REQUEST_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseAllaouiSearchHtml(html);
  } catch {
    return [];
  }
}

// =============================================================================
// Real Photo Download, Binary Validation & Pure WebP Conversion (Zero Synthesis)
// =============================================================================

export interface ValidatedRealWebp {
  webpBuffer: Buffer;
  sha256: string;
  width: number;
  height: number;
}

export async function downloadAndConvertRealPhotoToWebp(
  imageUrl: string,
  timeoutMs = 8500,
  fallbackThumbnailUrl?: string,
): Promise<ValidatedRealWebp | null> {
  const tryFetch = async (urlToFetch: string, ms: number): Promise<ValidatedRealWebp | null> => {
    try {
      const res = await fetch(urlToFetch, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': REQUEST_USER_AGENT,
          Accept: 'image/webp,image/jpeg,image/png,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(ms),
      });
      if (!res.ok) return null;

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) return null;
      if (ct.includes('svg') || ct.includes('gif')) return null;

      const rawBuffer = Buffer.from(await res.arrayBuffer());
      if (rawBuffer.length < 4096 || rawBuffer.length > 15 * 1024 * 1024) return null;

      const meta = await sharp(rawBuffer).metadata();
      const format = (meta.format || '').toLowerCase();
      if (!format || format === 'svg' || format === 'gif') return null;

      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width < MIN_PHOTO_WIDTH || height < MIN_PHOTO_HEIGHT) return null;

      const aspect = width / height;
      if (aspect < MIN_ASPECT_RATIO || aspect > MAX_ASPECT_RATIO) return null;

      const stats = await sharp(rawBuffer).stats();
      const maxStdev = Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
      if (maxStdev < 8) return null;

      let pipe = sharp(rawBuffer).rotate();
      if (width > MAX_SAVED_WIDTH) {
        pipe = pipe.resize({
          width: MAX_SAVED_WIDTH,
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        });
      }

      const { data, info } = await pipe
        .webp({ quality: 84, effort: 4, smartSubsample: false })
        .toBuffer({ resolveWithObject: true });

      if (data.length < 1500) return null;

      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      return {
        webpBuffer: data,
        sha256,
        width: info.width,
        height: info.height,
      };
    } catch {
      return null;
    }
  };

  const direct = await tryFetch(imageUrl, timeoutMs);
  if (direct) return direct;
  // For geo-blocked German/EU industrial belt distributors (e.g. keilriemen24.eu, ayback-technik.de, kaufland.de),
  // fall back to Bing's cached CDN copy of the EXACT same original photograph.
  if (fallbackThumbnailUrl && /^https?:\/\/ts\d*\.mm\.bing\.net\//i.test(fallbackThumbnailUrl)) {
    return tryFetch(fallbackThumbnailUrl, 5000);
  }
  return null;
}

export function isValidWebpOnDisk(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 1000) return false;
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  } catch {
    return false;
  }
}

// =============================================================================
// Live On-Demand Real Web SKU Discovery + Permanent Disk Cache (Server Runtime)
// =============================================================================

export interface RealSkuProvenanceEntry {
  skuCode: string;
  matchType: 'EXACT_SKU_WEB' | 'CLOSE_SPEC_WEB';
  localPath: string;
  sourceUrl: string;
  sourcePageUrl: string;
  title: string;
  domain: string;
  query: string;
  sha256: string;
  width: number;
  height: number;
  verifiedAt: string;
}

const LIVE_SKU_DIR = path.resolve(process.cwd(), 'public/belt-catalog/skus-web');
const LIVE_PROVENANCE_DIR = path.resolve(process.cwd(), 'deliverables/belt-master-audit/live-sku-provenance');
const inFlightSkuDiscovery = new Map<string, Promise<RealSkuProvenanceEntry | null>>();

let cachedWebIndex: {
  entries: WebImageCandidate[];
  byKind: Record<string, WebImageCandidate[]>;
} | null = null;
let cachedWebIndexMtime = 0;

export function loadRealWebBeltIndex(): {
  entries: WebImageCandidate[];
  byKind: Record<string, WebImageCandidate[]>;
} {
  const indexPath = path.resolve(process.cwd(), 'server/data/realWebBeltIndex.json');
  try {
    const stat = fs.statSync(indexPath);
    if (!cachedWebIndex || stat.mtimeMs !== cachedWebIndexMtime) {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
        entries?: WebImageCandidate[];
      };
      const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).filter(
        (e) => !isCandidateUrlRejected(e.imageUrl, e.title, e.sourcePageUrl),
      );
      const byKind: Record<string, WebImageCandidate[]> = {};
      for (const e of entries) {
        const k = classifyBeltBroadKind('', '', `${e.title} ${e.imageUrl}`);
        if (!byKind[k]) byKind[k] = [];
        byKind[k].push(e);
      }
      cachedWebIndex = { entries, byKind };
      cachedWebIndexMtime = stat.mtimeMs;
    }
  } catch {
    if (!cachedWebIndex) cachedWebIndex = { entries: [], byKind: {} };
  }
  return cachedWebIndex;
}

export async function readLiveSkuProvenance(skuCode: string): Promise<RealSkuProvenanceEntry | null> {
  const safe = String(skuCode || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const p = path.join(LIVE_PROVENANCE_DIR, `${safe}.json`);
  try {
    const raw = await fsPromises.readFile(p, 'utf8');
    return JSON.parse(raw) as RealSkuProvenanceEntry;
  } catch {
    return null;
  }
}

export async function discoverAndCacheLiveSkuWebPhoto(
  sku: BeltSkuQueryInput,
): Promise<RealSkuProvenanceEntry | null> {
  const safe = String(sku.skuCode || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const existingProv = await readLiveSkuProvenance(sku.skuCode);
  const targetDiskAbs = path.join(LIVE_SKU_DIR, `${safe}.webp`);
  if (existingProv && isValidWebpOnDisk(targetDiskAbs) && !isCandidateUrlRejected(existingProv.sourceUrl, existingProv.title, existingProv.sourcePageUrl)) {
    return existingProv;
  }

  const inflight = inFlightSkuDiscovery.get(safe);
  if (inflight) return inflight;

  const task = (async (): Promise<RealSkuProvenanceEntry | null> => {
    const queries = buildSkuWebQueries(sku);
    const spec = translateWarehouseBeltSpec({
      rawName: sku.rawName,
      rawSize: sku.rawSize,
      profile: sku.profile,
      beltDivision: sku.beltDivision,
      backingOrCoating: sku.backingOrCoating,
    });
    const specTokens = extractAlphanumericSpecTokens(`${sku.rawName} ${sku.rawSize || ''} ${spec.primaryDesignation}`);
    const candidates: WebImageCandidate[] = [];
    const seenUrls = new Set<string>();

    const addCandidates = (list: WebImageCandidate[]) => {
      for (const c of list) {
        if (!c.imageUrl || seenUrls.has(c.imageUrl)) continue;
        if (isCandidateUrlRejected(c.imageUrl, c.title, c.sourcePageUrl)) continue;
        seenUrls.add(c.imageUrl);
        candidates.push(c);
      }
    };

    // 1. Live multi-language internet search: EN + DE + Brandless + FA + Allaoui Shop
    const searchPromises: Array<Promise<WebImageCandidate[]>> = [];
    for (const q of queries.slice(0, 3)) {
      searchPromises.push(searchBingImages(q, 24, 7500).catch(() => []));
    }
    if (spec.primaryDesignation) {
      const allaQ = `${isGenericBrandName(sku.brand) ? '' : sku.brand} ${spec.primaryDesignation}`.trim();
      searchPromises.push(searchAllaouiBelts(allaQ, 6500).catch(() => []));
    }

    const liveBatches = await Promise.all(searchPromises);
    for (const b of liveBatches) addCandidates(b);

    if (candidates.length < 4 && queries[3]) {
      addCandidates(await searchBingImages(queries[3], 20, 7000).catch(() => []));
    }

    // Supplement with clean pre-harvested real web index candidates
    const webIndex = loadRealWebBeltIndex();
    const targetKind = classifyBeltBroadKind(sku.beltDivision, sku.profile, sku.rawName);
    const kindPool = webIndex.byKind[targetKind] || webIndex.entries;
    if (kindPool.length > 0) {
      addCandidates(kindPool.slice(0, 120));
    }

    const scored = candidates
      .map((c) => ({
        c,
        score: scoreWebCandidate(c, {
          brand: sku.brand,
          profile: sku.profile,
          beltDivision: sku.beltDivision,
          name: sku.rawName,
          rawSize: sku.rawSize,
          specTokens,
          strictSkuMode: true,
        }),
      }))
      .filter((x) => x.score > 20)
      .sort((a, b) => b.score - a.score);

    const allDesignations = [spec.primaryDesignation, ...spec.altDesignations].filter(Boolean);

    for (const item of scored.slice(0, 10)) {
      const downloaded = await downloadAndConvertRealPhotoToWebp(
        item.c.imageUrl,
        7500,
        item.c.thumbnailFallbackUrl,
      );
      if (!downloaded) continue;

      // Pixel-level physical marking gate via free-tier Gemini 4 Hydrogen (when configured):
      // Reject watermarked images, competitor brand prints, or wrong belt construction BEFORE caching.
      const vision = await inspectBeltPhysicalMarking(downloaded.webpBuffer, 'image/webp', {
        brand: sku.brand,
        profile: sku.profile,
        expectedCode: spec.primaryDesignation,
      });
      if (
        vision.visionChecked &&
        (vision.verdict === 'REJECTED_WATERMARK' ||
          vision.verdict === 'REJECTED_COMPETITOR_BRAND' ||
          vision.verdict === 'REJECTED_WRONG_STRUCTURE')
      ) {
        continue;
      }

      await fsPromises.mkdir(LIVE_SKU_DIR, { recursive: true });
      await fsPromises.mkdir(LIVE_PROVENANCE_DIR, { recursive: true });
      await fsPromises.writeFile(targetDiskAbs, downloaded.webpBuffer);

      const candidateText = `${item.c.title} ${item.c.imageUrl}`;
      const hasExactCodeMatch =
        vision.verdict === 'VERIFIED_EXACT_MARKING' ||
        allDesignations.some((d) => hasExactTokenBoundaryDesignationMatch(candidateText, d));
      const entry: RealSkuProvenanceEntry = {
        skuCode: sku.skuCode,
        matchType: hasExactCodeMatch ? 'EXACT_SKU_WEB' : 'CLOSE_SPEC_WEB',
        localPath: `/belt-catalog/skus-web/${encodeURIComponent(safe)}.webp`,
        sourceUrl: item.c.imageUrl,
        sourcePageUrl: item.c.sourcePageUrl,
        title: item.c.title,
        domain: item.c.domain,
        query: queries[0] || '',
        sha256: downloaded.sha256,
        width: downloaded.width,
        height: downloaded.height,
        verifiedAt: new Date().toISOString(),
      };
      await fsPromises.writeFile(
        path.join(LIVE_PROVENANCE_DIR, `${safe}.json`),
        JSON.stringify(entry, null, 2),
        'utf8',
      );
      return entry;
    }

    return null;
  })();

  inFlightSkuDiscovery.set(safe, task);
  try {
    return await task;
  } finally {
    inFlightSkuDiscovery.delete(safe);
  }
}
