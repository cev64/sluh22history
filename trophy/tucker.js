/* Tucker, the league mascot, sitting in the gap between the Champions and the
   Hall of Fame.

   He is built from two photographs of him: a black-and-white border collie
   sitting square on a hardwood floor, both ears up, head cocked. Everything
   below is an attempt to get those two pictures into geometry —

     · a broad white blaze up the middle of the face, with the whole of his
       left side, that eye included, under one black patch
     · both ears black, the right one a black cap over otherwise white cheek
     · a deep white ruff running down the chest and both front legs
     · black over the back, the haunches and the upper hind legs, white socks
       under them
     · a black tail with a white tip, laid out along the floor to one side
     · a red webbing collar with a stamped tag hanging off it
     · pink freckles across the muzzle and around the eye that sits in white

   The rig is the other half of the job. Nothing here is a single mesh: the
   tail is a chain, the head hangs off a neck, the ears, jaw, eyelids and tag
   all pivot, and every one of them is driven from `update`. That is what lets
   him watch you walk past and come apart into a wag when you pet him. */

import * as THREE from "three";
import { materials, roundedBox } from "./models.js";
import {
  TUCKER_COAT, affectionTexture, furTexture, nameplateTexture,
  tuckerCollarTexture, tuckerFaceTexture, tuckerMuzzleTexture, tuckerTagTexture
} from "./textures.js";
import { contactShadow } from "./hall.js";

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const rad = THREE.MathUtils.degToRad;

/* He is modelled at roughly life size and then scaled to stand this tall at
   the ear tips. A real collie on the floor of a six-metre hall disappears; a
   mascot is allowed to be a little larger than life. */
const STANDING_HEIGHT = 0.94;
const DAIS_HEIGHT = 0.42;
const DAIS_RADIUS = 0.80;

// The skull is a sphere, and every marking on the face map — plus every eye,
// ear and brow seated below — is placed by direction on it. `yaw` is 0 dead
// ahead and positive toward his left; `pitch` is +90 at the crown.
const SKULL = { rx: 0.089, ry: 0.086, rz: 0.098 };

function seat(yaw, pitch, k = 1) {
  const a = rad(yaw);
  const p = rad(pitch);
  return new THREE.Vector3(
    Math.sin(a) * Math.cos(p) * SKULL.rx * k,
    Math.sin(p) * SKULL.ry * k,
    Math.cos(a) * Math.cos(p) * SKULL.rz * k
  );
}

/* ---------------------------------------------------------------- materials */

let coat = null;

function buildCoat(quality) {
  if (coat) return coat;
  const { envMap } = materials();
  const fur = furTexture();
  const soft = !quality || !quality.light;

  // Fur is not a plastic surface: the sheen term is what puts the pale rim on
  // the edge of a black coat, and without it he reads as a vinyl toy. It is
  // the first thing dropped on a weak device.
  const pelt = (color, { sheenColor = 0xffe3bd, sheenMap = null, roughness = 0.86, bump = 0.0035, sheen = 0.2, ...rest } = {}) => {
    const common = {
      color, roughness, metalness: 0,
      bumpMap: fur, bumpScale: bump,
      roughnessMap: fur,
      envMap, envMapIntensity: 0.22,
      ...rest
    };
    if (!soft) return new THREE.MeshStandardMaterial(common);
    const pelage = new THREE.MeshPhysicalMaterial({
      ...common, sheen, sheenColor: new THREE.Color(sheenColor), sheenRoughness: 0.65
    });
    // A warm sheen on white fur is the pale rim that makes it fur. The same
    // sheen on black fur turns the patch olive, which is exactly what a head
    // wearing both on one mesh did until the marking map was handed to the
    // sheen as well: black in the map, no sheen in the black.
    if (sheenMap) pelage.sheenColorMap = sheenMap;
    return pelage;
  };

  const face = tuckerFaceTexture();
  const muzzle = tuckerMuzzleTexture();

  coat = {
    fur,
    // Black fur is nearly black in albedo — the pale it reads at in a photo is
    // all specular. Give it the albedo of coal and let the room do the rest.
    black: pelt(0x0d0e12, { sheenColor: 0x44506a, sheen: 0.18, roughness: 0.88 }),
    white: pelt(0xe9e3d6, { sheenColor: 0xffeed4, sheen: 0.3, roughness: 0.88 }),
    // The head and muzzle carry their markings as a map, so they take the
    // painted colour rather than a flat one.
    head: pelt(0xffffff, { map: face, sheenMap: face, sheenColor: 0xffeed4, sheen: 0.34, roughness: 0.86 }),
    muzzle: pelt(0xffffff, { map: muzzle, sheenMap: muzzle, sheenColor: 0xffeed4, sheen: 0.32, roughness: 0.84, bump: 0.002 }),
    // A wet nose and a wet eye are the two glossy things on a dog.
    nose: new THREE.MeshPhysicalMaterial({
      color: 0x100d12, roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
      envMap, envMapIntensity: 1.1
    }),
    eye: new THREE.MeshPhysicalMaterial({
      color: 0x35200f, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      envMap, envMapIntensity: 1.6
    }),
    spark: new THREE.MeshBasicMaterial({ color: 0xfff6e2 }),
    skin: new THREE.MeshStandardMaterial({
      color: 0xc98d87, roughness: 0.68, metalness: 0, envMap, envMapIntensity: 0.25
    }),
    tongue: new THREE.MeshStandardMaterial({
      color: 0xd4736f, roughness: 0.35, metalness: 0, envMap, envMapIntensity: 0.6
    }),
    claw: new THREE.MeshStandardMaterial({ color: 0x1b1a1c, roughness: 0.4, metalness: 0.1, envMap }),
    collar: new THREE.MeshStandardMaterial({
      map: tuckerCollarTexture(), roughness: 0.62, metalness: 0.05, envMap, envMapIntensity: 0.5
    }),
    tagFace: new THREE.MeshStandardMaterial({
      map: tuckerTagTexture(), roughness: 0.3, metalness: 0.7, envMap, envMapIntensity: 1.4
    }),
    tagEdge: new THREE.MeshStandardMaterial({ color: 0xb9c1cb, roughness: 0.32, metalness: 0.9, envMap, envMapIntensity: 1.4 }),
    ball: new THREE.MeshStandardMaterial({ color: 0xd8e04a, roughness: 0.92, metalness: 0 }),
    ballSeam: new THREE.MeshStandardMaterial({ color: 0xf4f2e6, roughness: 0.85, metalness: 0 })
  };
  return coat;
}

