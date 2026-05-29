import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0d0d20"/>
      <stop offset="100%" stop-color="#05050a"/>
    </radialGradient>
    <radialGradient id="orb" cx="34%" cy="28%" r="72%">
      <stop offset="0%"   stop-color="#c084fc"/>
      <stop offset="40%"  stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="orbClip">
      <circle cx="256" cy="248" r="188"/>
    </clipPath>
  </defs>

  <!-- Dark background -->
  <rect width="512" height="512" rx="88" fill="url(#bg)"/>

  <!-- Outer glow -->
  <circle cx="256" cy="248" r="220" fill="url(#glow)"/>

  <!-- Main orb -->
  <circle cx="256" cy="248" r="188" fill="url(#orb)"/>

  <!-- Subtle soccer ball arcs clipped to orb -->
  <g clip-path="url(#orbClip)" fill="none" stroke="#1e1b4b" stroke-width="16" stroke-linecap="round" opacity="0.22">
    <path d="M148,88  Q258,175 375,118"/>
    <path d="M72,282  Q195,228 252,435"/>
    <path d="M388,298 Q298,222 252,435"/>
  </g>

  <!-- Shine highlight (top-left of orb) -->
  <ellipse cx="188" cy="165" rx="82" ry="52"
    fill="white" opacity="0.18"
    transform="rotate(-28 188 165)"
    clip-path="url(#orbClip)"/>

  <!-- Bold white P -->
  <text x="256" y="328"
    font-family="'Liberation Sans', Arial, Helvetica, sans-serif"
    font-size="238"
    font-weight="900"
    fill="white"
    text-anchor="middle">P</text>

  <!-- Large sparkle top-right -->
  <path d="M392,122 L398,142 L418,148 L398,154 L392,174 L386,154 L366,148 L386,142 Z"
    fill="white" opacity="0.92"/>

  <!-- Small sparkle bottom-left -->
  <path d="M142,340 L145,350 L155,353 L145,356 L142,366 L139,356 L129,353 L139,350 Z"
    fill="white" opacity="0.55"/>

  <!-- Tiny sparkle top-left area -->
  <path d="M168,112 L170,119 L177,121 L170,123 L168,130 L166,123 L159,121 L166,119 Z"
    fill="white" opacity="0.45"/>
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
