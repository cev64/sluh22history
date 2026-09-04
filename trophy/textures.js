/* Everything in the hall is drawn at runtime. Marble, walnut, brushed brass and
   the engraved nameplates are all painted onto 2D canvases and handed to
   three.js as textures, which keeps the whole room to one 340KB library and
   nothing else to download.

   The one exception is the team logos, which are real artwork rather than
   something a canvas can invent. They arrive as data URIs (see team-logos.js)
   and get painted into these same canvases. */

import * as THREE from "three";

const DISPLAY_FONT = '"Space Grotesk", Inter, system-ui, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/* Team logos, decoded up front. Every texture here is painted synchronously, so
   an image has to be ready before a single canvas is drawn — a logo that is
   still loading would silently paint nothing and bake an empty crest into a
   texture that is never regenerated. `loadTeamLogos` is awaited before the hall
   is built; anything missing falls back to the owner's emoji. */
const logos = new Map();

export function loadTeamLogos(sources) {
  const table = sources || (typeof window !== "undefined" && window.TEAM_LOGOS) || {};
  return Promise.all(Object.entries(table).map(([ownerId, src]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { logos.set(ownerId, image); resolve(); };
    image.onerror = () => resolve();
    image.src = src;
  })));
}

export function teamLogo(ownerId) {
  return (ownerId && logos.get(ownerId)) || null;
}

/* Draws a logo to fit a box, centred, keeping its aspect. The files are not all
   square — they come in at 72×72, 73×72 and 64.8×64.8 — so nothing may assume
   one, and an SVG sized only by its viewBox reports that size here. */
function drawLogo(ctx, image, cx, cy, box) {
  const w = image.naturalWidth || image.width || 1;
  const h = image.naturalHeight || image.height || 1;
  const scale = box / Math.max(w, h);
  ctx.drawImage(image, cx - (w * scale) / 2, cy - (h * scale) / 2, w * scale, h * scale);
}

let anisotropy = 4;

export function setAnisotropy(value) {
  anisotropy = value;
}

function canvas(width, height) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return { element, ctx: element.getContext("2d") };
}

function finish(element, { repeat, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(element);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/* Fits a line to a width by stepping the size down rather than clipping, so a
   long team name still reads on a nameplate cut for a short one.

   The letter spacing has to be set here, not after: it is part of the measured
   width, and `ctx.letterSpacing` persists between draws — measuring at one
   spacing and drawing at a wider one is how a long manager's name ended up
   running off the end of their own flag. */
function fitText(ctx, text, maxWidth, startSize, weight = 800, font = DISPLAY_FONT, spacing = "0px") {
  ctx.letterSpacing = spacing;
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  } while (size > 8);
  return size;
}

/* Cut into metal: a bright lip below the stroke and a dark fill above it reads
   as an incision under the hall's overhead light. */
const PLATE_INK = {
  brass: { ink: "#2a2013", lip: "rgba(255,244,214,.6)" },
  pewter: { ink: "#1d2228", lip: "rgba(240,246,251,.6)" }
};

function engrave(ctx, text, x, y, { size, weight = 800, align = "center", ink = "#2a2013", lip = "rgba(255,244,214,.6)", font = DISPLAY_FONT, letterSpacing = "0px" }) {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.letterSpacing = letterSpacing;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = lip;
  ctx.fillText(text, x, y + Math.max(1.5, size * 0.045));
  ctx.fillStyle = ink;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function noise(ctx, width, height, amount, alpha) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * amount;
    data[i] += grain;
    data[i + 1] += grain;
    data[i + 2] += grain;
    data[i + 3] = Math.min(255, data[i + 3] * alpha + 255 * (1 - alpha));
  }
  ctx.putImageData(image, 0, 0);
}

export function marbleTexture({ base = "#141d2c", vein = "#33455f", glow = "#1d2a3e", size = 512, veins = 26 } = {}) {
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Broad tonal drifts first, then the fine veining on top.
  for (let i = 0; i < 12; i += 1) {
    const gradient = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 0,
      Math.random() * size, Math.random() * size, size * (0.2 + Math.random() * 0.4)
    );
    gradient.addColorStop(0, glow);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < veins; i += 1) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = -20;
    ctx.moveTo(x, y);
    while (y < size + 20) {
      x += (Math.random() - 0.5) * size * 0.22;
      y += size * (0.05 + Math.random() * 0.09);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = vein;
    ctx.globalAlpha = 0.08 + Math.random() * 0.18;
    ctx.lineWidth = 0.6 + Math.random() * 2.4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noise(ctx, size, size, 14, 1);
  return element;
}

export function woodTexture({ base = "#2b1c12", grain = "#160d07", highlight = "#4a3320", size = 512 } = {}) {
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 190; i += 1) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    for (let x = -10; x < size + 10; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3 + (Math.random() - 0.5) * 2);
    }
    ctx.strokeStyle = Math.random() > 0.72 ? highlight : grain;
    ctx.globalAlpha = 0.06 + Math.random() * 0.16;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noise(ctx, size, size, 10, 1);
  return element;
}

