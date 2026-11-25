import fs from 'node:fs';
import path from 'node:path';
import {
  absorbDirectSkusIntoFamilies,
  organizeNonBeltCatalog,
  isBeltCategorySlug,
} from '../server/nonBeltCatalogOrganizer';
import {
  applyUniqueE869LinksToCatalog,
  computeUniqueE869Assignments,
  writeE869AuditDeliverables,
} from '../server/catalogE869Linker';

const CATALOG_PATH = path.resolve(process.cwd(), 'server/data/engineeredCatalog.json');
const OUT_DIR = path.resolve(process.cwd(), 'deliverables/catalog-869-audit');

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const orgStats = organizeNonBeltCatalog(catalog);
  const absorbStats = absorbDirectSkusIntoFamilies(catalog);
  console.log('=== NON-BELT CATALOG ORGANIZATION & DIRECT SKU ABSORPTION COMPLETE ===');
  console.log({
    beforeNonBeltFamilies: orgStats.beforeNonBeltFamilies,
    afterNonBeltFamilies: orgStats.afterNonBeltFamilies,
    mergedFamiliesCount: orgStats.mergedFamiliesCount,
    reassignedCategoryCount: orgStats.reassignedCategoryCount,
    cleanedNameCount: orgStats.cleanedNameCount,
    preservedSkuCount: orgStats.preservedSkuCount,
    aliasesAdded: orgStats.aliasesAdded,
    absorbStats,
  });

  const result = computeUniqueE869Assignments(catalog);
  const applyStats = applyUniqueE869LinksToCatalog(catalog, result);

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  writeE869AuditDeliverables(result, OUT_DIR);

  // Report uncovered non-belt families (those with 0 images after E869 linking)
  const uncovered = (catalog.products || []).filter((p: any) => {
    const slug = p.resolvedAssignment?.categorySlug || p.categorySlug || '';
    if (isBeltCategorySlug(slug)) return false;
    return !Array.isArray(p.images) || p.images.length === 0;
  });
  console.log(`\nUncovered non-belt families (0 images): ${uncovered.length}`);
  for (const p of uncovered) {
    const slug = p.resolvedAssignment?.categorySlug || p.categorySlug;
    console.log(`  [${slug}] ${p.code} | ${p.name} (${(p.variants || []).length} SKUs)`);
  }

  // Post-write invariant audit directly on engineeredCatalog.json
  const skuImageOwners = new Map<string, string[]>();
  const familyImageOwners = new Map<string, string[]>();
  const eRe = /\/storage\/products\/catalog\/e\(\d+\)\.png/i;

  for (const p of catalog.products || []) {
    const famImgs = new Set<string>();
    for (const u of p.images || []) {
      if (eRe.test(String(u))) famImgs.add(String(u));
    }
    for (const u of famImgs) {
      const list = familyImageOwners.get(u) || [];
      list.push(p.code);
      familyImageOwners.set(u, list);
    }
    for (const v of p.variants || []) {
      for (const u of v.images || []) {
        if (eRe.test(String(u))) {
          const list = skuImageOwners.get(String(u)) || [];
          list.push(`VAR:${v.code}`);
          skuImageOwners.set(String(u), list);
        }
      }
    }
  }
  for (const d of catalog.directSkus || []) {
    if (d.imageUrl && eRe.test(String(d.imageUrl))) {
      const list = skuImageOwners.get(String(d.imageUrl)) || [];
      list.push(`DIR:${d.skuCode}`);
      skuImageOwners.set(String(d.imageUrl), list);
    }
  }

  const dupSkus = Array.from(skuImageOwners.entries()).filter(([, owners]) => owners.length > 1);
  const dupFams = Array.from(familyImageOwners.entries()).filter(([, owners]) => owners.length > 1);

  console.log('=== 869 REAL CATALOG PHOTO LINKING COMPLETE ===');
  console.log({
    totalImages: result.totalImages,
    linkedImages: result.linkedImages,
    uniqueSkusLinked: result.uniqueSkusLinked,
    variantSkusLinked: result.variantSkusLinked,
    directSkusLinked: result.directSkusLinked,
    uniqueFamiliesTouched: result.uniqueFamiliesTouched,
    duplicateImagesAcrossSkus: dupSkus.length,
    duplicateImagesAcrossFamilies: dupFams.length,
    applyStats,
  });
  console.log('\nBy part class:', result.byPartClass);
  console.log('\nBy category slug:', result.byCategorySlug);

  // Print sample verified links across key classes
  const sampleIndices = [1, 5, 14, 28, 51, 72, 167, 185, 251, 337, 383, 386, 478, 549, 570, 583, 621, 636, 640, 688, 696, 710, 711, 741, 799, 814, 842, 848, 855, 859];
  console.log('\nSample verified 1-to-1 links:');
  for (const idx of sampleIndices) {
    const a = result.assignments[idx - 1];
    console.log(
      `  ${a.fileName} (${a.partClass}) -> [${a.targetKind}] SKU ${a.skuCode} "${a.skuName}" | cat=${a.categorySlug} | fam=${a.familyCode || 'DIRECT'} | score=${a.score}`,
    );
  }

  // Check lowest-scoring 10 assignments to inspect edge cases
  const lowest = [...result.assignments].sort((a, b) => a.score - b.score).slice(0, 10);
  console.log('\nLowest-scoring 10 assignments (for quality audit):');
  for (const a of lowest) {
    console.log(
      `  ${a.fileName} (${a.partClass}) -> SKU ${a.skuCode} "${a.skuName}" | cat=${a.categorySlug} | score=${a.score}`,
    );
  }
}

main();
