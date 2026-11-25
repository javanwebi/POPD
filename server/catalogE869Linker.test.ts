import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildAll869VisualEntries } from './data/e869VisualTaxonomy';
import {
  applyUniqueE869LinksToCatalog,
  computeUniqueE869Assignments,
} from './catalogE869Linker';

const CATALOG_PATH = path.resolve(process.cwd(), 'server/data/engineeredCatalog.json');
const IMAGES_DIR = path.resolve(process.cwd(), 'public/storage/products/catalog');

test('All 869 visual entries (e(1).png..e(869).png) are classified with zero gaps and exist on disk', () => {
  const entries = buildAll869VisualEntries();
  assert.equal(entries.length, 869);
  for (let i = 1; i <= 869; i++) {
    assert.equal(entries[i - 1].index, i);
    assert.equal(entries[i - 1].fileName, `e(${i}).png`);
    const filePath = path.join(IMAGES_DIR, `e(${i}).png`);
    assert.equal(fs.existsSync(filePath), true, `Missing image on disk: ${filePath}`);
  }
});

test('All 869 images link 1-to-1 uniquely to 869 distinct catalog SKUs with ZERO duplicates', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const result = computeUniqueE869Assignments(catalog);

  assert.equal(result.totalImages, 869);
  assert.equal(result.linkedImages, 869);
  assert.equal(result.uniqueSkusLinked, 869);
  assert.equal(result.duplicateImagesAcrossSkus, 0);

  const seenUrls = new Set<string>();
  const seenSkus = new Set<string>();
  for (const a of result.assignments) {
    assert.equal(seenUrls.has(a.url), false, `Duplicate URL assigned: ${a.url}`);
    assert.equal(seenSkus.has(a.skuCode), false, `Duplicate SKU assigned: ${a.skuCode}`);
    seenUrls.add(a.url);
    seenSkus.add(a.skuCode);
  }
});

test('Applying 869 unique links produces ZERO duplicate e(N).png across SKUs and across families', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const result = computeUniqueE869Assignments(catalog);
  applyUniqueE869LinksToCatalog(catalog, result);

  const eRe = /\/storage\/products\/catalog\/e\(\d+\)\.png/i;
  const skuImgOwners = new Map<string, string[]>();
  const famImgOwners = new Map<string, string[]>();

  for (const p of catalog.products || []) {
    const famSet = new Set<string>();
    for (const u of p.images || []) {
      if (eRe.test(String(u))) famSet.add(String(u));
    }
    for (const u of famSet) {
      const list = famImgOwners.get(u) || [];
      list.push(p.code);
      famImgOwners.set(u, list);
    }
    for (const v of p.variants || []) {
      for (const u of v.images || []) {
        if (eRe.test(String(u))) {
          const list = skuImgOwners.get(String(u)) || [];
          list.push(v.code);
          skuImgOwners.set(String(u), list);
        }
      }
    }
  }
  for (const d of catalog.directSkus || []) {
    if (d.imageUrl && eRe.test(String(d.imageUrl))) {
      const list = skuImgOwners.get(String(d.imageUrl)) || [];
      list.push(d.skuCode);
      skuImgOwners.set(String(d.imageUrl), list);
    }
  }

  assert.equal(skuImgOwners.size, 869, 'Expected all 869 unique e(N).png URLs linked to SKUs');
  for (const [url, owners] of skuImgOwners.entries()) {
    assert.equal(owners.length, 1, `Duplicate SKU link for ${url}: ${owners.join(', ')}`);
  }
  for (const [url, owners] of famImgOwners.entries()) {
    assert.equal(owners.length, 1, `Cross-family duplicate link for ${url}: ${owners.join(', ')}`);
  }
});

test('Key visual classes map accurately to their real industrial categories', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const result = computeUniqueE869Assignments(catalog);
  const byIdx = new Map(result.assignments.map((a) => [a.index, a]));

  // Elevator buckets -> excel-v2-9-5
  assert.equal(byIdx.get(636)?.categorySlug, 'excel-v2-9-5');
  assert.equal(byIdx.get(621)?.categorySlug, 'excel-v2-9-5');

  // Wire mesh cylinder -> excel-v2-11-1
  assert.equal(byIdx.get(842)?.categorySlug, 'excel-v2-11-1');

  // Bearing safety guard -> excel-v2-13-2
  assert.equal(byIdx.get(696)?.categorySlug, 'excel-v2-13-2');

  // Deep groove bearing -> excel-v2-13-1
  assert.equal(byIdx.get(383)?.categorySlug, 'excel-v2-13-1');
  assert.equal(byIdx.get(434)?.categorySlug, 'excel-v2-13-1');

  // Glaze pump impeller -> excel-v2-9-2
  assert.equal(byIdx.get(570)?.categorySlug, 'excel-v2-9-2');
  assert.equal(byIdx.get(583)?.categorySlug, 'excel-v2-9-2');

  // Vacuum suction cup -> excel-v2-7-3
  assert.equal(byIdx.get(640)?.categorySlug, 'excel-v2-7-3');

  // Industrial brush -> excel-v2-5-2 or excel-v2-5-1
  assert.ok(['excel-v2-5-1', 'excel-v2-5-2'].includes(byIdx.get(710)?.categorySlug || ''));

  // Jaw coupling & Bowex coupling -> excel-v2-4-2
  assert.equal(byIdx.get(72)?.categorySlug, 'excel-v2-4-2');
  assert.equal(byIdx.get(741)?.categorySlug, 'excel-v2-4-2');

  // Aluminum profile rail -> excel-v2-6-3 or excel-v2-6-1
  assert.ok(['excel-v2-6-1', 'excel-v2-6-3'].includes(byIdx.get(251)?.categorySlug || ''));

  // PVC conveyor belt -> excel-v2-2-1
  assert.equal(byIdx.get(859)?.categorySlug, 'excel-v2-2-1');
});
