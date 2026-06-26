/**
 * Gera os ícones do app a partir do PNG de origem do usuário.
 *   Origem:  build/icone-voltz-ide.png   (quadrado, alta resolução)
 *   Saída:
 *     build/icon.png  — 1024×1024 (janela do app + macOS/Linux; o electron-builder
 *                       gera o .icns do macOS a partir deste PNG)
 *     build/icon.ico  — multi-resolução (256/128/64/48/32/16) para o .exe + NSIS
 *
 * Rodar: node scripts/build-icons.mjs   (ou npm run build:icons)
 *
 * NOTA: depois de trocar o ícone, rode `npm run dist` para embutir no instalador
 * e no .exe (via rcedit em scripts/after-pack.cjs). O Windows cacheia ícones de
 * atalho — se continuar mostrando o antigo, rode (Win+R) "ie4uinit -show".
 */

import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');
const SOURCE = path.join(buildDir, 'icone-voltz-idev2.png');

if (!fs.existsSync(SOURCE)) {
  console.error(`✗ Ícone de origem não encontrado: ${SOURCE}`);
  process.exit(1);
}

const b64 = fs.readFileSync(SOURCE).toString('base64');

// Embute o PNG num SVG e rasteriza num quadrado exato do tamanho pedido.
// `preserveAspectRatio="none"` força o quadrado (a origem é ~quadrada, então a
// distorção é imperceptível) e garante ícones perfeitamente quadrados.
function renderSquare(size) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<image xlink:href="data:image/png;base64,${b64}" x="0" y="0" ` +
    `width="${size}" height="${size}" preserveAspectRatio="none"/></svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

// 1) icon.png — 1024×1024
fs.writeFileSync(path.join(buildDir, 'icon.png'), renderSquare(1024));
console.log('✓ build/icon.png  (1024×1024)');

// 2) icon.ico — multi-resolução para Windows
const sizes = [256, 128, 64, 48, 32, 16];
const ico = await pngToIco(sizes.map((s) => renderSquare(s)));
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
console.log(`✓ build/icon.ico  (${sizes.join(', ')})`);

console.log('\nÍcones gerados a partir de build/icone-voltz-ide.png');
