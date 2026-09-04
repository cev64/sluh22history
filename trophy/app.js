/* The hall itself: builds the room, hangs the exhibits along one rail, and
   turns pointers, wheels and keys into movement through it.

   There are two states and one transition between them. In `hall` you travel
   sideways past the pedestals. In `focus` one exhibit lifts off its plinth and
   turns under your finger while its record opens beside it. The camera is never
   driven directly — every frame it eases toward a target pose, which is what
   makes a flick, a tap and a keypress all feel like the same room. */

import * as THREE from "three";
import { buildHall } from "./accolades.js";
import { environmentTexture, glintTexture, setAnisotropy, waitForFonts } from "./textures.js";
import { buildExhibitObject, buildPedestal, initMaterials } from "./models.js";
import { LAYOUT, buildDust, buildRoom, buildTravellingLights, contactShadow, planLayout } from "./hall.js";

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

const state = {
  mode: "intro",
  rail: 0,
  railTarget: 0,
  velocity: 0,
  dragging: false,
  pointerMoved: 0,
  focusIndex: -1,
  focusYaw: 0,
  focusPitch: 0,
  focusZoom: 1,
  lift: 0,
  intro: 1,
  lastIndex: -1
};

const dom = {};
let hall;
let layout;
let scene;
let camera;
let renderer;
let lights;
let focusFill;
let dust;
let raycaster;
let exhibits = [];
let quality;
const pointer = new THREE.Vector2();
const camTarget = { position: new THREE.Vector3(), look: new THREE.Vector3() };
const lookAt = new THREE.Vector3();

/* ------------------------------------------------------------------- setup */

function detectQuality() {
  const mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 820;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const light = mobile && (cores <= 4 || memory <= 4);
  // Someone who has asked the system for less motion should not be handed a
  // room where every object sways and dust drifts through the light.
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    mobile,
    light,
    calm,
    pixelRatio: Math.min(devicePixelRatio || 1, light ? 1.5 : mobile ? 2 : 2),
    shadows: !light,
    dust: calm ? 0 : light ? 200 : 420,
    anisotropy: light ? 2 : 8
  };
}

async function boot() {
  cacheDom();

  if (!window.LEAGUE_DATA && typeof LEAGUE_DATA === "undefined") {
    fail("The league record didn't load.");
    return;
  }

  hall = buildHall(window.LEAGUE_DATA || LEAGUE_DATA);
  layout = planLayout(hall);

  const canvas = dom.canvas;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (error) {
    fail("This device can't open WebGL, so the hall can't be rendered.");
    return;
  }
  if (!renderer.getContext()) {
    fail("This device can't open WebGL, so the hall can't be rendered.");
    return;
  }

  quality = detectQuality();
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (quality.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setAnisotropy(Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy()));
  await waitForFonts();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d17);
  scene.fog = new THREE.Fog(0x070d17, 17, 62);

  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 220);
  camera.position.set(0, 2.1, LAYOUT.itemZ + 6.4);

  const envMap = environmentTexture(renderer);
  scene.environment = envMap;
  // The reflected room is deliberately dim so gold keeps its contrast; the
  // intensity here is what makes it actually light the marble.
  scene.environmentIntensity = 2.4;
  initMaterials({ envMap, quality });

  scene.add(new THREE.HemisphereLight(0x9fbdff, 0x2a1a10, 1.5));
  scene.add(new THREE.AmbientLight(0x4a5f80, 0.75));

  buildRoom(scene, hall, layout);
  buildExhibits();
  lights = buildTravellingLights(scene, quality);
  focusFill = new THREE.PointLight(0xfff0d6, 0, 9, 2);
  scene.add(focusFill);
  dust = buildDust(scene, quality.dust);

  raycaster = new THREE.Raycaster();

  buildHud();
  bindInput();
  applyDeepLink();

  addEventListener("resize", onResize);
  onResize();

  /* A console handle for tuning the room and for driving it from a headless
     browser. Nothing in the page reads it. `camTarget`/`lookAt` are the poses
     the camera is easing toward — useful because at a low frame rate the
     camera can be a long way behind them. */
  window.__hall = {
    scene, camera, renderer, exhibits, state, hall, layout,
    camTarget, lookAt, goTo, focus: focusExhibit, exitFocus
  };

  dom.stage.classList.add("ready");
  dom.loader.classList.add("done");
  renderer.setAnimationLoop(tick);
}

