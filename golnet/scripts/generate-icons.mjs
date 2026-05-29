import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="pitch" x1="0" y1="0" x2="0.1" y2="1">
      <stop offset="0%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#14532d"/>
    </linearGradient>
    <radialGradient id="ballGrad" cx="36%" cy="32%" r="68%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#d1d5db"/>
    </radialGradient>
    <clipPath id="bgClip">
      <rect width="512" height="512" rx="88"/>
    </clipPath>
  </defs>

  <!-- Green pitch background -->
  <rect width="512" height="512" rx="88" fill="url(#pitch)"/>

  <!-- Subtle pitch stripes -->
  <g clip-path="url(#bgClip)" opacity="0.07">
    <rect x="0"   y="0" width="73" height="512" fill="white"/>
    <rect x="146" y="0" width="73" height="512" fill="white"/>
    <rect x="292" y="0" width="73" height="512" fill="white"/>
    <rect x="438" y="0" width="73" height="512" fill="white"/>
  </g>

  <!-- Halfway line -->
  <line x1="36" y1="256" x2="476" y2="256"
    stroke="white" stroke-width="5" opacity="0.55" clip-path="url(#bgClip)"/>

  <!-- Center circle -->
  <circle cx="256" cy="256" r="130"
    fill="none" stroke="white" stroke-width="5" opacity="0.7"/>

  <!-- Center spot -->
  <circle cx="256" cy="256" r="7" fill="white" opacity="0.7"/>

  <!-- Bold P centered -->
  <text x="256" y="322"
    font-family="'Liberation Sans', Arial, Helvetica, sans-serif"
    font-size="200"
    font-weight="900"
    fill="white"
    text-anchor="middle">P</text>

  <!-- Soccer ball (bottom-right corner) -->
  <circle cx="408" cy="400" r="54" fill="url(#ballGrad)"/>
  <!-- Ball patches -->
  <g fill="#1f2937" opacity="0.85">
    <!-- Top pentagon -->
    <path d="M408,352 L422,362 L418,378 L398,378 L394,362 Z"/>
    <!-- Top-right patch -->
    <path d="M422,362 L437,357 L445,371 L436,382 L420,380 L418,378 Z"/>
    <!-- Top-left patch -->
    <path d="M394,362 L398,378 L382,380 L373,371 L381,357 Z"/>
    <!-- Bottom-right patch -->
    <path d="M436,384 L445,397 L436,408 L420,406 L416,392 L428,384 Z"/>
    <!-- Bottom-left patch -->
    <path d="M376,384 L384,392 L380,406 L364,408 L355,397 L364,384 Z"/>
    <!-- Bottom patch -->
    <path d="M416,392 L418,408 L408,414 L398,408 L400,392 Z"/>
  </g>
  <!-- Ball shine -->
  <ellipse cx="395" cy="378" rx="14" ry="9"
    fill="white" opacity="0.35" transform="rotate(-25 395 378)"/>
</svg>`;

const maskableSvg = iconSvg.replace('rx="88"', 'rx="0"');

for (const size of sizes) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);

  await sharp(Buffer.from(maskableSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}-maskable.png`));
  console.log(`✓ icon-${size}-maskable.png`);
}

console.log("\nTodos os ícones gerados!");
