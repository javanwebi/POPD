#!/usr/bin/env bun
/**
 * High-Speed Real-Web Industrial Belt Image Harvester
 * -----------------------------------------------------------------------------
 * Replaces ALL generic 14-folder archetypes and ALL synthetic studio-stamped
 * SKU templates with 100% REAL physical belt photographs discovered across the
 * internet (Bing Images + Allaoui Shop + TotallyBelts + Official Distributors).
 *
 * Outputs:
 *  - public/belt-catalog/families/<familyCode>/01-main.webp .. 04-closeup.webp
 *  - public/belt-catalog/skus-web/<skuCode>.webp (for directly searched SKUs)
 *  - deliverables/belt-master-audit/web_real_family_provenance.json
 *  - deliverables/belt-master-audit/web_real_sku_mapping.json
 *  - server/data/realWebBeltIndex.json
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  buildFamilyWebQueries,
  buildSkuWebQueries,
  classifyBeltBroadKind,
  downloadAndConvertRealPhotoToWebp,
  extractAlphanumericSpecTokens,
  extractDomainFromUrl,
  isCandidateUrlRejected,
  isGenericBrandName,
  isValidWebpOnDisk,
  REQUEST_USER_AGENT,
  scoreWebCandidate,
  searchAllaouiBelts,
  searchBingImages,
  translateWarehouseBeltSpec,
  type BeltFamilyQueryInput,
  type BeltSkuQueryInput,
  type WebImageCandidate,
} from '../server/realWebBeltEngine';

const ROOT_DIR = process.cwd();
const DELIVERABLES_DIR = path.join(ROOT_DIR, 'deliverables/belt-master-audit');
const SERVER_DATA_DIR = path.join(ROOT_DIR, 'server/data');
const FAMILIES_PUBLIC_ROOT = path.join(ROOT_DIR, 'public/belt-catalog/families');
const SKUS_PUBLIC_ROOT = path.join(ROOT_DIR, 'public/belt-catalog/skus');
const SKUS_WEB_PUBLIC_ROOT = path.join(ROOT_DIR, 'public/belt-catalog/skus-web');
const MANIFEST_TS_PATH = path.join(ROOT_DIR, 'src/generated/beltCatalogManifest.ts');

const FAMILY_PROV_OUT = path.join(DELIVERABLES_DIR, 'web_real_family_provenance.json');
const SKU_MAP_OUT = path.join(DELIVERABLES_DIR, 'web_real_sku_mapping.json');
const WEB_INDEX_OUT = path.join(SERVER_DATA_DIR, 'realWebBeltIndex.json');

const SLOT_FILES = ['01-main.webp', '02-angle.webp', '03-detail.webp', '04-closeup.webp'] as const;

interface HarvestedFamilySlot {
  slotIndex: 1 | 2 | 3 | 4;
  slotName: string;
  localPath: string;
  sourceUrl: string;
  sourcePageUrl: string;
  title: string;
  domain: string;
  query: string;
  sha256: string;
  width: number;
  height: number;
  engine: string;
  verifiedAt: string;
}

interface HarvestedSkuEntry {
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

const MAJOR_LOCKED_BRANDS = new Set([
  'SWR',
  'OPTIBELT',
  'MEGADYNE',
  'DONGIL',
  'BANDO',
  'MITSUBOSHI',
  'MITSUBISHI',
  'HANCHANG',
  'VOLTA',
  'FORZA',
  'GATES',
  'CONTITECH',
]);

async function harvestForeignBrandSeeds(): Promise<WebImageCandidate[]> {
  const brandQueries = [
    // SWR (Germany) — largest brand in catalog (1,464 SKUs / 45 families)
    'SWR Keilriemen ebay',
    'SWR Keilriemen A 13x DIN 2215',
    'SWR Keilriemen 13x480 A19',
    'SWR Keilriemen 13x406 A16',
    'SWR Keilriemen B 17x DIN 2215',
    'SWR Keilriemen C 22x DIN 2215',
    'SWR Keilriemen Z 10x DIN 2215',
    'SWR Keilriemen D 32x DIN 2215',
    'SWR Schmalkeilriemen SPZ',
    'SWR Schmalkeilriemen SPA',
    'SWR Schmalkeilriemen SPB',
    'SWR Schmalkeilriemen SPC',
    'SWR Keilriemen XPZ gezahnt',
    'SWR Keilriemen XPA gezahnt',
    'SWR Keilriemen XPB gezahnt',
    'SWR Keilriemen XPC gezahnt',
    'SWR Keilriemen AX gezahnt',
    'SWR Keilriemen BX gezahnt',
    'SWR Keilriemen CX gezahnt',
    'SWR Keilriemen AVX 10',
    'SWR Keilriemen AVX 13',
    'SWR Zahnriemen HTD 8M',
    'SWR Zahnriemen HTD 5M',
    'SWR Keilrippenriemen PJ PK',
    // DRB Dongil (South Korea) — 664 SKUs / 39 families
    'DRB Dongil Super Star V-belt',
    'Dongil V-belt A B C classical',
    'DRB Dongil cogged V-belt AX BX',
    'DRB Dongil wedge belt SPZ SPA SPB SPC',
    'DRB Dongil timing belt HTD',
    'DRB Dongil ribbed belt PK PJ',
    // Optibelt (Germany) — 318 SKUs / 80 families
    'Optibelt VB classical V-belt A B C',
    'Optibelt SK wedge belt SPZ SPA SPB SPC',
    'Optibelt Super X-Power XPA XPB XPC XPZ',
    'Optibelt Omega HTD timing belt 5M 8M 14M',
    'Optibelt Alpha Power polyurethane timing belt T5 T10 AT5 AT10',
    'Optibelt RB poly-V ribbed belt PJ PK PL',
    'Optibelt ZR imperial timing belt XL L H',
    // Megadyne (Italy) — 333 SKUs / 66 families
    'Megadyne Isoran RPP timing belt 5M 8M 14M',
    'Megadyne Megalinear polyurethane timing belt T10 AT10 AT20',
    'Megadyne Oleostatic V-belt A B C SPZ SPA SPB',
    'Megadyne Linea-X cogged V-belt XPA XPB',
    'Megadyne PV ribbed poly-V belt PJ PK PL',
    // Bando (Japan) — 63 SKUs / 14 families
    'Bando Power King V-belt A B C',
    'Bando Synchro-Link timing belt XL L H HTD',
    'Bando Rib Ace poly-V belt PJ PK',
    // Mitsuboshi (Japan) — 37 SKUs / 12 families
    'Mitsuboshi classical V-belt A B C',
    'Mitsuboshi timing belt MXL XL L H S8M',
    'Mitsuboshi Maxstar wedge belt SPA SPB',
    // Hanchang (South Korea) — 207 SKUs / 23 families
    'Hanchang V-belt industrial Korea',
    'Hanchang wrapped V-belt A B C',
    'Hanchang cogged raw edge V-belt',
    // Volta (Israel/EU) — 27 SKUs / 8 families
    'Volta Belting polyurethane round belt green',
    'Volta Belting thermoplastic V-belt',
    'Volta Belting flat conveyor belt PU',
    // Forza — 586 SKUs / 81 families
    'Forza polyurethane timing belt AT10 AT20 T10',
    'Forza industrial V-belt classical',
    // Gates & ContiTech
    'Gates PowerGrip HTD timing belt',
    'ContiTech Conti-V classical V-belt Keilriemen',
  ];

  const out: WebImageCandidate[] = [];
  const seen = new Set<string>();
  await runPool(brandQueries, 10, async (q) => {
    const items = await searchBingImages(q, 30, 9000).catch(() => []);
    for (const item of items) {
      if (seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      out.push(item);
    }
  });
  return out;
}

function sha256File(filePath: string): string {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, idx: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// =============================================================================
// Phase 1: Bulk Harvest Real Belt Catalogs from TotallyBelts & Allaoui Shop
// =============================================================================

async function harvestTotallyBeltsCatalog(): Promise<WebImageCandidate[]> {
  const out: WebImageCandidate[] = [];
  const seen = new Set<string>();
  const pages = [1, 2, 3, 4, 5, 6, 7, 8];
  await runPool(pages, 4, async (page) => {
    try {
      const res = await fetch(`https://www.totallybelts.com/products.json?limit=250&page=${page}`, {
        headers: { 'User-Agent': REQUEST_USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        products?: Array<{
          title?: string;
          handle?: string;
          vendor?: string;
          images?: Array<{ src?: string; width?: number; height?: number }>;
        }>;
      };
      for (const p of data.products || []) {
        const title = `${p.vendor || ''} ${p.title || ''}`.trim();
        const pageUrl = p.handle ? `https://www.totallybelts.com/products/${p.handle}` : 'https://www.totallybelts.com';
        for (const img of (p.images || []).slice(0, 2)) {
          const src = String(img.src || '').trim();
          if (!src || seen.has(src)) continue;
          if (isCandidateUrlRejected(src, title, pageUrl)) continue;
          seen.add(src);
          out.push({
            imageUrl: src,
            sourcePageUrl: pageUrl,
            title,
            domain: 'totallybelts.com',
            width: img.width,
            height: img.height,
            engine: 'totallybelts',
            extractedTokens: extractAlphanumericSpecTokens(`${title} ${src}`),
          });
        }
      }
    } catch {
      // Ignore single page failure
    }
  });
  return out;
}

async function harvestAllaouiSeedCatalog(): Promise<WebImageCandidate[]> {
  const seedQueries = [
    'optibelt timing belt',
    'optibelt 8m',
    'optibelt 5m',
    'optibelt 14m',
    'optibelt zr',
    'optibelt l timing',
    'optibelt h timing',
    'optibelt xl timing',
    'optibelt t5',
    'optibelt t10',
    'optibelt at5',
    'optibelt at10',
    'optibelt spa',
    'optibelt spb',
    'optibelt spc',
    'optibelt spz',
    'optibelt xpa',
    'optibelt xpb',
    'optibelt pj',
    'optibelt pk',
    'optibelt pl',
    'optibelt v-belt',
    'megadyne timing belt',
    'megadyne rpp8',
    'megadyne 8m',
    'megadyne 5m',
    'megadyne t5',
    'megadyne t10',
    'megadyne at10',
    'megadyne h',
    'megadyne v-belt',
    'bando timing belt',
    'bando v-belt',
    'gates powergrip',
    'gates timing belt',
    'gates v-belt',
    'contitech timing belt',
    'contitech v-belt',
    'mitsuboshi belt',
    'poly-v belt',
    'flat belt',
    'conveyor belt',
    'round belt',
  ];

  const out: WebImageCandidate[] = [];
  const seen = new Set<string>();
  await runPool(seedQueries, 6, async (q) => {
    const items = await searchAllaouiBelts(q, 9000);
    for (const item of items) {
      if (seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      out.push(item);
    }
  });
  return out;
}

// =============================================================================
// Main Harvester Pipeline
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const directSkuLimitArg = args.find((a) => a.startsWith('--direct-skus='));
  const directSkuLimit = directSkuLimitArg ? Number(directSkuLimitArg.split('=')[1]) : 160;
  const familyConcurrencyArg = args.find((a) => a.startsWith('--concurrency='));
  const familyConcurrency = familyConcurrencyArg ? Number(familyConcurrencyArg.split('=')[1]) : 12;

  console.log('=== REAL-WEB BELT IMAGE HARVESTER START ===');
  const tStart = Date.now();

  // Load runtime manifest + svg lookup + existing exact image manifest
  const manifestSrc = fs.readFileSync(MANIFEST_TS_PATH, 'utf8');
  const m = manifestSrc.match(/export const beltCatalogManifest = ([\s\S]*?) as const;/);
  if (!m) throw new Error('Could not parse src/generated/beltCatalogManifest.ts');
  const runtimeManifest = JSON.parse(m[1]);
  const svgLookup = JSON.parse(fs.readFileSync(path.join(SERVER_DATA_DIR, 'beltSvgLookup.json'), 'utf8'));
  const oldImageManifest = JSON.parse(fs.readFileSync(path.join(DELIVERABLES_DIR, 'image_manifest.json'), 'utf8'));

  // Load existing harvested family provenance if resuming
  let familyProv: Record<string, HarvestedFamilySlot[]> = {};
  if (fs.existsSync(FAMILY_PROV_OUT)) {
    try {
      familyProv = JSON.parse(fs.readFileSync(FAMILY_PROV_OUT, 'utf8'));
    } catch {
      familyProv = {};
    }
  }

  // Global candidate index (deduped by imageUrl)
  const globalIndexMap = new Map<string, WebImageCandidate>();
  const addToGlobalIndex = (list: WebImageCandidate[]) => {
    for (const c of list) {
      if (!c.imageUrl || globalIndexMap.has(c.imageUrl)) continue;
      globalIndexMap.set(c.imageUrl, c);
    }
  };

  // Load existing verified/index.json real URLs into global index
  const verifiedIdxPath = path.join(ROOT_DIR, 'public/belt-catalog/verified/index.json');
  if (fs.existsSync(verifiedIdxPath)) {
    const vIdx = JSON.parse(fs.readFileSync(verifiedIdxPath, 'utf8'));
    for (const [key, item] of Object.entries<any>(vIdx.assets || {})) {
      if (item?.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) {
        addToGlobalIndex([
          {
            imageUrl: item.sourceUrl,
            sourcePageUrl: item.sourcePageUrl || item.sourceUrl,
            title: `${item.manufacturer || ''} ${key.replace(/_/g, ' ')}`.trim(),
            domain: extractDomainFromUrl(item.sourcePageUrl || item.sourceUrl),
            engine: 'verified-local',
            extractedTokens: extractAlphanumericSpecTokens(`${key} ${item.sourceUrl}`),
          },
        ]);
      }
    }
  }

  // Phase 1: Harvest TotallyBelts, Allaoui, and Foreign Brand-Locked Seeds in parallel
  console.log('[Phase 1] Harvesting TotallyBelts, Allaoui Shop & Foreign Brand-Locked Seeds (SWR/Optibelt/Dongil/Megadyne/Bando/etc.)...');
  const [tbItems, allaItems, brandSeedItems] = await Promise.all([
    harvestTotallyBeltsCatalog(),
    harvestAllaouiSeedCatalog(),
    harvestForeignBrandSeeds(),
  ]);
  addToGlobalIndex(tbItems);
  addToGlobalIndex(allaItems);
  addToGlobalIndex(brandSeedItems);
  console.log(
    `[Phase 1] Done in ${((Date.now() - tStart) / 1000).toFixed(1)}s — TotallyBelts: ${tbItems.length}, Allaoui: ${allaItems.length}, Brand Seeds: ${brandSeedItems.length}, Global pool: ${globalIndexMap.size}`,
  );

  // Determine canonical families to populate (all PFAM-* + unaliased FAM-*)
  const aliases: Record<string, string> = runtimeManifest.aliases || {};
  const allManifestFamCodes = Object.keys(runtimeManifest.families || {});
  const canonicalFamCodes = allManifestFamCodes.filter((code) => {
    const aliased = aliases[code];
    return !(aliased && runtimeManifest.families[aliased]);
  });
  console.log(
    `[Phase 2] Canonical families: ${canonicalFamCodes.length} (out of ${allManifestFamCodes.length} manifest keys, ${allManifestFamCodes.length - canonicalFamCodes.length} aliases)`,
  );

  // Seed already-verified exact family slots from old image_manifest (ONLY genuine non-archetype local files!)
  const globalUrlUseCounts = new Map<string, number>();
  for (const famCode of canonicalFamCodes) {
    const existingOld: any[] = oldImageManifest.verifiedFamilyPhotos?.[famCode] || [];
    const exactLocal: HarvestedFamilySlot[] = [];

    // Also include any already-resumed slots from familyProv ONLY if they pass our upgraded strict foreign + brand-lock gates!
    const famMetaForResume = svgLookup.families?.[famCode] || {};
    const famBrandUpper = String(famMetaForResume.brand || 'UNSPECIFIED').trim().toUpperCase();
    const isMajorBrand = MAJOR_LOCKED_BRANDS.has(famBrandUpper);
    const minResumeScore = isMajorBrand ? 250 : 60;
    const resumed = familyProv[famCode] || [];
    for (const s of resumed) {
      const diskAbs = path.join(FAMILIES_PUBLIC_ROOT, famCode, s.slotName);
      if (!isValidWebpOnDisk(diskAbs) || !s.sourceUrl || !/^https?:\/\//i.test(s.sourceUrl)) continue;
      if (isCandidateUrlRejected(s.sourceUrl, s.title || '', s.sourcePageUrl || '')) continue;
      const qualityScore = scoreWebCandidate(
        {
          imageUrl: s.sourceUrl,
          sourcePageUrl: s.sourcePageUrl || s.sourceUrl,
          title: s.title || '',
          domain: s.domain || extractDomainFromUrl(s.sourcePageUrl || s.sourceUrl),
          engine: (s.engine as WebImageCandidate['engine']) || 'bing',
        },
        {
          brand: famMetaForResume.brand || 'UNSPECIFIED',
          profile: (famMetaForResume.dominantProfiles || [])[0] || '',
          beltDivision: famMetaForResume.dominantDivision || runtimeManifest.families[famCode]?.d || '',
          name: famMetaForResume.familyName || famCode,
        },
      );
      if (qualityScore < minResumeScore) continue; // Purge Iranian, off-topic, wrong-brand, or wrong-profile slots!
      exactLocal.push(s);
      globalUrlUseCounts.set(s.sourceUrl, (globalUrlUseCounts.get(s.sourceUrl) || 0) + 1);
      addToGlobalIndex([
        {
          imageUrl: s.sourceUrl,
          sourcePageUrl: s.sourcePageUrl || s.sourceUrl,
          title: s.title || famCode,
          domain: s.domain || extractDomainFromUrl(s.sourcePageUrl || s.sourceUrl),
          width: s.width,
          height: s.height,
          engine: (s.engine as WebImageCandidate['engine']) || 'bing',
          extractedTokens: extractAlphanumericSpecTokens(`${s.title || ''} ${s.sourceUrl}`),
        },
      ]);
    }

    for (const s of existingOld) {
      if (!s || s.matchType === 'PROFILE_MATCHED' || String(s.localPath || '').includes('/archetypes/')) continue;
      const slotIdx = Number(s.slotIndex) as 1 | 2 | 3 | 4;
      if (exactLocal.some((x) => x.slotIndex === slotIdx)) continue;
      const slotName = SLOT_FILES[slotIdx - 1];
      const diskAbs = path.join(FAMILIES_PUBLIC_ROOT, famCode, slotName);
      if (!isValidWebpOnDisk(diskAbs)) continue;
      const srcUrl = String(s.sourceUrl || '').trim();
      if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) continue;
      if (isCandidateUrlRejected(srcUrl, String(s.title || s.noteFa || ''), String(s.sourcePageUrl || ''))) continue;
      const oldScore = scoreWebCandidate(
        {
          imageUrl: srcUrl,
          sourcePageUrl: String(s.sourcePageUrl || srcUrl),
          title: String(s.title || s.noteFa || ''),
          domain: extractDomainFromUrl(s.sourcePageUrl || srcUrl),
          engine: 'verified-local',
        },
        {
          brand: famMetaForResume.brand || 'UNSPECIFIED',
          profile: (famMetaForResume.dominantProfiles || [])[0] || '',
          beltDivision: famMetaForResume.dominantDivision || runtimeManifest.families[famCode]?.d || '',
          name: famMetaForResume.familyName || famCode,
        },
      );
      if (oldScore < minResumeScore) continue;
      exactLocal.push({
        slotIndex: slotIdx,
        slotName,
        localPath: `/belt-catalog/families/${encodeURIComponent(famCode)}/${slotName}`,
        sourceUrl: srcUrl,
        sourcePageUrl: String(s.sourcePageUrl || ''),
        title: String(s.title || s.noteFa || famCode),
        domain: extractDomainFromUrl(s.sourcePageUrl || srcUrl) || String(s.manufacturer || 'verified'),
        query: 'verified-exact-brand',
        sha256: s.sha256 || sha256File(diskAbs),
        width: 800,
        height: 600,
        engine: 'verified-local',
        verifiedAt: new Date().toISOString(),
      });
      globalUrlUseCounts.set(srcUrl, (globalUrlUseCounts.get(srcUrl) || 0) + 1);
    }

    familyProv[famCode] = exactLocal;
  }

  // Group candidates by broad kind for fast fallback lookup
  const poolByKind = new Map<string, WebImageCandidate[]>();
  const rebuildPoolByKind = () => {
    poolByKind.clear();
    for (const c of globalIndexMap.values()) {
      const k = classifyBeltBroadKind('', '', `${c.title} ${c.imageUrl}`);
      if (!poolByKind.has(k)) poolByKind.set(k, []);
      poolByKind.get(k)!.push(c);
    }
  };
  rebuildPoolByKind();

  // Cache Bing search results by normalized query so identical queries aren't repeated
  const bingQueryCache = new Map<string, WebImageCandidate[]>();
  const queryBingCached = async (q: string): Promise<WebImageCandidate[]> => {
    const key = q.toLowerCase().trim();
    if (bingQueryCache.has(key)) return bingQueryCache.get(key)!;
    const res = await searchBingImages(q, 35, 9000).catch(() => []);
    bingQueryCache.set(key, res);
    addToGlobalIndex(res);
    return res;
  };

  // Phase 2: Fetch 4 EXACT, REAL, DISTINCT web photos for EVERY canonical family!
  const familiesNeedingPhotos = canonicalFamCodes.filter((c) => (familyProv[c]?.length || 0) < 4);
  console.log(
    `[Phase 2] Families already having 4 real photos: ${canonicalFamCodes.length - familiesNeedingPhotos.length}, needing real web fetch: ${familiesNeedingPhotos.length}`,
  );

  let completedFamilies = 0;
  let downloadedFamilyPhotos = 0;
  let searchQueriesRun = 0;

  await runPool(familiesNeedingPhotos, familyConcurrency, async (famCode) => {
    const famMeta = svgLookup.families?.[famCode] || {};
    const manifestEntry = runtimeManifest.families[famCode] || {};
    const famInput: BeltFamilyQueryInput = {
      familyCode: famCode,
      familyName: famMeta.familyName || famCode,
      brand: famMeta.brand || 'UNSPECIFIED',
      beltDivision: famMeta.dominantDivision || manifestEntry.d || 'vbelt-classical',
      profiles: Array.isArray(famMeta.dominantProfiles) ? famMeta.dominantProfiles : [],
      bodyMaterial: famMeta.dominantBodyMaterial || '',
      backingOrCoating: famMeta.backingOrCoating || null,
      supplyForm: famMeta.dominantSupplyForm || '',
      sampleSkus: famMeta.sampleSkus || [],
    };

    const existingSlots = familyProv[famCode] || [];
    const filledIndices = new Set<number>(existingSlots.map((s) => s.slotIndex));
    const usedShasInFam = new Set<string>(existingSlots.map((s) => s.sha256));
    const usedUrlsInFam = new Set<string>(existingSlots.map((s) => s.sourceUrl));

    const queries = buildFamilyWebQueries(famInput);
    const localCandidates: WebImageCandidate[] = [];
    const seenCandUrl = new Set<string>();
    const addCand = (list: WebImageCandidate[]) => {
      for (const c of list) {
        if (!c.imageUrl || seenCandUrl.has(c.imageUrl) || usedUrlsInFam.has(c.imageUrl)) continue;
        seenCandUrl.add(c.imageUrl);
        localCandidates.push(c);
      }
    };

    // Run multi-language queries (EN + DE + sample SKU + construction fallback) on Bing Images
    if (queries[0]) {
      searchQueriesRun++;
      addCand(await queryBingCached(queries[0]));
    }
    if (queries[1] && localCandidates.length < 22) {
      searchQueriesRun++;
      addCand(await queryBingCached(queries[1]));
    }
    if (queries[2] && localCandidates.length < 22) {
      searchQueriesRun++;
      addCand(await queryBingCached(queries[2]));
    }
    if (queries[3] && localCandidates.length < 22) {
      searchQueriesRun++;
      addCand(await queryBingCached(queries[3]));
    }

    // Supplement from harvested Brand Seeds + Allaoui + TotallyBelts matching this brand AND broad kind
    const famBrandUp = isGenericBrandName(famInput.brand) ? '' : String(famInput.brand || '').trim().toUpperCase();
    if (famBrandUp) {
      let brandAdded = 0;
      for (const c of globalIndexMap.values()) {
        const txt = `${c.title} ${c.imageUrl} ${c.sourcePageUrl}`.toUpperCase();
        if (txt.includes(famBrandUp) || (famBrandUp === 'DONGIL' && txt.includes('DRB'))) {
          addCand([c]);
          brandAdded++;
          if (brandAdded >= 120) break;
        }
      }
    }
    const broadKind = classifyBeltBroadKind(famInput.beltDivision, famInput.profiles[0], famInput.familyName);
    const kindPool = poolByKind.get(broadKind) || [];
    addCand(kindPool.slice(0, 120));

    if (localCandidates.length < 24) {
      const broadFallbackQueryMap: Record<string, string> = {
        timing: 'industrial timing belt rubber synchronous toothed belt',
        vbelt: 'industrial classical rubber v-belt drive belt',
        ribbed: 'poly-v ribbed drive belt multi-rib belt',
        conveyor: 'pvc pu industrial conveyor belt roll',
        flat: 'industrial flat transmission drive belt',
        round: 'polyurethane round drive belt cord roll',
        link: 'link v-belt polyurethane detachable drive belt',
        hexagonal: 'double sided hexagonal v-belt industrial',
        other: 'industrial power transmission drive belt rubber',
      };
      const fbQ = broadFallbackQueryMap[broadKind] || broadFallbackQueryMap.other;
      searchQueriesRun++;
      addCand(await queryBingCached(fbQ));
    }

    const primaryProfile = famInput.profiles[0] || '';
    const sampleTokens = (famInput.sampleSkus || [])
      .slice(0, 3)
      .flatMap((s) => extractAlphanumericSpecTokens(s.name || ''))
      .slice(0, 4);

    const ranked = localCandidates
      .map((c) => ({
        c,
        score: scoreWebCandidate(
          c,
          {
            brand: famInput.brand,
            profile: primaryProfile,
            beltDivision: famInput.beltDivision,
            name: famInput.familyName,
            specTokens: sampleTokens,
          },
          globalUrlUseCounts,
        ),
      }))
      .filter((x) => x.score > -250)
      .sort((a, b) => b.score - a.score);

    const famDir = path.join(FAMILIES_PUBLIC_ROOT, famCode);
    await fsPromises.mkdir(famDir, { recursive: true });

    const missingIndices = ([1, 2, 3, 4] as const).filter((idx) => !filledIndices.has(idx));
    let candCursor = 0;

    for (const slotIdx of missingIndices) {
      const slotName = SLOT_FILES[slotIdx - 1];
      let savedSlot: HarvestedFamilySlot | null = null;

      // Try up to 24 ranked candidates for this slot until a real, valid, non-duplicate photo succeeds
      let tries = 0;
      while (candCursor < ranked.length && tries < 24) {
        const { c } = ranked[candCursor++];
        if (usedUrlsInFam.has(c.imageUrl)) continue;
        tries++;

        const validated = await downloadAndConvertRealPhotoToWebp(
          c.imageUrl,
          7000,
          c.thumbnailFallbackUrl,
        );
        if (!validated) continue;
        if (usedShasInFam.has(validated.sha256)) continue;

        const diskAbs = path.join(famDir, slotName);
        await fsPromises.writeFile(diskAbs, validated.webpBuffer);

        usedShasInFam.add(validated.sha256);
        usedUrlsInFam.add(c.imageUrl);
        globalUrlUseCounts.set(c.imageUrl, (globalUrlUseCounts.get(c.imageUrl) || 0) + 1);
        downloadedFamilyPhotos++;

        savedSlot = {
          slotIndex: slotIdx,
          slotName,
          localPath: `/belt-catalog/families/${encodeURIComponent(famCode)}/${slotName}`,
          sourceUrl: c.imageUrl,
          sourcePageUrl: c.sourcePageUrl,
          title: c.title,
          domain: c.domain,
          query: queries[0] || '',
          sha256: validated.sha256,
          width: validated.width,
          height: validated.height,
          engine: c.engine,
          verifiedAt: new Date().toISOString(),
        };
        break;
      }

      if (savedSlot) {
        existingSlots.push(savedSlot);
      }
    }

    existingSlots.sort((a, b) => a.slotIndex - b.slotIndex);
    familyProv[famCode] = existingSlots;
    completedFamilies++;

    if (completedFamilies % 30 === 0 || completedFamilies === familiesNeedingPhotos.length) {
      fs.writeFileSync(FAMILY_PROV_OUT, JSON.stringify(familyProv, null, 2), 'utf8');
      console.log(
        `[Phase 2] Progress: ${completedFamilies}/${familiesNeedingPhotos.length} families | downloaded: ${downloadedFamilyPhotos} | Bing queries: ${searchQueriesRun} | Global pool: ${globalIndexMap.size}`,
      );
    }
  });

  // Save final family provenance + global real web belt index
  fs.writeFileSync(FAMILY_PROV_OUT, JSON.stringify(familyProv, null, 2), 'utf8');
  const allIndexEntries = Array.from(globalIndexMap.values());
  fs.writeFileSync(
    WEB_INDEX_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalRealWebPhotos: allIndexEntries.length,
        entries: allIndexEntries,
      },
      null,
      0,
    ),
    'utf8',
  );
  console.log(
    `[Phase 2] COMPLETE in ${((Date.now() - tStart) / 1000).toFixed(1)}s — Saved ${allIndexEntries.length} real web belt photos to index.`,
  );

  // ===========================================================================
  // Phase 3: Real-Web SKU Matching + Direct Web Search for Priority SKUs
  // ===========================================================================
  console.log('[Phase 3] Matching ALL belt SKUs to real web belt photographs + running direct SKU web searches...');

  // Rebuild kind-grouped index from all ~10k+ harvested web candidates
  rebuildPoolByKind();

  // Build token inverted index over globalIndexMap for instant O(1) exact SKU matching across 8,000 SKUs!
  const tokenToCandidates = new Map<string, WebImageCandidate[]>();
  for (const c of allIndexEntries) {
    const tokens = c.extractedTokens || extractAlphanumericSpecTokens(`${c.title} ${c.imageUrl}`);
    for (const tok of tokens) {
      if (tok.length < 2) continue;
      let list = tokenToCandidates.get(tok);
      if (!list) {
        list = [];
        tokenToCandidates.set(tok, list);
      }
      if (list.length < 60) list.push(c);
    }
  }

  const verifiedSkuPhotos = oldImageManifest.verifiedSkuPhotos || {};
  const allManifestSkus = Object.keys(runtimeManifest.skus || {});

  // Select diverse priority SKUs for direct live Bing+Allaoui SKU search & local WebP download
  // Explicitly include user-referenced SWR SKUs (11229 A19, 11226 A16) + top SKUs across ALL major brands!
  const directSearchSkus: string[] = [];
  const seenDirectSku = new Set<string>();
  const forceIncludeSkus = ['11229', '11226'];
  for (const code of forceIncludeSkus) {
    if (svgLookup.skus?.[code] && !verifiedSkuPhotos[code] && !seenDirectSku.has(code)) {
      directSearchSkus.push(code);
      seenDirectSku.add(code);
    }
  }
  const seenDirectFam = new Map<string, number>();
  // First pass: major named brands (SWR, OPTIBELT, MEGADYNE, DONGIL, BANDO, HANCHANG, FORZA, MITSUBOSHI, VOLTA)
  const prioritizedFams = [...canonicalFamCodes].sort((a, b) => {
    const ba = String(svgLookup.families?.[a]?.brand || '').toUpperCase();
    const bb = String(svgLookup.families?.[b]?.brand || '').toUpperCase();
    const pa = MAJOR_LOCKED_BRANDS.has(ba) ? 0 : 1;
    const pb = MAJOR_LOCKED_BRANDS.has(bb) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (svgLookup.families?.[b]?.skuCount || 0) - (svgLookup.families?.[a]?.skuCount || 0);
  });
  for (const famCode of prioritizedFams) {
    if (directSearchSkus.length >= directSkuLimit) break;
    const fam = svgLookup.families?.[famCode];
    const sample = fam?.sampleSkus || [];
    for (const s of sample) {
      const code = String(s.sku || '').trim();
      if (!code || verifiedSkuPhotos[code] || seenDirectSku.has(code)) continue;
      const cCount = seenDirectFam.get(famCode) || 0;
      if (cCount >= 1) continue;
      seenDirectFam.set(famCode, cCount + 1);
      seenDirectSku.add(code);
      directSearchSkus.push(code);
      if (directSearchSkus.length >= directSkuLimit) break;
    }
  }

  console.log(`[Phase 3a] Running strict multi-language live web search & download for ${directSearchSkus.length} priority SKUs...`);
  await fsPromises.mkdir(SKUS_WEB_PUBLIC_ROOT, { recursive: true });
  const directSkuResults = new Map<string, HarvestedSkuEntry>();
  const globalSkuUrlUseCounts = new Map<string, number>();

  await runPool(directSearchSkus, 10, async (skuCode) => {
    const skuMeta = svgLookup.skus?.[skuCode];
    if (!skuMeta) return;
    const diskAbs = path.join(SKUS_WEB_PUBLIC_ROOT, `${skuCode}.webp`);
    const skuInput: BeltSkuQueryInput = {
      skuCode,
      familyCode: skuMeta.familyCode || runtimeManifest.skus[skuCode] || '',
      brand: skuMeta.brand || 'UNSPECIFIED',
      rawName: skuMeta.rawName || '',
      rawSize: skuMeta.rawSize || '',
      beltDivision: skuMeta.technical?.beltDivision || '',
      profile: skuMeta.technical?.profile || '',
      widthMm: skuMeta.technical?.nominalWidthMm ?? skuMeta.technical?.topWidthMm ?? null,
      lengthMm: skuMeta.technical?.pitchLengthMm ?? skuMeta.technical?.insideLengthMm ?? null,
      ribCount: skuMeta.technical?.ribCount ?? null,
    };

    const queries = buildSkuWebQueries(skuInput);
    const spec = translateWarehouseBeltSpec({
      rawName: skuInput.rawName,
      rawSize: skuInput.rawSize,
      profile: skuInput.profile,
      beltDivision: skuInput.beltDivision,
    });
    const specTokens = extractAlphanumericSpecTokens(`${skuInput.rawName} ${skuInput.rawSize || ''} ${spec.primaryDesignation}`);
    const cands: WebImageCandidate[] = [];
    const seen = new Set<string>();
    const pushCands = (list: WebImageCandidate[]) => {
      for (const c of list) {
        if (!c.imageUrl || seen.has(c.imageUrl)) continue;
        if (isCandidateUrlRejected(c.imageUrl, c.title, c.sourcePageUrl)) continue;
        seen.add(c.imageUrl);
        cands.push(c);
      }
    };

    // Multi-language queries: EN + DE + brandless + FA
    if (queries[0]) pushCands(await queryBingCached(queries[0]));
    if (queries[1]) pushCands(await queryBingCached(queries[1]));
    if (cands.length < 10 && queries[2]) pushCands(await queryBingCached(queries[2]));
    if (cands.length < 10 && queries[3]) pushCands(await queryBingCached(queries[3]));

    // Supplement SKU candidates with matching-brand harvested index photos so named brands always stay locked!
    const skuBrandUp = isGenericBrandName(skuInput.brand) ? '' : String(skuInput.brand || '').trim().toUpperCase();
    if (skuBrandUp) {
      let addedBrand = 0;
      for (const c of globalIndexMap.values()) {
        const txt = `${c.title} ${c.imageUrl} ${c.sourcePageUrl}`.toUpperCase();
        if (txt.includes(skuBrandUp) || (skuBrandUp === 'DONGIL' && txt.includes('DRB'))) {
          pushCands([c]);
          addedBrand++;
          if (addedBrand >= 80) break;
        }
      }
    }

    const scored = cands
      .map((c) => ({
        c,
        score: scoreWebCandidate(
          c,
          {
            brand: skuInput.brand,
            profile: skuInput.profile,
            beltDivision: skuInput.beltDivision,
            name: skuInput.rawName,
            rawSize: skuInput.rawSize,
            specTokens,
            strictSkuMode: true,
          },
          globalSkuUrlUseCounts,
        ),
      }))
      .filter((x) => x.score > 10)
      .sort((a, b) => b.score - a.score);

    const allDesignations = [spec.primaryDesignation, ...spec.altDesignations]
      .filter(Boolean)
      .map((d) => d.replace(/[\s_-]+/g, '').toUpperCase());

    for (const item of scored.slice(0, 10)) {
      const dl = await downloadAndConvertRealPhotoToWebp(
        item.c.imageUrl,
        6500,
        item.c.thumbnailFallbackUrl,
      );
      if (!dl) continue;
      await fsPromises.writeFile(diskAbs, dl.webpBuffer);
      globalSkuUrlUseCounts.set(item.c.imageUrl, (globalSkuUrlUseCounts.get(item.c.imageUrl) || 0) + 1);
      const compactTitle = `${item.c.title} ${item.c.imageUrl}`.replace(/[\s_-]+/g, '').toUpperCase();
      const exactHit = allDesignations.some((d) => d.length >= 3 && compactTitle.includes(d));
      directSkuResults.set(skuCode, {
        skuCode,
        familyCode: skuInput.familyCode || '',
        matchType: exactHit ? 'EXACT_SKU_WEB' : 'CLOSE_SPEC_WEB',
        localPath: `/belt-catalog/skus-web/${encodeURIComponent(skuCode)}.webp`,
        sourceUrl: item.c.imageUrl,
        thumbnailFallbackUrl: item.c.thumbnailFallbackUrl,
        sourcePageUrl: item.c.sourcePageUrl,
        title: item.c.title,
        domain: item.c.domain,
        score: item.score,
        verifiedAt: new Date().toISOString(),
      });
      return;
    }
  });

  console.log(`[Phase 3a] Directly downloaded ${directSkuResults.size} individual SKU real web photos.`);

  // Phase 3b: Map ALL remaining SKUs to their closest real web photo from the harvested real-web index
  const skuMapping: Record<string, HarvestedSkuEntry> = {};
  let exactVerifiedCount = 0;
  let exactWebCount = 0;
  let closeSpecWebCount = 0;

  for (const skuCode of allManifestSkus) {
    const famCode = runtimeManifest.skus[skuCode] || '';
    const canonicalFam = aliases[famCode] || famCode;

    // 1. Existing 18 strictly verified exact SKU photos on disk
    const existingExact = verifiedSkuPhotos[skuCode];
    const exactDiskAbs = path.join(SKUS_PUBLIC_ROOT, skuCode, '01-real-marking.webp');
    if (existingExact && isValidWebpOnDisk(exactDiskAbs)) {
      skuMapping[skuCode] = {
        skuCode,
        familyCode: canonicalFam,
        matchType: 'EXACT_WEB_VERIFIED',
        localPath: `/belt-catalog/skus/${encodeURIComponent(skuCode)}/01-real-marking.webp`,
        sourceUrl: existingExact.sourceUrl || '',
        sourcePageUrl: existingExact.sourcePageUrl || '',
        title: existingExact.visibleMarking || existingExact.noteFa || `SKU ${skuCode}`,
        domain: extractDomainFromUrl(existingExact.sourcePageUrl || existingExact.sourceUrl || '') || 'verified',
        score: 999,
        verifiedAt: existingExact.verifiedAt || new Date().toISOString(),
      };
      exactVerifiedCount++;
      continue;
    }

    // 2. Direct live-searched SKU real web photo from Phase 3a
    const directHit = directSkuResults.get(skuCode);
    if (directHit) {
      skuMapping[skuCode] = directHit;
      if (directHit.matchType === 'EXACT_SKU_WEB') exactWebCount++;
      else closeSpecWebCount++;
      continue;
    }

    // 3. Match against our harvested real web belt index by exact tokens -> brand+profile -> kind
    const skuMeta = svgLookup.skus?.[skuCode];
    const brand = skuMeta?.brand || svgLookup.families?.[canonicalFam]?.brand || 'UNSPECIFIED';
    const rawName = skuMeta?.rawName || '';
    const rawSize = skuMeta?.rawSize || '';
    const profile = skuMeta?.technical?.profile || svgLookup.families?.[canonicalFam]?.dominantProfiles?.[0] || '';
    const division = skuMeta?.technical?.beltDivision || svgLookup.families?.[canonicalFam]?.dominantDivision || '';
    const specTokens = extractAlphanumericSpecTokens(`${rawName} ${rawSize}`);

    const candidateSet = new Map<string, WebImageCandidate>();
    for (const tok of specTokens) {
      for (const c of tokenToCandidates.get(tok) || []) {
        candidateSet.set(c.imageUrl, c);
      }
    }
    if (profile) {
      for (const c of tokenToCandidates.get(profile.toUpperCase()) || []) {
        candidateSet.set(c.imageUrl, c);
      }
    }
    if (!isGenericBrandName(brand)) {
      for (const c of tokenToCandidates.get(brand.toUpperCase()) || []) {
        candidateSet.set(c.imageUrl, c);
      }
    }
    if (candidateSet.size < 8) {
      const k = classifyBeltBroadKind(division, profile, rawName);
      for (const c of (poolByKind.get(k) || []).slice(0, 40)) {
        candidateSet.set(c.imageUrl, c);
      }
    }

    let best: { c: WebImageCandidate; score: number } | null = null;
    for (const c of candidateSet.values()) {
      const s = scoreWebCandidate(c, {
        brand,
        profile,
        beltDivision: division,
        name: rawName,
        rawSize,
        specTokens,
        strictSkuMode: true,
      });
      if (!best || s > best.score) best = { c, score: s };
    }

    const specForSku = translateWarehouseBeltSpec({
      rawName,
      rawSize,
      profile,
      beltDivision: division,
    });
    const desList = [specForSku.primaryDesignation, ...specForSku.altDesignations]
      .filter(Boolean)
      .map((d) => d.replace(/[\s_-]+/g, '').toUpperCase());

    if (best && best.score > 35) {
      const compactText = `${best.c.title} ${best.c.imageUrl}`.replace(/[\s_-]+/g, '').toUpperCase();
      const exactHit = desList.some((d) => d.length >= 3 && compactText.includes(d));
      skuMapping[skuCode] = {
        skuCode,
        familyCode: canonicalFam,
        matchType: exactHit ? 'EXACT_SKU_WEB' : 'CLOSE_SPEC_WEB',
        localPath: null, // Downloaded & cached on-demand via real-time web discovery when viewed
        sourceUrl: best.c.imageUrl,
        thumbnailFallbackUrl: best.c.thumbnailFallbackUrl,
        sourcePageUrl: best.c.sourcePageUrl,
        title: best.c.title,
        domain: best.c.domain,
        score: best.score,
        verifiedAt: new Date().toISOString(),
      };
      if (exactHit) exactWebCount++;
      else closeSpecWebCount++;
    } else {
      // Fallback to its own family's verified slot 1 real web photo (still 100% real web photo, never synthesized!)
      const famSlot = (familyProv[canonicalFam] || [])[0];
      if (famSlot) {
        skuMapping[skuCode] = {
          skuCode,
          familyCode: canonicalFam,
          matchType: 'CLOSE_SPEC_WEB',
          localPath: famSlot.localPath,
          sourceUrl: famSlot.sourceUrl,
          sourcePageUrl: famSlot.sourcePageUrl,
          title: famSlot.title,
          domain: famSlot.domain,
          score: 50,
          verifiedAt: famSlot.verifiedAt,
        };
        closeSpecWebCount++;
      }
    }
  }

  fs.writeFileSync(SKU_MAP_OUT, JSON.stringify(skuMapping, null, 2), 'utf8');

  // Re-save updated realWebBeltIndex.json including Phase 3a newly discovered candidates
  const finalIndexEntries = Array.from(globalIndexMap.values());
  fs.writeFileSync(
    WEB_INDEX_OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalRealWebPhotos: finalIndexEntries.length,
        entries: finalIndexEntries,
      },
      null,
      0,
    ),
    'utf8',
  );

  // Summary report
  const fam4Count = canonicalFamCodes.filter((c) => (familyProv[c]?.length || 0) === 4).length;
  const famPartialCount = canonicalFamCodes.filter((c) => {
    const l = familyProv[c]?.length || 0;
    return l > 0 && l < 4;
  }).length;
  const famZeroCount = canonicalFamCodes.filter((c) => (familyProv[c]?.length || 0) === 0).length;

  console.log('=== REAL-WEB BELT IMAGE HARVESTER COMPLETE ===');
  console.log(
    JSON.stringify(
      {
        elapsedSeconds: Number(((Date.now() - tStart) / 1000).toFixed(1)),
        canonicalFamiliesTotal: canonicalFamCodes.length,
        canonicalFamiliesWith4RealWebPhotos: fam4Count,
        canonicalFamiliesPartial: famPartialCount,
        canonicalFamiliesZero: famZeroCount,
        globalUniqueRealWebPhotosIndexed: finalIndexEntries.length,
        directSkuRealPhotosDownloaded: directSkuResults.size,
        skuCoverageTotal: Object.keys(skuMapping).length,
        exactVerifiedSkuCount: exactVerifiedCount,
        exactWebMatchedSkuCount: exactWebCount,
        closeSpecWebMatchedSkuCount: closeSpecWebCount,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('Harvester failed:', err);
  process.exit(1);
});