function fail(message) {
  dom.loader.classList.add("failed");
  dom.loaderNote.textContent = message;
  dom.enter.textContent = "Back to the Record Book";
  dom.enter.onclick = () => { location.href = "alltime.html"; };
}

function cacheDom() {
  const id = (name) => document.getElementById(name);
  Object.assign(dom, {
    stage: id("stage"),
    canvas: id("scene"),
    loader: id("loader"),
    loaderNote: id("loaderNote"),
    enter: id("enterHall"),
    hud: id("hud"),
    label: id("label"),
    labelWing: id("labelWing"),
    labelTitle: id("labelTitle"),
    labelSub: id("labelSub"),
    hint: id("hint"),
    wings: id("wings"),
    progress: id("progress"),
    prev: id("prevItem"),
    next: id("nextItem"),
    sheet: id("sheet"),
    sheetWing: id("sheetWing"),
    sheetTitle: id("sheetTitle"),
    sheetSub: id("sheetSub"),
    sheetBlurb: id("sheetBlurb"),
    sheetStats: id("sheetStats"),
    sheetLinks: id("sheetLinks"),
    sheetClose: id("sheetClose"),
    counter: id("counter"),
    summary: id("summary")
  });
}

/* --------------------------------------------------------------- exhibits */

function buildExhibits() {
  const glint = glintTexture();
  const glintMaterial = new THREE.SpriteMaterial({
    map: glint,
    color: 0xfff0cf,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    opacity: 0.9
  });

  exhibits = hall.rail.map((item, index) => {
    const stand = new THREE.Group();
    stand.position.set(layout.positions[index], 0, LAYOUT.itemZ);

    const pedestal = buildPedestalFor(item);
    const riser = new THREE.Group();
    riser.position.y = pedestal.userData.topY;
    const pivot = new THREE.Group();
    const spinner = new THREE.Group();

    const object = buildExhibitObject(item);
    spinner.add(object);
    pivot.add(spinner);
    riser.add(pivot);

    const shadow = contactShadow(0.95, 0.6);
    const glints = (object.userData.glints || []).map((offset) => {
      const sprite = new THREE.Sprite(glintMaterial.clone());
      sprite.position.copy(offset);
      sprite.scale.setScalar(0.34);
      sprite.visible = false;
      spinner.add(sprite);
      return sprite;
    });

    stand.add(shadow, pedestal, riser);
    scene.add(stand);

    stand.userData.exhibitIndex = index;
    return {
      item,
      index,
      stand,
      pedestal,
      riser,
      pivot,
      spinner,
      object,
      glints,
      x: layout.positions[index],
      focusHeight: object.userData.focusHeight ?? 0.6,
      focusRadius: object.userData.focusRadius ?? 1.1,
      spin: object.userData.spin || [],
      shadow,
      sway: object.userData.faceForward ? 0.07 : 0.2,
      idlePhase: Math.random() * Math.PI * 2
    };
  });
}

// A pillar is most of a plinth already, and a plaque has to land at reading
// height; the plinth under each exhibit is cut to suit what stands on it.
const PLINTH_HEIGHT = { cup: 1.12, pillar: 0.86, plaque: 0.92, toilet: 0.84 };

function buildPedestalFor(item) {
  return buildPedestal(item, { height: PLINTH_HEIGHT[item.kind] ?? LAYOUT.pedestalHeight });
}

/* ------------------------------------------------------------------ camera */

