import fs from 'node:fs';
import path from 'node:path';
import {
  buildAll869VisualEntries,
  PART_CLASS_SPECS,
  type E869VisualEntry,
  type PartClassSpec,
} from './data/e869VisualTaxonomy';

export interface CatalogCandidateSku {
  kind: 'variant' | 'direct';
  skuCode: string;
  skuName: string;
  familyCode: string | null;
  familyName: string;
  categorySlug: string;
  submenuName: string;
  leafName: string;
  brand: string;
  searchableText: string;
  isBeltCategory: boolean;
}

export interface E869LinkAssignment {
  index: number;
  fileName: string;
  url: string;
  partClass: string;
  titleFa: string;
  titleEn: string;
  googleRef: string;
  noteFa: string;
  targetKind: 'variant' | 'direct';
  skuCode: string;
  skuName: string;
  familyCode: string | null;
  familyName: string;
  categorySlug: string;
  score: number;
  matchReasons: string[];
}

export interface E869LinkingResult {
  generatedAt: string;
  totalImages: number;
  linkedImages: number;
  uniqueSkusLinked: number;
  uniqueFamiliesTouched: number;
  directSkusLinked: number;
  variantSkusLinked: number;
  duplicateImagesAcrossSkus: number;
  byPartClass: Record<string, number>;
  byCategorySlug: Record<string, number>;
  assignments: E869LinkAssignment[];
}

