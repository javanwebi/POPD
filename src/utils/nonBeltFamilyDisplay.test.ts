import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNonBeltGridItems,
  filterNonBeltGridItems,
  getCleanVariantSpecs,
  isNonBeltFamilyProduct,
} from './nonBeltFamilyDisplay';
import type { ProductVariant } from '../types';

test('isNonBeltFamilyProduct cleanly separates belts from non-belt families', () => {
  assert.equal(isNonBeltFamilyProduct({ categorySlug: 'excel-v2-1-1' }), false);
  assert.equal(isNonBeltFamilyProduct({ categorySlug: 'excel-v2-1-4' }), false);
  assert.equal(isNonBeltFamilyProduct({ categorySlug: 'excel-v2-3-2' }), true);
  assert.equal(isNonBeltFamilyProduct({ categorySlug: 'excel-v2-9-2' }), true);
});

test('buildNonBeltGridItems prioritizes unique real photos first and blocks duplicate images across SKUs', () => {
  const variants: ProductVariant[] = [
    { code: 'SKU-NO-IMG', name: 'بوش رولر 42', size: '42mm', images: [] },
    { code: 'SKU-IMG-1', name: 'بوش رولر 50', size: '50mm', images: ['/storage/products/catalog/e(12).png'] },
    { code: 'SKU-DUP-IMG', name: 'بوش رولر 55', size: '55mm', images: ['/storage/products/catalog/e(12).png'] },
    { code: 'SKU-IMG-2', name: 'بوش رولر 60', size: '60mm', images: ['/storage/products/catalog/e(45).png'] },
  ];

  const items = buildNonBeltGridItems(variants, 'بوش رولر');
  assert.equal(items.length, 4);
  assert.equal(items[0].variant.code, 'SKU-IMG-1');
  assert.equal(items[0].uniqueImageUrl, '/storage/products/catalog/e(12).png');
  assert.equal(items[1].variant.code, 'SKU-IMG-2');
  assert.equal(items[1].uniqueImageUrl, '/storage/products/catalog/e(45).png');
  const dupItem = items.find((i) => i.variant.code === 'SKU-DUP-IMG');
  assert.equal(dupItem?.uniqueImageUrl, null);
  assert.equal(dupItem?.hasRealPhoto, false);
});

test('filterNonBeltGridItems filters by Persian digits, Latin codes, and specs', () => {
  const variants: ProductVariant[] = [
    { code: 'BR-4210', name: 'بوش رولر سایز ۴۲', size: '42mm' },
    { code: 'BR-5020', name: 'بوش رولر سایز ۵۰', size: '50mm' },
  ];
  const items = buildNonBeltGridItems(variants, 'بوش رولر');

  assert.equal(filterNonBeltGridItems(items, '42').length, 1);
  assert.equal(filterNonBeltGridItems(items, '۵۰')[0].variant.code, 'BR-5020');
  assert.equal(filterNonBeltGridItems(items, 'BR-4210')[0].variant.code, 'BR-4210');
});

test('getCleanVariantSpecs strips NOT_APPLICABLE and internal placeholder tokens', () => {
  const specs = getCleanVariantSpecs({
    code: '35093',
    name: 'بوش رولر',
    size: '42mm',
    technicalSpecs: [
      { key: 'متریال', value: 'NOT_APPLICABLE' },
      { key: 'پروفیل', value: 'UNKNOWN' },
      { key: 'ابعاد / سایز', value: '42 × 60 میلی‌متر' },
      { key: 'کد فنی داخلی', value: 'INTERNAL_ONLY_CODE' },
    ],
  });
  assert.deepEqual(specs, [{ key: 'ابعاد / سایز', value: '42 × 60 میلی‌متر' }]);
});