function railToX(t) {
  const clamped = clamp(t, 0, exhibits.length - 1);
  const low = Math.floor(clamped);
  const high = Math.min(exhibits.length - 1, low + 1);
  const fraction = clamped - low;
  return THREE.MathUtils.lerp(layout.positions[low], layout.positions[high], fraction);
}

/* Framing an inspected exhibit.

   The record sheet covers part of the viewport — a column down the right of a
   desktop, the lower half of a phone — so the exhibit is both fitted into the
   space that is left and aimed at the middle of it, rather than at the middle
   of the screen. Everything is worked out in metres at the viewing distance,
   so it holds at any zoom, aspect ratio or sheet size. */
function focusFraming(exhibit) {
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const radius = exhibit.focusRadius;

  const narrow = innerWidth <= 860;
  const sheetShare = narrow
    ? Math.min(0.56, (dom.sheet.offsetHeight || innerHeight * 0.5) / innerHeight)
    : Math.min(0.5, ((dom.sheet.offsetWidth || 372) + 32) / innerWidth);

  // Give the object the clear part of the frame, then push back far enough that
  // it fits inside that part rather than inside the whole viewport.
  const clear = Math.max(0.35, 1 - sheetShare);
  const fitHeight = radius / Math.tan(vertical / 2) / (narrow ? clear : 1);
  const fitWidth = radius / Math.tan(horizontal / 2) / (narrow ? 1 : clear);
  const distance = Math.max(fitHeight, fitWidth) * 1.24 * state.focusZoom;

  const visibleHeight = 2 * distance * Math.tan(vertical / 2);
  const visibleWidth = visibleHeight * camera.aspect;

  return {
    distance,
    // Move the camera the other way from the panel, so the exhibit lands in the
    // clear half.
    offsetX: narrow ? 0 : sheetShare * visibleWidth * 0.5,
    offsetY: narrow ? -sheetShare * visibleHeight * 0.5 : 0
  };
}

function updateCameraTarget(dt) {
  if (state.mode === "focus" && exhibits[state.focusIndex]) {
    const exhibit = exhibits[state.focusIndex];
    const centerY = exhibit.pedestal.userData.topY + state.lift + exhibit.focusHeight;
    const { distance, offsetX, offsetY } = focusFraming(exhibit);
    camTarget.position.set(exhibit.x + offsetX, centerY + 0.16 - offsetY, LAYOUT.itemZ + distance);
    camTarget.look.set(exhibit.x + offsetX, centerY + offsetY, LAYOUT.itemZ);
  } else {
    const x = railToX(state.rail);
    // The camera leans into a flick, which reads as momentum without moving
    // the exhibits themselves.
    const lean = clamp(state.velocity * 0.14, -0.7, 0.7);
    const ease = state.intro * state.intro;
    camTarget.position.set(x + lean * 0.55, 2.34 + ease * 2.2, LAYOUT.itemZ + 7.2 + ease * 6.6);
    camTarget.look.set(x + lean * 1.6, 1.62 + ease * 0.25, LAYOUT.itemZ);
  }

  const speed = state.mode === "focus" ? 5.4 : 4.2;
  camera.position.x = damp(camera.position.x, camTarget.position.x, speed, dt);
  camera.position.y = damp(camera.position.y, camTarget.position.y, speed, dt);
  camera.position.z = damp(camera.position.z, camTarget.position.z, speed, dt);
  lookAt.x = damp(lookAt.x, camTarget.look.x, speed, dt);
  lookAt.y = damp(lookAt.y, camTarget.look.y, speed, dt);
  lookAt.z = damp(lookAt.z, camTarget.look.z, speed, dt);
  camera.lookAt(lookAt);
}

/* -------------------------------------------------------------------- loop */

