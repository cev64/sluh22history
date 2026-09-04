/* The hall itself: builds the room, hangs the exhibits along one rail, and
   turns pointers, wheels and keys into movement through it.

   There are two states and one transition between them. In `hall` you travel
   sideways past the pedestals. In `focus` one exhibit lifts off its plinth and
   turns under your finger while its record opens beside it. The camera is never
   driven directly — every frame it eases toward a target pose, which is what
   makes a flick, a tap and a keypress all feel like the same room. */

import * as THREE from "three";
import { buildHall } from "./accolades.js";
import { environmentTexture, glintTexture, loadTeamLogos, setAnisotropy, waitForFonts } from "./textures.js";
import { buildExhibitObject, buildPedestal, initMaterials } from "./models.js";
import { LAYOUT, buildDust, buildRoom, buildTravellingLights, contactShadow, planLayout } from "./hall.js";
import { buildLockerRoom, buildLockerWall } from "./locker.js";
import { buildTucker } from "./tucker.js";

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
  lastIndex: -1,
  // The team locker: which manager's wall is open, which piece of it is being
  // inspected, and where the viewer has panned and zoomed the wall itself.
  lockerId: null,
  lockerIndex: -1,
  lockerPanX: 0,
  lockerPanY: 0,
  lockerWallZoom: 1,
  // The mascot sitting between the Champions and the Hall of Fame. `petFocus`
  // is whether the viewer has crouched down to him; `pet` is how far the
  // camera has actually got, so leaving him is a glide rather than a cut.
  petFocus: false,
  pet: 0
};

const IN_LOCKER = (mode) => mode === "locker" || mode === "lockerFocus";

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
let hallGroup;
let hallFog;
let lockerRoom;
let lockerWall = null;
let tucker = null;
// Where he sits on the rail: halfway between the last champion and the first
// manager, which is the gap the arch stands in.
let tuckerRail = -1;
let exhibits = [];
let quality;
const pointer = new THREE.Vector2();
// Where the mouse is, kept whether or not anything is being dragged, so the
// cursor can tell you the dog is a thing you may touch.
const hoverPointer = new THREE.Vector2();
let hovering = false;
let overTucker = false;
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
  // Both gates for the same reason: every texture here is painted once, on a
  // canvas, synchronously. A font or a logo that arrives afterwards is too late
  // to appear in one.
  await Promise.all([waitForFonts(), loadTeamLogos()]);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d17);
  hallFog = new THREE.Fog(0x070d17, 17, 62);
  scene.fog = hallFog;

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

  hallGroup = new THREE.Group();
  scene.add(hallGroup);
  buildRoom(hallGroup, hall, layout);
  buildExhibits();
  buildMascot();
  lockerRoom = buildLockerRoom(scene);
  lights = buildTravellingLights(scene, quality);
  focusFill = new THREE.PointLight(0xfff0d6, 0, 9, 2);
  scene.add(focusFill);
  dust = buildDust(scene, quality.dust);

  raycaster = new THREE.Raycaster();

  buildHud();
  bindInput();
  if (dom.petCount) {
    const known = loadPats();
    dom.petCount.textContent = known === 1 ? "1 pat" : `${known.toLocaleString()} pats`;
  }
  applyDeepLink();

  addEventListener("resize", onResize);
  onResize();

  /* A console handle for tuning the room and for driving it from a headless
     browser. Nothing in the page reads it. `camTarget`/`lookAt` are the poses
     the camera is easing toward — useful because at a low frame rate the
     camera can be a long way behind them. */
  window.__hall = {
    scene, camera, renderer, exhibits, state, hall, layout,
    camTarget, lookAt, goTo, focus: focusExhibit, exitFocus,
    openLocker, closeLocker, focusLockerItem, exitLockerFocus,
    lockerWall: () => lockerWall,
    lockerRoom: () => lockerRoom,
    tucker: () => tucker,
    pet: petTucker
  };

  dom.stage.classList.add("ready");
  renderer.setAnimationLoop(tick);

  // Nothing to press: the splash covered the build, and the camera's dolly-in
  // plays underneath it as it fades.
  enterHall();
}

function fail(message) {
  dom.loader.classList.add("failed");
  dom.loaderNote.textContent = message;
}

