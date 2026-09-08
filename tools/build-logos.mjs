/* Regenerates team-logos.js from the artwork in logos/.

   Run after adding or replacing a logo:
     node tools/build-logos.mjs

   Files are named for the owner id they belong to, because a manager keeps
   their logo when the team name changes. A vector one (.svg) is preferred and
   is what most of these are; a raster (.png, .jpg, .webp) is taken when that is
   the artwork that exists, which for a detailed crest it sometimes is.

   Either way it goes into team-logos.js as a data URI. That is not for tidiness:
   the trophy room paints these onto canvases and hands the result to WebGL, and
   an <img> pointing at an external file taints the canvas under file://, which
   throws on upload and takes the whole hall black with it. */

import fs from "node:fs";
import path from "node:path";

const OWNERS = [
  "ted_williams", "charlie_vonderheid", "niko_nadreau", "jp_torack", "ian_farroll",
  "matt_windler", "nathan_rich", "matthew_kluba", "grant_thornberry", "jared_thornberry"
];

/* In preference order. Vector first: it is a fraction of the bytes and stays
   sharp on the 512-pixel canvases the 3D crests are painted at. */
const KINDS = [
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
];

/* team-logos.js is loaded by every page on the site, so one logo is not allowed
   to dwarf the other nine. A crest is drawn at 24 pixels in a table and 512 on a
   canvas, so anything beyond about half a megabyte of source is resolution
   nobody will ever see. */
const WARN_AT = 120 * 1024;
const STOP_AT = 512 * 1024;

const root = path.resolve(import.meta.dirname, "..");

const find = (owner) => {
  for (const [extension, type] of KINDS) {
    const file = path.join(root, "logos", `${owner}${extension}`);
    if (fs.existsSync(file)) return { file, type, extension };
  }
  throw new Error(`missing logo for ${owner}: logos/${owner}.{${KINDS.map(([e]) => e.slice(1)).join(",")}}`);
};

const entries = OWNERS.map((owner) => {
  const { file, type, extension } = find(owner);
  const bytes = fs.readFileSync(file);

  // A vector logo that has a bitmap pasted inside it is a raster wearing a
  // vector's extension: it costs the bytes of one and the sharpness of neither.
  if (extension === ".svg" && bytes.includes("data:image")) {
    throw new Error(`${owner}.svg embeds a raster image; save it as ${owner}.png instead`);
  }
  if (bytes.length > STOP_AT) {
    throw new Error(
      `${path.basename(file)} is ${(bytes.length / 1024).toFixed(0)}KB, over the ${STOP_AT / 1024}KB ceiling — ` +
      "resize it to about 512×512 and try again"
    );
  }
  if (bytes.length > WARN_AT) {
    console.warn(`  ${path.basename(file)} is ${(bytes.length / 1024).toFixed(0)}KB; 512×512 would do`);
  }

  return `  ${owner}: "data:${type};base64,${bytes.toString("base64")}"`;
});

const header = fs.readFileSync(path.join(root, "team-logos.js"), "utf8").split("const TEAM_LOGOS")[0];
fs.writeFileSync(
  path.join(root, "team-logos.js"),
  `${header}const TEAM_LOGOS = {\n${entries.join(",\n")}\n};\n\nwindow.TEAM_LOGOS = TEAM_LOGOS;\n`
);
console.log(`team-logos.js rebuilt from ${entries.length} logos`);