let previous = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  const time = now / 1000;

  if (state.mode !== "intro") {
    state.intro = damp(state.intro, 0, 2.4, dt);
  }

  if (state.mode === "hall") {
    if (!state.dragging) {
      state.rail = damp(state.rail, state.railTarget, 6.5, dt);
      state.velocity = damp(state.velocity, 0, 6, dt);
    }
  }

  state.lift = damp(state.lift, state.mode === "focus" ? 0.42 : 0, 5, dt);

  updateExhibits(dt, time);
  updateCameraTarget(dt);

  const current = nearestIndex();
  if (current !== state.lastIndex) {
    state.lastIndex = current;
    onCurrentChanged(current);
  }

  const active = exhibits[state.mode === "focus" ? state.focusIndex : current];
  if (active) lights.update(active.x, active.item.accent);

  // The fill rides just off the camera's shoulder, so it lights whatever face
  // the viewer has turned toward themselves. Gold can take a lot of it; the
  // painted shields and engraved plates clip long before it does, so this is
  // set by what the diffuse surfaces will take.
  focusFill.intensity = damp(focusFill.intensity, state.mode === "focus" ? 20 : 0, 4, dt);
  focusFill.position.set(
    camera.position.x - 0.9,
    camera.position.y + 0.5,
    camera.position.z - 0.4
  );
  dust.update(dt, camera.position.x);

  renderer.render(scene, camera);
}

function updateExhibits(dt, time) {
  const centre = state.mode === "focus" ? state.focusIndex : state.rail;

  exhibits.forEach((exhibit, index) => {
    const distance = Math.abs(index - centre);
    const near = distance < 4.5;
    // Anything more than a few pedestals away is behind the fog anyway.
    exhibit.stand.visible = distance < 9;
    if (!exhibit.stand.visible) return;

    const focused = state.mode === "focus" && index === state.focusIndex;

    if (focused) {
      exhibit.spinner.rotation.y = damp(exhibit.spinner.rotation.y, state.focusYaw, 9, dt);
      exhibit.pivot.rotation.x = damp(exhibit.pivot.rotation.x, state.focusPitch, 9, dt);
      exhibit.riser.position.y = damp(
        exhibit.riser.position.y,
        exhibit.pedestal.userData.topY + state.lift,
        5,
        dt
      );
    } else {
      // Idle: a slow quarter-turn sway, so the room is never still but nothing
      // ever spins away from you.
      const sway = quality.calm ? 0 : Math.sin(time * 0.32 + exhibit.idlePhase) * exhibit.sway;
      exhibit.spinner.rotation.y = damp(exhibit.spinner.rotation.y, sway, 2.2, dt);
      exhibit.pivot.rotation.x = damp(exhibit.pivot.rotation.x, 0, 4, dt);
      exhibit.riser.position.y = damp(exhibit.riser.position.y, exhibit.pedestal.userData.topY, 4, dt);
    }

    const lifted = focused ? state.lift : 0;
    exhibit.shadow.material.opacity = 0.6 - lifted * 0.5;
    exhibit.shadow.scale.setScalar(1 + lifted * 0.5);

    exhibit.spin.forEach(({ node, speed }) => {
      if (!quality.calm) node.rotation.y += speed * dt * (focused ? 0.35 : 1);
    });

    exhibit.glints.forEach((sprite, i) => {
      sprite.visible = near;
      if (!near) return;
      const pulse = quality.calm ? 0.7 : 0.5 + 0.5 * Math.sin(time * (1.1 + i * 0.37) + exhibit.idlePhase * 3);
      const proximity = clamp(1 - distance / 4.5, 0, 1);
      sprite.material.opacity = pulse * proximity * (focused ? 0.95 : 0.55);
      sprite.scale.setScalar(0.22 + pulse * 0.2);
    });
  });
}

function nearestIndex() {
  return clamp(Math.round(state.mode === "focus" ? state.focusIndex : state.rail), 0, exhibits.length - 1);
}

/* -------------------------------------------------------------------- HUD */