function cacheDom() {
  const id = (name) => document.getElementById(name);
  Object.assign(dom, {
    stage: id("stage"),
    canvas: id("scene"),
    loader: id("loader"),
    loaderNote: id("loaderNote"),
    loaderExit: id("loaderExit"),
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
    summary: id("summary"),
    wipe: id("wipe"),
    wipeCrest: id("wipeCrest"),
    wipeLabel: id("wipeLabel"),
    lockerBar: id("lockerBar"),
    lockerCrest: id("lockerCrest"),
    lockerTeam: id("lockerTeam"),
    lockerOwner: id("lockerOwner"),
    lockerSummary: id("lockerSummary"),
    lockerBack: id("lockerBack"),
    lockerBackLabel: id("lockerBackLabel"),
    lockerHint: id("lockerHint"),
    petCard: id("petCard"),
    petLine: id("petLine"),
    petCount: id("petCount"),
    petButton: id("petButton"),
    petExit: id("petExit")
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

    /* Measure what was actually built rather than trusting a hand-set radius.
       The stars over a hall-of-fame shield and the handles on a cup both sit
       outside the figure they belong to, and framing guessed at them badly.
       Half-width is the diagonal of the footprint, not the width face-on,
       because the exhibit turns under the viewer's finger and has to stay in
       frame all the way round. */
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const middle = bounds.getCenter(new THREE.Vector3());
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
    hallGroup.add(stand);

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
      focusHeight: middle.y,
      focusHalfWidth: Math.hypot(size.x, size.z) / 2,
      focusHalfHeight: size.y / 2,
      spin: object.userData.spin || [],
      shadow,
      sway: object.userData.faceForward ? 0.07 : 0.2,
      idlePhase: Math.random() * Math.PI * 2
    };
  });
}

/* ------------------------------------------------------------------ mascot */

/* Tucker sits in the gap between the Champions and the Hall of Fame — the one
   place in the hall wide enough for something that is not on a pedestal, and
   the threshold the arch already marks.

   He is not an exhibit: he has no rail index of his own, no record sheet and
   no place in the wing counts. What he has is a fractional spot on the rail
   between the two wings, which is all the camera needs to be able to stop at
   him, and a hit sphere, which is all a fingertip needs to be able to reach
   him. */
function buildMascot() {
  const managers = hall.wings.findIndex((wing) => wing.id === "hall");
  if (managers < 1) return;
  // The last champion and the first manager, with the arch between them.
  const before = hall.wings[managers].start - 1;
  if (before < 0 || before + 1 >= exhibits.length) return;

  tuckerRail = before + 0.5;
  tucker = buildTucker({
    x: railToX(tuckerRail),
    z: LAYOUT.itemZ + 0.95,
    quality
  });
  hallGroup.add(tucker.group);
}

/* Petting him. The camera crouches to his level, he reacts, and the HUD swaps
   the exhibit label for his card. Petting him again while already down there
   just pets him again — which is the point of him. */
function petTucker() {
  if (!tucker || state.mode === "intro" || IN_LOCKER(state.mode)) return;
  if (state.mode === "focus") exitFocus();
  state.petFocus = true;
  state.rail = tuckerRail;
  state.railTarget = tuckerRail;
  state.velocity = 0;
  dom.stage.classList.add("petting");
  dom.hint.classList.remove("show");
  if (history.replaceState) history.replaceState(null, "", "#tucker");

  const reaction = tucker.pet();
  storePats();
  showPetCard(reaction);
}

function leavePet() {
  if (!state.petFocus) return;
  state.petFocus = false;
  dom.stage.classList.remove("petting");
  state.railTarget = clamp(Math.round(tuckerRail), 0, exhibits.length - 1);
  state.lastIndex = -1;
}

/* The pat count is his, not the browser's, so it survives a reload the way a
   scoreboard would. A browser that refuses storage simply forgets him. */
const PAT_KEY = "sluh-tucker-pats";
let pats = 0;

function loadPats() {
  try {
    pats = Math.max(0, parseInt(localStorage.getItem(PAT_KEY), 10) || 0);
  } catch (error) {
    pats = 0;
  }
  return pats;
}

function storePats() {
  pats = loadPats() + 1;
  try {
    localStorage.setItem(PAT_KEY, String(pats));
  } catch (error) {
    // Private browsing. He still enjoyed it.
  }
}

const PET_LINES = [
  "Tucker leans into it.",
  "Tail going like a metronome.",
  "He tips his head at you.",
  "Ears up. Fully committed.",
  "He would like this to continue.",
  "Good boy. Certified.",
  "He has decided you are his favourite."
];

