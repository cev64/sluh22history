/* Regenerates team-logos.js from the SVGs in logos/.

   Run after adding or replacing a logo:
     node tools/build-logos.mjs

   Files are named for the owner id they belong to, because a manager keeps
   their logo when the team name changes. */

import fs from "node:fs";
import path from "node:path";

const OWNERS = [
  "ted_williams", "charlie_vonderheid", "niko_nadreau", "jp_torack", "ian_farroll",
  "matt_windler", "nathan_rich", "matthew_kluba", "grant_thornberry", "jared_thornberry"
];

const root = path.resolve(import.meta.dirname, "..");
const entries = OWNERS.map((owner) => {
  const file = path.join(root, "logos", `${owner}.svg`);
  if (!fs.existsSync(file)) throw new Error(`missing logo for ${owner}: ${file}`);
  const svg = fs.readFileSync(file);
  if (svg.includes("data:image")) {
    throw new Error(`${owner}.svg embeds a raster image; it should be pure vector`);
  }
  return `  ${owner}: "data:image/svg+xml;base64,${svg.toString("base64")}"`;
});

const header = fs.readFileSync(path.join(root, "team-logos.js"), "utf8").split("const TEAM_LOGOS")[0];
fs.writeFileSync(
  path.join(root, "team-logos.js"),
  `${header}const TEAM_LOGOS = {\n${entries.join(",\n")}\n};\n\nwindow.TEAM_LOGOS = TEAM_LOGOS;\n`
);
console.log(`team-logos.js rebuilt from ${entries.length} logos`);