/* ------------------------------------------------------------------ helpers */

const sphereCache = new Map();
function ball(segments = 24) {
  const key = String(segments);
  if (!sphereCache.has(key)) sphereCache.set(key, new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75)));
  return sphereCache.get(key);
}

/* Almost every part of him is a squashed sphere, so this is the workhorse: a
   unit sphere scaled to a shape and dropped where it belongs. */
function blob(material, [x, y, z], [sx, sy, sz], { segments = 24, rotation } = {}) {
  const mesh = new THREE.Mesh(ball(segments), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.castShadow = true;
  return mesh;
}

/* A limb bone: a tapered cylinder laid between two points. */
function bone(material, from, to, r0, r1, segments = 12) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const span = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, span.length(), segments, 1, false), material);
  mesh.position.copy(a).addScaledVector(span, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
  mesh.castShadow = true;
  return mesh;
}

/* Long fur, done as a ring of overlapping lobes rather than a ring of spikes:
   a collie's ruff and trousers are a soft mass with a broken edge, and spikes
   at this size read as debris stuck to him. Used for the ruff, the trousers
   and the feathering behind the legs. */
/* The ruff itself, which is not a ring of anything: a bell of fur round the
   base of the neck with a scalloped edge, cut as one surface so it reads as a
   mass and not as a string of beads. */
function ruffSkirt(material, { rTop, rBottom, top, bottom, scallops = 11, depth = 0.1 }) {
  const geometry = new THREE.LatheGeometry([
    new THREE.Vector2(rTop * 0.62, top + 0.02),
    new THREE.Vector2(rTop, top),
    new THREE.Vector2((rTop + rBottom) * 0.56, (top + bottom) / 2),
    new THREE.Vector2(rBottom, bottom),
    new THREE.Vector2(rBottom * 0.9, bottom - 0.012),
    new THREE.Vector2(rBottom * 0.55, bottom - 0.02)
  ], 56);

  // Break the rim: without this it is a lampshade.
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const angle = Math.atan2(v.z, v.x);
    const down = THREE.MathUtils.clamp((top - v.y) / Math.max(0.001, top - bottom), 0, 1);
    const wave = 1 + Math.sin(angle * scallops) * depth * down + Math.sin(angle * (scallops * 2 + 1) + 1.3) * depth * 0.4 * down;
    position.setX(i, v.x * wave);
    position.setZ(i, v.z * wave);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function ruff(group, material, { centre, radius, count, size, squash = 0.7, jitter = 0.3, plane = "y" }) {
  for (let i = 0; i < count; i += 1) {
    const angle = ((i + 0.5) / count) * Math.PI * 2;
    const wobble = 1 - jitter / 2 + Math.random() * jitter;
    const reach = radius * wobble;
    const lobe = new THREE.Mesh(ball(14), material);
    if (plane === "y") lobe.position.set(centre[0] + Math.cos(angle) * reach, centre[1] + (Math.random() - 0.5) * size * 0.6, centre[2] + Math.sin(angle) * reach * 0.85);
    else lobe.position.set(centre[0] + (Math.random() - 0.5) * size * 0.6, centre[1] + Math.cos(angle) * reach, centre[2] + Math.sin(angle) * reach);
    lobe.scale.set(size * wobble, size * squash * wobble, size * wobble);
    lobe.rotation.set(Math.random() * 0.6, angle, (Math.random() - 0.5) * 0.6);
    lobe.castShadow = true;
    group.add(lobe);
  }
}

/* The finer stuff — the brush on the tail and the fringe down the back of a
   foreleg — where an actual tuft is the right shape. */
function feathering(group, material, { centre, radius, count, size, spread = 0.5, axis = "y" }) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const angle = t * Math.PI * 2;
    const wobble = 0.75 + Math.random() * 0.6;
    const tuft = new THREE.Mesh(ball(10), material);
    const drop = (Math.random() - 0.5) * spread * radius;
    if (axis === "y") tuft.position.set(centre[0] + Math.cos(angle) * radius, centre[1] + drop, centre[2] + Math.sin(angle) * radius * 0.75);
    else tuft.position.set(centre[0] + drop, centre[1] + Math.cos(angle) * radius, centre[2] + Math.sin(angle) * radius);
    tuft.scale.set(size * wobble, size * wobble * 2.1, size * wobble);
    tuft.rotation.set((Math.random() - 0.5) * 1.2, Math.random() * Math.PI, angle + Math.PI / 2 + (Math.random() - 0.5) * 0.5);
    group.add(tuft);
  }
}

/* --------------------------------------------------------------------- weld */

/* He is modelled as two hundred small pieces because that is the only sane way
   to shape a dog out of spheres, and two hundred draw calls is not what this
   room costs anywhere else. So once he is built, everything that never moves
   relative to the part it hangs off is baked into one mesh per material.

   The boundaries are the joints: a group marked `pivot` is left alone and
   welded on its own, because it has to keep turning. Anything wearing a
   texture is left alone too — merging geometry merges its UVs into nonsense,
   and his face is a texture. */