function showPetCard(reaction) {
  if (!dom.petLine) return;
  const line = reaction && reaction.bow
    ? "Play bow. He wants the ball."
    : PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
  dom.petLine.textContent = line;
  dom.petCount.textContent = pats === 1 ? "1 pat" : `${pats.toLocaleString()} pats`;
  dom.petCard.classList.remove("pop");
  // Restart the animation rather than letting a second pat land silently.
  void dom.petCard.offsetWidth;
  dom.petCard.classList.add("pop");
}

// A pillar is most of a plinth already, and a plaque has to land at reading
// height; the plinth under each exhibit is cut to suit what stands on it.
const PLINTH_HEIGHT = { cup: 0.72, pillar: 0.86, plaque: 0.92, toilet: 0.84 };

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

   The HUD does not leave the exhibit the whole screen: the record sheet takes a
   column down the right of a desktop or the lower part of a phone, and the back
   button and wordmark sit across the top. So the framing works out the
   rectangle of screen that is actually free, pushes the camera back until the
   object fits inside that rectangle rather than inside the viewport, and aims
   so it lands in the middle of it.

   The camera stays level — it shifts rather than tilts — because tilting to
   place an object skews it, and a trophy you are turning in your hands should
   not lean as you turn it. */
function focusFraming(exhibit) {
  const narrow = innerWidth <= 860;
  const pad = narrow ? 14 : 24;

  // The top chrome, and whatever the sheet is currently covering.
  const topChrome = narrow ? 78 : 84;
  const sheetHeight = dom.sheet.offsetHeight || innerHeight * 0.46;
  const sheetWidth = dom.sheet.offsetWidth || 372;

  const band = {
    left: pad,
    right: narrow ? innerWidth - pad : innerWidth - sheetWidth - 32 - pad,
    top: topChrome + pad,
    bottom: narrow ? innerHeight - sheetHeight - pad : innerHeight - pad
  };
  const bandWidth = Math.max(140, band.right - band.left);
  const bandHeight = Math.max(140, band.bottom - band.top);

  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);

  /* Fit into the free rectangle, not the viewport: the object subtends only
     that fraction of the frame, in each direction independently.

     Turning the exhibit sweeps a cylinder of radius `reach`, and the near
     face of that cylinder is what the perspective makes largest — a trophy
     fitted at its centre plane still overruns the frame by the depth of its
     own handles. So each fit is measured to the near face and the reach is
     added back. */
  const reach = exhibit.focusHalfWidth;
  const fitHeight = exhibit.focusHalfHeight / (Math.tan(vertical / 2) * (bandHeight / innerHeight)) + reach;
  const fitWidth = reach / (Math.tan(horizontal / 2) * (bandWidth / innerWidth)) + reach;
  const distance = Math.max(fitHeight, fitWidth) * 1.06 * state.focusZoom;

  const visibleHeight = 2 * distance * Math.tan(vertical / 2);
  const visibleWidth = visibleHeight * camera.aspect;

  // Shift the level camera so the object projects onto the middle of the band.
  return {
    distance,
    offsetX: (0.5 - (band.left + band.right) / 2 / innerWidth) * visibleWidth,
    offsetY: ((band.top + band.bottom) / 2 / innerHeight - 0.5) * visibleHeight
  };
}

/* Framing the locker wall. Same near-face reasoning as an inspected exhibit,
   but the thing being fitted is the whole wall, and there is no record sheet
   covering the screen — only the top bar and the strip of HUD along the
   bottom. Whatever will not fit is reachable by dragging. */
function wallFraming() {
  if (!lockerWall) return { distance: 12, offsetX: 0, offsetY: 0 };
  const pad = innerWidth <= 860 ? 12 : 24;
  const band = {
    width: Math.max(160, innerWidth - pad * 2),
    height: Math.max(160, innerHeight - (innerWidth <= 860 ? 210 : 216))
  };
  const centreY = (innerWidth <= 860 ? 84 : 92) + band.height / 2;

  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  // A wall does not turn, so the only depth in front of its centre is its own
  // thickness — using the width here pushed the camera into the next room.
  const reach = lockerWall.size.z / 2;
  const fitHeight = lockerWall.size.y / 2 / (Math.tan(vertical / 2) * (band.height / innerHeight)) + reach;
  const fitWidth = lockerWall.size.x / 2 / (Math.tan(horizontal / 2) * (band.width / innerWidth)) + reach;
  const distance = Math.max(fitHeight, fitWidth) * 1.05 / state.lockerWallZoom;

  const visibleHeight = 2 * distance * Math.tan(vertical / 2);
  return {
    distance,
    offsetX: 0,
    offsetY: (centreY / innerHeight - 0.5) * visibleHeight
  };
}