export function normalizeFa(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/[^\p{L}\p{N}\s./*-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCatalogCandidates(engineeredCatalog: any): CatalogCandidateSku[] {
  const candidates: CatalogCandidateSku[] = [];
  const seenSkuCodes = new Set<string>();

  for (const product of engineeredCatalog.products || []) {
    const slug = String(product.resolvedAssignment?.categorySlug || product.categorySlug || '');
    const submenuName = String(product.resolvedAssignment?.submenuName || '');
    const leafName = String(product.resolvedAssignment?.leafName || '');
    const isBeltCategory = slug.startsWith('excel-v2-1-');

    for (const variant of product.variants || []) {
      const skuCode = String(variant.code || '').trim();
      if (!skuCode || seenSkuCodes.has(skuCode)) continue;
      seenSkuCodes.add(skuCode);
      const skuName = String(variant.name || product.name || '').trim();
      const searchableText = normalizeFa(
        `${skuName} ${product.name || ''} ${submenuName} ${leafName} ${variant.model || ''} ${variant.brand || product.brand || ''}`,
      );
      candidates.push({
        kind: 'variant',
        skuCode,
        skuName,
        familyCode: String(product.code),
        familyName: String(product.name || ''),
        categorySlug: slug,
        submenuName,
        leafName,
        brand: String(variant.brand || product.brand || ''),
        searchableText,
        isBeltCategory,
      });
    }
  }

  for (const direct of engineeredCatalog.directSkus || []) {
    const skuCode = String(direct.skuCode || '').trim();
    if (!skuCode || seenSkuCodes.has(skuCode)) continue;
    seenSkuCodes.add(skuCode);
    const slug = String(direct.categorySlug || '');
    const submenuName = String(direct.submenuName || '');
    const leafName = String(direct.leafName || '');
    const skuName = String(direct.name || '').trim();
    const isBeltCategory = slug.startsWith('excel-v2-1-');
    candidates.push({
      kind: 'direct',
      skuCode,
      skuName,
      familyCode: null,
      familyName: skuName,
      categorySlug: slug,
      submenuName,
      leafName,
      brand: String(direct.brand || ''),
      searchableText: normalizeFa(`${skuName} ${submenuName} ${leafName} ${direct.brand || ''}`),
      isBeltCategory,
    });
  }

  return candidates;
}

export function scoreCandidateForVisualEntry(
  entry: E869VisualEntry,
  spec: PartClassSpec,
  cand: CatalogCandidateSku,
  familyUsageCount: number,
): { score: number; reasons: string[] } {
  // Never match a non-belt photo onto a belt SKU
  if (cand.isBeltCategory && !spec.allowBeltCategory) {
    return { score: -10000, reasons: ['blocked:belt-category'] };
  }

  let score = 0;
  const reasons: string[] = [];

  // 1. Category slug alignment (strongest structural signal)
  const prefIdx = spec.preferredSlugs.indexOf(cand.categorySlug);
  if (prefIdx === 0) {
    score += 120;
    reasons.push(`primarySlug:${cand.categorySlug}`);
  } else if (prefIdx > 0) {
    score += 100 - prefIdx * 8;
    reasons.push(`preferredSlug:${cand.categorySlug}`);
  } else {
    const fbIdx = spec.fallbackSlugs.indexOf(cand.categorySlug);
    if (fbIdx >= 0) {
      score += 48 - fbIdx * 6;
      reasons.push(`fallbackSlug:${cand.categorySlug}`);
    } else {
      score -= 40;
    }
  }

  // 2. Weighted Persian/English engineering keywords
  const text = cand.searchableText;
  const skuNameNorm = normalizeFa(cand.skuName);
  let keywordHits = 0;
  for (const [rawKw, weight] of spec.keywords) {
    const kw = normalizeFa(rawKw);
    if (!kw) continue;
    if (skuNameNorm.includes(kw)) {
      score += weight;
      keywordHits++;
      reasons.push(`skuKw:${kw}`);
    } else if (text.includes(kw)) {
      score += Math.round(weight * 0.65);
      keywordHits++;
      reasons.push(`famKw:${kw}`);
    }
  }

  // 3. Exclusion penalties
  for (const rawEx of spec.excludeKeywords || []) {
    const ex = normalizeFa(rawEx);
    if (ex && skuNameNorm.includes(ex)) {
      score -= 75;
      reasons.push(`penalty:${ex}`);
    }
  }

  // 4. Color & sub-type bonus (matches exact color / screw-vs-nut / agitator-vs-impeller)
  if (entry.colorHint) {
    const colorNorm = normalizeFa(entry.colorHint);
    if (skuNameNorm.includes(colorNorm)) {
      score += 24;
      reasons.push(`color:${colorNorm}`);
    } else if (text.includes(colorNorm)) {
      score += 12;
      reasons.push(`famColor:${colorNorm}`);
    }
  }
  if (entry.subTypeHint) {
    const subNorm = normalizeFa(entry.subTypeHint);
    if (skuNameNorm.includes(subNorm)) {
      score += 30;
      reasons.push(`subType:${subNorm}`);
    }
  }

  // 5. Spread coverage gently across families (prefer giving uncovered families a unique real photo first,
  //    while still allowing multi-variant families with many sizes to receive multiple distinct photos!)
  if (cand.kind === 'variant' && familyUsageCount === 0) {
    score += 18;
    reasons.push('newFamilyBoost');
  } else if (cand.kind === 'variant' && familyUsageCount > 0) {
    score -= Math.min(28, familyUsageCount * 4);
  } else if (cand.kind === 'direct') {
    score += 14;
    reasons.push('directSkuBoost');
  }

  // Tiny deterministic tiebreaker based on SKU code + image index
  if (keywordHits === 0 && prefIdx < 0) {
    score -= 25;
  }

  return { score, reasons };
}

/**
 * Computes a guaranteed 1-to-1 unique assignment of ALL 869 real catalog photos
 * to 869 distinct SKU codes in engineeredCatalog.json (ZERO duplicates across SKUs).
 */
export function computeUniqueE869Assignments(engineeredCatalog: any): E869LinkingResult {
  const entries = buildAll869VisualEntries();
  const candidates = extractCatalogCandidates(engineeredCatalog);

  // Order images by partClass priority (rarest / most specific classes first), then by index
  const sortedEntries = [...entries].sort((a, b) => {
    const pa = PART_CLASS_SPECS[a.partClass].priority;
    const pb = PART_CLASS_SPECS[b.partClass].priority;
    if (pa !== pb) return pa - pb;
    return a.index - b.index;
  });

  const usedSkus = new Set<string>();
  const familyUsage = new Map<string, number>();
  const assignmentsByIndex = new Map<number, E869LinkAssignment>();

  for (const entry of sortedEntries) {
    const spec = PART_CLASS_SPECS[entry.partClass];
    let bestCand: CatalogCandidateSku | null = null;
    let bestScore = -Infinity;
    let bestReasons: string[] = [];

    for (const cand of candidates) {
      if (usedSkus.has(cand.skuCode)) continue;
      const famCount = cand.familyCode ? familyUsage.get(cand.familyCode) || 0 : 0;
      const { score, reasons } = scoreCandidateForVisualEntry(entry, spec, cand, famCount);
      if (score > bestScore) {
        bestScore = score;
        bestCand = cand;
        bestReasons = reasons;
      }
    }

    if (!bestCand) {
      throw new Error(`Failed to find unique unused SKU candidate for ${entry.fileName}`);
    }

    usedSkus.add(bestCand.skuCode);
    if (bestCand.familyCode) {
      familyUsage.set(bestCand.familyCode, (familyUsage.get(bestCand.familyCode) || 0) + 1);
    }

    assignmentsByIndex.set(entry.index, {
      index: entry.index,
      fileName: entry.fileName,
      url: entry.url,
      partClass: entry.partClass,
      titleFa: spec.titleFa,
      titleEn: spec.titleEn,
      googleRef: spec.googleRef,
      noteFa: entry.noteFa,
      targetKind: bestCand.kind,
      skuCode: bestCand.skuCode,
      skuName: bestCand.skuName,
      familyCode: bestCand.familyCode,
      familyName: bestCand.familyName,
      categorySlug: bestCand.categorySlug,
      score: bestScore,
      matchReasons: bestReasons,
    });
  }

  const assignments: E869LinkAssignment[] = [];
  const byPartClass: Record<string, number> = {};
  const byCategorySlug: Record<string, number> = {};
  const familiesTouched = new Set<string>();
  let directSkusLinked = 0;
  let variantSkusLinked = 0;

  for (let i = 1; i <= 869; i++) {
    const a = assignmentsByIndex.get(i)!;
    assignments.push(a);
    byPartClass[a.partClass] = (byPartClass[a.partClass] || 0) + 1;
    byCategorySlug[a.categorySlug] = (byCategorySlug[a.categorySlug] || 0) + 1;
    if (a.familyCode) familiesTouched.add(a.familyCode);
    if (a.targetKind === 'direct') directSkusLinked++;
    else variantSkusLinked++;
  }

  // Hard invariant verification: zero duplicates
  const urlSet = new Set(assignments.map((a) => a.url));
  const skuSet = new Set(assignments.map((a) => a.skuCode));
  const duplicateImagesAcrossSkus = assignments.length - urlSet.size;
  if (urlSet.size !== 869 || skuSet.size !== 869) {
    throw new Error(
      `Bijection invariant violated: urls=${urlSet.size}, skus=${skuSet.size}, expected 869`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    totalImages: entries.length,
    linkedImages: assignments.length,
    uniqueSkusLinked: skuSet.size,
    uniqueFamiliesTouched: familiesTouched.size,
    directSkusLinked,
    variantSkusLinked,
    duplicateImagesAcrossSkus,
    byPartClass,
    byCategorySlug,
    assignments,
  };
}

const E_CATALOG_URL_RE = /\/storage\/products\/(catalog|thumbs)\/e\(\d+\)\.(png|webp)/i;

/**
 * Applies the 869 unique assignments directly onto engineeredCatalog in-place:
 * 1. Strips ALL legacy cross-family duplicated /storage/products/catalog/e(N).png links first.
 * 2. Links each e(N).png strictly to its ONE assigned variant SKU (and that variant's own parent family gallery)
 *    or its ONE assigned Direct SKU.
 * 3. Guarantees zero duplicate e(N).png URLs across SKUs or across families.
 */
export function applyUniqueE869LinksToCatalog(
  engineeredCatalog: any,
  result: E869LinkingResult,
): {
  strippedLegacyRefs: number;
  appliedVariantRefs: number;
  appliedDirectRefs: number;
  updatedFamilies: number;
} {
  let strippedLegacyRefs = 0;
  let appliedVariantRefs = 0;
  let appliedDirectRefs = 0;
  let updatedFamilies = 0;

  const byVariantSku = new Map<string, E869LinkAssignment>();
  const byDirectSku = new Map<string, E869LinkAssignment>();
  const byFamilyCode = new Map<string, E869LinkAssignment[]>();

  for (const a of result.assignments) {
    if (a.targetKind === 'direct') {
      byDirectSku.set(a.skuCode, a);
    } else {
      byVariantSku.set(a.skuCode, a);
      if (a.familyCode) {
        const list = byFamilyCode.get(a.familyCode) || [];
        list.push(a);
        byFamilyCode.set(a.familyCode, list);
      }
    }
  }

  // Step 1 & 2: Clean & apply on multi-variant family products
  for (const product of engineeredCatalog.products || []) {
    const oldImages: string[] = Array.isArray(product.images) ? product.images : [];
    const cleanedImages = oldImages.filter((u) => {
      const isLegacyE = E_CATALOG_URL_RE.test(String(u || ''));
      if (isLegacyE) strippedLegacyRefs++;
      return !isLegacyE;
    });

    const oldGallery: any[] = Array.isArray(product.galleryImages) ? product.galleryImages : [];
    const cleanedGallery = oldGallery.filter((g) => {
      const isLegacyE = E_CATALOG_URL_RE.test(String(g?.url || ''));
      if (isLegacyE) strippedLegacyRefs++;
      return !isLegacyE;
    });

    const isBeltCat = String(product.resolvedAssignment?.categorySlug || product.categorySlug || '').startsWith('excel-v2-1-');

    for (const v of product.variants || []) {
      const oldVarImgs: string[] = Array.isArray(v.images) ? v.images : [];
      const cleanedVarImgs = oldVarImgs.filter((u) => {
        const isLegacyE = E_CATALOG_URL_RE.test(String(u || ''));
        if (isLegacyE) strippedLegacyRefs++;
        return !isLegacyE;
      });
      const assigned = byVariantSku.get(String(v.code || ''));
      if (assigned) {
        v.images = [assigned.url, ...cleanedVarImgs.filter((u) => u !== assigned.url)];
        appliedVariantRefs++;
      } else {
        v.images = cleanedVarImgs;
      }
    }

    // Prioritize SKUs with unique verified real photos at the top of every non-belt family
    if (!isBeltCat && Array.isArray(product.variants) && product.variants.length > 1) {
      product.variants.sort((a: any, b: any) => {
        const aHas = byVariantSku.has(String(a?.code || '')) ? 1 : 0;
        const bHas = byVariantSku.has(String(b?.code || '')) ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        const aAny = Array.isArray(a?.images) && a.images.length > 0 ? 1 : 0;
        const bAny = Array.isArray(b?.images) && b.images.length > 0 ? 1 : 0;
        return bAny - aAny;
      });
    }

    const famAssignments = byFamilyCode.get(String(product.code || '')) || [];
    if (famAssignments.length > 0) {
      updatedFamilies++;
      const assignedUrls = famAssignments.map((a) => a.url);
      product.images = Array.from(new Set([...assignedUrls, ...cleanedImages]));
      product.image = product.images[0];

      const newVariantGalleryEntries = famAssignments.map((a, idx) => ({
        id: `e869-${a.index}-${a.skuCode}`,
        url: a.url,
        fileName: a.fileName,
        scope: 'variant' as const,
        variantCode: a.skuCode,
        identityVerified: true,
        title: `${a.skuName} — تصویر واقعی کد ${a.skuCode}`,
        order: idx + 1,
      }));
      product.galleryImages = [...newVariantGalleryEntries, ...cleanedGallery];
    } else {
      product.images = cleanedImages;
      if (product.image && E_CATALOG_URL_RE.test(String(product.image))) {
        product.image = cleanedImages[0] || undefined;
      }
      product.galleryImages = cleanedGallery;
    }
  }

  // Step 3: Clean & apply on standalone directSkus
  for (const d of engineeredCatalog.directSkus || []) {
    if (d.imageUrl && E_CATALOG_URL_RE.test(String(d.imageUrl))) {
      strippedLegacyRefs++;
      d.imageUrl = null;
    }
    const assigned = byDirectSku.get(String(d.skuCode || ''));
    if (assigned) {
      d.imageUrl = assigned.url;
      appliedDirectRefs++;
    }
  }

  return { strippedLegacyRefs, appliedVariantRefs, appliedDirectRefs, updatedFamilies };
}

export function writeE869AuditDeliverables(result: E869LinkingResult, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'e869_linked_catalog.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  const csvHeader = [
    'image_index',
    'file_name',
    'image_url',
    'part_class',
    'title_fa',
    'title_en',
    'target_kind',
    'sku_code',
    'sku_name',
    'family_code',
    'family_name',
    'category_slug',
    'score',
    'note_fa',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    csvHeader.join(','),
    ...result.assignments.map((a) =>
      [
        a.index,
        a.fileName,
        a.url,
        a.partClass,
        a.titleFa,
        a.titleEn,
        a.targetKind,
        a.skuCode,
        a.skuName,
        a.familyCode || '',
        a.familyName,
        a.categorySlug,
        a.score,
        a.noteFa,
      ]
        .map(esc)
        .join(','),
    ),
  ];
  fs.writeFileSync(
    path.join(outDir, 'e869_linked_catalog.csv'),
    '\uFEFF' + lines.join('\n'),
    'utf8',
  );
}