function weldGeometries(list) {
  let vertices = 0;
  for (const geometry of list) vertices += geometry.attributes.position.count;
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  let at = 0;
  for (const geometry of list) {
    const p = geometry.attributes.position;
    position.set(p.array.subarray(0, p.count * 3), at * 3);
    if (geometry.attributes.normal) {
      normal.set(geometry.attributes.normal.array.subarray(0, p.count * 3), at * 3);
    }
    if (geometry.attributes.uv) {
      uv.set(geometry.attributes.uv.array.subarray(0, p.count * 2), at * 2);
    }
    at += p.count;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

function weld(root) {
  const nested = [];
  const buckets = new Map();

  const gather = (node, matrix) => {
    for (const child of [...node.children]) {
      child.updateMatrix();
      const local = matrix.clone().multiply(child.matrix);
      if (child.userData.pivot) { nested.push(child); continue; }
      if (child.isMesh) {
        // A mapped material keeps its own mesh: its UVs mean something.
        if (child.material.map || Array.isArray(child.material)) continue;
        const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone());
        geometry.applyMatrix4(local);
        if (!buckets.has(child.material)) buckets.set(child.material, []);
        buckets.get(child.material).push(geometry);
        node.remove(child);
      } else if (child.isGroup) {
        gather(child, local);
      }
    }
  };

  gather(root, new THREE.Matrix4());

  for (const [material, list] of buckets) {
    const mesh = new THREE.Mesh(weldGeometries(list), material);
    mesh.castShadow = true;
    root.add(mesh);
  }
  nested.forEach(weld);
}

/* ---------------------------------------------------------------------- ear */

/* Both ears stand up and both are black on the back with pink inside. The
   shape is cut once and cupped by pushing its middle back, which is what gives
   an erect ear its scoop instead of leaving it a flat leaf. */
function earGeometry() {
  // Wide at the base and coming to a point, the way a collie's does — not the
  // narrow leaf a first pass at this produces, which reads as a rabbit.
  const shape = new THREE.Shape();
  shape.moveTo(-0.042, 0);
  shape.quadraticCurveTo(-0.050, 0.042, -0.014, 0.086);
  shape.quadraticCurveTo(-0.002, 0.100, 0.012, 0.084);
  shape.quadraticCurveTo(0.046, 0.038, 0.040, 0);
  shape.quadraticCurveTo(0.002, -0.018, -0.042, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.010, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004,
    bevelSegments: 3, curveSegments: 14
  });
  geometry.translate(0, 0, -0.005);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    // Cup it, then let the tip fall forward a touch the way a young collie's
    // does rather than standing dead straight.
    position.setZ(i, position.getZ(i) - x * x * 5.5 + y * y * 1.6);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function innerEarGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.030, 0.012);
  shape.quadraticCurveTo(-0.036, 0.044, -0.010, 0.074);
  shape.quadraticCurveTo(0.000, 0.086, 0.008, 0.072);
  shape.quadraticCurveTo(0.034, 0.038, 0.029, 0.012);
  shape.quadraticCurveTo(0.000, -0.002, -0.030, 0.012);
  const geometry = new THREE.ShapeGeometry(shape, 14);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, position.getZ(i) - x * x * 5.5 + y * y * 1.6 + 0.004);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function buildEar(side, mat) {
  // side: +1 is his left ear, which is the one on the right of a photograph
  // taken face on.
  const pivot = new THREE.Group();
  pivot.userData.pivot = true;
  pivot.position.copy(seat(side * 42, 58, 0.86));
  pivot.rotation.order = "YXZ";
  pivot.rotation.y = side * 0.60;
  pivot.rotation.x = -0.16;
  pivot.rotation.z = -side * 0.22;

  const shell = new THREE.Mesh(earGeometry(), mat.black);
  shell.castShadow = true;
  const inner = new THREE.Mesh(innerEarGeometry(), mat.skin);
  inner.position.z = 0.0035;
  inner.scale.set(0.88, 0.92, 1);

  pivot.add(shell, inner);
  pivot.userData.rest = { x: pivot.rotation.x, y: pivot.rotation.y, z: pivot.rotation.z };
  return pivot;
}

/* --------------------------------------------------------------------- eyes */

