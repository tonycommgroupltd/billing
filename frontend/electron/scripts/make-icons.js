/**
 * Build Windows .ico (16–256) from public/logo512.png for NSIS + exe icons.
 * Run: npm run electron:icons
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const root = path.join(__dirname, '..', '..');
  const resources = path.join(root, 'electron', 'resources');
  const logo = path.join(root, 'public', 'logo512.png');
  const favicon = path.join(root, 'public', 'favicon.png');

  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(logo, path.join(resources, 'icon.png'));
  fs.copyFileSync(favicon, path.join(resources, 'favicon.png'));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tmpPngs = [];
  for (const size of sizes) {
    const out = path.join(resources, `icon-${size}.png`);
    await sharp(logo)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toFile(out);
    tmpPngs.push(out);
  }

  const pngToIco = require('png-to-ico');
  const toIco = pngToIco.default || pngToIco;
  const buf = await toIco(tmpPngs);
  fs.writeFileSync(path.join(resources, 'icon.ico'), buf);
  for (const f of tmpPngs) fs.unlinkSync(f);
  console.log('Wrote electron/resources/icon.ico (%d bytes)', buf.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
