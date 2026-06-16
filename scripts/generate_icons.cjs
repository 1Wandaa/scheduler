const sharp = require('sharp');
async function createCircle() {
  const mask512 = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>');
  const mask192 = Buffer.from('<svg width="192" height="192"><circle cx="96" cy="96" r="96" fill="white"/></svg>');

  const bg512 = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0a1b2f' } }).png().toBuffer();
  const bg192 = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#0a1b2f' } }).png().toBuffer();

  const logo512 = await sharp('public/logo.png').resize(512, 512, { fit: 'cover' }).toBuffer();
  const logo192 = await sharp('public/logo.png').resize(192, 192, { fit: 'cover' }).toBuffer();

  // Full bleed square icons for maskable (Android will apply its own mask without gaps)
  const maskable512 = await sharp(bg512).composite([{ input: logo512, gravity: 'center' }]).png().toBuffer();
  const maskable192 = await sharp(bg192).composite([{ input: logo192, gravity: 'center' }]).png().toBuffer();

  await sharp(maskable512).toFile('public/app-icon-512-maskable.png');
  await sharp(maskable192).toFile('public/app-icon-192-maskable.png');

  // Pre-cut circle icons for 'any' (Desktop/Windows will show a perfect circle)
  await sharp(maskable512).composite([{ input: mask512, blend: 'dest-in' }]).png().toFile('public/app-icon-512-any.png');
  await sharp(maskable192).composite([{ input: mask192, blend: 'dest-in' }]).png().toFile('public/app-icon-192-any.png');

  console.log('Icons generated successfully.');
}
createCircle().catch(console.error);
