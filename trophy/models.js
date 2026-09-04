/* Every object in the hall is built from three.js primitives at load time —
   lathed cups, extruded stars, hexagonal marble. No model files, so the whole
   room is a few hundred lines of geometry and it streams instantly.

   Each builder returns a Group whose origin sits on the surface it stands on,
   and tags itself with the framing hints the camera needs to inspect it:
     userData.focusHeight — where the object's visual centre is
     userData.focusRadius — how far back the camera has to sit to hold it
     userData.spin        — parts that turn on their own
     userData.glints      — points that catch an additive sparkle */

import * as THREE from "three";
import { crestTexture, marbleTexture, mix, nameplateTexture, recordFaceTexture, woodTexture } from "./textures.js";

const TAU = Math.PI * 2;

let shared = null;

export function initMaterials({ envMap, quality }) {
  const marble = new THREE.CanvasTexture(marbleTexture());
  marble.colorSpace = THREE.SRGBColorSpace;
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;

  const darkMarble = new THREE.CanvasTexture(marbleTexture({ base: "#0b1220", vein: "#22344b", glow: "#132132" }));
  darkMarble.colorSpace = THREE.SRGBColorSpace;
  darkMarble.wrapS = darkMarble.wrapT = THREE.RepeatWrapping;

  const walnut = new THREE.CanvasTexture(woodTexture());
  walnut.colorSpace = THREE.SRGBColorSpace;
  walnut.wrapS = walnut.wrapT = THREE.RepeatWrapping;

  const metal = (color, roughness, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMap, envMapIntensity: 1.5, ...extra });

  shared = {
    envMap,
    quality,
    gold: metal(0xffc964, 0.14),
    goldWarm: metal(0xe8a53c, 0.24),
    goldDark: metal(0x8a6420, 0.38),
    brass: metal(0xd8b46a, 0.28),
    silver: metal(0xd6dde6, 0.16),
    pewter: metal(0x7d8794, 0.34),
    bronze: metal(0x9a6a38, 0.32),
    tarnish: metal(0x6d6553, 0.55),
    porcelain: new THREE.MeshStandardMaterial({
      color: 0xf2f6f9, metalness: 0.04, roughness: 0.1, envMap, envMapIntensity: 1.2
    }),
    marble: new THREE.MeshStandardMaterial({
      map: marble, color: 0xffffff, metalness: 0.2, roughness: 0.42, envMap, envMapIntensity: 0.7
    }),
    darkMarble: new THREE.MeshStandardMaterial({
      map: darkMarble, color: 0xffffff, metalness: 0.3, roughness: 0.38, envMap, envMapIntensity: 0.8
    }),
    walnut: new THREE.MeshStandardMaterial({
      map: walnut, color: 0xd8b184, metalness: 0.12, roughness: 0.52, envMap, envMapIntensity: 0.55
    }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x2a1421, metalness: 0, roughness: 0.95 }),
    textures: { marble, darkMarble, walnut }
  };

  return shared;
}

export function materials() {
  return shared;
}

/* A tinted metal in a team's colour, cached so ten pillars sharing a palette
   share a material. */
const teamMetalCache = new Map();
export function teamMetal(color, { roughness = 0.26, emissive = 0.14 } = {}) {
  const key = `${color}:${roughness}:${emissive}`;
  if (!teamMetalCache.has(key)) {
    teamMetalCache.set(key, new THREE.MeshStandardMaterial({
      color: new THREE.Color(mix(color, "#ffffff", 0.25)),
      metalness: 0.95,
      roughness,
      emissive: new THREE.Color(color),
      emissiveIntensity: emissive,
      envMap: shared.envMap,
      envMapIntensity: 1.4
    }));
  }
  return teamMetalCache.get(key);
}

const crestCache = new Map();
function crestMaterial(item, label) {
  const key = `${item.ownerId || item.id}:${label || ""}`;
  if (!crestCache.has(key)) {
    crestCache.set(key, new THREE.MeshStandardMaterial({
      map: crestTexture({ icon: item.icon, color: item.color, label }),
      metalness: 0.2,
      roughness: 0.4,
      envMap: shared.envMap,
      envMapIntensity: 1.1
    }));
  }
  return crestCache.get(key);
}

function lathe(points, segments = 64) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

