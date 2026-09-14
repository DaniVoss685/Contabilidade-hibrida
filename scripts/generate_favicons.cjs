const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const publicDir = path.resolve(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgPath = path.join(publicDir, 'favicon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating favicon PNGs from favicon.svg...');

  // 1. Generate PNGs for 16x16, 32x32, 48x48, 180x180, 192x192, 512x512
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), png16);

  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), png32);

  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon-48x48.png'), png48);

  const png180 = await sharp(svgBuffer).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png180);

  const png192 = await sharp(svgBuffer).resize(192, 192).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);

  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);

  console.log('Generated PNGs successfully.');

  // 2. Build multi-resolution favicon.ico containing 16x16, 32x32, 48x48
  const images = [
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 },
  ];

  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  let offset = headerSize + dirEntrySize * numImages;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height === 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset of image data
    entries.push(entry);
    offset += img.buffer.length;
  }

  const icoBuffer = Buffer.concat([header, ...entries, ...images.map((i) => i.buffer)]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Built multi-resolution favicon.ico successfully. Total size:', icoBuffer.length, 'bytes');
}

generate().catch((err) => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
