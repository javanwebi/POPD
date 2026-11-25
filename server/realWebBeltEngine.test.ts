import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFamilyWebQueries,
  buildSkuWebQueries,
  classifyBeltBroadKind,
  extractAlphanumericSpecTokens,
  extractMentionedBeltProfilesAndSizes,
  hasExactTokenBoundaryDesignationMatch,
  isCandidateUrlRejected,
  parseBingImagesAsyncHtml,
  scoreWebCandidate,
  translateWarehouseBeltSpec,
  type WebImageCandidate,
} from './realWebBeltEngine';

test('translateWarehouseBeltSpec converts Iranian warehouse sizes to international designations', () => {
  const z500 = translateWarehouseBeltSpec({
    rawName: 'تسمه دانگيل 500 * 9/5',
    rawSize: '500*9',
    profile: 'Z',
    beltDivision: 'vbelt-classical',
  });
  assert.equal(z500.primaryDesignation, 'AVX 10 x 500');
  assert.ok(z500.altDesignations.includes('10x500'));
  assert.ok(z500.altDesignations.includes('Z500'));

  const at20 = translateWarehouseBeltSpec({
    rawName: 'تسمه چمفر ( FORZA ) 150AT20 * 12580 * 6APL',
    profile: 'AT20',
    beltDivision: 'timing-metric-single',
  });
  assert.equal(at20.isCoated, true);
  assert.equal(at20.primaryDesignation, '150AT20');

  const sleeve = translateWarehouseBeltSpec({
    rawName: 'تسمه مارشال آستين 1630H',
    profile: 'H',
    beltDivision: 'timing-imperial-single',
  });
  assert.equal(sleeve.isSleeve, true);
  assert.equal(sleeve.primaryDesignation, '1630H');
  const swrA19 = translateWarehouseBeltSpec({
    rawName: 'تسمه SWR A19',
    rawSize: 'A19',
    profile: 'A',
    beltDivision: 'vbelt-classical',
  });
  assert.equal(swrA19.primaryDesignation, 'A19');
  assert.ok(swrA19.altDesignations.includes('13x480'), `Expected DIN 2215 13x480 in ${swrA19.altDesignations.join(',')}`);

  const swrA16 = translateWarehouseBeltSpec({
    rawName: 'تسمه SWR A16',
    rawSize: 'A16',
    profile: 'A',
    beltDivision: 'vbelt-classical',
  });
  assert.equal(swrA16.primaryDesignation, 'A16');
  assert.ok(swrA16.altDesignations.includes('13x406'), `Expected DIN 2215 13x406 in ${swrA16.altDesignations.join(',')}`);
});

test('buildFamilyWebQueries generates exact brand + series + profile + German queries (foreign only)', () => {
  const queries = buildFamilyWebQueries({
    familyCode: 'PFAM-OPTIBELT-SPA',
    familyName: 'تسمه V شکل باریک SPA برند OPTIBELT',
    brand: 'OPTIBELT',
    beltDivision: 'vbelt-narrow-wedge',
    profiles: ['SPA'],
    sampleSkus: [{ sku: '1234', name: 'تسمه SPA 1600 اپتی بلت' }],
  });
  assert.ok(queries.length >= 3);
  assert.match(queries[0], /Optibelt/i);
  assert.match(queries[0], /SK/i);
  assert.match(queries[0], /SPA/i);
  assert.ok(queries.some((q) => /Keilriemen/i.test(q)));
  assert.ok(queries.every((q) => !/[\u0600-\u06FF]/.test(q)), 'Queries must be 100% foreign (no Persian queries)');
});