export function roundedBox(width, height, depth, radius, curve = 4) {
  const shape = new THREE.Shape();
  const w = width / 2 - radius;
  const h = height / 2 - radius;
  shape.moveTo(-w, -height / 2);
  shape.lineTo(w, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -h);
  shape.lineTo(width / 2, h);
  shape.quadraticCurveTo(width / 2, height / 2, w, height / 2);
  shape.lineTo(-w, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, h);
  shape.lineTo(-width / 2, -h);
  shape.quadraticCurveTo(-width / 2, -height / 2, -w, -height / 2);

  const bevel = Math.min(depth * 0.3, radius * 0.8);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: curve,
    curveSegments: 8
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function starGeometry(outer = 0.1, inner = 0.045, thickness = 0.03) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = (i / 10) * TAU - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.5,
    bevelEnabled: true,
    bevelThickness: thickness * 0.35,
    bevelSize: thickness * 0.35,
    bevelSegments: 2
  });
  geometry.center();
  return geometry;
}

/* A disc carrying the team crest on its front face, gold on the rim and back.
   The cylinder's cap order is [side, top, bottom]; standing it up on X means
   the "top" cap becomes the face the room sees. */
export function crestDisc(item, { radius = 0.3, thickness = 0.055, label = null } = {}) {
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, thickness, 56),
    [shared.goldWarm, crestMaterial(item, label), shared.goldDark]
  );
  disc.rotation.x = Math.PI / 2;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.005, thickness * 0.44, 10, 60),
    shared.gold
  );

  const group = new THREE.Group();
  group.add(disc, rim);
  group.userData.crestFace = disc;
  return group;
}

/* ---------------------------------------------------------------- pedestals */

let sheenMap = null;
function sheenTexture() {
  if (!sheenMap) {
    const element = document.createElement("canvas");
    element.width = 64;
    element.height = 256;
    const ctx = element.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "rgba(255,255,255,.85)");
    gradient.addColorStop(0.45, "rgba(255,255,255,.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 256);
    // Pinch the sides so the streak tapers away from the plinth.
    const sides = ctx.createLinearGradient(0, 0, 64, 0);
    sides.addColorStop(0, "rgba(0,0,0,1)");
    sides.addColorStop(0.5, "rgba(0,0,0,0)");
    sides.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, 64, 256);
    sheenMap = new THREE.CanvasTexture(element);
  }
  return sheenMap;
}

const pedestalGeometry = {};
function pedestalParts() {
  if (!pedestalGeometry.shaft) {
    pedestalGeometry.plinth = roundedBox(1.00, 0.13, 1.00, 0.045);
    pedestalGeometry.shaft = roundedBox(0.76, 0.86, 0.76, 0.035);
    pedestalGeometry.cap = roundedBox(0.92, 0.09, 0.92, 0.03);
    pedestalGeometry.fillet = new THREE.TorusGeometry(0.44, 0.016, 8, 4);
  }
  return pedestalGeometry;
}

export function buildPedestal(item, { height = 1.1 } = {}) {
  const parts = pedestalParts();
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(parts.plinth, shared.darkMarble);
  plinth.position.y = 0.07;
  const shaft = new THREE.Mesh(parts.shaft, shared.marble);
  shaft.position.y = 0.14 + 0.43;
  const cap = new THREE.Mesh(parts.cap, shared.darkMarble);
  cap.position.y = height - 0.045;

  // A thin band of the team's colour where the cap meets the shaft, so a
  // pedestal is identifiable from down the hall before you can read it.
  const band = new THREE.Mesh(roundedBox(0.855, 0.02, 0.855, 0.01), teamMetal(item.color, { emissive: 0.5 }));
  band.position.y = height - 0.105;

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.16),
    new THREE.MeshStandardMaterial({
      map: nameplateTexture({ title: item.title, sub: item.subtitle, accent: item.accent }),
      metalness: 0.28,
      roughness: 0.32,
      envMap: shared.envMap,
      envMapIntensity: 1.1
    })
  );
  plate.position.set(0, 0.63, 0.3855);

  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 2.2),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(item.color).lerp(new THREE.Color(0xffd28a), 0.6),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: sheenTexture()
    })
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(0, 0.014, 1.42);

  group.add(plinth, shaft, cap, band, plate, sheen);
  group.userData.topY = height;
  group.userData.band = band;
  return group;
}