function buildHud() {
  dom.wings.innerHTML = hall.wings.map((wing) => `
    <button class="wing" data-wing="${wing.id}" style="--accent:${wing.accent}">
      <span class="wing-name">${wing.name}</span>
      <span class="wing-count">${wing.count}</span>
    </button>
  `).join("");

  dom.progress.innerHTML = hall.wings.map((wing) => `
    <span class="progress-wing" data-wing="${wing.id}" style="--accent:${wing.accent}; flex-grow:${wing.count}"></span>
  `).join("");

  const { summary } = hall;
  dom.summary.textContent =
    `${summary.titles} titles · ${summary.managers} managers · ${summary.seasons} seasons on record · ${summary.games} games played`;

  dom.wings.addEventListener("click", (event) => {
    const button = event.target.closest("[data-wing]");
    if (!button) return;
    const wing = hall.wings.find((entry) => entry.id === button.dataset.wing);
    if (wing) goTo(wing.start, { exitFocus: true });
  });

  dom.prev.addEventListener("click", () => step(-1));
  dom.next.addEventListener("click", () => step(1));
  dom.sheet.querySelectorAll("[data-sheet-step]").forEach((button) => {
    button.addEventListener("click", () => step(Number(button.dataset.sheetStep)));
  });

  const inspect = () => { if (state.mode === "hall") focusExhibit(nearestIndex()); };
  dom.label.addEventListener("click", inspect);
  dom.label.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(); }
  });
  dom.sheetClose.addEventListener("click", exitFocus);
  dom.enter.addEventListener("click", enterHall);
}