/* Crouching to him. The hall pose is worked out as usual and then bent toward
   his eye level by however far into petting we are, so approaching him and
   leaving him are the same glide run in opposite directions — and a drag part
   way through hands the camera straight back to the rail. */
const petPose = { position: new THREE.Vector3(), look: new THREE.Vector3() };

function applyPetFraming() {
  if (!tucker || state.pet < 0.001) return;
  // On a phone his card takes the bottom of the screen, so he is lifted into
  // the half that is left rather than sitting behind it.
  const narrow = innerWidth <= 860;
  if (narrow) {
    petPose.position.set(tucker.x + 0.06, tucker.daisTop + 1.02, tucker.z + 2.5);
    petPose.look.set(tucker.x, tucker.daisTop + 0.66, tucker.z);
  } else {
    petPose.position.set(tucker.x + 0.34, tucker.daisTop + 0.80, tucker.z + 1.95);
    petPose.look.set(tucker.x + 0.04, tucker.daisTop + 0.38, tucker.z);
  }
  camTarget.position.lerp(petPose.position, state.pet);
  camTarget.look.lerp(petPose.look, state.pet);
}

function updateCameraTarget(dt) {
  if (state.mode === "lockerFocus" && lockerWall && lockerWall.items[state.lockerIndex]) {
    const holder = lockerWall.items[state.lockerIndex];
    const frame = holder.userData.frame;
    const present = holder.userData.present;
    const framing = focusFraming({
      focusHalfWidth: frame.halfWidth,
      focusHalfHeight: frame.halfHeight
    });
    // A pennant is a small thing. Fitting it to the frame the way a trophy is
    // fitted blows it up until its neighbours crowd in around it, so nothing
    // comes closer than arm's length.
    const distance = Math.max(framing.distance, 2.4 * state.focusZoom);
    const { offsetX, offsetY } = framing;
    const shownY = frame.centre.y + present.lift;
    const shownZ = frame.centre.z + present.push;
    camTarget.position.set(frame.centre.x + offsetX, shownY + offsetY, shownZ + distance);
    camTarget.look.set(frame.centre.x + offsetX, shownY + offsetY, shownZ);
  } else if (state.mode === "locker" && lockerWall) {
    // The wall's centre is measured in world space, origin included, so it is
    // used as it comes.
    const { distance, offsetX, offsetY } = wallFraming();
    const x = lockerWall.centre.x + state.lockerPanX + offsetX;
    const y = lockerWall.centre.y + state.lockerPanY + offsetY;
    camTarget.position.set(x, y, lockerWall.centre.z + distance);
    camTarget.look.set(x, y, lockerWall.centre.z);
  } else if (state.mode === "focus" && exhibits[state.focusIndex]) {
    const exhibit = exhibits[state.focusIndex];
    const centerY = exhibit.pedestal.userData.topY + state.lift + exhibit.focusHeight;
    const { distance, offsetX, offsetY } = focusFraming(exhibit);
    const axisY = centerY + offsetY;
    camTarget.position.set(exhibit.x + offsetX, axisY, LAYOUT.itemZ + distance);
    camTarget.look.set(exhibit.x + offsetX, axisY, LAYOUT.itemZ);
  } else {
    const x = railToX(state.rail);
    // The camera leans into a flick, which reads as momentum without moving
    // the exhibits themselves.
    const lean = clamp(state.velocity * 0.14, -0.7, 0.7);
    const ease = state.intro * state.intro;
    camTarget.position.set(x + lean * 0.55, 2.52 + ease * 2.2, LAYOUT.itemZ + 6.7 + ease * 6.6);
    camTarget.look.set(x + lean * 1.6, 1.80 + ease * 0.25, LAYOUT.itemZ);
    applyPetFraming();
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

  // Damped here rather than below the locker branch so that stepping through a
  // door while crouched at him does not leave the camera half way to him when
  // you come back out.
  state.pet = damp(state.pet, state.petFocus && state.mode === "hall" ? 1 : 0, 4.2, dt);

  if (IN_LOCKER(state.mode)) {
    updateLocker(dt, time);
    updateCameraTarget(dt);
    focusFill.intensity = damp(focusFill.intensity, state.mode === "lockerFocus" ? 10 : 0, 4, dt);
    focusFill.position.set(camera.position.x - 0.6, camera.position.y + 0.4, camera.position.z - 0.3);
    dust.update(dt, camera.position.x);
    renderer.render(scene, camera);
    return;
  }

  state.lift = damp(state.lift, state.mode === "focus" ? 0.42 : 0, 5, dt);

  updateExhibits(dt, time);
  updateMascot(dt, time);
  updateCameraTarget(dt);

  const current = nearestIndex();
  if (current !== state.lastIndex) {
    state.lastIndex = current;
    onCurrentChanged(current);
  }

  const active = exhibits[state.mode === "focus" ? state.focusIndex : current];
  if (active) {
    // While you are down with the dog the key light comes off the exhibits and
    // onto him, warm rather than in a wing's colour.
    const litX = tucker ? THREE.MathUtils.lerp(active.x, tucker.x, state.pet) : active.x;
    lights.update(litX, state.pet > 0.5 ? "#ffd08a" : active.item.accent);
  }

  // The fill rides just off the camera's shoulder, so it lights whatever face
  // the viewer has turned toward themselves. Gold can take a lot of it; the
  // painted shields and engraved plates clip long before it does, so this is
  // set by what the diffuse surfaces will take.
  focusFill.intensity = damp(focusFill.intensity, state.mode === "focus" ? 20 : 0, 4, dt);
  // The fill takes the wing's colour too, so a cold wall is not lit warm.
  if (active) focusFill.color.lerp(new THREE.Color(0xfff0d6).lerp(new THREE.Color(active.item.accent), 0.35), 0.08);
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

// Whether the hall has already introduced him. It points him out once.
let metTucker = false;

/* Tucker, every frame he is anywhere near. He is culled by distance down the
   hall rather than by rail index, because he does not have one. */
function updateMascot(dt, time) {
  if (!tucker) return;
  const distance = Math.abs(camera.position.x - tucker.x);
  const near = distance < 15;
  tucker.group.visible = distance < 26;
  tucker.update(dt, time, {
    cameraPosition: camera.position,
    calm: quality.calm,
    near: near && tucker.group.visible
  });

  // One ray against one sphere, once a frame, only while a mouse is actually
  // over the canvas.
  if (hovering && !state.dragging && state.mode === "hall" && tucker.group.visible) {
    raycaster.setFromCamera(hoverPointer, camera);
    const over = raycaster.intersectObject(tucker.proxy, false).length > 0;
    if (over !== overTucker) {
      overTucker = over;
      dom.canvas.style.cursor = over ? "pointer" : "";
    }
  } else if (overTucker) {
    overTucker = false;
    dom.canvas.style.cursor = "";
  }

  // The one time the hall points him out: the first time you walk up to him
  // without having met him.
  if (!metTucker && !state.petFocus && distance < 3.4 && state.mode === "hall" && state.intro < 0.2) {
    metTucker = true;
    dom.hint.textContent = "That's Tucker, the league mascot · tap him to say hello";
    dom.hint.classList.add("show");
    setTimeout(() => dom.hint.classList.remove("show"), 5200);
  }
}

/* The wall breathes a little: the piece being inspected turns under the
   finger, and everything else drifts back to square. */
function updateLocker(dt, time) {
  if (!lockerWall) return;
  lockerWall.items.forEach((holder, index) => {
    const spinner = holder.userData.spinner;
    const home = holder.userData.home;
    const present = holder.userData.present;
    if (!spinner || !home || !present) return;

    if (state.mode === "lockerFocus" && index === state.lockerIndex) {
      // Off the shelf and clear of the panelling before it turns, and no
      // further round than the room it has allows.
      spinner.rotation.y = damp(spinner.rotation.y, clamp(state.focusYaw, -present.yaw, present.yaw), 9, dt);
      spinner.rotation.x = damp(spinner.rotation.x, clamp(state.focusPitch, -present.pitch, present.pitch), 9, dt);
      holder.position.y = damp(holder.position.y, home.y + present.lift, 6, dt);
      holder.position.z = damp(holder.position.z, home.z + present.push, 6, dt);
    } else {
      const sway = quality.calm ? 0 : Math.sin(time * 0.28 + index) * 0.03;
      spinner.rotation.y = damp(spinner.rotation.y, sway, 2.4, dt);
      spinner.rotation.x = damp(spinner.rotation.x, 0, 4, dt);
      holder.position.y = damp(holder.position.y, home.y, 5, dt);
      holder.position.z = damp(holder.position.z, home.z, 5, dt);
    }
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
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.sheetStep);
      if (state.mode === "lockerFocus") stepLocker(direction);
      else step(direction);
    });
  });

  dom.lockerBack.addEventListener("click", () => {
    if (state.mode === "lockerFocus") exitLockerFocus();
    else closeLocker();
  });

  const inspect = () => {
    if (state.mode !== "hall") return;
    // The nameplate is the same door the shield is.
    const item = exhibits[nearestIndex()]?.item;
    if (item && item.wing === "hall" && item.ownerId) openLocker(item.ownerId);
    else focusExhibit(nearestIndex());
  };
  if (dom.petButton) dom.petButton.addEventListener("click", () => petTucker());
  if (dom.petExit) dom.petExit.addEventListener("click", () => leavePet());

  dom.label.addEventListener("click", inspect);
  dom.label.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspect(); }
  });
  dom.sheetClose.addEventListener("click", () => {
    if (state.mode === "lockerFocus") exitLockerFocus();
    else exitFocus();
  });
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
  dom.stage.classList.toggle("is-team", item.wing === "hall" && Boolean(item.ownerId));

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
  // While you are down with Tucker the address bar belongs to him, not to
  // whichever exhibit happens to be nearest.
  if (history.replaceState && !state.petFocus) history.replaceState(null, "", `#${item.id}`);
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
  leavePet();
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
  leavePet();
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
  leavePet();
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
  dom.loader.classList.add("done", "gone");
  setTimeout(() => dom.hint.classList.add("show"), 900);
  setTimeout(() => dom.hint.classList.remove("show"), 6500);
}

