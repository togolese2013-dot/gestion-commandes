/**
 * Generate PWA icons (PNG) from the SVG source.
 * Run once: node scripts/generate-icons.mjs
 * Requires: npm install sharp (dev dependency)
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath   = join(__dirname, '../public/icons/icon.svg');
const outDir    = join(__dirname, '../public/icons');

const svg = readFileSync(svgPath);

const icons = [
  { file: 'icon-192.png',          size: 192 },
  { file: 'icon-512.png',          size: 512 },
  { file: 'icon-maskable-192.png', size: 192 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png',  size: 180 },
  { file: 'favicon-32.png',        size: 32  },
  { file: 'favicon-16.png',        size: 16  },
];

for (const { file, size } of icons) {
  const dest = join(outDir, file);
  await sharp(svg).resize(size, size).png().toFile(dest);
  console.log(`✅  ${file} (${size}×${size})`);
}

console.log('\n🎉  Icons generated in public/icons/');
