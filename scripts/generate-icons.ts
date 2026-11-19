import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT = join(import.meta.dirname, '..', 'public', 'brand');
const BG = '#0B0D10';
const MAIN = '#4C9EEB';
const ACCENT = '#E8EBF0';

const GRID = [40, 100, 160, 220];
const cells = GRID.flatMap((y) => GRID.map((x) => [x, y] as const)).filter(
  ([x, y]) => !(x === 160 && y === 160),
);

const logo = (transform: string) =>
  `<g transform="${transform}">` +
  `<rect x="10" y="10" width="280" height="280" rx="40" fill="none" stroke="${MAIN}" stroke-width="20"/>` +
  cells
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="40" height="40" rx="10" fill="${MAIN}"/>`)
    .join('') +
  `<rect x="160" y="160" width="40" height="40" rx="10" fill="${ACCENT}"/></g>`;

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${body}</svg>`;

const any = svg(
  `<rect width="512" height="512" rx="112" fill="${BG}"/>${logo('translate(76 76) scale(1.2)')}`,
);
const maskable = svg(
  `<rect width="512" height="512" fill="${BG}"/>${logo('translate(96 96) scale(1.0667)')}`,
);

const png = (source: string, size: number) =>
  sharp(Buffer.from(source)).resize(size, size).png().toBuffer();

// ICO com PNGs embutidos (16 e 32 px).
function ico(images: { size: number; data: Buffer }[]) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size, o);
    head.writeUInt8(size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: string | Buffer) => writeFileSync(join(OUT, name), data);

write('icon-any.svg', any);
write('icon-maskable.svg', maskable);
write('icon.svg', any);
write('icon-192.png', await png(any, 192));
write('icon-512.png', await png(any, 512));
write('icon-maskable-192.png', await png(maskable, 192));
write('icon-maskable-512.png', await png(maskable, 512));
write(
  'apple-touch-icon.png',
  await sharp(await png(maskable, 180))
    .flatten({ background: BG })
    .png()
    .toBuffer(),
);
write(
  'favicon.ico',
  ico(await Promise.all([16, 32].map(async (size) => ({ size, data: await png(any, size) })))),
);
console.log('Ícones gerados em public/brand');
