import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Shield / crest style — navy + gold
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="navyGrad" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#0c1a4e"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
  </defs>

  <!-- Dark rounded background -->
  <rect width="512" height="512" rx="76" fill="#060b1a"/>

  <!-- Shield shadow -->
  <path d="M256,478 Q50,365 50,206 L50,76 Q150,36 256,36 Q362,36 462,76 L462,206 Q462,365 256,478Z"
    fill="#f59e0b" opacity="0.15"/>

  <!-- Shield body -->
  <path d="M256,468 Q60,358 60,200 L60,86 Q155,50 256,50 Q357,50 452,86 L452,200 Q452,358 256,468Z"
    fill="url(#navyGrad)"/>

  <!-- Gold outer border -->
  <path d="M256,468 Q60,358 60,200 L60,86 Q155,50 256,50 Q357,50 452,86 L452,200 Q452,358 256,468Z"
    fill="none" stroke="url(#goldGrad)" stroke-width="10"/>

  <!-- Gold top band -->
  <clipPath id="shieldClip">
    <path d="M256,468 Q60,358 60,200 L60,86 Q155,50 256,50 Q357,50 452,86 L452,200 Q452,358 256,468Z"/>
  </clipPath>
  <rect x="0" y="50" width="512" height="85" fill="#f59e0b" opacity="0.18" clip-path="url(#shieldClip)"/>
  <line x1="60" y1="135" x2="452" y2="135" stroke="#f59e0b" stroke-width="6" opacity="0.85"/>

  <!-- Text in gold band -->
  <text x="256" y="112"
    font-family="Arial, Helvetica, sans-serif"
    font-size="40"
    font-weight="700"
    fill="#fde68a"
    text-anchor="middle"
    letter-spacing="6">PALPITAÍ</text>

  <!-- Bold white P -->
  <text x="256" y="355"
    font-family="'Liberation Sans', Arial, Helvetica, sans-serif"
    font-size="250"
    font-weight="900"
    fill="white"
    text-anchor="middle">P</text>

  <!-- Two gold stars at the bottom -->
  <text x="200" y="450" font-size="40" text-anchor="middle" fill="#f59e0b">★</text>
  <text x="256" y="460" font-size="48" text-anchor="middle" fill="#f59e0b">★</text>
  <text x="312" y="450" font-size="40" text-anchor="middle" fill="#f59e0b">★</text>
</svg>`;

// Maskable — full bleed version
const maskableSvg = iconSvg.replace('rx="76" fill="#060b1a"', 'rx="0" fill="#060b1a"');

for (const size of sizes) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);

  await sharp(Buffer.from(maskableSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}-maskable.png`));
  console.log(`✓ icon-${size}-maskable.png`);
}

console.log("\nTodos os ícones gerados!");