function onCurrentChanged(index) {
  const exhibit = exhibits[index];
  if (!exhibit) return;
  const { item } = exhibit;

  dom.labelWing.textContent = item.wingName;
  dom.labelWing.style.color = item.accent;
  dom.labelTitle.textContent = item.kind === "plaque" ? item.title : item.title;
  dom.labelSub.textContent = item.kind === "plaque"
    ? `${item.bigValue} · ${item.subtitle}`
    : `${item.subtitle}${item.owner && item.owner !== item.subtitle ? ` · ${item.owner}` : ""}`;
  dom.counter.textContent = `${item.itemIndex + 1} / ${hall.wings[item.wingIndex].count}`;

  dom.wings.querySelectorAll(".wing").forEach((button) => {
    const active = button.dataset.wing === item.wing;
    button.classList.toggle("active", active);
    // On a phone the pill row scrolls; walking into a wing should bring its
    // pill into view rather than leaving the highlight off-screen.
    if (active && button.dataset.wing !== dom.wings.dataset.shown) {
      dom.wings.dataset.shown = button.dataset.wing;
      button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  });
  dom.progress.querySelectorAll(".progress-wing").forEach((bar) => {
    bar.classList.toggle("active", bar.dataset.wing === item.wing);
  });
  dom.stage.style.setProperty("--accent", item.accent);

  if (state.mode === "focus" && index === state.focusIndex) fillSheet(item);
  if (history.replaceState) history.replaceState(null, "", `#${item.id}`);
}

function fillSheet(item) {
  dom.sheetWing.textContent = item.wingName;
  dom.sheetWing.style.color = item.accent;
  dom.sheetTitle.textContent = item.kind === "plaque" ? item.bigValue : item.title;
  dom.sheetSub.innerHTML = item.kind === "plaque"
    ? `<strong>${item.title}</strong> · ${item.subtitle}`
    : `<strong>${item.subtitle}</strong>${item.owner && item.owner !== item.subtitle ? ` · ${item.owner}` : ""}`;
  dom.sheetBlurb.textContent = item.blurb || "";

  dom.sheetStats.innerHTML = (item.stats || []).map((stat) => `
    <div class="stat">
      <dt>${stat.label}</dt>
      <dd>${stat.value}</dd>
    </div>
  `).join("");

  dom.sheetLinks.innerHTML = (item.links || []).map((link) => `
    <a class="sheet-link" href="${link.href}">${link.label} <span aria-hidden="true">→</span></a>
  `).join("");
}

/* -------------------------------------------------------------- navigation */

function goTo(index, { exitFocus: leave = false } = {}) {
  if (leave && state.mode === "focus") exitFocus({ silent: true });
  state.railTarget = clamp(index, 0, exhibits.length - 1);
  state.velocity = 0;
  if (state.mode === "focus") {
    state.focusIndex = state.railTarget;
    state.rail = state.railTarget;
    resetFocusPose();
    fillSheet(exhibits[state.focusIndex].item);
  }
}

function step(direction) {
  if (state.mode === "focus") {
    const next = clamp(state.focusIndex + direction, 0, exhibits.length - 1);
    if (next === state.focusIndex) return;
    state.focusIndex = next;
    state.rail = next;
    state.railTarget = next;
    resetFocusPose();
    fillSheet(exhibits[next].item);
    return;
  }
  goTo(Math.round(state.railTarget) + direction);
}

function resetFocusPose() {
  state.focusYaw = 0;
  state.focusPitch = 0;
  state.focusZoom = 1;
}

function focusExhibit(index) {
  if (state.mode === "intro") return;
  state.mode = "focus";
  state.focusIndex = clamp(index, 0, exhibits.length - 1);
  state.rail = state.focusIndex;
  state.railTarget = state.focusIndex;
  state.velocity = 0;
  resetFocusPose();
  fillSheet(exhibits[state.focusIndex].item);
  dom.stage.classList.add("focused");
  dom.sheet.setAttribute("aria-hidden", "false");
}

function exitFocus() {
  if (state.mode !== "focus") return;
  state.railTarget = state.focusIndex;
  state.rail = state.focusIndex;
  state.mode = "hall";
  state.focusIndex = -1;
  dom.stage.classList.remove("focused");
  dom.sheet.setAttribute("aria-hidden", "true");
}

function enterHall() {
  if (state.mode !== "intro") return;
  state.mode = "hall";
  dom.stage.classList.add("entered");
  dom.loader.classList.add("gone");
  setTimeout(() => dom.hint.classList.add("show"), 900);
  setTimeout(() => dom.hint.classList.remove("show"), 6500);
}

function applyDeepLink() {
  const target = location.hash.replace("#", "");
  if (!target) return;
  const wing = hall.wings.find((entry) => entry.id === target);
  const item = hall.rail.find((entry) => entry.id === target);
  const index = wing ? wing.start : item ? item.railIndex : -1;
  if (index < 0) return;
  state.rail = index;
  state.railTarget = index;
  state.lastIndex = -1;
}

/* ------------------------------------------------------------------ input */

function bindInput() {
  const canvas = dom.canvas;
  const active = new Map();
  let startRail = 0;
  let startX = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  let pinchStart = 0;
  let zoomStart = 1;
  let lastX = 0;
  let lastTime = 0;
  let pinching = false;

  // Dragging the full width of the screen walks about four pedestals, on a
  // phone and on a desktop alike.
  const unitsPerPixel = () => 4.2 / Math.max(360, innerWidth);

  canvas.addEventListener("pointerdown", (event) => {
    if (state.mode === "intro") return;
    canvas.setPointerCapture(event.pointerId);
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (active.size === 2) {
      const [a, b] = [...active.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      zoomStart = state.focusZoom;
      // A pinch is not a drag, and must not land as a tap when the fingers lift.
      pinching = true;
      state.dragging = false;
      return;
    }

    if (active.size === 1) pinching = false;
    state.dragging = true;
    state.pointerMoved = 0;
    startRail = state.rail;
    startX = lastX = event.clientX;
    startY = event.clientY;
    startYaw = state.focusYaw;
    startPitch = state.focusPitch;
    lastTime = performance.now();
    state.velocity = 0;
    dom.hint.classList.remove("show");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (active.size === 2) {
      const [a, b] = [...active.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0 && state.mode === "focus") {
        state.focusZoom = clamp(zoomStart * (pinchStart / spread), 0.62, 2.2);
      }
      return;
    }
    if (!state.dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    state.pointerMoved = Math.max(state.pointerMoved, Math.hypot(dx, dy));

    if (state.mode === "focus") {
      state.focusYaw = startYaw - dx * 0.0085;
      state.focusPitch = clamp(startPitch + dy * 0.0055, -0.55, 0.55);
      return;
    }

    state.rail = clamp(startRail - dx * unitsPerPixel(), -0.4, exhibits.length - 0.6);
    const now = performance.now();
    const elapsed = Math.max(8, now - lastTime);
    state.velocity = -(event.clientX - lastX) * unitsPerPixel() * (1000 / elapsed);
    lastX = event.clientX;
    lastTime = now;
  });

  const release = (event) => {
    if (!active.has(event.pointerId)) return;
    active.delete(event.pointerId);
    if (active.size > 0) return;
    if (pinching) {
      pinching = false;
      pinchStart = 0;
      return;
    }
    if (!state.dragging) return;
    state.dragging = false;

    if (state.pointerMoved < 9) {
      handleTap(event);
      return;
    }
    if (state.mode === "hall") {
      // Carry the flick a little way, then let the pedestals pull the camera in.
      const projected = state.rail + clamp(state.velocity * 0.28, -3.2, 3.2);
      state.railTarget = clamp(Math.round(projected), 0, exhibits.length - 1);
    }
  };

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  // Trackpads report continuous deltas and mice report notches; accumulating
  // into one budget and spending it a pedestal at a time makes both feel the same.
  let wheelBudget = 0;
  canvas.addEventListener("wheel", (event) => {
    if (state.mode === "intro") return;
    event.preventDefault();
    if (state.mode === "focus") {
      state.focusZoom = clamp(state.focusZoom + event.deltaY * 0.0016, 0.62, 2.2);
      return;
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    wheelBudget += delta;
    const steps = Math.trunc(wheelBudget / 55);
    if (!steps) return;
    wheelBudget -= steps * 55;
    state.railTarget = clamp(state.railTarget + steps, 0, exhibits.length - 1);
  }, { passive: false });

  addEventListener("keydown", (event) => {
    if (state.mode === "intro") {
      if (event.key === "Enter" || event.key === " ") { enterHall(); event.preventDefault(); }
      return;
    }
    switch (event.key) {
      case "ArrowRight": case "d": step(1); break;
      case "ArrowLeft": case "a": step(-1); break;
      case "ArrowUp": case "Enter":
        if (state.mode === "hall") focusExhibit(nearestIndex());
        break;
      case "ArrowDown": case "Escape": exitFocus(); break;
      case "Home": goTo(0, { exitFocus: true }); break;
      case "End": goTo(exhibits.length - 1, { exitFocus: true }); break;
      default: return;
    }
    event.preventDefault();
  });

  addEventListener("hashchange", () => {
    applyDeepLink();
  });
}

function handleTap(event) {
  const rect = dom.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const candidates = exhibits
    .filter((exhibit) => exhibit.stand.visible)
    .map((exhibit) => exhibit.stand);
  const hits = raycaster.intersectObjects(candidates, true);

  if (!hits.length) {
    if (state.mode === "focus") exitFocus();
    return;
  }

  let node = hits[0].object;
  while (node && node.userData.exhibitIndex === undefined) node = node.parent;
  if (!node) return;

  const index = node.userData.exhibitIndex;
  if (state.mode === "focus") {
    if (index === state.focusIndex) exitFocus();
    else { state.focusIndex = index; state.rail = index; state.railTarget = index; resetFocusPose(); fillSheet(exhibits[index].item); }
    return;
  }
  focusExhibit(index);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.pixelRatio));
}

boot();