/* ------------------------------------------------------------ team lockers */

/* Opening a locker swaps rooms rather than travelling to one: the hall is
   switched off, the wall is built for this manager, and the camera is already
   there when the wipe clears. The wipe is what sells it as a door. */
function openLocker(ownerId) {
  const locker = hall.lockers[ownerId];
  if (!locker || state.lockerId === ownerId) return;
  leavePet();

  wipe({ color: locker.color, icon: locker.icon, ownerId: locker.ownerId, label: `Opening ${locker.team}` }, () => {
    if (lockerWall) lockerWall.dispose();
    lockerWall = buildLockerWall(lockerRoom.room, locker);

    state.lockerId = ownerId;
    state.lockerIndex = -1;
    state.lockerPanX = 0;
    state.lockerPanY = 0;
    state.lockerWallZoom = 1;
    state.mode = "locker";

    hallGroup.visible = false;
    lockerRoom.room.visible = true;
    // The hall's fog is tuned to a long aisle; a wall two rooms away would sit
    // in the middle of it.
    scene.fog = null;

    const framing = wallFraming();
    camera.position.set(
      lockerWall.centre.x,
      lockerWall.centre.y + framing.offsetY,
      lockerWall.centre.z + framing.distance
    );
    lookAt.copy(camera.position).setZ(lockerWall.centre.z);
    camera.lookAt(lookAt);

    dom.stage.classList.add("in-locker");
    dom.stage.classList.remove("focused");
    dom.sheet.setAttribute("aria-hidden", "true");
    dom.stage.style.setProperty("--accent", locker.color);
    fillLockerHud(locker);
    dom.lockerBackLabel.textContent = "Hall of Fame";
    if (history.replaceState) history.replaceState(null, "", `#locker=${ownerId}`);
  });
}

