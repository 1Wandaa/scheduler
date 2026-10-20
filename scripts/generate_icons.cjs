const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateAllIcons() {
  console.log('Generating optimized PWA and app icons...');

  const publicDir = path.join(__dirname, '..', 'public');
  const scratchDir = path.join(__dirname, '..', 'scratch');

  // Source base image: the high-res 512x512 full-bleed image with the badge
  const sourceFile = path.join(scratchDir, 'old-app-icon-512-maskable.png');
  if (!fs.existsSync(sourceFile)) {
    throw new Error('Source file not found: ' + sourceFile);
  }

  // 1. Antialiased Circular Masks
  // 512x512: radius 254 (2px margin for sub-pixel anti-aliasing around entire perimeter)
  const mask512 = Buffer.from(
    '<svg width="512" height="512" viewBox="0 0 512 512">' +
    '<circle cx="256" cy="256" r="254" fill="#ffffff"/>' +
    '</svg>'
  );

  // 192x192: radius 95 (1px margin for crisp anti-aliasing)
  const mask192 = Buffer.from(
    '<svg width="192" height="192" viewBox="0 0 192 192">' +
    '<circle cx="96" cy="96" r="95" fill="#ffffff"/>' +
    '</svg>'
  );

  // 180x180: radius 89 (for apple touch icon or high-res favicons)
  const mask180 = Buffer.from(
    '<svg width="180" height="180" viewBox="0 0 180 180">' +
    '<circle cx="90" cy="90" r="89" fill="#ffffff"/>' +
    '</svg>'
  );

  // Base 512 buffer
  const base512Buffer = await sharp(sourceFile).resize(512, 512).toBuffer();
  // Base 192 buffer
  const base192Buffer = await sharp(sourceFile).resize(192, 192, { kernel: sharp.kernel.lanczos3 }).toBuffer();
  // Base 180 buffer for Apple Touch Icon
  const base180Buffer = await sharp(sourceFile).resize(180, 180, { kernel: sharp.kernel.lanczos3 }).toBuffer();

  // --- A. CIRCULAR ICONS (purpose: "any") with 100% transparent corners ---
  // 512x512 circular icon for PC (Windows desktop shortcut / Chrome / Edge) and Mobile fallback
  const circle512Buffer = await sharp(base512Buffer)
    .composite([{ input: mask512, blend: 'dest-in' }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  // 192x192 circular icon
  const circle192Buffer = await sharp(base192Buffer)
    .composite([{ input: mask192, blend: 'dest-in' }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  // Write circle icons
  fs.writeFileSync(path.join(publicDir, 'app-icon-512-any.png'), circle512Buffer);
  fs.writeFileSync(path.join(publicDir, 'app-icon-192-any.png'), circle192Buffer);

  // Also write to v3 filenames for backwards-compatibility with any cached PWA instances
  fs.writeFileSync(path.join(publicDir, 'app-icon-512-v3.png'), circle512Buffer);
  fs.writeFileSync(path.join(publicDir, 'app-icon-192-v3.png'), circle192Buffer);

  // Also write to logo.png so in-app UI and browser tab favicon are high-res and circular!
  fs.writeFileSync(path.join(publicDir, 'logo.png'), circle512Buffer);

  // --- B. MASKABLE ICONS (purpose: "maskable") for Android Adaptive Icons ---
  // Full bleed background (#0a1b2f with radial pattern), safe zone compliant
  const maskable512Buffer = await sharp(base512Buffer)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const maskable192Buffer = await sharp(base192Buffer)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'app-icon-512-maskable.png'), maskable512Buffer);
  fs.writeFileSync(path.join(publicDir, 'app-icon-192-maskable.png'), maskable192Buffer);

  // --- C. APPLE TOUCH ICON (iOS Safari) ---
  // iOS requires solid background (no transparent corners because iOS applies its own rounded squircle)
  const appleTouchBuffer = await sharp(base180Buffer)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchBuffer);

  // --- D. FAVICON ---
  const favicon32Buffer = await sharp(circle512Buffer)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), favicon32Buffer);

  console.log('Finished generating icons:');
  console.log('- app-icon-512-any.png (Circle, transparent corners):', circle512Buffer.length, 'bytes');
  console.log('- app-icon-192-any.png (Circle, transparent corners):', circle192Buffer.length, 'bytes');
  console.log('- app-icon-512-maskable.png (Full bleed, Android safe zone):', maskable512Buffer.length, 'bytes');
  console.log('- app-icon-192-maskable.png (Full bleed, Android safe zone):', maskable192Buffer.length, 'bytes');
  console.log('- apple-touch-icon.png (iOS squircle compatible):', appleTouchBuffer.length, 'bytes');
  console.log('- logo.png (Updated high-res circular logo):', circle512Buffer.length, 'bytes');
  console.log('- favicon-32x32.png:', favicon32Buffer.length, 'bytes');
}

generateAllIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