/* ------------------------------------------------------------------ trophies */

/* The championship cup: lathed foot, stem and bowl, two swept handles, a domed
   lid and a football finial. The team crest is mounted on the front of the bowl. */
export function buildCup(item) {
  const group = new THREE.Group();

  // Read bottom-up: a stepped foot, a narrow stem through a knop, then a bowl
  // that flares to a wide mouth. The last third of the list walks back down the
  // inside so the cup is hollow when you look into it.
  const body = new THREE.Mesh(lathe([
    [0.000, 0.000], [0.255, 0.000], [0.262, 0.032], [0.246, 0.056],
    [0.150, 0.086], [0.110, 0.124], [0.062, 0.190], [0.052, 0.290],
    [0.058, 0.372], [0.104, 0.412], [0.112, 0.436], [0.062, 0.462],
    [0.088, 0.500], [0.150, 0.552], [0.212, 0.634], [0.256, 0.752],
    [0.284, 0.888], [0.300, 0.996], [0.316, 1.042], [0.312, 1.072],
    [0.286, 1.070], [0.276, 1.000], [0.246, 0.860], [0.176, 0.680],
    [0.104, 0.566], [0.000, 0.542]
  ]), shared.gold);
  body.castShadow = true;

  const accentRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.222, 0.024, 12, 64),
    teamMetal(item.color, { emissive: 0.3 })
  );
  accentRing.rotation.x = Math.PI / 2;
  accentRing.position.y = 0.652;

  // Loop handles standing in the plane of the front face, gap turned inward.
  const handles = new THREE.Group();
  const handleGeometry = new THREE.TorusGeometry(0.125, 0.021, 10, 40, Math.PI * 1.34);
  const right = new THREE.Mesh(handleGeometry, shared.gold);
  right.position.set(0.288, 0.900, 0);
  right.rotation.z = -2.1;
  right.scale.set(0.85, 1.25, 1);
  right.castShadow = true;
  const left = right.clone();
  left.position.x = -0.288;
  left.rotation.z = Math.PI + 2.1;
  handles.add(right, left);

  const lid = new THREE.Mesh(lathe([
    [0.000, 1.072], [0.292, 1.072], [0.300, 1.096], [0.268, 1.124],
    [0.196, 1.172], [0.108, 1.204], [0.052, 1.222], [0.042, 1.248],
    [0.000, 1.252]
  ]), shared.gold);
  lid.castShadow = true;

  // Finial: a football, the one shape in the room the league did not invent.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.056, 0.046, 24), shared.goldDark);
  collar.position.y = 1.256;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.072, 26, 18), shared.goldWarm);
  ball.scale.set(1.6, 0.9, 0.9);
  ball.position.y = 1.348;
  ball.rotation.z = 0.1;
  const laces = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.014), shared.silver);
  laces.position.y = 1.414;

  // The crest rides on the face of the bowl, sitting proud of it like a
  // soldered-on medallion rather than a window cut into the metal.
  const crest = crestDisc(item, { radius: 0.152, thickness: 0.034 });
  crest.position.set(0, 0.878, 0.318);
  crest.rotation.x = -0.08;

  group.add(body, accentRing, handles, lid, collar, ball, laces, crest);

  // The 2020 cup is a ghost: the title is on the record, the season is not.
  if (item.lost) {
    group.traverse((child) => {
      if (!child.isMesh) return;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => ghost(material))
        : ghost(child.material);
    });
  }

  group.scale.setScalar(1.22);
  group.userData.focusHeight = 0.88;
  group.userData.focusRadius = 1.0;
  group.userData.spin = [];
  group.userData.glints = [
    new THREE.Vector3(0.20, 1.00, 0.20),
    new THREE.Vector3(-0.17, 0.70, 0.22),
    new THREE.Vector3(0.03, 1.35, 0.06)
  ];
  return group;
}

/* Polished metal under a spotlight blows out the moment you make it
   translucent, so a ghost trades most of its metalness for roughness and comes
   back as pale glass instead of a white blob. */