function closeLocker() {
  if (!IN_LOCKER(state.mode)) return;
  const returning = state.lockerId;

  wipe({ color: "#f2c14a", icon: "🏆", label: "Back to the Hall" }, () => {
    if (lockerWall) lockerWall.dispose();
    lockerWall = null;
    state.lockerId = null;
    state.lockerIndex = -1;
    state.mode = "hall";

    lockerRoom.room.visible = false;
    hallGroup.visible = true;
    scene.fog = hallFog;

    dom.stage.classList.remove("in-locker", "focused");
    dom.sheet.setAttribute("aria-hidden", "true");

    // Back to the shield you came in through.
    const shield = hall.rail.find((entry) => entry.wing === "hall" && entry.ownerId === returning);
    const index = shield ? shield.railIndex : state.lastIndex;
    state.rail = index;
    state.railTarget = index;
    state.lastIndex = -1;
    const exhibit = exhibits[index];
    if (exhibit) {
      camera.position.set(exhibit.x, 2.52, LAYOUT.itemZ + 6.7);
      lookAt.set(exhibit.x, 1.8, LAYOUT.itemZ);
      camera.lookAt(lookAt);
    }
  });
}

function focusLockerItem(index) {
  if (!lockerWall || !lockerWall.items[index]) return;
  state.mode = "lockerFocus";
  state.lockerIndex = index;
  state.focusYaw = 0;
  state.focusPitch = 0;
  state.focusZoom = 1;
  fillSheet(lockerWall.items[index].userData.locker);
  dom.stage.classList.add("focused");
  dom.sheet.setAttribute("aria-hidden", "false");
  dom.lockerBackLabel.textContent = "The Wall";
}

