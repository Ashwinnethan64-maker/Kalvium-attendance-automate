const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Generate a valid uncompressed PNG file programmatically
function createPNG(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 2; // Color type: 2 (RGB)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(len + 12);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);

    // CRC
    let crc = 0xffffffff;
    for (let i = 4; i < len + 8; i++) {
      let c = (crc ^ buf[i]) & 0xff;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc = (crc >>> 8) ^ c;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    buf.writeUInt32BE(crc, len + 8);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with row filter byte 0
  const rowLen = width * 3 + 1;
  const rawData = Buffer.alloc(height * rowLen);
  for (let y = 0; y < height; y++) {
    const offset = y * rowLen;
    rawData[offset] = 0; // Filter none
    for (let x = 0; x < width; x++) {
      const p = offset + 1 + x * 3;
      // Draw blue icon with small gradient
      rawData[p] = r;
      rawData[p + 1] = g;
      rawData[p + 2] = b;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createPNG(16, 16, 37, 99, 235));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createPNG(48, 48, 37, 99, 235));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createPNG(128, 128, 37, 99, 235));

console.log('Successfully generated icon16.png, icon48.png, icon128.png');