/* Brushed metal: a vertical gradient scratched horizontally, the ground under
   every engraved plate in the hall. Brass for the marks worth having; a cold
   tarnished pewter for the ones on the lowlight wall. */
const PLATE_METAL = {
  brass: {
    stops: ["#e8cd8f", "#c9a55f", "#e2c384", "#b48f4c", "#d8b871"],
    scratch: ["#fff3d2", "#7d5f2a"]
  },
  pewter: {
    stops: ["#a5acb5", "#767e88", "#959da6", "#5e666f", "#888f98"],
    scratch: ["#dfe4ea", "#3c434a"]
  }
};

function brushedMetal(ctx, width, height, kind = "brass") {
  const metal = PLATE_METAL[kind] || PLATE_METAL.brass;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  [0, 0.22, 0.5, 0.78, 1].forEach((offset, index) => {
    gradient.addColorStop(offset, metal.stops[index]);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < height * 1.5; i += 1) {
    const y = Math.random() * height;
    ctx.globalAlpha = 0.02 + Math.random() * 0.05;
    ctx.strokeStyle = Math.random() > 0.5 ? metal.scratch[0] : metal.scratch[1];
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + (Math.random() - 0.5) * 2);
    ctx.lineWidth = 0.6 + Math.random();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function plateFrame(ctx, width, height, accent) {
  ctx.save();
  ctx.strokeStyle = "rgba(66,46,16,.55)";
  ctx.lineWidth = Math.max(2, height * 0.018);
  ctx.strokeRect(width * 0.035, height * 0.09, width * 0.93, height * 0.82);
  ctx.strokeStyle = accent ? `${accent}` : "rgba(255,240,200,.5)";
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, height * 0.008);
  ctx.strokeRect(width * 0.05, height * 0.12, width * 0.9, height * 0.76);
  ctx.restore();
}

/* The small engraved plate on the front of a plinth. */
export function nameplateTexture({ title, sub, accent, metal = "brass" }) {
  const width = 1024;
  const height = 256;
  const { element, ctx } = canvas(width, height);
  const tone = PLATE_INK[metal] || PLATE_INK.brass;
  brushedMetal(ctx, width, height, metal);
  plateFrame(ctx, width, height, accent);

  const titleSize = fitText(ctx, title, width * 0.8, sub ? 86 : 104, 800, DISPLAY_FONT, "2px");
  engrave(ctx, title, width / 2, sub ? height * 0.4 : height * 0.5, {
    size: titleSize, letterSpacing: "2px", ...tone
  });

  if (sub) {
    const subSize = fitText(ctx, sub, width * 0.78, 46, 600, DISPLAY_FONT, "6px");
    engrave(ctx, sub.toUpperCase(), width / 2, height * 0.68, {
      size: subSize,
      weight: 600,
      ink: metal === "pewter" ? "rgba(40,48,56,.9)" : "rgba(52,38,14,.9)",
      lip: tone.lip,
      letterSpacing: "6px"
    });
  }
  return finish(element);
}

/* A team crest: the emoji the league already uses for that manager, set in a
   coloured roundel with a brass rim. This is the closest thing the league has
   to a logo, so the hall treats it as one. */
export function crestTexture({ icon, color, label, ownerId, size = 512 }) {
  const { element, ctx } = canvas(size, size);
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);

  /* With a real logo the crest is left bare: no coloured field, no rays, no
     painted ring. The canvas stays transparent around the mark so the gold (or
     pewter) of the medallion itself shows through and the logo reads as struck
     into the metal rather than printed on a badge. */
  const logo = teamLogo(ownerId);
  if (logo) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = size * 0.035;
    ctx.shadowOffsetY = size * 0.012;
    drawLogo(ctx, logo, half, half * (label ? 0.9 : 1), size * (label ? 0.6 : 0.74));
    ctx.restore();
    if (label) crestLabel(ctx, label, size);
    return finish(element);
  }

  const field = ctx.createRadialGradient(half, half * 0.75, size * 0.05, half, half, half);
  field.addColorStop(0, mix(color, "#ffffff", 0.14));
  field.addColorStop(0.55, color);
  field.addColorStop(1, mix(color, "#000000", 0.55));
  ctx.beginPath();
  ctx.arc(half, half, half * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = field;
  ctx.fill();

  // Rays, so the crest catches the eye as it turns under the lights.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.translate(half, half);
  for (let i = 0; i < 24; i += 1) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, half * 0.95, 0, Math.PI / 24);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    ctx.fill();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(half, half, half * 0.9, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(236,206,150,.75)";
  ctx.lineWidth = size * 0.035;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(half, half, half * 0.79, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(20,14,6,.35)";
  ctx.lineWidth = size * 0.012;
  ctx.stroke();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size * 0.56}px ${EMOJI_FONT}`;
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = size * 0.04;
  ctx.shadowOffsetY = size * 0.012;
  ctx.fillText(icon || "🏈", half, half * (label ? 0.92 : 1));
  ctx.restore();

  if (label) crestLabel(ctx, label, size);

  return finish(element);
}

function crestLabel(ctx, label, size) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelSize = fitText(ctx, label.toUpperCase(), size * 0.68, size * 0.075, 800, DISPLAY_FONT, "3px");
  ctx.font = `800 ${labelSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "3px";
  ctx.fillStyle = "rgba(0,0,0,.4)";
  ctx.fillText(label.toUpperCase(), size / 2, size * 0.795 + 2);
  ctx.fillStyle = "rgba(255,246,226,.95)";
  ctx.fillText(label.toUpperCase(), size / 2, size * 0.795);
  ctx.restore();
}

/* The face of a record plaque: the number first, then what it is and who owns it. */
export function recordFaceTexture({ value, label, holder, meta, accent, metal = "brass" }) {
  const width = 1024;
  const height = 768;
  const { element, ctx } = canvas(width, height);
  const tone = PLATE_INK[metal] || PLATE_INK.brass;
  brushedMetal(ctx, width, height, metal);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  plateFrame(ctx, width, height, accent);

  engrave(ctx, label.toUpperCase(), width / 2, height * 0.235, {
    size: fitText(ctx, label.toUpperCase(), width * 0.8, 56, 700, DISPLAY_FONT, "8px"),
    weight: 700,
    ink: metal === "pewter" ? "rgba(34,42,50,.92)" : "rgba(58,42,16,.92)",
    lip: tone.lip,
    letterSpacing: "8px"
  });

  ctx.save();
  ctx.strokeStyle = metal === "pewter" ? "rgba(48,56,64,.4)" : "rgba(70,50,18,.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.33, height * 0.295);
  ctx.lineTo(width * 0.67, height * 0.295);
  ctx.stroke();
  ctx.restore();

  engrave(ctx, value, width / 2, height * 0.47, {
    size: fitText(ctx, value, width * 0.82, 210, 800, DISPLAY_FONT, "-2px"),
    weight: 800,
    letterSpacing: "-2px",
    ...tone
  });

  engrave(ctx, holder, width / 2, height * 0.665, {
    size: fitText(ctx, holder, width * 0.85, 64, 700),
    weight: 700,
    ink: metal === "pewter" ? "rgba(28,36,44,.95)" : "rgba(48,34,12,.95)",
    lip: tone.lip
  });

  if (meta) {
    engrave(ctx, meta, width / 2, height * 0.775, {
      size: fitText(ctx, meta, width * 0.85, 42, 500, DISPLAY_FONT, "3px"),
      weight: 500,
      ink: metal === "pewter" ? "rgba(44,52,60,.8)" : "rgba(64,48,20,.8)",
      lip: tone.lip,
      letterSpacing: "3px"
    });
  }

  return finish(element);
}

/* The two printed inserts on the league trophy itself.

   The real trophy ships with sample artwork in both — a placeholder design on
   the plaque between its columns and a "custom text" strip across the base.
   These fill them in: the champion's crest on the plaque, the year on the base. */
export function teamPlaqueTexture({ icon, color, label, ownerId }) {
  const logo = teamLogo(ownerId);
  const width = 512;
  const height = 720;
  const { element, ctx } = canvas(width, height);

  const ground = ctx.createLinearGradient(0, 0, 0, height);
  ground.addColorStop(0, "#16233a");
  ground.addColorStop(0.5, mix(color, "#101a2c", 0.35));
  ground.addColorStop(1, "#111c30");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);

  /* A wash of the team's colour behind the mark, so the insert reads as theirs
     from across the hall. Kept faint under a logo, which carries its own
     colour and only needs separating from the plaque's dark ground. */
  const halo = ctx.createRadialGradient(width / 2, height * 0.42, 10, width / 2, height * 0.42, width * 0.62);
  halo.addColorStop(0, mix(color, "#ffffff", 0.3));
  halo.addColorStop(0.45, color);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = logo ? 0.3 : 0.85;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = mix(color, "#ffffff", 0.55);
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, width - 64, height - 64);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = width * 0.05;
  ctx.shadowOffsetY = width * 0.014;
  if (logo) {
    drawLogo(ctx, logo, width / 2, height * 0.41, width * 0.66);
  } else {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${width * 0.56}px ${EMOJI_FONT}`;
    ctx.fillText(icon || "🏈", width / 2, height * 0.41);
  }
  ctx.restore();

  if (label) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = fitText(ctx, label.toUpperCase(), width * 0.82, 58, 700, DISPLAY_FONT, "3px");
    ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
    ctx.letterSpacing = "3px";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillText(label.toUpperCase(), width / 2, height * 0.755 + 3);
    ctx.fillStyle = "rgba(255,250,240,.97)";
    ctx.fillText(label.toUpperCase(), width / 2, height * 0.755);
    ctx.restore();
  }

  return finish(element);
}

export function yearPlateTexture({ year, color }) {
  const width = 1024;
  const height = 460;
  const { element, ctx } = canvas(width, height);

  const ground = ctx.createLinearGradient(0, 0, 0, height);
  ground.addColorStop(0, "#0b1421");
  ground.addColorStop(0.5, "#060c15");
  ground.addColorStop(1, "#0a1220");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * 0.55);
  wash.addColorStop(0, color);
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = mix(color, "#ffffff", 0.5);
  ctx.lineWidth = 7;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "rgba(255,255,255,.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, width - 72, height - 72);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = fitText(ctx, String(year), width * 0.72, 250, 700, DISPLAY_FONT, "16px");
  ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "16px";
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillText(String(year), width / 2 + 4, height / 2 + 5);
  const ink = ctx.createLinearGradient(0, height * 0.28, 0, height * 0.72);
  ink.addColorStop(0, "#ffffff");
  ink.addColorStop(0.5, mix(color, "#ffffff", 0.75));
  ink.addColorStop(1, mix(color, "#ffffff", 0.35));
  ctx.fillStyle = ink;
  ctx.fillText(String(year), width / 2, height / 2);
  ctx.restore();

  return finish(element);
}

/* ------------------------------------------------ the team locker's cloth */

/* A team's flag, hung across the top of their locker wall: crest on the hoist,
   name and manager on the fly, the way a club banner is laid out. */
export function teamFlagTexture({ icon, color, team, owner, since, ownerId }) {
  const logo = teamLogo(ownerId);
  const width = 1200;
  const height = 636;
  const { element, ctx } = canvas(width, height);

  const field = ctx.createLinearGradient(0, 0, width, height);
  field.addColorStop(0, mix(color, "#ffffff", 0.16));
  field.addColorStop(0.45, color);
  field.addColorStop(1, mix(color, "#05080e", 0.55));
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, width, height);

  // A pale band behind the lettering so a dark team colour still reads.
  const panel = ctx.createLinearGradient(width * 0.3, 0, width, 0);
  panel.addColorStop(0, "rgba(0,0,0,0)");
  panel.addColorStop(0.35, "rgba(4,8,14,.55)");
  panel.addColorStop(1, "rgba(4,8,14,.66)");
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,240,205,.75)";
  ctx.lineWidth = 9;
  ctx.strokeRect(24, 24, width - 48, height - 48);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 3;
  ctx.strokeRect(44, 44, width - 88, height - 88);
  ctx.globalAlpha = 1;

  // The mark on the hoist. A logo flies bare on the field; an emoji needs the
  // roundel behind it to read at all.
  const cx = width * 0.195;
  const cy = height * 0.5;
  const r = height * 0.285;
  if (!logo) {
    const roundel = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
    roundel.addColorStop(0, mix(color, "#ffffff", 0.3));
    roundel.addColorStop(1, mix(color, "#000000", 0.45));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = roundel;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,238,190,.9)";
    ctx.lineWidth = 10;
    ctx.stroke();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 18;
  if (logo) {
    drawLogo(ctx, logo, cx, cy, r * 2.3);
  } else {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${r * 1.05}px ${EMOJI_FONT}`;
    ctx.fillText(icon || "🏈", cx, cy);
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const left = width * 0.395;
  const room = width - left - 96;

  const nameSize = fitText(ctx, team.toUpperCase(), room, 104, 700, DISPLAY_FONT, "2px");
  ctx.font = `700 ${nameSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "2px";
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillText(team.toUpperCase(), left + 3, height * 0.42 + 4);
  ctx.fillStyle = "rgba(255,250,240,.98)";
  ctx.fillText(team.toUpperCase(), left, height * 0.42);

  const ownerSize = fitText(ctx, owner.toUpperCase(), room, 54, 600, DISPLAY_FONT, "6px");
  ctx.font = `600 ${ownerSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "6px";
  ctx.fillStyle = mix(color, "#ffffff", 0.72);
  ctx.fillText(owner.toUpperCase(), left, height * 0.585);

  if (since) {
    ctx.font = `600 ${30}px ${DISPLAY_FONT}`;
    ctx.letterSpacing = "10px";
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillText(`EST. ${since}`, left, height * 0.71);
  }
  ctx.restore();

  return finish(element);
}

/* One pennant per playoff berth. Drawn with its own silhouette so the mesh can
   stay a single quad — the corners outside the triangle are transparent. */
export function pennantTexture({ year, color, note = "PLAYOFFS", crown = false }) {
  const width = 320;
  const height = 720;
  const { element, ctx } = canvas(width, height);
  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.lineTo(width - 14, 12);
  ctx.lineTo(width / 2, height - 10);
  ctx.closePath();
  ctx.clip();

  const cloth = ctx.createLinearGradient(0, 0, 0, height);
  cloth.addColorStop(0, mix(color, "#ffffff", 0.08));
  cloth.addColorStop(0.45, color);
  cloth.addColorStop(1, mix(color, "#05080e", 0.32));
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, width, height);

  // The stitched band across the hoist. A division pennant wears gold braid.
  ctx.fillStyle = crown ? "rgba(255,214,120,.98)" : "rgba(255,246,226,.95)";
  ctx.fillRect(0, 18, width, crown ? 16 : 12);
  ctx.fillRect(0, 150, width, crown ? 12 : 8);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const yearSize = fitText(ctx, String(year), width * 0.74, 92, 700, DISPLAY_FONT, "4px");
  ctx.font = `700 ${yearSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillText(String(year), width / 2 + 3, 96 + 3);
  ctx.fillStyle = "rgba(255,250,240,.98)";
  ctx.fillText(String(year), width / 2, 96);

  const noteSize = fitText(ctx, note, width * 0.66, 40, 600, DISPLAY_FONT, "5px");
  ctx.font = `600 ${noteSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "5px";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(note, width / 2, 200);
  ctx.restore();

  // A row of stars down the taper, so the point is not dead cloth.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 3; i += 1) {
    const y = 300 + i * 96;
    const size = 26 - i * 6;
    ctx.beginPath();
    for (let p = 0; p < 10; p += 1) {
      const radius = p % 2 ? size * 0.44 : size;
      const angle = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const px = width / 2 + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  return finish(element);
}

/* The hanging banner that names a wing. Cloth, not metal. */
export function bannerTexture({ name, kicker, accent }) {
  const width = 1024;
  const height = 368;
  const { element, ctx } = canvas(width, height);

  const cloth = ctx.createLinearGradient(0, 0, width, height);
  cloth.addColorStop(0, "#101c2e");
  cloth.addColorStop(0.5, "#16273e");
  cloth.addColorStop(1, "#0b1420");
  ctx.fillStyle = cloth;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const kickerSize = fitText(ctx, kicker.toUpperCase(), width * 0.7, 32, 600, DISPLAY_FONT, "14px");
  ctx.font = `600 ${kickerSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "14px";
  ctx.fillStyle = accent;
  ctx.fillText(kicker.toUpperCase(), width / 2, height * 0.27);

  const nameSize = fitText(ctx, name.toUpperCase(), width * 0.82, 126, 700, DISPLAY_FONT, "12px");
  ctx.font = `700 ${nameSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "12px";
  ctx.fillStyle = "rgba(255,247,230,.97)";
  ctx.fillText(name.toUpperCase(), width / 2, height * 0.6);

  // Folds across the drop, so the cloth is not a flat printed board.
  const fold = ctx.createLinearGradient(0, 0, 0, height);
  fold.addColorStop(0, "rgba(0,0,0,.45)");
  fold.addColorStop(0.28, "rgba(255,255,255,.06)");
  fold.addColorStop(0.7, "rgba(0,0,0,.2)");
  fold.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = fold;
  ctx.fillRect(0, 0, width, height);

  return finish(element);
}

/* Brass lettering set into the floor where one wing gives way to the next. */
export function floorInlayTexture({ name, accent }) {
  const size = 1024;
  const { element, ctx } = canvas(size, size);
  ctx.clearRect(0, 0, size, size);
  const half = size / 2;

  ctx.save();
  ctx.translate(half, half);
  for (const [radius, width, alpha] of [[0.46, 7, 0.7], [0.41, 2, 0.4], [0.3, 3, 0.5]]) {
    ctx.beginPath();
    ctx.arc(0, 0, size * radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#e6c98a";
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameSize = fitText(ctx, name.toUpperCase(), size * 0.5, 96, 800, DISPLAY_FONT, "10px");
  ctx.font = `800 ${nameSize}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "10px";
  ctx.fillStyle = "#f0d69c";
  ctx.globalAlpha = 0.85;
  ctx.fillText(name.toUpperCase(), half, half);
  ctx.globalAlpha = 0.5;
  ctx.font = `600 ${size * 0.032}px ${DISPLAY_FONT}`;
  ctx.letterSpacing = "16px";
  ctx.fillStyle = accent;
  ctx.fillText("· LEAGUE HISTORY ·", half, half + size * 0.09);
  ctx.restore();

  return finish(element);
}

/* One soft blob, reused everywhere something needs to fade out at the edges:
   contact shadows, the pools of light on the floor, dust, and the glints. */
export function radialTexture({ size = 256, stops = [[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]] } = {}) {
  const { element, ctx } = canvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return finish(element, { srgb: false });
}

/* A four-point star, drawn once and reused as the additive sparkle that sits on
   polished gold. Cheaper than a bloom pass and it survives on a phone. */
export function glintTexture({ size = 256 } = {}) {
  const { element, ctx } = canvas(size, size);
  const half = size / 2;
  const core = ctx.createRadialGradient(half, half, 0, half, half, half * 0.28);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.4, "rgba(255,238,196,.75)");
  core.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(half, half);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 2);
    const ray = ctx.createLinearGradient(0, 0, 0, -half);
    ray.addColorStop(0, "rgba(255,247,224,.85)");
    ray.addColorStop(1, "rgba(255,220,150,0)");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(-size * 0.018, 0);
    ctx.lineTo(0, -half);
    ctx.lineTo(size * 0.018, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return finish(element, { srgb: false });
}

/* The hall's reflected world. Nothing renders it directly — it exists so the
   gold has streaks of overhead light to throw back, which is most of what makes
   a trophy look like metal instead of yellow plastic. */
export function environmentTexture(renderer) {
  const width = 1024;
  const height = 512;
  const { element, ctx } = canvas(width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#c2a878");
  sky.addColorStop(0.3, "#5c6478");
  sky.addColorStop(0.48, "#2c3a4f");
  sky.addColorStop(0.62, "#1a2433");
  sky.addColorStop(0.8, "#0d141f");
  sky.addColorStop(1, "#070b12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Ceiling coves: the long bright bands a polished cup smears across itself.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i += 1) {
    const y = height * (0.06 + i * 0.035);
    const glow = ctx.createLinearGradient(0, y - 14, 0, y + 14);
    glow.addColorStop(0, "rgba(255,226,170,0)");
    glow.addColorStop(0.5, `rgba(255,232,186,${0.5 - i * 0.06})`);
    glow.addColorStop(1, "rgba(255,226,170,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, y - 16, width, 32);
  }

  // Wall sconces around the room, spaced so a turning object picks them up
  // one after another.
  for (let i = 0; i < 10; i += 1) {
    const x = (i + 0.5) * (width / 10);
    const y = height * 0.42;
    const lamp = ctx.createRadialGradient(x, y, 0, x, y, width * 0.05);
    lamp.addColorStop(0, "rgba(255,214,146,.85)");
    lamp.addColorStop(0.35, "rgba(255,182,104,.28)");
    lamp.addColorStop(1, "rgba(255,170,90,0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(x - width * 0.05, y - width * 0.05, width * 0.1, width * 0.1);
  }
  ctx.restore();

  // A cool bounce off the floor keeps the shadow side from going flat black.
  const bounce = ctx.createLinearGradient(0, height * 0.7, 0, height);
  bounce.addColorStop(0, "rgba(40,70,110,0)");
  bounce.addColorStop(1, "rgba(46,80,124,.35)");
  ctx.fillStyle = bounce;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);

  const texture = new THREE.CanvasTexture(element);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(texture);
  texture.dispose();
  pmrem.dispose();
  return target.texture;
}

export function mix(colorA, colorB, amount) {
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  return `#${a.lerp(b, amount).getHexString()}`;
}

export async function waitForFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('800 100px "Space Grotesk"'),
      document.fonts.load('600 100px "Space Grotesk"'),
      document.fonts.load('500 100px "Space Grotesk"')
    ]);
    await document.fonts.ready;
  } catch (error) {
    // A missing webfont costs the plates some character, not their legibility.
  }
}

/* ------------------------------------------------------------------ Tucker */

/* The league mascot's coat, taken off two photographs of him sitting in a
   hallway: a border collie, white from the chin down the chest and front legs,
   black over the back and haunches, black over one whole side of the face and
   both ears, with a broad white blaze up the middle. Everything below paints
   that; `tucker.js` builds the dog it wraps. */

export const TUCKER_COAT = {
  white: "#f2ede2",       // the ruff is cream rather than paper white
  whiteShade: "#cfc6b6",
  black: "#0b0c11",       // as dark as the coat material, or the patch goes brown
  blackWarm: "#2e2822",
  nose: "#171417",
  skin: "#d99b93",        // the pink of his muzzle freckles and inner ears
  eye: "#3c2214"
};

/* Fur, painted once and used as the bump and roughness map on every part of
   him. It is grey on purpose: the colour comes from the material, this only
   says where the coat lies flat and where it stands up. */
export function furTexture({ size = 512, strokes = 5200, length = 20 } = {}) {
  const { element, ctx } = canvas(size, size);
  // Near white, not mid grey: this is multiplied into the material's own
  // roughness, and a grey map halves it and turns the coat to satin.
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = "round";
  for (let i = 0; i < strokes; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const run = length * (0.3 + Math.random());
    const lean = (Math.random() - 0.5) * 0.8;
    ctx.strokeStyle = Math.random() > 0.5
      ? `rgba(255,255,255,${0.03 + Math.random() * 0.09})`
      : `rgba(0,0,0,${0.03 + Math.random() * 0.10})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * run * 0.5, y + run * 0.55, x + lean * run, y + run);
    ctx.stroke();
  }
  return finish(element, { repeat: [3, 3], srgb: false });
}

/* A blob with a coat rather than an outline. The polygon is smoothed through
   its points and filled, then hairs are stamped along every edge in the same
   ink — which is the whole difference between a marking and a sticker. */
function smoothPolygon(ctx, points) {
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.moveTo((points[0][0] + last[0]) / 2, (points[0][1] + last[1]) / 2);
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
  }
  ctx.closePath();
}

function furredRegion(ctx, points, fill, { hair = 13, density = 0.32 } = {}) {
  ctx.fillStyle = fill;
  smoothPolygon(ctx, points);
  ctx.fill();

  // Hairs go out both ways from the boundary. The inward half lands on ink of
  // its own colour and disappears; the outward half is the ragged edge.
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const run = Math.hypot(dx, dy) || 1;
    const steps = Math.max(1, Math.round(run * density));
    for (let step = 0; step < steps; step += 1) {
      const t = (step + Math.random()) / steps;
      const px = a[0] + dx * t;
      const py = a[1] + dy * t;
      const nx = dy / run;
      const ny = -dx / run;
      const side = Math.random() > 0.5 ? 1 : -1;
      const reach = hair * (0.3 + Math.random() * 1.1) * side;
      const width = 1 + Math.random() * 2.4;
      ctx.beginPath();
      ctx.moveTo(px + (dx / run) * width, py + (dy / run) * width);
      ctx.lineTo(px - (dx / run) * width, py - (dy / run) * width);
      ctx.lineTo(px + nx * reach, py + ny * reach);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function speckle(ctx, x, y, radius, count, color, size = 3) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    ctx.globalAlpha = 0.25 + Math.random() * 0.45;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      size * (0.4 + Math.random() * 0.8),
      size * (0.4 + Math.random() * 0.7),
      Math.random() * Math.PI, 0, Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* His head, unwrapped.

   The skull is a sphere, so the map is equirectangular and every marking is
   placed by the direction it faces rather than by pixels: `yaw` runs from 0
   straight ahead round to 180 at the back of the skull, positive toward his
   left; `pitch` is +90 at the crown and -90 under the jaw. Those two lines are
   the only thing `tucker.js` has to agree with, and it does — the eyes are
   seated by the same pair of angles. */
export function tuckerFaceTexture() {
  const width = 1024;
  const height = 512;
  const { element, ctx } = canvas(width, height);
  const U = (yaw) => (0.25 + yaw / 360) * width;
  const V = (pitch) => (0.5 - pitch / 180) * height;

  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, "#f7f3ea");
  wash.addColorStop(0.45, TUCKER_COAT.white);
  wash.addColorStop(1, "#ddd5c6");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Two passes so a marking that runs off one edge of the map arrives back on
  // the other: the seam sits on his right cheek, and the patch round that ear
  // straddles it.
  for (const shift of [0, -width]) {
    const P = (yaw, pitch) => [U(yaw) + shift, V(pitch)];

    // The nape and the back of the skull, which run on into the black of his
    // back without a break.
    furredRegion(ctx, [
      P(104, 90), P(111, 55), P(116, 20), P(113, -20), P(108, -55), P(104, -90),
      P(250, -90), P(248, -50), P(256, 0), P(250, 45), P(248, 90)
    ], TUCKER_COAT.black, { hair: 16 });

    // The big patch: his left ear, his left eye, and the whole cheek under it.
    // The front edge is what the photographs are really about — it runs down
    // the middle of his forehead, bows in to take the eye, then swings out
    // along the jaw.
    furredRegion(ctx, [
      P(4, 92), P(8, 64), P(15, 42), P(10, 16), P(13, -4), P(22, -24), P(36, -40),
      P(58, -49), P(92, -50), P(126, -46), P(142, 0), P(138, 50), P(128, 92)
    ], TUCKER_COAT.black, { hair: 15 });

    // His right ear is black too, but only the ear: the cheek below it stays
    // white, so the patch is a small cap sitting behind that eye.
    furredRegion(ctx, [
      P(306, 92), P(316, 62), P(318, 42), P(306, 26), P(288, 20), P(264, 22),
      P(244, 32), P(238, 62), P(238, 92)
    ], TUCKER_COAT.black, { hair: 13 });

    // A warm brown breaking the black where the light catches it, so the coat
    // is not one flat ink.
    for (const [yaw, pitch, size] of [[62, 26, 130], [282, 58, 80]]) {
      const warm = ctx.createRadialGradient(U(yaw) + shift, V(pitch), 4, U(yaw) + shift, V(pitch), size);
      warm.addColorStop(0, "rgba(46,40,34,.5)");
      warm.addColorStop(1, "rgba(46,40,34,0)");
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(U(yaw) + shift, V(pitch), size, 0, Math.PI * 2);
      ctx.fill();
    }

    // The pink freckled skin round the eye that sits in the white, and a
    // dusting of it up the bridge of his nose.
    speckle(ctx, U(336) + shift, V(6), 46, 60, TUCKER_COAT.skin, 3.4);
    speckle(ctx, U(352) + shift, V(-26), 40, 34, TUCKER_COAT.skin, 2.6);

    // Sockets. The eyes themselves are modelled; this is only the shadow they
    // sit in, which is what stops them reading as beads stuck on a ball.
    for (const yaw of [24, 336]) {
      const socket = ctx.createRadialGradient(U(yaw) + shift, V(4), 2, U(yaw) + shift, V(4), 30);
      socket.addColorStop(0, "rgba(70,52,36,.42)");
      socket.addColorStop(1, "rgba(70,52,36,0)");
      ctx.fillStyle = socket;
      ctx.beginPath();
      ctx.arc(U(yaw) + shift, V(4), 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // The blaze is not flat white either — it has a shaded channel down the
    // middle of the forehead where the fur parts.
    const parting = ctx.createRadialGradient(U(-6) + shift, V(48), 4, U(-6) + shift, V(48), 96);
    parting.addColorStop(0, "rgba(196,186,170,.34)");
    parting.addColorStop(1, "rgba(196,186,170,0)");
    ctx.fillStyle = parting;
    ctx.beginPath();
    ctx.ellipse(U(-6) + shift, V(48), 44, 110, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  noise(ctx, width, height, 16, 1);
  return finish(element);
}

/* The red webbing collar, with the black figures repeated along it and the
   worn edge where it has been buckled and unbuckled. Mapped round a torus, so
   the horizontal axis is the way round his neck. */
export function tuckerCollarTexture() {
  const width = 1024;
  const height = 128;
  const { element, ctx } = canvas(width, height);

  const weave = ctx.createLinearGradient(0, 0, 0, height);
  weave.addColorStop(0, "#7d1414");
  weave.addColorStop(0.2, "#c8221d");
  weave.addColorStop(0.55, "#e03a2c");
  weave.addColorStop(0.85, "#a81a17");
  weave.addColorStop(1, "#6d1010");
  ctx.fillStyle = weave;
  ctx.fillRect(0, 0, width, height);

  // The nylon's own ribbing.
  ctx.globalAlpha = 0.16;
  for (let x = 0; x < width; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? "#000" : "#fff";
    ctx.fillRect(x, 0, 2, height);
  }
  ctx.globalAlpha = 1;

  // The black motif: a paw between two bars, repeated the way a printed collar
  // repeats it.
  ctx.fillStyle = "#15100f";
  for (let i = 0; i < 16; i += 1) {
    const x = (i + 0.5) * (width / 16);
    ctx.fillRect(x - 34, height * 0.3, 8, height * 0.4);
    ctx.fillRect(x + 26, height * 0.3, 8, height * 0.4);
    ctx.beginPath();
    ctx.ellipse(x, height * 0.58, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let toe = -1.5; toe <= 1.5; toe += 1) {
      ctx.beginPath();
      ctx.ellipse(x + toe * 9, height * 0.34, 4, 5.5, toe * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Edges, darkened and rubbed.
  const edge = ctx.createLinearGradient(0, 0, 0, height);
  edge.addColorStop(0, "rgba(0,0,0,.55)");
  edge.addColorStop(0.12, "rgba(0,0,0,0)");
  edge.addColorStop(0.88, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);

  noise(ctx, width, height, 20, 1);
  return finish(element, { repeat: [1, 1] });
}

/* The tag on the collar: a stamped disc with his name on it. */
export function tuckerTagTexture({ size = 256 } = {}) {
  const { element, ctx } = canvas(size, size);
  const half = size / 2;
  brushedMetal(ctx, size, size, "pewter");

  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half * 0.86, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(40,48,56,.5)";
  ctx.lineWidth = size * 0.03;
  ctx.stroke();
  ctx.restore();

  engrave(ctx, "TUCKER", half, half * 0.86, {
    size: fitText(ctx, "TUCKER", size * 0.68, 46, 800, DISPLAY_FONT, "2px"),
    letterSpacing: "2px", ink: "#1d2228", lip: "rgba(240,246,251,.55)"
  });
  engrave(ctx, "GOOD BOY", half, half * 1.22, {
    size: 22, weight: 700, ink: "rgba(40,48,56,.85)",
    lip: "rgba(240,246,251,.5)", letterSpacing: "4px"
  });
  return finish(element);
}

/* What comes off him when he is made a fuss of: a heart and a paw print, in
   one map each, thrown as sprites that rise and fade. */
export function affectionTexture(kind = "heart", { size = 128 } = {}) {
  const { element, ctx } = canvas(size, size);
  const unit = size / 100;
  ctx.fillStyle = "#ffffff";
  ctx.translate(size / 2, size / 2);

  if (kind === "heart") {
    ctx.beginPath();
    ctx.moveTo(0, 34 * unit);
    ctx.bezierCurveTo(-46 * unit, 2 * unit, -34 * unit, -40 * unit, 0, -16 * unit);
    ctx.bezierCurveTo(34 * unit, -40 * unit, 46 * unit, 2 * unit, 0, 34 * unit);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 14 * unit, 24 * unit, 20 * unit, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, lean] of [[-26, -16, -0.4], [-10, -30, -0.14], [10, -30, 0.14], [26, -16, 0.4]]) {
      ctx.beginPath();
      ctx.ellipse(x * unit, y * unit, 9 * unit, 12 * unit, lean, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(element, { srgb: false });
}

/* His muzzle, which is cream rather than white and freckled pink around the
   nose. Mapped on the same sphere convention as the head: the front of the
   muzzle sits a quarter of the way across, the underside at the bottom. */
export function tuckerMuzzleTexture() {
  const width = 512;
  const height = 256;
  const { element, ctx } = canvas(width, height);

  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, "#f5f1e8");
  wash.addColorStop(0.6, TUCKER_COAT.white);
  wash.addColorStop(1, "#c9bfae");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  // Freckles, heaviest at the front and thinning back along the cheeks.
  speckle(ctx, width * 0.25, height * 0.44, 62, 90, TUCKER_COAT.skin, 3.6);
  speckle(ctx, width * 0.14, height * 0.5, 42, 40, TUCKER_COAT.skin, 3);
  speckle(ctx, width * 0.36, height * 0.5, 42, 40, TUCKER_COAT.skin, 3);
  speckle(ctx, width * 0.25, height * 0.28, 46, 26, TUCKER_COAT.skin, 2.4);

  // The dark lip line under the muzzle.
  const lip = ctx.createLinearGradient(0, height * 0.7, 0, height);
  lip.addColorStop(0, "rgba(24,20,24,0)");
  lip.addColorStop(1, "rgba(24,20,24,.85)");
  ctx.fillStyle = lip;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);

  noise(ctx, width, height, 14, 1);
  return finish(element);
}