function buildEye(yaw, mat) {
  const group = new THREE.Group();
  group.userData.pivot = true;
  const pitch = 3;
  group.position.copy(seat(yaw, pitch, 0.86));
  group.rotation.order = "YXZ";
  group.rotation.y = rad(yaw);
  group.rotation.x = rad(-pitch);

  const eyeball = new THREE.Mesh(ball(20), mat.eye);
  eyeball.scale.setScalar(0.0118);
  eyeball.position.z = 0.001;

  // A pupil dark enough to read as one at a distance, and one hard catchlight,
  // which is the whole difference between an eye and a bead.
  const pupil = new THREE.Mesh(ball(14), new THREE.MeshBasicMaterial({ color: 0x120a05 }));
  pupil.scale.setScalar(0.0058);
  pupil.position.set(0, 0, 0.0088);

  const spark = new THREE.Mesh(ball(10), mat.spark);
  spark.scale.setScalar(0.0026);
  spark.position.set(-0.0035, 0.0040, 0.0098);

  // Upper and lower lids, cut as caps that can roll down over the eye.
  const lidGeometry = new THREE.SphereGeometry(0.0134, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  // The lids wear the face map, so they are their own meshes anyway; the flag
  // is what keeps the weld from folding them into the skull.
  const upper = new THREE.Mesh(lidGeometry, mat.head);
  upper.rotation.x = 0.34;
  upper.userData.pivot = true;
  const lower = new THREE.Mesh(lidGeometry, mat.head);
  lower.rotation.x = Math.PI - 0.42;
  lower.userData.pivot = true;

  group.add(eyeball, pupil, spark, upper, lower);
  group.userData.lid = upper;
  group.userData.lowerLid = lower;
  return group;
}

/* --------------------------------------------------------------------- head */

function buildHead(mat) {
  const head = new THREE.Group();

  const skull = blob(mat.head, [0, 0, 0], [SKULL.rx, SKULL.ry, SKULL.rz], { segments: 40 });
  head.add(skull);

  // The occiput — the bump at the back of a collie's skull — and the cheeks.
  // These take flat coat colours rather than the face map: the map is
  // equirectangular on the skull, and any other shape wearing it samples a
  // meaningless slice of somebody's cheek.
  head.add(blob(mat.black, [0, 0.026, -0.056], [0.064, 0.052, 0.052], { segments: 18 }));
  // His left cheek is inside the black patch; his right one is in the white.
  head.add(blob(mat.black, [0.058, -0.026, 0.006], [0.038, 0.040, 0.048], { segments: 18 }));
  head.add(blob(mat.white, [-0.058, -0.026, 0.006], [0.038, 0.040, 0.048], { segments: 18 }));

  /* ------------------------------------------------------------- the muzzle */
  const muzzle = new THREE.Group();
  muzzle.position.set(0, -0.020, 0.056);
  muzzle.rotation.x = -0.05;
  // The bridge running down from the stop, and the fuller sides under it.
  muzzle.add(blob(mat.muzzle, [0, 0.014, 0.016], [0.032, 0.026, 0.054], { segments: 24 }));
  muzzle.add(blob(mat.muzzle, [0, -0.006, 0.012], [0.042, 0.034, 0.060], { segments: 28 }));
  muzzle.add(blob(mat.muzzle, [0, -0.014, -0.016], [0.052, 0.042, 0.048], { segments: 22 }));

  const nose = blob(mat.nose, [0, -0.001, 0.074], [0.0195, 0.0160, 0.0150], { segments: 26 });
  nose.rotation.x = -0.25;
  muzzle.add(nose);
  for (const side of [-1, 1]) {
    const nostril = blob(new THREE.MeshBasicMaterial({ color: 0x07060a }), [side * 0.0086, -0.006, 0.0876], [0.0044, 0.0056, 0.0034], { segments: 10 });
    muzzle.add(nostril);
  }

  // Whiskers. Three a side, hair-thin, and worth the six draw calls: they
  // catch the key light and read as the only fine thing on him.
  const whisker = new THREE.MeshBasicMaterial({ color: 0xded7c8, transparent: true, opacity: 0.28 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.0003, 0.0006, 0.044, 4), whisker);
      hair.position.set(side * 0.032, -0.004 + i * 0.008, 0.044 - i * 0.006);
      hair.rotation.z = side * (1.15 + i * 0.12);
      hair.rotation.x = -0.25 + i * 0.16;
      muzzle.add(hair);
    }
  }
  head.add(muzzle);

  /* ---------------------------------------------------------------- the jaw */
  const jaw = new THREE.Group();
  jaw.userData.pivot = true;
  jaw.position.set(0, -0.030, 0.030);
  // The black lip line under the muzzle, the white chin under that.
  jaw.add(blob(mat.nose, [0, -0.002, 0.040], [0.030, 0.010, 0.050], { segments: 20 }));
  jaw.add(blob(mat.muzzle, [0, -0.016, 0.014], [0.036, 0.022, 0.044], { segments: 18 }));

  const tongue = blob(mat.tongue, [0, -0.002, 0.052], [0.017, 0.006, 0.030], { segments: 16 });
  tongue.rotation.x = 0.35;
  tongue.userData.pivot = true;
  jaw.add(tongue);
  jaw.userData.tongue = tongue;
  jaw.userData.rest = jaw.rotation.x;
  head.add(jaw);

  /* --------------------------------------------------------------- the eyes */
  const eyeLeft = buildEye(24, mat);
  const eyeRight = buildEye(-24, mat);
  head.add(eyeLeft, eyeRight);

  /* --------------------------------------------------------------- the ears */
  const earLeft = buildEar(1, mat);
  const earRight = buildEar(-1, mat);
  head.add(earLeft, earRight);

  head.userData = { jaw, tongue, eyes: [eyeLeft, eyeRight], ears: [earLeft, earRight], muzzle };
  return head;
}

/* -------------------------------------------------------------------- limbs */

/* He is proportioned off the photographs in units where the top of an ear is
   1.0 and the floor is 0: withers at .62, elbow at .34, eye line at .79. The
   absolute size does not matter — he is measured and rescaled once he is
   built — so these read as fractions of a dog. */

function buildForeleg(side, mat) {
  const leg = new THREE.Group();
  const x = side * 0.105;

  leg.add(blob(mat.white, [x, 0.455, 0.050], [0.062, 0.070, 0.072], { segments: 18 }));
  leg.add(bone(mat.white, [x, 0.470, 0.042], [x + side * 0.004, 0.320, 0.098], 0.056, 0.043, 16));
  leg.add(blob(mat.white, [x + side * 0.004, 0.325, 0.096], [0.045, 0.046, 0.046], { segments: 16 }));
  leg.add(bone(mat.white, [x + side * 0.004, 0.330, 0.098], [x + side * 0.002, 0.070, 0.126], 0.043, 0.033, 16));

  // Paw: a rounded pad with three toes over it.
  leg.add(blob(mat.white, [x, 0.042, 0.140], [0.048, 0.038, 0.072], { segments: 20 }));
  for (let i = -1; i <= 1; i += 1) {
    leg.add(blob(mat.white, [x + i * 0.024, 0.044, 0.176], [0.016, 0.020, 0.028], { segments: 12 }));
    // One front paw has dark nails on it, which is the sort of thing a
    // photograph has and a generic dog does not.
    if (side < 0) {
      leg.add(blob(mat.claw, [x + i * 0.024, 0.028, 0.202], [0.0062, 0.008, 0.011], { segments: 8 }));
    }
  }

  // A little feathering down the back of the leg, and the black fleck he has
  // above one wrist.
  feathering(leg, mat.white, { centre: [x, 0.340, 0.032], radius: 0.016, count: 10, size: 0.006, spread: 3.6 });
  if (side > 0) leg.add(blob(mat.black, [x - 0.024, 0.130, 0.112], [0.017, 0.023, 0.025], { segments: 12 }));

  return leg;
}

