const zlib = require('zlib');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const bytes = Buffer.alloc(body.length + 12);
  bytes.writeUInt32BE(body.length);
  bytes.write(type, 4);
  body.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}
function png(width = 960, height = 540, variant = 0, { badFilter = false, badDeflate = false } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc(height * (1 + width * 3));
  const palettes = [
    [[70, 104, 133], [103, 128, 145], [52, 83, 71], [67, 104, 73], [36, 60, 45]],
    [[115, 80, 74], [176, 125, 91], [67, 74, 72], [92, 101, 72], [37, 53, 47]],
    [[48, 58, 86], [88, 94, 119], [43, 62, 67], [48, 79, 74], [25, 43, 48]],
  ];
  const colors = palettes[variant % palettes.length];
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 3);
    rows[start] = badFilter ? 8 : 0;
    for (let x = 0; x < width; x++) {
      const horizon = Math.floor(height * .48) + Math.floor(Math.sin(Math.floor(x / 32) * .7) * height * .10);
      let band = y < height * .24 ? 0 : y < horizon ? 1 : y < height * .68 ? 2 : y < height * .84 ? 3 : 4;
      if (Math.floor(x / 36) % 7 === 3 && y > height * .29 && y < height * .7) band = 4;
      const shade = ((Math.floor(x / 24) + Math.floor(y / 24)) % 3) * 3;
      for (let channel = 0; channel < 3; channel++) rows[start + 1 + x * 3 + channel] = colors[band][channel] + shade;
    }
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', badDeflate ? Buffer.from('not zlib') : zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { png, chunk };
