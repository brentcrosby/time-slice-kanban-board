import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

for (const [source, output, size] of [
  ["favicon.svg", "favicon-32.png", 32],
  ["app-icon.svg", "apple-touch-icon.png", 180],
  ["app-icon.svg", "icon-192.png", 192],
  ["app-icon.svg", "icon-512.png", 512],
]) {
  const svg = readFileSync(join(publicDir, source));
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(join(publicDir, output), png);
}
