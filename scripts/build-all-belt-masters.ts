import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  downloadAndConvertRealPhotoToWebp,
  searchBingImages,
} from '../server/realWebBeltEngine';
import { enhanceBeltBasePhoto } from '../server/beltMarkingStudio';

const MASTERS_DIR = path.resolve(process.cwd(), 'public/belt-catalog/masters');
const GRIDS_DIR = path.resolve(process.cwd(), '.playwright-cli/grids');

interface MasterHarvestSpec {
  id: string;
  brand: string;
  construction: string;
  isBrandedMaster: boolean;
  queries: string[];
  preferDomains?: string[];
  avoidDomains?: string[];
}

const MASTER_SPECS: MasterHarvestSpec[] = [
  {
    id: 'SWR-COGGED',
    brand: 'SWR',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: true,
    queries: ['SWR AX Keilriemen gezahnt', 'SWR XPB XPA Keilriemen', 'SWR AX 46 Keilriemen'],
    preferDomains: ['vseinstrumenti.ru', 'keilriemen24.eu'],
  },
  {
    id: 'DONGIL-WRAPPED',
    brand: 'DONGIL',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    queries: ['DRB Super Star belt white background', 'DRB V-belt A B C rubber studio', 'Dongil V-belt ebay'],
    preferDomains: ['d-netshop.com', 'komachine.com'],
    avoidDomains: ['iksonic.com'],
  },
  {
    id: 'OPTIBELT-WRAPPED',
    brand: 'OPTIBELT',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    queries: ['Optibelt VB Keilriemen classic V-belt', 'Optibelt VB 5 C plus ebay', 'Optibelt SK SPB V-belt'],
    preferDomains: ['ebay.com', 'ebay.de', 'web.optibelt.com'],
  },
  {
    id: 'OPTIBELT-COGGED',
    brand: 'OPTIBELT',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: true,
    queries: ['Optibelt Super X-Power M=S cogged V-belt', 'Optibelt Super X-Power XPB 1900'],
    preferDomains: ['shop.dreisilker.com', 'dreisilker.com', 'ebay.com'],
  },
  {
    id: 'OPTIBELT-TIMING',
    brand: 'OPTIBELT',
    construction: 'timing-rubber',
    isBrandedMaster: true,
    queries: ['Optibelt Omega 8M timing belt white background', 'Optibelt Omega 640 8M timing belt'],
    preferDomains: ['industrialautomationcanada.com', 'web.optibelt.com'],
    avoidDomains: ['plcsource.com'],
  },
  {
    id: 'OPTIBELT-POLYV',
    brand: 'OPTIBELT',
    construction: 'poly-v-ribbed',
    isBrandedMaster: true,
    queries: ['Optibelt RB PL 1803 poly-V ribbed belt ebay', 'Optibelt RB PJ PK poly-V ribbed belt'],
    preferDomains: ['ebay.com', 'ebay.de'],
  },
  {
    id: 'MEGADYNE-WRAPPED',
    brand: 'MEGADYNE',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    queries: ['Megadyne Oleostatic V-belt white background', 'Megadyne Oleostatic V-belt A B C'],
    preferDomains: ['bearingboys.co.uk', 'bepltd.com'],
  },
  {
    id: 'MEGADYNE-TIMING',
    brand: 'MEGADYNE',
    construction: 'timing-rubber',
    isBrandedMaster: true,
    queries: ['Megadyne Isoran RPP Gold timing belt', 'Megadyne Isoran H L timing belt'],
    preferDomains: ['bepltd.com', 'industrialautomationcanada.com'],
    avoidDomains: ['tranbelt.com', 'totallybelts.com'],
  },
  {
    id: 'BANDO-WRAPPED',
    brand: 'BANDO',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    queries: ['Bando Power King V-belt ebay', 'Bando V-belt A B C white background'],
    preferDomains: ['ebay.com', 'bandobelts.co.nz'],
    avoidDomains: ['imssupply.com'],
  },
  {
    id: 'MITSUBOSHI-WRAPPED',
    brand: 'MITSUBOSHI',
    construction: 'wrapped-vbelt',
    isBrandedMaster: true,
    queries: ['Mitsuboshi V-belt A B C classic', 'Mitsuboshi Set Free V-belt white background'],
    preferDomains: ['zd-transmission.com'],
    avoidDomains: ['tbcnsongthan.com', 'chm.com.vn'],
  },
  {
    id: 'CLEAN-WRAPPED',
    brand: 'GENERIC',
    construction: 'wrapped-vbelt',
    isBrandedMaster: false,
    queries: ['black classical wrapped V-belt studio white background', 'industrial V-belt wrapped rubber white background'],
    preferDomains: ['oridabelts.com', 'baopower.com'],
  },
  {
    id: 'CLEAN-COGGED',
    brand: 'GENERIC',
    construction: 'cogged-raw-edge-vbelt',
    isBrandedMaster: false,
    queries: ['raw edge cogged V-belt notched white background studio', 'cogged V-belt AX BX rubber white background'],
    preferDomains: ['conveyorbeltchn.com', 'mblusa.com'],
  },
  {
    id: 'CLEAN-TIMING-TRAP',
    brand: 'GENERIC',
    construction: 'timing-trapezoidal-rubber',
    isBrandedMaster: false,
    queries: ['black rubber trapezoidal timing belt H L XL white background', 'synchronous rubber timing belt industrial white background'],
    preferDomains: ['pionwaybelt.com', 'ebay.com'],
  },
  {
    id: 'CLEAN-TIMING-DOUBLE',
    brand: 'GENERIC',
    construction: 'timing-double-sided',
    isBrandedMaster: false,
    queries: ['double sided timing belt twin power toothed white background', 'DL DH double sided rubber timing belt'],
    preferDomains: ['tranbelt.com', 'puteken.com'],
  },
  {
    id: 'CLEAN-TIMING-HTD',
    brand: 'GENERIC',
    construction: 'timing-htd-rubber',
    isBrandedMaster: false,
    queries: ['HTD 8M timing belt rubber black white background', '5M HTD rubber timing belt studio white background'],
    preferDomains: ['ersadental.com', 'jsdtransmission.com'],
    avoidDomains: ['yonghangbelt.com', 'bmgworld.net'],
  },
  {
    id: 'CLEAN-TIMING-PU',
    brand: 'GENERIC',
    construction: 'timing-pu-steel',
    isBrandedMaster: false,
    queries: ['white polyurethane steel cord timing belt AT10 T10 open end', 'polyurethane timing belt AT20 T10 white background'],
    preferDomains: ['bepltd.com', 'canwellbelt.com'],
    avoidDomains: ['yonghangbelt.com', 'beltingedge.com'],
  },
  {
    id: 'CLEAN-TIMING-COATED',
    brand: 'GENERIC',
    construction: 'timing-coated',
    isBrandedMaster: false,
    queries: ['red linatex coated timing belt polyurethane APL', 'coated polyurethane timing belt red backing industrial'],
    preferDomains: ['fnsheppard.com'],
  },
  {
    id: 'CLEAN-POLYV',
    brand: 'GENERIC',
    construction: 'poly-v-ribbed',
    isBrandedMaster: false,
    queries: ['poly-V multi ribbed drive belt PJ PK white background', 'multi ribbed belt industrial studio photo'],
    preferDomains: ['rubberbeltmanufacturer.com', 'baopower.com'],
    avoidDomains: ['store.santent.in'],
  },
  {
    id: 'CLEAN-HEX',
    brand: 'GENERIC',
    construction: 'hexagonal-vbelt',
    isBrandedMaster: false,
    queries: ['hexagonal double V-belt AA BB CC white background', 'double sided hexagonal V-belt industrial'],
    preferDomains: ['transpower.co.uk'],
    avoidDomains: ['sevlowmro.co.uk', 'simplybearings.co.uk'],
  },
  {
    id: 'CLEAN-PU-ROUND',
    brand: 'GENERIC',
    construction: 'pu-round-welded',
    isBrandedMaster: false,
    queries: ['green polyurethane round belt weldable cord white background', 'Volta green polyurethane round belt'],
    preferDomains: ['bigamart.com', 'lisenpu.com'],
  },
  {
    id: 'CLEAN-PU-VBELT',
    brand: 'GENERIC',
    construction: 'pu-vbelt-welded',
    isBrandedMaster: false,
    queries: ['green polyurethane V-belt weldable profile white background', 'Volta green polyurethane V-belt'],
    preferDomains: ['tyma.eu', 'utuobelt.com'],
  },
  {
    id: 'CLEAN-CROWNED',
    brand: 'GENERIC',
    construction: 'crowned-ridge',
    isBrandedMaster: false,
    queries: ['ridge top polyurethane ceramic tile conveyor belt crowned', 'polyurethane ridge top V-belt ceramic line'],
    preferDomains: ['atlastrading.it', 'rubbexconveyors.com'],
  },
  {
    id: 'CLEAN-CONVEYOR',
    brand: 'GENERIC',
    construction: 'conveyor-flat',
    isBrandedMaster: false,
    queries: ['green PVC flat industrial conveyor belt roll white background', 'industrial PVC PU conveyor belt'],
    preferDomains: ['rentonebelt.com', 'puteken.com'],
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
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${lines}<rect x="0" y="${size - 24}" width="${size}" height="24" fill="rgba(0,0,0,0.78)"/><text x="8" y="${size - 7}" fill="#fff" font-size="12" font-family="monospace" font-weight="700">${label}</text></svg>`,
  );
  return sharp(resized).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer();
}

async function harvestOne(spec: MasterHarvestSpec) {
  const outName = `${spec.id}-master.webp`;
  const outPath = path.join(MASTERS_DIR, outName);

  const candidates = [];
  const seen = new Set<string>();
  for (const q of spec.queries) {
    const res = await searchBingImages(q, 16, 7500).catch(() => []);
    for (const c of res) {
      if (seen.has(c.imageUrl)) continue;
      if (spec.avoidDomains?.some((d) => c.domain.includes(d) || c.imageUrl.includes(d))) continue;
      seen.add(c.imageUrl);
      candidates.push(c);
    }
  }

  // Sort preferred verified domains first
  candidates.sort((a, b) => {
    const aPref = spec.preferDomains?.findIndex((d) => a.domain.includes(d) || a.imageUrl.includes(d)) ?? -1;
    const bPref = spec.preferDomains?.findIndex((d) => b.domain.includes(d) || b.imageUrl.includes(d)) ?? -1;
    const aScore = aPref >= 0 ? 100 - aPref * 10 : 0;
    const bScore = bPref >= 0 ? 100 - bPref * 10 : 0;
    return bScore - aScore;
  });

  for (const c of candidates.slice(0, 14)) {
    const dl = await downloadAndConvertRealPhotoToWebp(c.imageUrl, 6500, c.thumbnailFallbackUrl);
    if (!dl || dl.width < 320 || dl.height < 220) continue;
    const enhanced = await enhanceBeltBasePhoto(dl.webpBuffer, 1000);
    fs.writeFileSync(outPath, enhanced);
    const meta = await sharp(enhanced).metadata();
    console.log(spec.id.padEnd(22), 'OK ->', c.domain, `(${meta.width}x${meta.height})`);
    return {
      entry: {
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
      gridTile: await drawGridOverlay(enhanced, `${spec.id} (${meta.width}x${meta.height})`),
    };
  }
  console.warn(spec.id.padEnd(22), 'FAILED');
  return null;
}

async function main() {
  fs.mkdirSync(MASTERS_DIR, { recursive: true });
  fs.mkdirSync(GRIDS_DIR, { recursive: true });

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
      width: 1200,
      height: 798,
    },
  };

  const gridTiles: Buffer[] = [];
  // Run in batches of 6
  for (let i = 0; i < MASTER_SPECS.length; i += 6) {
    const batch = await Promise.all(MASTER_SPECS.slice(i, i + 6).map(harvestOne));
    for (const r of batch) {
      if (r) {
        manifest[r.entry.id] = r.entry;
        gridTiles.push(r.gridTile);
      }
    }
  }

  fs.writeFileSync(path.join(MASTERS_DIR, 'masters-manifest.json'), JSON.stringify(manifest, null, 2));

  async function writeGrid(idx: number, tiles: Buffer[]) {
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
      .toFile(path.join(GRIDS_DIR, `grid_${idx}.png`));
  }

  await writeGrid(1, gridTiles.slice(0, 12));
  await writeGrid(2, gridTiles.slice(12));
  console.log(`DONE! Saved ${Object.keys(manifest).length} masters & coordinate grids.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