test('buildSkuWebQueries generates foreign EN + DE + DIN 2215 exact designation queries', () => {
  const queries = buildSkuWebQueries({
    skuCode: '35271',
    brand: 'OPTIBELT',
    rawName: 'تسمه تایمینگ اپتی بلت 1280-8M عرض 25',
    beltDivision: 'timing-htd-rpp-single',
    profile: '8M',
    widthMm: 25,
    lengthMm: 1280,
  });
  assert.ok(queries.length >= 3);
  assert.match(queries[0], /Optibelt/i);
  assert.match(queries[0], /1280-8M/i);
  assert.ok(queries.some((q) => /Zahnriemen/i.test(q)));
  assert.ok(queries.every((q) => !/[\u0600-\u06FF]/.test(q)), 'SKU queries must target foreign sites only');

  const swrQueries = buildSkuWebQueries({
    skuCode: '11229',
    brand: 'SWR',
    rawName: 'تسمه SWR A19',
    rawSize: 'A19',
    beltDivision: 'vbelt-classical',
    profile: 'A',
  });
  assert.ok(swrQueries.some((q) => /SWR/i.test(q) && /13x48[03]/i.test(q)), `Expected SWR DIN 13x480/13x483 query in ${swrQueries.join(' | ')}`);
});

test('isCandidateUrlRejected blocks Iranian sites, stock watermarks, Chinese B2B watermarks, CGI cutaways, car parts, and fashion belts', () => {
  assert.ok(isCandidateUrlRejected('https://fallahtradingco.ir/uploads/swr-a19.jpg', 'SWR A19 V-belt', 'https://fallahtradingco.ir/p/1'));
  assert.ok(isCandidateUrlRejected('https://image.torob.com/base/images/belt.jpg', 'تسمه SWR', 'https://torob.com/p/123'));
  assert.ok(isCandidateUrlRejected('https://dkstatics-public.digikala.com/belt.jpg', 'SWR A19', 'https://digikala.com/p/1'));
  assert.ok(isCandidateUrlRejected('https://apadanabelt.com/wp-content/uploads/a19.jpg', 'SWR A19', 'https://apadanabelt.com/product/a19'));
  assert.ok(isCandidateUrlRejected('https://www.shutterstock.com/image/belt.jpg', 'V-belt'));
  assert.ok(isCandidateUrlRejected('https://image.made-in-china.com/2f0j00/v-belt.jpg', 'Dongil SPB 3150'));
  assert.ok(isCandidateUrlRejected('https://www.toothedbelt.com/upload/at20.jpg', 'AT20 PU timing belt'));
  assert.ok(isCandidateUrlRejected('https://5.imimg.com/data5/v-belt-500x500.jpg', 'V-belt', 'https://indiamart.com/p'));
  assert.ok(isCandidateUrlRejected('https://example.com/belt.svg', 'Optibelt SPA'));
  assert.ok(isCandidateUrlRejected('https://example.com/cad-cross-section.jpg', 'SPA dimension chart'));
  assert.ok(isCandidateUrlRejected('https://example.com/photo.jpg', 'تسمه دینام شاهین سایپا'));
  assert.ok(isCandidateUrlRejected('https://example.com/photo.jpg', 'Mens leather belt buckle'));
  assert.equal(
    isCandidateUrlRejected(
      'https://sw-media.fra1.cdn.digitaloceanspaces.com/prod/sw6/public/media/optibelt-1280-8m.jpeg',
      'Optibelt 1280-8M-25 Timing Belt',
      'https://allaoui.shop/optibelt-1280-8m-25',
    ),
    null,
  );
});

