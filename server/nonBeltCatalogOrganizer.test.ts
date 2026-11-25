import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  absorbDirectSkusIntoFamilies,
  organizeNonBeltCatalog,
  resolveCleanNonBeltFamilyIdentity,
  resolveTrueCategoryForDirectSku,
} from './nonBeltCatalogOrganizer';

test('resolveCleanNonBeltFamilyIdentity fixes misplaced families across categories', () => {
  assert.equal(
    resolveCleanNonBeltFamilyIdentity({
      name: 'گاید و کشویی راهنمای خط انتقال',
      categorySlug: 'excel-v2-9-3',
    }).targetCategorySlug,
    'excel-v2-6-2',
  );
  assert.equal(
    resolveCleanNonBeltFamilyIdentity({
      name: 'پروفیل قوطی صنعتی',
      categorySlug: 'excel-v2-9-3',
    }).targetCategorySlug,
    'excel-v2-6-3',
  );
  assert.equal(
    resolveCleanNonBeltFamilyIdentity({
      name: 'لاستیک دیافراگم پمپ و شیر',
      categorySlug: 'excel-v2-7-1',
    }).targetCategorySlug,
    'excel-v2-9-2',
  );
  assert.equal(
    resolveCleanNonBeltFamilyIdentity({
      name: 'ضربه‌گیر و لرزه‌گیر لاستیکی',
      categorySlug: 'excel-v2-7-1',
    }).targetCategorySlug,
    'excel-v2-7-3',
  );
  assert.equal(
    resolveCleanNonBeltFamilyIdentity({
      name: 'واشر لاستیکی فلنج',
      categorySlug: 'excel-v2-7-1',
    }).targetCategorySlug,
    'excel-v2-7-2',
  );
});

test('resolveTrueCategoryForDirectSku routes misplaced direct SKUs to their true categories', () => {
  assert.equal(
    resolveTrueCategoryForDirectSku({ name: 'اسكاج ساب كد 1255', categorySlug: 'excel-v2-14-3' }),
    'excel-v2-14-3',
  );
  assert.equal(
    resolveTrueCategoryForDirectSku({ name: 'لاستیک کوپلینگ 6 پره', categorySlug: 'excel-v2-7-1' }),
    'excel-v2-4-2',
  );
  assert.equal(
    resolveTrueCategoryForDirectSku({ name: 'پین سر رولر استیل', categorySlug: 'excel-v2-9-3' }),
    'excel-v2-3-2',
  );
});

test('organizeNonBeltCatalog + absorbDirectSkusIntoFamilies leaves ZERO directSkus and preserves 100% of SKUs', () => {
  const catalogPath = path.resolve(process.cwd(), 'server/data/engineeredCatalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const beforeCodes = new Set<string>();
  for (const p of catalog.products || []) {
    for (const v of p.variants || []) {
      if (v?.code) beforeCodes.add(String(v.code).trim().toLowerCase());
    }
  }
  for (const d of catalog.directSkus || []) {
    if (d?.skuCode) beforeCodes.add(String(d.skuCode).trim().toLowerCase());
  }

  organizeNonBeltCatalog(catalog);
  const res = absorbDirectSkusIntoFamilies(catalog);

  assert.equal(res.afterDirectSkus, 0);
  assert.equal((catalog.directSkus || []).length, 0);

  const afterCodes = new Set<string>();
  for (const p of catalog.products || []) {
    for (const v of p.variants || []) {
      if (v?.code) afterCodes.add(String(v.code).trim().toLowerCase());
    }
  }

  assert.equal(afterCodes.size, beforeCodes.size);
  for (const code of beforeCodes) {
    assert.ok(afterCodes.has(code), `Missing preserved SKU code: ${code}`);
  }
});
