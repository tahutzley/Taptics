"use strict";

const crypto = require("crypto");
const zlib = require("zlib");

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

function rgba(hex) {
  const value = hex.replace("#", "");
  if (![6, 8].includes(value.length)) throw new Error(`Invalid color: ${hex}`);
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), alpha];
}

class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  pixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const index = (y * this.width + x) * 4;
    const [red, green, blue, alpha] = rgba(color);
    this.data[index] = red;
    this.data[index + 1] = green;
    this.data[index + 2] = blue;
    this.data[index + 3] = alpha;
  }

  rect(x, y, width, height, color) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) this.pixel(x + column, y + row, color);
    }
  }

  line(x0, y0, x1, y1, color) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.pixel(x, y, color);
      if (x === x1 && y === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
  }

  regionData(x, y, width, height) {
    if (![x, y, width, height].every(Number.isInteger) || width <= 0 || height <= 0) {
      throw new Error("Pixel region must use positive integer dimensions");
    }
    if (x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      throw new Error("Pixel region exceeds canvas bounds");
    }
    const region = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const sourceStart = ((y + row) * this.width + x) * 4;
      this.data.copy(region, row * width * 4, sourceStart, sourceStart + width * 4);
    }
    return region;
  }

  encodePng() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8;
    header[9] = 6;
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
    for (let row = 0; row < this.height; row += 1) {
      const target = row * (this.width * 4 + 1);
      raw[target] = 0;
      this.data.copy(raw, target + 1, row * this.width * 4, (row + 1) * this.width * 4);
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0))
    ]);
  }
}

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

function readPngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) throw new Error("Invalid PNG signature");
  if (buffer.readUInt32BE(8) !== 13 || buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("Invalid PNG header");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25]
  };
}

module.exports = { PixelCanvas, readPngInfo, rgba, sha256 };