function ghost(material) {
  const clone = material.clone();
  clone.transparent = true;
  clone.opacity = 0.26;
  clone.metalness = 0.35;
  clone.roughness = 0.62;
  clone.envMapIntensity = 0.45;
  clone.color = clone.color.clone().lerp(new THREE.Color(0x9ec2ff), 0.55);
  clone.depthWrite = false;
  return clone;
}

/* The hall-of-fame exhibit. A plain marble column said nothing about whose
   career it was, so the manager's crest is the object: a heraldic shield struck
   in their own colour, standing on a brass post, with one gold star turning
   overhead for every title. It is as close to a team logo in three dimensions
   as a league of emoji and hex codes can get. */
function shieldShape(width = 0.46, shoulder = 0.56, point = 0.64) {
  const shape = new THREE.Shape();
  shape.moveTo(-width, shoulder);
  shape.lineTo(width, shoulder);
  shape.lineTo(width, 0.06);
  shape.bezierCurveTo(width, -0.3, width * 0.62, -point * 0.75, 0, -point);
  shape.bezierCurveTo(-width * 0.62, -point * 0.75, -width, -0.3, -width, 0.06);
  shape.closePath();
  return shape;
}

function extrudedShield(scale, depth, material) {
  const geometry = new THREE.ExtrudeGeometry(
    shieldShape(0.46 * scale, 0.56 * scale, 0.64 * scale),
    { depth, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.022, bevelSegments: 3, curveSegments: 18 }
  );
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function buildShield(item) {
  const group = new THREE.Group();

  const rim = extrudedShield(1.06, 0.1, shared.gold);
  rim.position.set(0, 1.02, -0.02);
  rim.castShadow = true;

  const face = extrudedShield(1.0, 0.12, teamMetal(item.color, { roughness: 0.3, emissive: 0.12 }));
  face.position.set(0, 1.02, 0.03);

  const crest = crestDisc(item, { radius: 0.29, thickness: 0.05 });
  crest.position.set(0, 1.09, 0.11);

  // A chevron across the foot of the shield, so it is not a flat field of colour.
  const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.02), shared.gold);
  chevron.position.set(0, 0.64, 0.1);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, 0.46, 16), shared.brass);
  post.position.y = 0.23;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.07, 24), shared.darkMarble);
  foot.position.y = 0.035;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.018, 8, 26), shared.gold);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.45;

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.014, 8, 34),
    teamMetal(item.color, { emissive: 0.9, roughness: 0.16 })
  );
  halo.position.set(0, 0.44, 0);
  halo.rotation.x = Math.PI / 2;

  const stars = new THREE.Group();
  stars.position.y = 1.86;
  const geometry = starGeometry(0.085, 0.038, 0.028);
  for (let i = 0; i < (item.rings || 0); i += 1) {
    const star = new THREE.Mesh(geometry, shared.gold);
    const angle = (i / Math.max(1, item.rings)) * TAU;
    star.position.set(Math.cos(angle) * 0.34, Math.sin(angle * 2) * 0.05, Math.sin(angle) * 0.34);
    stars.add(star);
  }

  group.add(foot, post, collar, halo, rim, face, chevron, crest, stars);
  group.userData.focusHeight = 1.02;
  group.userData.focusRadius = 0.96;
  group.userData.spin = item.rings ? [{ node: stars, speed: -0.3 }] : [];
  group.userData.glints = [
    new THREE.Vector3(0.42, 1.4, 0.1),
    new THREE.Vector3(-0.4, 0.7, 0.1),
    new THREE.Vector3(0, 1.09, 0.16)
  ];
  return group;
}

/* A record plaque: walnut board, brass face, studs at the corners, tilted back
   on a stand the way a real one leans in a case. */
