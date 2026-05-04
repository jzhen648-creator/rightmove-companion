// Converts public/icons/icon.svg into PNG files at every size Chrome needs.
// Run with: npm run icons
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const svgPath = join(rootDir, "public", "icons", "icon.svg");
const outputDir = join(rootDir, "public", "icons");
const svg = readFileSync(svgPath, "utf8");

const sizes = [16, 32, 48, 128];

mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  const outputPath = join(outputDir, `icon${size}.png`);
  writeFileSync(outputPath, png);
  console.log(`  ✓ icon${size}.png`);
}

console.log("\nIcons written to public/icons/");