function buildHindLeg(side, mat) {
  const leg = new THREE.Group();
  const x = side * 0.170;

  // The haunch, which on a sitting dog is the widest part of it.
  leg.add(blob(mat.black, [x, 0.235, -0.100], [0.070, 0.140, 0.152], { segments: 26 }));
  leg.add(blob(mat.black, [x * 0.96, 0.145, 0.014], [0.062, 0.088, 0.100], { segments: 22 }));
  // Stifle down to the hock, then forward along the floor to the foot.
  leg.add(bone(mat.black, [x * 0.95, 0.160, -0.010], [x * 0.90, 0.072, 0.070], 0.058, 0.038, 14));
  leg.add(bone(mat.white, [x * 0.92, 0.080, 0.070], [x * 0.92, 0.044, 0.166], 0.038, 0.031, 14));
  leg.add(blob(mat.white, [x * 0.92, 0.040, 0.186], [0.041, 0.033, 0.064], { segments: 18 }));
  for (let i = -1; i <= 1; i += 1) {
    leg.add(blob(mat.white, [x * 0.92 + i * 0.021, 0.042, 0.220], [0.014, 0.017, 0.024], { segments: 12 }));
  }

  // Trousers: the long fur on the back of a collie's thigh.
  ruff(leg, mat.black, { centre: [x, 0.222, -0.170], radius: 0.058, count: 10, size: 0.048, squash: 0.9, jitter: 0.28, plane: "x" });
  return leg;
}

/* --------------------------------------------------------------------- tail */

// The bend at each joint, walking from the root out. They add up to a tail
// that falls off the back of him, meets the floor, and then runs along it —
// which is where a sitting dog keeps it.
const TAIL_JOINTS = [0.30, 0.28, 0.24, 0.18, 0.10, 0.04, 0.00, -0.02];

function buildTail(mat) {
  // Two nested groups above the chain: the outer one swings the whole tail
  // across the floor, which is the wag; the chain adds the whip behind it.
  const swing = new THREE.Group();
  swing.userData.pivot = true;
  swing.position.set(0, 0.230, -0.320);
  swing.rotation.y = -0.66;

  const droop = new THREE.Group();
  droop.userData.pivot = true;
  droop.rotation.x = -2.75;
  swing.add(droop);

  const joints = [];
  let parent = droop;
  const length = 0.062;
  for (let i = 0; i < TAIL_JOINTS.length; i += 1) {
    const joint = new THREE.Group();
    joint.userData.pivot = true;
    joint.position.y = i === 0 ? 0 : length;
    joint.rotation.x = TAIL_JOINTS[i];
    const t = i / TAIL_JOINTS.length;
    const r0 = 0.052 * (1 - t) + 0.020 * t;
    const r1 = 0.052 * (1 - (t + 0.14)) + 0.020 * (t + 0.14);
    // The last third of the tail is the white tip.
    const material = i >= TAIL_JOINTS.length - 2 ? mat.white : mat.black;
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.018, r1), r0, length + 0.010, 14, 1), material);
    segment.position.y = length / 2;
    segment.castShadow = true;
    joint.add(segment);
    // Brush, so the tail is a plume and not a pipe.
    ruff(joint, material, {
      centre: [0, length / 2, 0], radius: Math.max(0.010, r0 * 0.5), count: 6,
      size: 0.020 * (1.15 - t * 0.7), squash: 1, jitter: 0.35, plane: "x"
    });
    parent.add(joint);
    joints.push(joint);
    parent = joint;
  }

  const tip = new THREE.Mesh(ball(14), mat.white);
  tip.scale.setScalar(0.021);
  tip.position.y = length;
  parent.add(tip);

  swing.userData = { joints, droop, restSwing: swing.rotation.y };
  return swing;
}

/* -------------------------------------------------------------------- collar */

function buildCollar(mat) {
  const group = new THREE.Group();

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.0115, 10, 48), mat.collar);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 0.92);
  group.add(band);

  // The tag hangs off the front of the band and swings with him.
  const hinge = new THREE.Group();
  hinge.userData.pivot = true;
  hinge.position.set(0, -0.006, 0.080);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.0022, 8, 18), mat.tagEdge);
  ring.position.y = -0.010;
  const tag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0165, 0.0165, 0.0022, 26),
    [mat.tagEdge, mat.tagFace, mat.tagFace]
  );
  tag.rotation.x = Math.PI / 2;
  tag.position.set(0, -0.031, 0.002);
  hinge.add(ring, tag);
  group.add(hinge);

  group.userData = { hinge };
  return group;
}

/* --------------------------------------------------------------------- body */