export function buildPlaque(item) {
  const group = new THREE.Group();
  const board = new THREE.Group();

  const backing = new THREE.Mesh(roundedBox(1.06, 1.30, 0.09, 0.05), shared.walnut);
  backing.castShadow = true;

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.645),
    new THREE.MeshStandardMaterial({
      map: recordFaceTexture({
        value: item.bigValue,
        label: item.title,
        holder: item.subtitle,
        meta: item.meta,
        accent: item.accent
      }),
      metalness: 0.26,
      roughness: 0.3,
      envMap: shared.envMap,
      envMapIntensity: 1.15
    })
  );
  face.position.set(0, -0.16, 0.048);

  const trim = new THREE.Mesh(roundedBox(0.9, 0.685, 0.012, 0.02), shared.brass);
  trim.position.set(0, -0.16, 0.043);

  const studs = new THREE.Group();
  for (const [x, y] of [[-0.45, 0.575], [0.45, 0.575], [-0.45, -0.575], [0.45, -0.575]]) {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 14), shared.brass);
    stud.position.set(x, y, 0.05);
    stud.scale.z = 0.6;
    studs.add(stud);
  }

  const crest = crestDisc(item, { radius: 0.165, thickness: 0.05 });
  crest.position.set(0, 0.42, 0.055);

  board.add(backing, trim, face, studs, crest);
  board.position.y = 0.82;
  board.rotation.x = -0.13;

  const foot = new THREE.Mesh(roundedBox(0.66, 0.1, 0.36, 0.03), shared.darkMarble);
  foot.position.y = 0.05;
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 12), shared.brass);
  strut.position.set(0, 0.24, -0.02);

  group.add(foot, strut, board);
  group.userData.focusHeight = 0.86;
  group.userData.focusRadius = 1.15;
  group.userData.spin = [];
  group.userData.glints = [new THREE.Vector3(0.42, 1.32, 0.1), new THREE.Vector3(-0.42, 0.55, 0.1)];
  group.userData.faceForward = true;
  return group;
}

/* The cellar prize. A trophy would be too kind. */
export function buildToilet(item) {
  const group = new THREE.Group();

  const bowl = new THREE.Mesh(lathe([
    [0.00, 0.000], [0.215, 0.000], [0.220, 0.030], [0.150, 0.075],
    [0.120, 0.180], [0.140, 0.290], [0.190, 0.370], [0.245, 0.420],
    [0.268, 0.455], [0.262, 0.480], [0.225, 0.478], [0.205, 0.440],
    [0.150, 0.390], [0.120, 0.330], [0.000, 0.320]
  ], 48), shared.porcelain);
  bowl.castShadow = true;
  bowl.scale.set(1.12, 1, 1);

  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.036, 12, 48), shared.porcelain);
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(1.14, 1, 1);
  seat.position.y = 0.5;

  const lid = new THREE.Mesh(roundedBox(0.52, 0.05, 0.46, 0.12), shared.porcelain);
  lid.position.set(0, 0.545, -0.36);
  lid.rotation.x = -1.16;

  const tank = new THREE.Mesh(roundedBox(0.52, 0.52, 0.26, 0.05), shared.porcelain);
  tank.position.set(0, 0.48, -0.30);
  tank.castShadow = true;
  const tankLid = new THREE.Mesh(roundedBox(0.58, 0.06, 0.32, 0.03), shared.porcelain);
  tankLid.position.set(0, 0.755, -0.30);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 12), shared.tarnish);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.20, 0.66, -0.175);

  // Tarnished laurel on the tank, in place of the gold the winner gets.
  const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 8, 40), shared.tarnish);
  wreath.position.set(0, 0.50, -0.164);

  const crest = crestDisc(item, { radius: 0.145, thickness: 0.05 });
  crest.position.set(0, 0.50, -0.155);
  crest.rotation.y = Math.PI;
  crest.scale.setScalar(0.98);

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.38, 0.1),
    new THREE.MeshStandardMaterial({
      map: nameplateTexture({ title: item.plate, sub: null, accent: item.accent }),
      metalness: 0.28,
      roughness: 0.36,
      envMap: shared.envMap
    })
  );
  plaque.position.set(0, 0.19, 0.245);
  plaque.rotation.x = -0.1;

  group.add(bowl, seat, lid, tank, tankLid, handle, wreath, crest, plaque);
  // Modelled facing away; turned around once here so the tank plaque and the
  // crest meet the viewer.
  group.rotation.y = Math.PI;
  group.userData.focusHeight = 0.42;
  group.userData.focusRadius = 1.0;
  group.userData.spin = [];
  group.userData.glints = [new THREE.Vector3(0, 0.5, -0.2)];
  return group;
}

export function buildExhibitObject(item) {
  switch (item.kind) {
    case "cup": return buildCup(item);
    case "pillar": return buildShield(item);
    case "plaque": return buildPlaque(item);
    case "toilet": return buildToilet(item);
    default: return buildCup(item);
  }
}