test('scoreWebCandidate enforces strict brand lock (SWR vs Optibelt/Strongbelt/Browning)', () => {
  const swrGermanPhoto: WebImageCandidate = {
    imageUrl: 'https://www.keilriemen24.eu/media/image/product/swr-a19-13x480.jpg',
    thumbnailFallbackUrl: 'https://ts1.mm.bing.net/th?id=OIP.test&pid=15.1',
    sourcePageUrl: 'https://www.keilriemen24.eu/keilriemen-13x480-li-a19-swr',
    title: 'Keilriemen 13 x 480 Li A19 DIN 2215 SWR',
    domain: 'keilriemen24.eu',
    width: 1000,
    engine: 'bing',
  };
  const competitorOptibelt: WebImageCandidate = {
    imageUrl: 'https://i.ebayimg.com/images/g/optibelt-a19/s-l1600.jpg',
    sourcePageUrl: 'https://www.ebay.de/itm/optibelt-a19',
    title: 'Optibelt VB A19 13x480 Li Keilriemen',
    domain: 'ebay.de',
    width: 1200,
    engine: 'bing',
  };
  const competitorStrongbelt: WebImageCandidate = {
    imageUrl: 'https://example.com/strongbelt-a19.jpg',
    sourcePageUrl: 'https://example.com/strongbelt-a19',
    title: 'Strongbelt Classical V-belt A19 13x480',
    domain: 'example.com',
    width: 1000,
    engine: 'bing',
  };
  const targetSwrA19 = {
    brand: 'SWR',
    profile: 'A',
    beltDivision: 'vbelt-classical',
    name: 'تسمه SWR A19',
    rawSize: 'A19',
    strictSkuMode: true,
    specTokens: extractAlphanumericSpecTokens('SWR A19 13x480'),
  };
  const sSwr = scoreWebCandidate(swrGermanPhoto, targetSwrA19);
  const sOpti = scoreWebCandidate(competitorOptibelt, targetSwrA19);
  const sStrong = scoreWebCandidate(competitorStrongbelt, targetSwrA19);
  assert.ok(sSwr > 700, `Expected very high score for genuine SWR A19 photo, got ${sSwr}`);
  assert.ok(sOpti < sSwr - 500, `Expected competitor Optibelt to lose heavily on SWR target (opti=${sOpti}, swr=${sSwr})`);
  assert.ok(sStrong < sSwr - 500, `Expected competitor Strongbelt to lose heavily on SWR target (strong=${sStrong}, swr=${sSwr})`);
});

test('scoreWebCandidate hard-blocks non-belt off-topic images and rejects conflicting SKU markings', () => {
  const gameScreenshot: WebImageCandidate = {
    imageUrl: 'https://arkcommunity.example.com/screen-1.jpg',
    sourcePageUrl: 'https://arkcommunity.example.com/post',
    title: 'Metaverse Hub Lobby 3D',
    domain: 'arkcommunity.example.com',
    engine: 'bing',
  };
  assert.ok(
    scoreWebCandidate(gameScreenshot, {
      brand: 'OPTIBELT',
      profile: 'C',
      beltDivision: 'vbelt-classical',
      name: 'تسمه C48',
    }) <= -900,
  );

  // Exact C48 Optibelt photo MUST beat a conflicting B 1015 Optibelt photo!
  const exactC48: WebImageCandidate = {
    imageUrl: 'https://i.ebayimg.com/images/g/c48/s-l1600.jpg',
    sourcePageUrl: 'https://www.ebay.de/itm/optibelt-vb-c48',
    title: 'Keilriemen Optibelt VB C 48 22x1220 Li',
    domain: 'ebay.de',
    width: 1200,
    engine: 'bing',
  };
  const wrongB1015: WebImageCandidate = {
    imageUrl: 'https://example.com/optibelt-b1015.jpg',
    sourcePageUrl: 'https://example.com/optibelt-b1015',
    title: 'Optibelt VB B 1015 V-Belt',
    domain: 'example.com',
    width: 1200,
    engine: 'bing',
  };
  const targetC48 = {
    brand: 'OPTIBELT',
    profile: 'C',
    beltDivision: 'vbelt-classical',
    name: 'تسمه اپتی بلت C48',
    rawSize: 'C48',
    strictSkuMode: true,
    specTokens: extractAlphanumericSpecTokens('C48'),
  };
  const sExact = scoreWebCandidate(exactC48, targetC48);
  const sWrong = scoreWebCandidate(wrongB1015, targetC48);
  assert.ok(sExact > 400, `Expected high score for exact C48, got ${sExact}`);
  assert.ok(sWrong < 100, `Expected much lower score for conflicting B 1015 on C48, got ${sWrong}`);
  assert.ok(sExact > sWrong + 400);
});

test('extractMentionedBeltProfilesAndSizes extracts conflicting profile/size markers accurately', () => {
  const m = extractMentionedBeltProfilesAndSizes('DONGIL SUPER STAR SPB 3150 V-Belt and Optibelt AVX 10 x 775');
  assert.ok(m.profiles.has('SPB'));
  assert.ok(m.profiles.has('Z'));
  assert.ok(m.profileSizes.some((x) => x.profile === 'SPB' && x.size === '3150'));
  assert.ok(m.profileSizes.some((x) => x.profile === 'Z' && x.size === '775'));
});