function buildDog(mat) {
  const dog = new THREE.Group();

  /* ---------------------------------------------------------------- haunches */
  const hips = new THREE.Group();
  hips.userData.pivot = true;
  hips.add(blob(mat.black, [0, 0.280, -0.175], [0.150, 0.185, 0.172], { segments: 30 }));
  hips.add(blob(mat.black, [0, 0.078, -0.165], [0.150, 0.082, 0.152], { segments: 26 }));
  hips.add(buildHindLeg(1, mat), buildHindLeg(-1, mat));
  const tail = buildTail(mat);
  hips.add(tail);
  dog.add(hips);

  /* ------------------------------------------------------------------- trunk */
  const torso = new THREE.Group();
  torso.userData.pivot = true;
  torso.position.set(0, 0.300, -0.060);
  torso.rotation.x = -0.10;

  torso.add(blob(mat.black, [0, -0.010, 0.000], [0.152, 0.158, 0.158], { segments: 28 }));
  torso.add(blob(mat.black, [0, 0.170, 0.036], [0.150, 0.156, 0.150], { segments: 30 }));
  torso.add(blob(mat.black, [0, 0.290, 0.030], [0.128, 0.078, 0.120], { segments: 24 }));
  for (const side of [-1, 1]) {
    torso.add(blob(mat.black, [side * 0.104, 0.205, 0.046], [0.062, 0.090, 0.100], { segments: 20 }));
  }

  // The white front. It is not a stripe painted on the black — it stands proud
  // of it, because on him the ruff is the widest thing about the chest.
  torso.add(blob(mat.white, [0, 0.100, 0.120], [0.132, 0.180, 0.090], { segments: 30 }));
  torso.add(blob(mat.white, [0, 0.255, 0.106], [0.112, 0.100, 0.084], { segments: 26 }));
  torso.add(blob(mat.white, [0, -0.055, 0.086], [0.112, 0.100, 0.086], { segments: 22 }));

  dog.add(torso);
  dog.add(buildForeleg(1, mat), buildForeleg(-1, mat));

  /* -------------------------------------------------------------------- neck */
  const neck = new THREE.Group();
  neck.userData.pivot = true;
  neck.position.set(0, 0.300, 0.092);
  neck.rotation.x = 0.16;

  neck.add(bone(mat.black, [0, -0.060, -0.014], [0, 0.100, 0.026], 0.128, 0.086, 22));
  neck.add(blob(mat.white, [0, 0.010, 0.064], [0.092, 0.100, 0.062], { segments: 22 }));
  neck.add(blob(mat.black, [0, 0.045, -0.042], [0.078, 0.090, 0.050], { segments: 20 }));
  // The ruff, which on a collie sits like a collar of its own under the real
  // one: a skirt of fur round the base of the neck, not a ring on the chest.
  const skirt = ruffSkirt(mat.white, { rTop: 0.098, rBottom: 0.152, top: 0.030, bottom: -0.088, scallops: 13, depth: 0.085 });
  skirt.position.set(0, 0, 0.004);
  skirt.rotation.x = -0.16;
  neck.add(skirt);

  const collar = buildCollar(mat);
  collar.position.set(0, 0.048, 0.010);
  collar.rotation.x = -0.10;
  collar.scale.setScalar(1.26);
  neck.add(collar);

  const head = buildHead(mat);
  head.userData.pivot = true;
  head.position.set(0, 0.150, 0.052);
  // The head is cut at a comfortable size to model in and then taken down to
  // the size a collie's actually is against that chest. Everything hung off it
  // — ears, eyes, whiskers, the lot — comes down with it.
  head.scale.setScalar(1.3);
  head.rotation.order = "YXZ";
  neck.add(head);
  torso.add(neck);

  dog.userData = { hips, torso, neck, head, tail, collar };
  return dog;
}

/* --------------------------------------------------------------------- dais */

function buildDais(mat) {
  const group = new THREE.Group();
  const shared = materials();

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DAIS_RADIUS, DAIS_RADIUS + 0.05, DAIS_HEIGHT - 0.06, 48), shared.darkMarble);
  drum.position.y = (DAIS_HEIGHT - 0.06) / 2;
  drum.receiveShadow = true;

  const top = new THREE.Mesh(new THREE.CylinderGeometry(DAIS_RADIUS + 0.03, DAIS_RADIUS + 0.03, 0.06, 48), shared.marble);
  top.position.y = DAIS_HEIGHT - 0.03;
  top.receiveShadow = true;

  const rim = new THREE.Mesh(new THREE.TorusGeometry(DAIS_RADIUS + 0.032, 0.012, 8, 60), shared.brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = DAIS_HEIGHT - 0.062;

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.60, 0.15),
    new THREE.MeshStandardMaterial({
      map: nameplateTexture({ title: "Tucker", sub: "League Mascot", accent: "#f2c14a" }),
      metalness: 0.28, roughness: 0.32, envMap: shared.envMap, envMapIntensity: 1.1
    })
  );
  plate.position.set(0, DAIS_HEIGHT - 0.20, DAIS_RADIUS + 0.035);
  plate.rotation.x = -0.06;

  group.add(drum, top, rim, plate);
  return group;
}

/* His tennis ball, sitting where he dropped it. */
function buildBall(mat) {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(ball(20), mat.ball);
  sphere.scale.setScalar(0.034);
  sphere.castShadow = true;
  group.add(sphere);
  for (const flip of [1, -1]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.0028, 6, 40, Math.PI * 1.05), mat.ballSeam);
    seam.rotation.set(Math.PI / 2, 0, flip > 0 ? 0.5 : Math.PI + 0.5);
    seam.scale.set(1, 1, 1.6);
    group.add(seam);
  }
  return group;
}

/* ---------------------------------------------------------------- affection */

/* What comes off him when he is made a fuss of. A small pool of sprites, each
   thrown once and recycled, so petting him fifty times allocates nothing. */
function buildAffection(scale) {
  const group = new THREE.Group();
  const maps = [affectionTexture("heart"), affectionTexture("paw")];
  const motes = [];
  for (let i = 0; i < 12; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: maps[i % 2],
      color: i % 2 ? 0xffd9a4 : 0xff8fa3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    sprite.visible = false;
    sprite.scale.setScalar(0.1 * scale);
    group.add(sprite);
    motes.push({ sprite, life: 0, span: 1, drift: new THREE.Vector3() });
  }
  let next = 0;

  return {
    group,
    burst(origin, count) {
      for (let i = 0; i < count; i += 1) {
        const mote = motes[next % motes.length];
        next += 1;
        mote.life = 0;
        mote.span = 0.95 + Math.random() * 0.55;
        mote.sprite.position.copy(origin).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.24 * scale,
          (Math.random() - 0.5) * 0.1 * scale,
          (Math.random() - 0.5) * 0.18 * scale
        ));
        mote.drift.set((Math.random() - 0.5) * 0.16, 0.26 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08)
          .multiplyScalar(scale);
        mote.sprite.visible = true;
      }
    },
    update(dt) {
      for (const mote of motes) {
        if (!mote.sprite.visible) continue;
        mote.life += dt;
        const t = mote.life / mote.span;
        if (t >= 1) { mote.sprite.visible = false; mote.sprite.material.opacity = 0; continue; }
        mote.sprite.position.addScaledVector(mote.drift, dt);
        mote.drift.y -= dt * 0.16 * scale;
        mote.sprite.material.opacity = Math.sin(Math.min(1, t) * Math.PI) * 0.9;
        mote.sprite.scale.setScalar((0.07 + t * 0.09) * scale);
      }
    }
  };
}

