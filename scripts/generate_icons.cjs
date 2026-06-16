const sharp = require('sharp');
async function createCircle() {
  const bg512 = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>');
  const bg192 = Buffer.from('<svg width="192" height="192"><circle cx="96" cy="96" r="96" fill="white"/></svg>');

  const logo512 = await sharp('public/logo.png').resize(380, 380, { fit: 'inside' }).toBuffer();
  await sharp(bg512)
    .composite([{ input: logo512, gravity: 'center' }])
    .png()
    .toFile('public/app-icon-512.png');

  const logo192 = await sharp('public/logo.png').resize(140, 140, { fit: 'inside' }).toBuffer();
  await sharp(bg192)
    .composite([{ input: logo192, gravity: 'center' }])
    .png()
    .toFile('public/app-icon-192.png');

  console.log('Icons generated successfully.');
}
createCircle().catch(console.error);