test('scoreWebCandidate penalizes already-used URLs for cross-family uniqueness', () => {
  const cand: WebImageCandidate = {
    imageUrl: 'https://www.totallybelts.com/cdn/shop/files/belt-a.jpg',
    sourcePageUrl: 'https://www.totallybelts.com/products/belt-a',
    title: 'Optibelt B60 Classical V-Belt',
    domain: 'totallybelts.com',
    engine: 'bing',
  };
  const target = { brand: 'OPTIBELT', profile: 'B', beltDivision: 'vbelt-classical' };
  const freshScore = scoreWebCandidate(cand, target, new Map());
  const usedScore = scoreWebCandidate(cand, target, new Map([[cand.imageUrl, 2]]));
  assert.ok(freshScore > usedScore + 150);
});

test('parseBingImagesAsyncHtml extracts real murl/turl/purl/t objects and skips blocked domains', () => {
  const sampleHtml = `
    <a class="iusc" m="{&quot;t&quot;:&quot;Optibelt SPA 1600 V-Belt&quot;,&quot;murl&quot;:&quot;https://media.rs-online.com/Y2837183-01.jpg&quot;,&quot;turl&quot;:&quot;https://ts2.mm.bing.net/th?id=OIP.abc&amp;pid=15.1&quot;,&quot;purl&quot;:&quot;https://uk.rs-online.com/web/p/2837183&quot;}"></a>
    <a class="iusc" m="{&quot;t&quot;:&quot;Iranian Belt&quot;,&quot;murl&quot;:&quot;https://torob.com/img1.jpg&quot;,&quot;purl&quot;:&quot;https://torob.com/p1&quot;}"></a>
    <a class="iusc" m="{&quot;t&quot;:&quot;Stock Belt&quot;,&quot;murl&quot;:&quot;https://www.shutterstock.com/img1.jpg&quot;,&quot;purl&quot;:&quot;https://www.shutterstock.com/p1&quot;}"></a>
    <a class="iusc" m="{&quot;t&quot;:&quot;Watermarked B2B&quot;,&quot;murl&quot;:&quot;https://image.made-in-china.com/2f0j00/belt.jpg&quot;,&quot;purl&quot;:&quot;https://test.en.made-in-china.com/p&quot;}"></a>
  `;
  const parsed = parseBingImagesAsyncHtml(sampleHtml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].imageUrl, 'https://media.rs-online.com/Y2837183-01.jpg');
  assert.equal(parsed[0].thumbnailFallbackUrl, 'https://ts2.mm.bing.net/th?id=OIP.abc&pid=15.1');
  assert.equal(parsed[0].domain, 'uk.rs-online.com');
});

test('classifyBeltBroadKind distinguishes timing PU, timing rubber, cogged V-belt, poly-V, round PU, conveyor', () => {
  assert.equal(classifyBeltBroadKind('timing-metric-single', 'AT10', 'تسمه AT10'), 'timing-pu');
  assert.equal(classifyBeltBroadKind('timing-htd-rpp-single', '8M', 'تسمه 8M'), 'timing-rubber');
  assert.equal(classifyBeltBroadKind('vbelt-classical', 'BX', 'تسمه BX50'), 'vbelt-cogged');
  assert.equal(classifyBeltBroadKind('ribbed-poly-v', 'PJ', 'تسمه 6PJ1168'), 'polyv');
  assert.equal(classifyBeltBroadKind('welded-pu-round-crc', 'CRC', 'تسمه گرد'), 'pu-round');
  assert.equal(classifyBeltBroadKind('conveyor-pvc-pu', 'PVC', 'نوار نقاله'), 'conveyor');
});

test('hasExactTokenBoundaryDesignationMatch rejects A19 inside XPA1900 and A16 inside A160', () => {
  assert.equal(hasExactTokenBoundaryDesignationMatch('SWR XPA1900 Belt', 'A19'), false);
  assert.equal(hasExactTokenBoundaryDesignationMatch('V-Belt A160 Classical', 'A16'), false);
  assert.equal(hasExactTokenBoundaryDesignationMatch('SWR Classical A-19 13x480 Li', 'A19'), true);
});

