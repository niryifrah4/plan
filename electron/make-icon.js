/**
 * Generates a 1024x1024 PNG with the Verdant emerald background and a
 * stylised "פ" letter, using zero npm dependencies (raw PNG via zlib).
 * Output: build/icon.png
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const W = 1024;
const H = 1024;

// Verdant palette
const BG = [10, 122, 74];      // emerald #0a7a4a
const FG = [249, 250, 242];    // cream  #f9faf2
const ACC = [88, 225, 176];    // highlight #58e1b0

// 32x32 bitmap of the Hebrew letter "פ" (Pe). 1 = letter, 0 = background.
// Hand-drawn so we don't need a font renderer.
const GLYPH = [
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00111111111111111111111111110000",
  "00111111111111111111111111110000",
  "00111111111111111111111111110000",
  "00111111111111111111111111110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00111100000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000011110000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
  "00000000000000000000000000000000",
];

// Build pixel buffer
const px = Buffer.alloc(W * H * 4);
function setPx(x, y, [r, g, b], a = 255) {
  const o = (y * W + x) * 4;
  px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
}

// Fill: rounded square emerald background with subtle gradient
const radius = 220;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // rounded-rect mask
    const dx = Math.max(radius - x, x - (W - 1 - radius), 0);
    const dy = Math.max(radius - y, y - (H - 1 - radius), 0);
    const inCorner = dx > 0 && dy > 0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (inCorner && dist > radius) {
      setPx(x, y, [0, 0, 0], 0); // transparent
      continue;
    }
    // vertical gradient: top brighter, bottom deeper
    const t = y / H;
    const r = Math.round(BG[0] * (1 - t * 0.35));
    const g = Math.round(BG[1] * (1 - t * 0.25));
    const b = Math.round(BG[2] * (1 - t * 0.25));
    setPx(x, y, [r, g, b]);
  }
}

// Draw glyph in the center, scaled up
const glyphSize = 720;
const cell = glyphSize / 32;
const ox = Math.round((W - glyphSize) / 2);
const oy = Math.round((H - glyphSize) / 2);
for (let gy = 0; gy < 32; gy++) {
  for (let gx = 0; gx < 32; gx++) {
    if (GLYPH[gy][gx] === "1") {
      const x0 = ox + Math.round(gx * cell);
      const y0 = oy + Math.round(gy * cell);
      const x1 = ox + Math.round((gx + 1) * cell);
      const y1 = oy + Math.round((gy + 1) * cell);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x >= 0 && x < W && y >= 0 && y < H) setPx(x, y, FG);
        }
      }
    }
  }
}

// Accent line under the letter
const accentY1 = oy + glyphSize - 60;
const accentY2 = accentY1 + 18;
const accentX1 = ox + 80;
const accentX2 = ox + glyphSize - 80;
for (let y = accentY1; y < accentY2; y++) {
  for (let x = accentX1; x < accentX2; x++) {
    setPx(x, y, ACC);
  }
}

// ─── PNG encoding (RGBA) ───
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// Add filter byte (0) per scanline
const rowBytes = 1 + W * 4;
const raw = Buffer.alloc(H * rowBytes);
for (let y = 0; y < H; y++) {
  raw[y * rowBytes] = 0;
  px.copy(raw, y * rowBytes + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, "..", "build");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "icon.png");
fs.writeFileSync(outFile, png);
console.log("✓ wrote", outFile, `(${png.length} bytes)`);
