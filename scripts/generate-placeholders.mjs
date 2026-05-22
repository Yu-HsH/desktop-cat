import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputRoot = path.join(rootDir, "assets", "pets", "cat");
const width = 160;
const height = 160;

const palette = {
  transparent: [0, 0, 0, 0],
  outline: [104, 67, 36, 255],
  fur: [244, 181, 96, 255],
  furDark: [205, 125, 56, 255],
  furLight: [255, 225, 173, 255],
  pink: [255, 141, 171, 255],
  shadow: [0, 0, 0, 48]
};

function makeCrcTable() {
  const table = [];

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createImage() {
  const pixels = new Uint8Array(width * height * 4);

  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set(palette.transparent, i);
  }

  return pixels;
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  pixels.set(color, index);
}

function fillEllipse(pixels, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;

      if (dx * dx + dy * dy <= 1) {
        setPixel(pixels, x, y, color);
      }
    }
  }
}

function fillTriangle(pixels, a, b, c, color) {
  const minX = Math.floor(Math.min(a.x, b.x, c.x));
  const maxX = Math.ceil(Math.max(a.x, b.x, c.x));
  const minY = Math.floor(Math.min(a.y, b.y, c.y));
  const maxY = Math.ceil(Math.max(a.y, b.y, c.y));
  const area = edge(a, b, c);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p = { x, y };
      const w0 = edge(b, c, p);
      const w1 = edge(c, a, p);
      const w2 = edge(a, b, p);

      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        setPixel(pixels, x, y, color);
      }
    }
  }

  function edge(left, right, point) {
    return (point.x - left.x) * (right.y - left.y) - (point.y - left.y) * (right.x - left.x);
  }
}

function fillLine(pixels, start, end, radius, color) {
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));

  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    fillEllipse(
      pixels,
      start.x + (end.x - start.x) * t,
      start.y + (end.y - start.y) * t,
      radius,
      radius,
      color
    );
  }
}

function drawCat(pixels, state, frame) {
  const walkBob = state === "walk" ? Math.sin(frame * Math.PI) * 3 : 0;
  const petSquish = state === "pet" ? 4 : 0;
  const sleeping = state === "sleep";
  const y = sleeping ? 12 : walkBob;

  fillEllipse(pixels, 78, 140, 50, 9, palette.shadow);

  if (sleeping) {
    fillEllipse(pixels, 76, 96, 52, 31, palette.outline);
    fillEllipse(pixels, 76, 94, 48, 27, palette.fur);
    fillEllipse(pixels, 109, 80, 31, 24, palette.outline);
    fillEllipse(pixels, 109, 80, 27, 20, palette.fur);
    fillTriangle(pixels, { x: 90, y: 67 }, { x: 97, y: 43 }, { x: 107, y: 70 }, palette.outline);
    fillTriangle(pixels, { x: 91, y: 68 }, { x: 97, y: 50 }, { x: 104, y: 70 }, palette.fur);
    fillTriangle(pixels, { x: 121, y: 66 }, { x: 140, y: 49 }, { x: 135, y: 76 }, palette.outline);
    fillTriangle(pixels, { x: 122, y: 67 }, { x: 136, y: 53 }, { x: 132, y: 74 }, palette.fur);
    fillLine(pixels, { x: 100, y: 80 }, { x: 110, y: 80 }, 1.5, palette.outline);
    fillLine(pixels, { x: 121, y: 80 }, { x: 131, y: 80 }, 1.5, palette.outline);
    fillEllipse(pixels, 116, 88, 4, 3, palette.pink);
    return;
  }

  const legOffset = state === "walk" ? Math.sin(frame * Math.PI) * 7 : 0;
  const tailOffset = Math.sin((frame + 1) * Math.PI * 0.5) * 8;

  fillLine(pixels, { x: 42, y: 96 + y }, { x: 22, y: 76 + y + tailOffset }, 8, palette.outline);
  fillLine(pixels, { x: 42, y: 96 + y }, { x: 22, y: 76 + y + tailOffset }, 5, palette.fur);
  fillEllipse(pixels, 76, 92 + y, 45, 30 - petSquish, palette.outline);
  fillEllipse(pixels, 76, 90 + y, 41, 26 - petSquish, palette.fur);
  fillEllipse(pixels, 108, 70 + y, 35, 29 - petSquish, palette.outline);
  fillEllipse(pixels, 108, 68 + y, 31, 25 - petSquish, palette.fur);
  fillTriangle(pixels, { x: 84, y: 56 + y }, { x: 93, y: 24 + y }, { x: 103, y: 58 + y }, palette.outline);
  fillTriangle(pixels, { x: 88, y: 56 + y }, { x: 94, y: 34 + y }, { x: 100, y: 58 + y }, palette.furLight);
  fillTriangle(pixels, { x: 118, y: 55 + y }, { x: 137, y: 29 + y }, { x: 135, y: 65 + y }, palette.outline);
  fillTriangle(pixels, { x: 121, y: 56 + y }, { x: 133, y: 38 + y }, { x: 131, y: 63 + y }, palette.furLight);
  fillEllipse(pixels, 98, 68 + y, 3, 4, palette.outline);
  fillEllipse(pixels, 120, 68 + y, 3, 4, palette.outline);
  fillEllipse(pixels, 110, 78 + y, 5, 4, palette.pink);
  fillLine(pixels, { x: 109, y: 82 + y }, { x: 104, y: 88 + y }, 1, palette.outline);
  fillLine(pixels, { x: 111, y: 82 + y }, { x: 116, y: 88 + y }, 1, palette.outline);
  fillLine(pixels, { x: 53, y: 114 + y }, { x: 48 + legOffset, y: 136 }, 4, palette.outline);
  fillLine(pixels, { x: 83, y: 114 + y }, { x: 78 - legOffset, y: 136 }, 4, palette.outline);
  fillLine(pixels, { x: 105, y: 110 + y }, { x: 101 - legOffset, y: 132 }, 4, palette.outline);
  fillLine(pixels, { x: 126, y: 106 + y }, { x: 121 + legOffset, y: 130 }, 4, palette.outline);

  if (state === "pet") {
    fillEllipse(pixels, 91, 77 + y, 5, 4, palette.pink);
    fillEllipse(pixels, 127, 77 + y, 5, 4, palette.pink);
  }
}

function encodePng(pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4)).copy(raw, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND")
  ]);
}

const states = {
  idle: 4,
  walk: 6,
  sleep: 3,
  pet: 4
};

for (const [state, frameCount] of Object.entries(states)) {
  const stateDir = path.join(outputRoot, state);
  fs.mkdirSync(stateDir, { recursive: true });

  for (let frame = 0; frame < frameCount; frame += 1) {
    const pixels = createImage();
    drawCat(pixels, state, frame / frameCount);
    fs.writeFileSync(path.join(stateDir, `${String(frame).padStart(3, "0")}.png`), encodePng(pixels));
  }
}

console.log(`Generated placeholder pet sprites in ${outputRoot}`);