function exitLockerFocus() {
  if (state.mode !== "lockerFocus") return;
  state.mode = "locker";
  state.lockerIndex = -1;
  dom.stage.classList.remove("focused");
  dom.sheet.setAttribute("aria-hidden", "true");
  dom.lockerBackLabel.textContent = "Hall of Fame";
}

function fillLockerHud(locker) {
  dom.lockerTeam.textContent = locker.team;
  dom.lockerOwner.textContent = locker.name;
  dom.lockerSummary.textContent = locker.summary;
  paintCrest(dom.lockerCrest, locker.ownerId, locker.icon);
  dom.lockerCrest.style.setProperty("--team", locker.color);
}

/* A short curtain over a change of room, so neither the build nor the camera
   jump is ever on screen.

   A request arriving mid-curtain is held rather than dropped: clicking through
   two managers quickly used to leave the second one's click doing nothing at
   all, with the first one's wall still on the screen. Only the most recent
   request is kept — the ones in between are rooms nobody asked to stay in. */
let wiping = false;
let pendingWipe = null;
/* Paints a team's mark into one of the HUD's crest chips. The logo is the same
   data URI the 3D textures are drawn from, so nothing extra is fetched; an
   owner without one (the two departed 2021 teams) keeps their emoji. */
function paintCrest(node, ownerId, fallback) {
  const src = ownerId && window.TEAM_LOGOS && window.TEAM_LOGOS[ownerId];
  node.textContent = "";
  if (!src) {
    node.textContent = fallback || "\u{1F3C8}";
    return;
  }
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  node.append(image);
}

function wipe(look, midpoint) {
  if (wiping) {
    pendingWipe = { look, midpoint };
    return;
  }
  wiping = true;
  dom.wipe.style.setProperty("--wipe-team", look.color);
  paintCrest(dom.wipeCrest, look.ownerId, look.icon);
  dom.wipeLabel.textContent = look.label;
  dom.wipe.classList.add("on");
  setTimeout(() => {
    midpoint();
    dom.wipe.classList.remove("on");
    setTimeout(() => {
      wiping = false;
      if (pendingWipe) {
        const next = pendingWipe;
        pendingWipe = null;
        wipe(next.look, next.midpoint);
      }
    }, 380);
  }, 300);
}

