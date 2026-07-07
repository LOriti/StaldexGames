// Generates Android launcher icons from resources/icon.png using jimp (pure JS).
// Produces legacy square + round icons and adaptive-icon foreground layers
// at every density. Run: node scripts/gen-icons.js
const path = require('path');
const Jimp = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources', 'icon.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Legacy launcher icon sizes (48dp base) per density bucket.
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive-icon foreground canvas is 108dp; safe content zone is the inner 72dp.
const FG = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
// Scale the icon art to ~80% of the foreground canvas so nothing important
// gets clipped by the launcher's circular / squircle mask.
const FG_CONTENT = 0.80;

async function main() {
  const src = await Jimp.read(SRC);

  for (const [density, size] of Object.entries(LEGACY)) {
    const dir = path.join(RES, `mipmap-${density}`);

    // Square legacy icon.
    const square = src.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
    await square.writeAsync(path.join(dir, 'ic_launcher.png'));

    // Round legacy icon: same art with a circular alpha mask.
    const round = square.clone();
    const r = size / 2;
    round.scan(0, 0, size, size, (x, y, idx) => {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) round.bitmap.data[idx + 3] = 0;
    });
    await round.writeAsync(path.join(dir, 'ic_launcher_round.png'));
  }

  for (const [density, canvas] of Object.entries(FG)) {
    const dir = path.join(RES, `mipmap-${density}`);
    const content = Math.round(canvas * FG_CONTENT);
    const art = src.clone().resize(content, content, Jimp.RESIZE_BICUBIC);
    // Transparent canvas, art centered in the safe zone.
    const fg = await new Jimp(canvas, canvas, 0x00000000);
    const off = Math.round((canvas - content) / 2);
    fg.composite(art, off, off);
    await fg.writeAsync(path.join(dir, 'ic_launcher_foreground.png'));
  }

  console.log('Icons generated for', Object.keys(LEGACY).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