/* ------------------------------------------------------------------- the dog */

/* `x` and `z` place him in the hall; `quality` decides how much of the coat's
   shading survives on a weak device. Everything the room needs afterwards is
   on the returned handle: where he is, what to raycast against, how to pet him
   and one `update` to call every frame. */
export function buildTucker({ x = 0, z = 0, quality } = {}) {
  const mat = buildCoat(quality);

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const dais = buildDais(mat);
  group.add(dais);

  const stage = new THREE.Group();
  stage.position.y = DAIS_HEIGHT;
  group.add(stage);

  const dog = buildDog(mat);
  weld(dog);
  // He is built life size and then taken up to the height a mascot needs to
  // hold a six-metre room. Measure rather than assume: the ear tips are the
  // top of him, and they move every time the ears are re-angled.
  dog.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(dog);
  const scale = STANDING_HEIGHT / Math.max(0.001, bounds.max.y);
  dog.scale.setScalar(scale);

  const body = new THREE.Group();
  body.add(dog);
  // Three-quarter on, the way he is in both photographs, and turned to face
  // down the hall toward whoever is walking up to him.
  body.rotation.y = -0.34;
  body.position.z = 0.08;
  stage.add(body);

  // The dark patch he presses into the top of the dais.
  const shadow = contactShadow(0.5, 0.6);
  stage.add(shadow);

  const toy = buildBall(mat);
  toy.position.set(-0.36, 0.034 * scale * 1.6, 0.30);
  toy.scale.setScalar(scale * 1.6);
  stage.add(toy);

  // A warm lamp of his own, so he is never the one dim thing in the room. It
  // comes up as you approach and goes out again behind you.
  const lamp = new THREE.PointLight(0xffd9a8, 0, 3.6, 2);
  lamp.position.set(0.1, 1.35, 0.7);
  group.add(lamp);

  const affection = buildAffection(scale * 1.5);
  stage.add(affection.group);

  // One invisible ball is a far kinder target for a fingertip than forty
  // pieces of dog, and it is the only thing the room has to raycast.
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.56, 12, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(0, DAIS_HEIGHT + 0.46, 0.02);
  proxy.userData.tucker = true;
  group.add(proxy);

  const rig = dog.userData;
  const head = rig.head;
  const parts = head.userData;
  const restTorso = rig.torso.rotation.x;
  const restNeck = rig.neck.rotation.x;

  const anim = {
    since: 999,          // seconds since the last pat
    excite: 0,           // 0..1, how wound up he is
    combo: 0,            // pats in quick succession
    pats: 0,
    wag: 0,              // the wag's own phase
    breath: Math.random() * 6,
    blink: 2 + Math.random() * 3,
    blinking: -1,
    tiltSide: 1,
    tilt: 0,
    hop: 0,
    bow: -1,             // >= 0 while a play bow is running
    pant: 0,
    lookYaw: 0,
    lookPitch: 0,
    tagSwing: 0,
    tagVelocity: 0,
    lamp: 0
  };

  const toLocal = new THREE.Vector3();
  const worldHead = new THREE.Vector3();

  function pet() {
    anim.combo = anim.since < 2.6 ? anim.combo + 1 : 1;
    anim.since = 0;
    anim.pats += 1;
    anim.excite = Math.min(1, anim.excite + 0.62);
    anim.hop = 1;
    anim.tiltSide *= -1;
    anim.tagVelocity += 5.5;
    // Every fifth pat in a run he stops being polite about it.
    if (anim.combo % 5 === 0) anim.bow = 0;
    head.getWorldPosition(worldHead);
    affection.group.worldToLocal(worldHead);
    affection.burst(worldHead, 3 + Math.round(Math.random() * 2));
    return { pats: anim.pats, combo: anim.combo, bow: anim.bow === 0 };
  }

  function update(dt, time, { cameraPosition, calm = false, near = true } = {}) {
    anim.since += dt;
    anim.excite *= Math.exp(-dt / 2.3);
    affection.update(dt);

    const proximity = cameraPosition
      ? clamp(1 - (cameraPosition.distanceTo(group.position) - 2.2) / 5.5, 0, 1)
      : 0;
    anim.lamp = damp(anim.lamp, proximity, 3, dt);
    lamp.intensity = anim.lamp * 2.6 + anim.excite * 1.4;

    if (!near) return;

    const excite = anim.excite;

    /* -------------------------------------------------------------- the wag */
    // A dog at rest sweeps its tail slowly. A dog being petted does not sweep
    // it, it beats it, and the whole back end goes with it.
    const wagSpeed = calm ? 0.9 : 1.35 + excite * 12;
    anim.wag += wagSpeed * dt;
    const wagAmount = (calm ? 0.06 : 0.13) + excite * 0.62;
    const beat = Math.sin(anim.wag);
    rig.tail.rotation.y = rig.tail.userData.restSwing + beat * wagAmount;
    rig.tail.userData.joints.forEach((joint, i) => {
      // The whip lags a little further behind at every joint, which is what
      // makes a tail look like a tail and not a windscreen wiper.
      joint.rotation.z = Math.sin(anim.wag - i * 0.42) * wagAmount * (0.10 + i * 0.035);
      joint.rotation.x = TAIL_JOINTS[i] - excite * 0.05;
    });
    // Wagging that hard moves the dog attached to it.
    rig.hips.rotation.y = damp(rig.hips.rotation.y, beat * excite * 0.09, 12, dt);

    /* ------------------------------------------------------- breath and hop */
    anim.breath += dt * (0.85 + excite * 2.4);
    const breath = Math.sin(anim.breath) * (0.010 + excite * 0.012);
    rig.torso.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);

    anim.hop = damp(anim.hop, 0, 3.4, dt);
    const bounce = Math.sin(anim.hop * Math.PI * 2.4) * anim.hop * 0.035;
    body.position.y = bounce;

    /* ------------------------------------------------------------- play bow */
    if (anim.bow >= 0) {
      anim.bow += dt / 1.5;
      if (anim.bow >= 1) anim.bow = -1;
    }
    // Up fast, held, down slow — the shape of the real thing.
    const bow = anim.bow < 0 ? 0 : Math.sin(clamp(anim.bow, 0, 1) * Math.PI) ** 0.7;
    rig.torso.rotation.x = damp(rig.torso.rotation.x, restTorso - bow * 0.62, 9, dt);
    rig.torso.position.y = damp(rig.torso.position.y, 0.215 - bow * 0.055, 9, dt);
    rig.hips.position.y = damp(rig.hips.position.y, bow * 0.045, 9, dt);
    rig.neck.rotation.x = damp(rig.neck.rotation.x, restNeck + bow * 0.72, 9, dt);

    /* ------------------------------------------------- watching the visitor */
    // He tracks whoever is walking up the hall. Clamped, because a dog turns
    // its whole body past a point, and damped, because nothing about him
    // should snap.
    let wantYaw = 0;
    let wantPitch = -0.05;
    if (cameraPosition) {
      toLocal.copy(cameraPosition);
      rig.neck.worldToLocal(toLocal);
      toLocal.sub(head.position);
      wantYaw = clamp(Math.atan2(toLocal.x, toLocal.z), -0.85, 0.85);
      wantPitch = clamp(-Math.atan2(toLocal.y, Math.hypot(toLocal.x, toLocal.z)), -0.42, 0.30);
    }
    // The head cock. It comes on hard for a second or so after a pat, which is
    // the expression he is wearing in both photographs.
    const wantTilt = anim.since < 1.8 ? anim.tiltSide * 0.36 : (calm ? 0 : Math.sin(time * 0.21) * 0.05);
    anim.tilt = damp(anim.tilt, wantTilt, 4.5, dt);
    anim.lookYaw = damp(anim.lookYaw, wantYaw, 3.2, dt);
    anim.lookPitch = damp(anim.lookPitch, wantPitch, 3.2, dt);

    const alert = Math.sin(time * 1.7) * excite * 0.03;
    head.rotation.y = anim.lookYaw + alert;
    head.rotation.x = anim.lookPitch - bow * 0.35;
    head.rotation.z = anim.tilt;

    /* ------------------------------------------------------------ the ears */
    parts.ears.forEach((ear, i) => {
      const side = i === 0 ? 1 : -1;
      const rest = ear.userData.rest;
      // Ears swivel toward the sound of you and prick further when he is
      // pleased; one flicks on its own now and then.
      const swivel = anim.lookYaw * 0.34 * side;
      const flick = calm ? 0 : Math.sin(time * (2.1 + i * 0.7) + i * 2.2) * 0.02;
      const perk = excite * 0.14;
      ear.rotation.x = damp(ear.rotation.x, rest.x - perk + flick, 8, dt);
      ear.rotation.y = damp(ear.rotation.y, rest.y + swivel, 6, dt);
      ear.rotation.z = damp(ear.rotation.z, rest.z - side * perk * 0.5, 8, dt);
    });

    /* ---------------------------------------------------- panting, blinking */
    const wantPant = excite > 0.18 ? 1 : 0;
    anim.pant = damp(anim.pant, wantPant, 3.5, dt);
    const pantBeat = (Math.sin(time * 9.5) * 0.5 + 0.5) * anim.pant;
    parts.jaw.rotation.x = parts.jaw.userData.rest + pantBeat * 0.30;
    const tongue = parts.jaw.userData.tongue;
    tongue.scale.set(0.017, 0.006, 0.030 + anim.pant * 0.030 + pantBeat * 0.012);
    tongue.position.z = 0.052 + anim.pant * 0.026;
    tongue.visible = anim.pant > 0.03;

    anim.blink -= dt * (1 + excite);
    if (anim.blink <= 0 && anim.blinking < 0) {
      anim.blinking = 0;
      anim.blink = 2.6 + Math.random() * 4.5;
    }
    let lid = 0;
    if (anim.blinking >= 0) {
      anim.blinking += dt / 0.17;
      if (anim.blinking >= 1) anim.blinking = -1;
      else lid = Math.sin(anim.blinking * Math.PI);
    }
    // Squinting is most of what a happy dog's face does; the blink rides on
    // top of it.
    const squint = Math.max(lid, excite * 0.3 + pantBeat * 0.1);
    parts.eyes.forEach((eye) => {
      eye.userData.lid.rotation.x = 0.34 + squint * 1.15;
      eye.userData.lowerLid.rotation.x = Math.PI - 0.42 - squint * 0.45;
    });

    /* --------------------------------------------------------------- the tag */
    // A pendulum on the collar, pushed by every bounce and beat.
    const push = (bounce * 40 + beat * excite * 1.6) - anim.tagSwing * 9;
    anim.tagVelocity += (push - anim.tagVelocity * 1.4) * dt * 9;
    anim.tagSwing += anim.tagVelocity * dt;
    anim.tagSwing = clamp(anim.tagSwing, -0.7, 0.7);
    rig.collar.userData.hinge.rotation.x = anim.tagSwing * 0.5;
    rig.collar.userData.hinge.rotation.z = anim.tagSwing;
  }

  return {
    group,
    proxy,
    lamp,
    x,
    z,
    topY: DAIS_HEIGHT + STANDING_HEIGHT,
    daisTop: DAIS_HEIGHT,
    pet,
    update,
    get pats() { return anim.pats; },
    get excited() { return anim.excite; }
  };
}