function applyDeepLink() {
  const target = location.hash.replace("#", "");
  if (!target) return;

  if (target === "tucker" && tucker) {
    state.rail = tuckerRail;
    state.railTarget = tuckerRail;
    state.lastIndex = -1;
    setTimeout(() => petTucker(), 80);
    return;
  }

  const team = target.match(/^locker=(.+)$/);
  if (team) {
    const ownerId = decodeURIComponent(team[1]);
    if (hall.lockers[ownerId]) setTimeout(() => openLocker(ownerId), 60);
    return;
  }

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
  let startPanX = 0;
  let startPanY = 0;
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
      zoomStart = state.mode === "locker" ? state.lockerWallZoom : state.focusZoom;
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
    startPanX = state.lockerPanX;
    startPanY = state.lockerPanY;
    lastTime = performance.now();
    state.velocity = 0;
    dom.hint.classList.remove("show");
  });

  // Hover is tracked separately from the drag: this one fires whether or not a
  // button is down, which is what the cursor needs.
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    hoverPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    hoverPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    hovering = true;
  });
  canvas.addEventListener("pointerleave", () => { hovering = false; });

  canvas.addEventListener("pointermove", (event) => {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (active.size === 2) {
      const [a, b] = [...active.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0) {
        if (state.mode === "focus" || state.mode === "lockerFocus") {
          state.focusZoom = clamp(zoomStart * (pinchStart / spread), 0.62, 2.2);
        } else if (state.mode === "locker") {
          state.lockerWallZoom = clamp(zoomStart * (spread / pinchStart), 0.85, 3.2);
        }
      }
      return;
    }
    if (!state.dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    state.pointerMoved = Math.max(state.pointerMoved, Math.hypot(dx, dy));

    if (state.mode === "focus" || state.mode === "lockerFocus") {
      // Drag right and the exhibit turns to show its right side; drag down and
      // it tips to show its top. This is the direction of orbiting a camera
      // around the object rather than pushing the face nearest you, and it is
      // the one that reads as "grabbing" it.
      state.focusYaw = startYaw + dx * 0.0085;
      state.focusPitch = clamp(startPitch + dy * 0.0055, -0.55, 0.55);
      return;
    }

    if (state.mode === "locker") {
      // A wall is panned, not travelled: drag moves the view across it, and
      // the reach is bounded by how much of the wall is off-screen.
      const metresPerPixel = wallFraming().distance * 0.0016;
      state.lockerPanX = clamp(startPanX - dx * metresPerPixel, -3.2, 3.2);
      state.lockerPanY = clamp(startPanY + dy * metresPerPixel, -2.6, 2.6);
      return;
    }

    // Walking away from him is how you stop petting him.
    if (state.petFocus && state.pointerMoved > 12) leavePet();
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
    if (state.mode === "focus" || state.mode === "lockerFocus") {
      state.focusZoom = clamp(state.focusZoom + event.deltaY * 0.0016, 0.62, 2.2);
      return;
    }
    if (state.mode === "locker") {
      state.lockerWallZoom = clamp(state.lockerWallZoom - event.deltaY * 0.0018, 0.85, 3.2);
      return;
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (state.petFocus && Math.abs(delta) > 4) leavePet();
    wheelBudget += delta;
    const steps = Math.trunc(wheelBudget / 55);
    if (!steps) return;
    wheelBudget -= steps * 55;
    state.railTarget = clamp(state.railTarget + steps, 0, exhibits.length - 1);
  }, { passive: false });

  addEventListener("keydown", (event) => {
    if (state.mode === "intro") return;
    if (IN_LOCKER(state.mode)) {
      switch (event.key) {
        case "Escape": case "Backspace":
          if (state.mode === "lockerFocus") exitLockerFocus();
          else closeLocker();
          break;
        case "ArrowRight": stepLocker(1); break;
        case "ArrowLeft": stepLocker(-1); break;
        case "Enter":
          if (state.mode === "locker") focusLockerItem(0);
          break;
        default: return;
      }
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case "ArrowRight": case "d": step(1); break;
      case "ArrowLeft": case "a": step(-1); break;
      case "ArrowUp": case "Enter":
        if (state.mode === "hall") focusExhibit(nearestIndex());
        break;
      case "p": case "P": petTucker(); break;
      case "ArrowDown": case "Escape":
        if (state.petFocus) leavePet();
        else exitFocus();
        break;
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

function stepLocker(direction) {
  if (!lockerWall || state.mode !== "lockerFocus") return;
  const next = clamp(state.lockerIndex + direction, 0, lockerWall.items.length - 1);
  if (next !== state.lockerIndex) focusLockerItem(next);
}

function handleTap(event) {
  const rect = dom.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (IN_LOCKER(state.mode)) {
    const hits = lockerWall ? raycaster.intersectObjects(lockerWall.items, true) : [];
    if (!hits.length) {
      // Tapping the room around the wall steps back out of a piece.
      if (state.mode === "lockerFocus") exitLockerFocus();
      return;
    }
    let node = hits[0].object;
    while (node && !node.userData.locker) node = node.parent;
    if (!node) return;
    const index = lockerWall.items.indexOf(node);
    if (state.mode === "lockerFocus" && index === state.lockerIndex) exitLockerFocus();
    else focusLockerItem(index);
    return;
  }

  const candidates = exhibits
    .filter((exhibit) => exhibit.stand.visible)
    .map((exhibit) => exhibit.stand);
  const hits = raycaster.intersectObjects(candidates, true);

  // The dog is checked against the same ray as the exhibits and wins only if
  // he is genuinely in front of one, so he can never swallow a tap meant for
  // the trophy behind him.
  if (tucker && tucker.group.visible) {
    const dog = raycaster.intersectObject(tucker.proxy, false);
    if (dog.length && (!hits.length || dog[0].distance < hits[0].distance)) {
      petTucker();
      return;
    }
  }

  if (!hits.length) {
    if (state.mode === "focus") exitFocus();
    else leavePet();
    return;
  }

  let node = hits[0].object;
  while (node && node.userData.exhibitIndex === undefined) node = node.parent;
  if (!node) return;

  const index = node.userData.exhibitIndex;
  const item = exhibits[index].item;

  // A manager in the hall of fame is a door, not an exhibit: tapping their
  // shield opens their locker rather than turning the shield around.
  if (item.wing === "hall" && item.ownerId) {
    openLocker(item.ownerId);
    return;
  }

  if (state.mode === "focus") {
    if (index === state.focusIndex) exitFocus();
    else { state.focusIndex = index; state.rail = index; state.railTarget = index; resetFocusPose(); fillSheet(item); }
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
