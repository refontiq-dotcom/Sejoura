import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const LOGO = "public/logo.png";
const OUT_DIR = "public/icons";

const BG = { r: 254, g: 253, b: 253 };
const NAVY = { r: 12, g: 28, b: 51 };

await mkdir(OUT_DIR, { recursive: true });

const logoSizes = async (logo, width, height) =>
  logo.resize({ width, height, fit: "inside", withoutEnlargement: true });

async function squareWithLogo(size, scale, bg, flatten = true) {
  const logo = sharp(LOGO);
  const meta = await logo.metadata();
  const aspect = meta.width / meta.height;
  let w = Math.round(size * scale);
  let h = Math.round(w / aspect);
  if (h > size * scale) {
    h = Math.round(size * scale);
    w = Math.round(h * aspect);
  }
  const resized = await logo.resize({ width: w, height: h }).png().toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: bg.r, g: bg.g, b: bg.b },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((size - w) / 2),
        top: Math.round((size - h) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const icon192 = await squareWithLogo(192, 0.8, BG);
const icon512 = await squareWithLogo(512, 0.8, BG);
const maskable = await squareWithLogo(512, 0.6, NAVY);
const apple = await squareWithLogo(180, 0.8, BG);

for (const [name, buf] of [
  ["icon-192x192.png", icon192],
  ["icon-512x512.png", icon512],
  ["icon-maskable-512x512.png", maskable],
  ["apple-touch-icon.png", apple],
]) {
  await sharp(buf)
    .flatten({ background: "#FFFFFF" })
    .toFile(`${OUT_DIR}/${name}`);
}

console.log("Icônes PWA générées dans", OUT_DIR);
