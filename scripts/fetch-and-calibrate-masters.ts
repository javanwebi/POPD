import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  searchBingImages,
  downloadAndConvertRealPhotoToWebp,
  isValidWebpOnDisk,
} from '../server/realWebBeltEngine';
import { enhanceBeltBasePhoto } from '../server/beltMarkingStudio';

const MASTERS_DIR = path.resolve(process.cwd(), 'public/belt-catalog/masters');
const GRID_DIR = path.resolve(process.cwd(), '.playwright-cli/master-grids');

interface MasterSpec {
  id: string;
  brand: string;
  construction: string;
  isBrandedMaster: boolean;
  preferredDomains: string[];
  avoidDomains?: string[];
  queries: string[];
  pickIdxHint?: number;
}

const MASTER_SPECS: MasterSpec[] = [
  {
    id: 'SWR-COGGED',
    brand: 'SWR',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['vseinstrumenti.ru', 'keilriemen24.eu'],
    queries: ['SWR AX 46 Keilriemen vseinstrumenti', 'SWR AX Keilriemen gezahnt'],
  },
  {
    id: 'DONGIL-WRAPPED',
    brand: 'DONGIL',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['d-netshop.com'],
    avoidDomains: ['iksonic.com'],
    queries: ['DRB V-belt A B C rubber studio', 'DRB Super Star belt white background'],
  },
  {
    id: 'OPTIBELT-WRAPPED',
    brand: 'OPTIBELT',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['ebay.com', 'ebay.de', 'web.optibelt.com'],
    queries: ['Optibelt VB Keilriemen classic V-belt ebay', 'Optibelt VB 5 C plus'],
  },
  {
    id: 'OPTIBELT-COGGED',
    brand: 'OPTIBELT',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['shop.dreisilker.com', 'dreisilker.com', 'ebay.com'],
    queries: ['Optibelt Super X-Power M=S XPB 1900', 'Optibelt Super X-Power M=S cogged V-belt'],
  },
  {
    id: 'OPTIBELT-TIMING',
    brand: 'OPTIBELT',
    construction: 'timing-rubber',
    isBrandedMaster: true,
    preferredDomains: ['industrialautomationcanada.com', 'web.optibelt.com'],
    avoidDomains: ['plcsource.com'],
    queries: ['Optibelt Omega 640 8M timing belt', 'Optibelt Omega 8M timing belt white background'],
  },
  {
    id: 'OPTIBELT-POLYV',
    brand: 'OPTIBELT',
    construction: 'poly-v-ribbed',
    isBrandedMaster: true,
    preferredDomains: ['ebay.com'],
    queries: ['Optibelt RB PL 1803 poly-V belt', 'Optibelt RB PJ PK poly-V ribbed belt'],
  },
  {
    id: 'MEGADYNE-WRAPPED',
    brand: 'MEGADYNE',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['bearingboys.co.uk', 'bepltd.com'],
    queries: ['Megadyne Oleostatic V-belt white background', 'Megadyne Oleostatic V-belt A B C'],
  },
  {
    id: 'MEGADYNE-TIMING',
    brand: 'MEGADYNE',
    construction: 'timing-rubber',
    isBrandedMaster: true,
    preferredDomains: ['bepltd.com'],
    avoidDomains: ['tranbelt.com', 'totallybelts.com'],
    queries: ['Megadyne Isoran RPP Gold timing belt white background', 'Megadyne Isoran H L timing belt'],
  },
  {
    id: 'BANDO-WRAPPED',
    brand: 'BANDO',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['ebay.com', 'bandobelts.co.nz'],
    avoidDomains: ['imssupply.com'],
    queries: ['Bando Power King C81 V-belt ebay', 'Bando V-belt A B C white background'],
  },
  {
    id: 'MITSUBOSHI-WRAPPED',
    brand: 'MITSUBOSHI',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    preferredDomains: ['zd-transmission.com'],
    avoidDomains: ['tbcnsongthan.com', 'chm.com.vn'],
    queries: ['Mitsuboshi V-belt A B C classic set free', 'Mitsuboshi industrial wrapped V-belt'],
  },
  {
    id: 'CLEAN-WRAPPED',
    brand: 'GENERIC',
    construction: 'wrapped-vbelt',
    isBrandedMaster: false,
    preferredDomains: ['oridabelts.com', 'baopower.com'],
    queries: ['black classical wrapped V-belt studio white background', 'industrial V-belt wrapped rubber white background'],
  },
  {
    id: 'CLEAN-COGGED',
    brand: 'GENERIC',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: false,
    preferredDomains: ['conveyorbeltchn.com'],
    avoidDomains: ['india.mitsuboshi.com', 'movendis-agribelts.com'],
    queries: ['raw edge cogged V-belt notched white background studio', 'cogged V-belt AX BX rubber white background'],
  },
  {
    id: 'CLEAN-TIMING-TRAP',
    brand: 'GENERIC',
    construction: 'timing-trapezoidal-rubber',
    isBrandedMaster: false,
    preferredDomains: ['pionwaybelt.com'],
    queries: ['black rubber trapezoidal timing belt H L XL white background', 'synchronous rubber timing belt industrial white background'],
  },
  {
    id: 'CLEAN-TIMING-DOUBLE',
    brand: 'GENERIC',
    construction: 'timing-double-sided',
    isBrandedMaster: false,
    preferredDomains: ['tranbelt.com', 'puteken.com'],
    avoidDomains: ['yonghangbelt.com'],
    queries: ['double sided timing belt twin power toothed white background', 'DL DH double sided rubber timing belt'],
  },
  {
    id: 'CLEAN-TIMING-HTD',
    brand: 'GENERIC',
    construction: 'timing-htd-rubber',
    isBrandedMaster: false,
    preferredDomains: ['ersadental.com', 'jsdtransmission.com'],
    avoidDomains: ['yonghangbelt.com', 'bmgworld.net', 'ebay.com'],
    queries: ['HTD 8M timing belt rubber black white background', '5M HTD rubber timing belt studio white background'],
  },
  {
    id: 'CLEAN-TIMING-PU',
    brand: 'GENERIC',
    construction: 'timing-pu-steel',
    isBrandedMaster: false,
    preferredDomains: ['bepltd.com'],
    avoidDomains: ['yonghangbelt.com', 'beltingedge.com'],
    queries: ['white polyurethane steel cord timing belt AT10 T10 open end', 'polyurethane timing belt AT20 T10 white background'],
  },
  {
    id: 'CLEAN-TIMING-COATED',
    brand: 'GENERIC',
    construction: 'timing-coated',
    isBrandedMaster: false,
    preferredDomains: ['fnsheppard.com'],
    queries: ['red linatex coated timing belt polyurethane APL', 'coated polyurethane timing belt red backing industrial'],
  },
  {
    id: 'CLEAN-POLYV',
    brand: 'GENERIC',
    construction: 'poly-v-ribbed',
    isBrandedMaster: false,
    preferredDomains: ['rubberbeltmanufacturer.com', 'belthub.co.uk', 'baopower.com'],
    avoidDomains: ['store.santent.in'],
    queries: ['poly-V multi ribbed drive belt PJ PK white background', 'multi ribbed belt industrial studio photo'],
  },
  {
    id: 'CLEAN-HEX',
    brand: 'GENERIC',
    construction: 'hexagonal-vbelt',
    isBrandedMaster: false,
    preferredDomains: ['transpower.co.uk'],
    avoidDomains: ['sevlowmro.co.uk', 'simplybearings.co.uk'],
    queries: ['hexagonal double V-belt AA BB CC white background', 'double sided hexagonal V-belt industrial'],
  },
  {
    id: 'CLEAN-PU-ROUND',
    brand: 'GENERIC',
    construction: 'pu-round-welded',
    isBrandedMaster: false,
    preferredDomains: ['bigamart.com', 'lisenpu.com'],
    queries: ['green polyurethane round belt weldable cord white background', 'Volta green polyurethane round belt'],
  },
  {
    id: 'CLEAN-PU-VBELT',
    brand: 'GENERIC',
    construction: 'pu-vbelt-welded',
    isBrandedMaster: false,
    preferredDomains: ['tyma.eu'],
    queries: ['green polyurethane V-belt weldable profile white background', 'Volta green polyurethane V-belt'],
  },
  {
    id: 'CLEAN-CROWNED',
    brand: 'GENERIC',
    construction: 'crowned-ridge',
    isBrandedMaster: false,
    preferredDomains: ['atlastrading.it'],
    queries: ['ridge top polyurethane ceramic tile conveyor belt crowned', 'polyurethane ridge top V-belt ceramic line'],
  },
  {
    id: 'CLEAN-CONVEYOR',
    brand: 'GENERIC',
    construction: 'conveyor-flat',
    isBrandedMaster: false,
    preferredDomains: ['rentonebelt.com', 'puteken.com'],
    queries: ['green PVC flat industrial conveyor belt roll white background', 'industrial PVC PU conveyor belt'],
  },
];

