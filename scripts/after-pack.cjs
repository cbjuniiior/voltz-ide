/**
 * electron-builder afterPack hook — patches the Electron prebuilt .exe with
 * the right icon + product metadata using rcedit.
 *
 * We do this OUTSIDE of electron-builder's signAndEditExecutable flow because
 * that flow tries to download the winCodeSign cache, and the cache extraction
 * fails on Windows when symlink creation isn't allowed (no Developer Mode /
 * no admin). The winCodeSign cache contains macOS dylib symlinks which need
 * the SeCreateSymbolicLinkPrivilege — we don't need any of that, we just want
 * to swap the .exe icon, which rcedit alone can do.
 *
 * Runs after the app is copied to win-unpacked but BEFORE NSIS builds the
 * installer, so the resulting installer (and installed .exe) carries the new
 * icon and version info.
 */

const path = require('node:path');
const pkg = require('../package.json');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  // rcedit v5 is ESM-only; load via dynamic import from this CJS hook.
  const { rcedit } = await import('rcedit');

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.resolve(__dirname, '..', 'build', 'icon.ico');

  console.log(`  • [afterPack] patching ${exePath} with icon=${iconPath}`);

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'Voltz IDE',
      FileDescription: 'Voltz IDE — Multiterminal Claude Code & Codex',
      CompanyName: 'Cassio Bona',
      LegalCopyright: `© ${new Date().getFullYear()} Cassio Bona`,
      OriginalFilename: `${context.packager.appInfo.productFilename}.exe`,
    },
    'file-version': pkg.version,
    'product-version': pkg.version,
  });

  console.log('  • [afterPack] icon + metadata patched');
};
