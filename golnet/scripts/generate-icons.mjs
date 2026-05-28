import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <!-- Vibrant green → blue diagonal gradient -->
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d86e"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <!-- Top-left shine for glass/depth effect -->
    <radialGradient id="shine" cx="28%" cy="22%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <!-- Bottom shadow for depth -->
    <radialGradient id="shadow" cx="70%" cy="80%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Gradient background -->
  <rect width="512" height="512" rx="88" fill="url(#bg)"/>

  <!-- Glass shine overlay -->
  <rect width="512" height="512" rx="88" fill="url(#shine)"/>

  <!-- Depth shadow overlay -->
  <rect width="512" height="512" rx="88" fill="url(#shadow)"/>

  <!-- Subtle circle rings (stadium / target feel) -->
  <circle cx="256" cy="256" r="210" fill="none" stroke="white" stroke-width="2.5" opacity="0.12"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="white" stroke-width="1.5" opacity="0.08"/>

  <!-- Bold white P -->
  <text x="256" y="370"
    font-family="'Liberation Sans', 'Arial Black', Arial, sans-serif"
    font-size="310"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    opacity="1">P</text>

  <!-- Small dot accent (ball / prediction dot) -->
  <circle cx="370" cy="148" r="22" fill="white" opacity="0.35"/>
  <circle cx="370" cy="148" r="14" fill="white" opacity="0.55"/>
</svg>`;

// Maskable — same but full bleed (no rounded corners)
const maskableSvg = iconSvg
  .replace(/rx="88"/g, 'rx="0"');

for (const size of sizes) {
  await sharp(Buffer.from(iconSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);

  await sharp(Buffer.from(maskableSvg)).resize(size, size).png()
    .toFile(path.join(publicDir, `icon-${size}-maskable.png`));
  console.log(`✓ icon-${size}-maskable.png`);
}

console.log("\nTodos os ícones gerados!");