async function drawGridOverlay(buf: Buffer, label: string): Promise<Buffer> {
  const size = 340;
  const resized = await sharp(buf).resize(size, size, { fit: 'fill' }).png().toBuffer();
  let lines = '';
  for (let i = 1; i <= 9; i++) {
    const pos = Math.round((size * i) / 10);
    lines += `<line x1="${pos}" y1="0" x2="${pos}" y2="${size}" stroke="rgba(255,60,0,0.45)" stroke-width="1"/>`;
    lines += `<line x1="0" y1="${pos}" x2="${size}" y2="${pos}" stroke="rgba(0,140,255,0.45)" stroke-width="1"/>`;
    lines += `<text x="${pos + 2}" y="12" fill="#e00" font-size="10" font-family="monospace" font-weight="700">${(i / 10).toFixed(1)}</text>`;
    lines += `<text x="2" y="${pos - 2}" fill="#06c" font-size="10" font-family="monospace" font-weight="700">${(i / 10).toFixed(1)}</text>`;
  }
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${lines}<rect x="0" y="${size - 24}" width="${size}" height="24" fill="rgba(0,0,0,0.82)"/><text x="8" y="${size - 7}" fill="#fff" font-size="12" font-family="monospace" font-weight="700">${label}</text></svg>`,
  );
  return sharp(resized).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

async function fetchOneMaster(spec: MasterSpec): Promise<{
  id: string;
  meta: any;
  gridTile: Buffer;
} | null> {
  const outName = `${spec.id}-master.webp`;
  const outPath = path.join(MASTERS_DIR, outName);

  const candidates = [];
  const seen = new Set<string>();
  for (const q of spec.queries) {
    const res = await searchBingImages(q, 18, 7000).catch(() => []);
    for (const c of res) {
      if (seen.has(c.imageUrl)) continue;
      if ((spec.avoidDomains || []).some((ad) => c.domain.includes(ad) || c.imageUrl.includes(ad))) continue;
      seen.add(c.imageUrl);
      candidates.push(c);
    }
  }

  // Sort preferred domains first
  candidates.sort((a, b) => {
    const aPref = spec.preferredDomains.findIndex((d) => a.domain.includes(d) || a.imageUrl.includes(d));
    const bPref = spec.preferredDomains.findIndex((d) => b.domain.includes(d) || b.imageUrl.includes(d));
    const aScore = aPref >= 0 ? 100 - aPref * 10 : 0;
    const bScore = bPref >= 0 ? 100 - bPref * 10 : 0;
    return bScore - aScore;
  });

  for (const c of candidates.slice(0, 12)) {
    const dl = await downloadAndConvertRealPhotoToWebp(c.imageUrl, 6500, c.thumbnailFallbackUrl);
    if (!dl || dl.width < 320 || dl.height < 220) continue;
    const enhanced = await enhanceBeltBasePhoto(dl.webpBuffer, 1000);
    fs.writeFileSync(outPath, enhanced);
    const meta = await sharp(enhanced).metadata();
    console.log(
      `[OK] ${spec.id.padEnd(20)} <- ${c.domain} (${meta.width}x${meta.height})`,
    );
    const gridTile = await drawGridOverlay(
      enhanced,
      `${spec.id} (${meta.width}x${meta.height})`,
    );
    return {
      id: spec.id,
      meta: {
        id: spec.id,
        localPath: `/belt-catalog/masters/${outName}`,
        brand: spec.brand,
        construction: spec.construction,
        isBrandedMaster: spec.isBrandedMaster,
        sourceUrl: c.imageUrl,
        sourcePageUrl: c.sourcePageUrl,
        sourceDomain: c.domain,
        title: c.title,
        width: meta.width,
        height: meta.height,
      },
      gridTile,
    };
  }

  console.warn(`[MISS] ${spec.id}`);
  return null;
}

async function main() {
  fs.mkdirSync(MASTERS_DIR, { recursive: true });
  fs.mkdirSync(GRID_DIR, { recursive: true });

  const manifest: Record<string, any> = {
    'SWR-WRAPPED': {
      id: 'SWR-WRAPPED',
      localPath: '/belt-catalog/masters/SWR-A-master.webp',
      brand: 'SWR',
      construction: 'wrapped-vbelt',
      isBrandedMaster: true,
      sourceUrl: '/assets/aistudio/photo_31459709079_x__1__e6c5f272.jpg',
      sourceDomain: 'verified-physical-sample',
      title: 'SWR Classical Wrapped V-Belt A-49 Verified Physical Master',
    },
  };

  const gridTiles: Buffer[] = [];
  for (let i = 0; i < MASTER_SPECS.length; i += 6) {
    const batch = MASTER_SPECS.slice(i, i + 6);
    const results = await Promise.all(batch.map(fetchOneMaster));
    for (const r of results) {
      if (r) {
        manifest[r.id] = r.meta;
        gridTiles.push(r.gridTile);
      }
    }
  }

  fs.writeFileSync(path.join(MASTERS_DIR, 'masters-manifest.json'), JSON.stringify(manifest, null, 2));

  async function writeSheet(idx: number, tiles: Buffer[]) {
    if (!tiles.length) return;
    const cols = 4;
    const rows = Math.ceil(tiles.length / cols);
    const sz = 340;
    const comps = tiles.map((buf, i) => ({
      input: buf,
      left: (i % cols) * sz,
      top: Math.floor(i / cols) * sz,
    }));
    await sharp({
      create: { width: cols * sz, height: rows * sz, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
    })
      .composite(comps)
      .png({ compressionLevel: 7 })
      .toFile(path.join(GRID_DIR, `grid_${idx}.png`));
  }

  await writeSheet(1, gridTiles.slice(0, 12));
  await writeSheet(2, gridTiles.slice(12));
  console.log(`ALL DONE: ${Object.keys(manifest).length} masters in public/belt-catalog/masters/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
