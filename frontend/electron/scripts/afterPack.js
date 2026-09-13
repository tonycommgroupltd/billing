const path = require('path');
const fs = require('fs');

/**
 * Embed Tonycomm icon into the Windows .exe before NSIS wraps it.
 * Needed because signAndEditExecutable is false (no winCodeSign symlink privileges).
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'electron', 'resources', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] exe not found:', exePath);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] icon not found:', iconPath);
    return;
  }

  const { rcedit } = require('rcedit');
  await rcedit(exePath, { icon: iconPath });
  console.log('[afterPack] set icon on', exeName);
};
