/* The team locker: one manager's wall, everything they have to be proud of on
   it at once.

   The hall's wings are league-wide and argue about who holds what. A locker
   does not argue — every manager has one, every one of them has something in
   it, and nothing on the wall is a lowlight. It reads as a wall rather than an
   aisle: you see the whole thing on arrival, then zoom into any piece of it.

   Rows run down the wall in the order a trophy case fills up:

     flag        the team's colours, across the top
     pennants    one per playoff berth, hung point-down from a rail
     shelf       a league trophy per title, a silver bowl per title game
     plaques     personal bests, mounted in a row

   A row centres itself and wraps when it runs long, so a manager with one
   berth and a manager with five both get a composed wall. The whole thing is
   built when a locker is opened and thrown away when it closes: ten lockers of
   canvas textures resident at once is not worth the memory. */

import * as THREE from "three";
import {
  buildLeagueTrophy, buildPennant, buildPlaque, buildPodiumBowl, buildTeamFlag,
  materials, roundedBox, teamMetal
} from "./models.js";
import { mix, radialTexture } from "./textures.js";

/* Where the room sits. Far enough from the hall that neither is ever in the
   other's frustum, so the two can simply be shown and hidden. */
const LOCKER_ORIGIN = new THREE.Vector3(0, 0, -220);

/* Rows stack from the top down rather than sitting at fixed heights, because
   most managers are missing at least one of them. A fixed layout left a hole
   where the trophy shelf would have been for anyone who has never reached a
   final; stacking closes the gap and every wall comes out composed. */
const WALL_TOP = 6.3;
const ROW_GAP = 0.34;
const CAPTION_DROP = 0.28;

const SIZE = {
  flagHalf: 0.80,
  pennant: 0.62,
  trophy: 0.90,
  bowl: 0.46,
  plaqueHalf: 0.43,
  trophyScale: 0.44,
  bowlScale: 1.1,
  plaqueScale: 0.66
};

const WALL_Z = -0.55;

/* The top of the room's wainscot rail, and the line the wall's contents stop
   at. Rows stack downward, so a manager with all four of them reaches furthest
   down — far enough that the brass rail cut through the bottom row of plaques. */
const TRIM_TOP = 0.39;
const WALL_FLOOR = TRIM_TOP + 0.24;

const ordinal = (n) => {
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n] || "th";
  return `${n}${suffix}`;
};

/* Lays out n items across a row, wrapping at `perRow`, and returns a position
   for each. Rows centre themselves, so one item sits in the middle rather than
   at the left edge. */
function spread(count, { perRow, gap, top, rowGap }) {
  const spots = [];
  const rows = Math.ceil(count / perRow);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const column = index - row * perRow;
    spots.push({
      x: (column - (inRow - 1) / 2) * gap,
      y: top - row * rowGap,
      row,
      rows
    });
  }
  return spots;
}

/* The room the wall stands in: a back wall, a floor, and enough side wall to
   stop the frame falling off into black. */
export function buildLockerRoom(scene) {
  const mat = materials();
  const room = new THREE.Group();
  room.position.copy(LOCKER_ORIGIN);
  room.visible = false;

  const panelling = mat.textures.darkMarble.clone();
  panelling.needsUpdate = true;
  panelling.repeat.set(4, 2.4);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 9),
    new THREE.MeshStandardMaterial({
      map: panelling, color: 0x6a7d96, metalness: 0.3, roughness: 0.55,
      envMap: mat.envMap, envMapIntensity: 0.7
    })
  );
  back.position.set(0, 3.5, WALL_Z - 0.1);
  back.userData.part = "panel";
  room.add(back);

  // A wainscot and a rail, so the wall has a floor line to sit on.
  const wainscotTexture = mat.textures.walnut.clone();
  wainscotTexture.needsUpdate = true;
  wainscotTexture.repeat.set(6, 1);
  const wainscot = new THREE.Mesh(
    new THREE.BoxGeometry(13, 0.34, 0.22),
    new THREE.MeshStandardMaterial({
      map: wainscotTexture, color: 0x6d5539, metalness: 0.15, roughness: 0.64,
      envMap: mat.envMap, envMapIntensity: 0.4
    })
  );
  wainscot.position.set(0, 0.17, WALL_Z + 0.06);
  wainscot.userData.part = "wainscot";
  const rail = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 0.3), mat.brass);
  rail.position.set(0, 0.36, WALL_Z + 0.1);
  rail.userData.part = "rail";
  room.add(wainscot, rail);

  const floorTexture = mat.textures.darkMarble.clone();
  floorTexture.needsUpdate = true;
  floorTexture.repeat.set(5, 3);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 8),
    new THREE.MeshStandardMaterial({
      map: floorTexture, color: 0x8ea4bd, metalness: 0.75, roughness: 0.18,
      envMap: mat.envMap, envMapIntensity: 2.0
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, WALL_Z + 3.9);
  room.add(floor);

  // A ceiling cove and two wall washes: broad even light, because a wall is
  // read all at once rather than one plinth at a time.
  // Kept well above the top of anything on the wall: at head height it showed
  // through the frame as a bright bar behind the header text.
  const cove = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  );
  cove.position.set(0, 8.6, WALL_Z + 0.6);
  room.add(cove);

  const lights = [];
  for (const x of [-3.4, 3.4]) {
    const wash = new THREE.SpotLight(0xfff0d4, 58, 26, 1.0, 0.85, 1.2);
    wash.position.set(x, 6.2, WALL_Z + 4.6);
    wash.target.position.set(x * 0.5, 2.6, WALL_Z);
    room.add(wash, wash.target);
    lights.push(wash);
  }
  const front = new THREE.PointLight(0xffe9c8, 26, 22, 1.5);
  front.position.set(0, 3.0, WALL_Z + 5.4);
  room.add(front);
  const ambient = new THREE.HemisphereLight(0xbcd4ff, 0x2a1a10, 0.95);
  room.add(ambient);

  scene.add(room);
  return { room, lights: [...lights, front, ambient] };
}

/* Builds one manager's wall into `room`, and hands back the pieces the camera
   and the pointer need: what can be clicked, and how big the wall came out. */
export function buildLockerWall(room, locker) {
  const mat = materials();
  const wall = new THREE.Group();
  const items = [];
  const perishable = [];

  // Anything cut for this one manager is thrown away when they close.
  const track = (node) => {
    node.traverse((child) => {
      if (child.isMesh || child.isSprite) {
        perishable.push(child.geometry);
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
          perishable.push(material);
          if (material.map) perishable.push(material.map);
        });
      }
    });
    return node;
  };

  const accent = locker.color;

  /* Hangs one piece on the wall. The holder sits where the piece goes; the
     spinner inside it is pivoted on the piece's own centre, so inspecting a
     trophy turns it in place instead of swinging it around its foot.

     Turning a piece sweeps a sphere around that centre, and a wall has two
     surfaces close enough to be caught by it: the panelling behind, and the
     shelf underneath anything standing on one. So each piece works out how far
     it must come forward and lift to turn freely — and where coming forward
     far enough would fly it at the viewer, as it would for a banner three
     metres wide, how far it may turn instead. */
  const CLEAR = 0.06;
  const MAX_PUSH = 0.45;
  const wallFace = WALL_Z - 0.1;

  const mount = (object, x, y, z, meta, { standsOn = null } = {}) => {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const localCentre = bounds.getCenter(new THREE.Vector3());
    const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);

    const spinner = new THREE.Group();
    spinner.position.copy(localCentre);
    object.position.sub(localCentre);
    spinner.add(object);

    // A piece stands on its own underside, not on its origin. Several are
    // modelled with a bevelled base that reaches below y=0, and trusting the
    // origin sank them a couple of centimetres into the shelf.
    const seatY = standsOn === null ? y : standsOn - bounds.min.y;

    const holder = new THREE.Group();
    holder.position.set(x, seatY, z);
    holder.add(spinner);

    // Where the piece turns about, and how far its corners reach from there.
    const centreZ = z + localCentre.z;
    const centreY = seatY + localCentre.y;
    const sweep = half.length();

    const push = Math.min(MAX_PUSH, Math.max(0, sweep - (centreZ - wallFace) + CLEAR));
    const lift = standsOn === null
      ? 0
      : Math.max(0, sweep - (centreY - standsOn) + CLEAR);

    // Whatever depth is left once it has come forward decides how far it turns.
    const room = centreZ + push - wallFace - CLEAR;
    const limit = (reachAcross, reachDeep) => {
      const reach = Math.hypot(reachAcross, reachDeep);
      if (reach <= room) return Infinity;
      return Math.max(0.08, Math.asin(Math.min(1, room / reach)) - Math.atan2(reachDeep, reachAcross));
    };

    holder.userData.locker = meta;
    holder.userData.spinner = spinner;
    holder.userData.home = holder.position.clone();
    holder.userData.present = {
      push,
      lift,
      yaw: limit(half.x, half.z),
      pitch: limit(half.y, half.z)
    };
    wall.add(track(holder));
    items.push(holder);
    return holder;
  };
  // Captions take a lifted version of the team's colour: the raw one is too
  // close to the wall behind it for the darker teams.
  const captionInk = mix(accent, "#ffffff", 0.55);
  const label = (text, x, y, width = 2.0) => {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.09),
      new THREE.MeshBasicMaterial({
        map: sectionLabelTexture(text, captionInk), transparent: true, depthWrite: false
      })
    );
    plate.position.set(x, y, WALL_Z + 0.06);
    plate.userData.part = `caption:${text}`;
    wall.add(track(plate));
  };

  /* ------------------------------------------------------------------ flag */
  let cursor = WALL_TOP;

  mount(buildTeamFlag(locker), 0, cursor - SIZE.flagHalf - 0.12, WALL_Z + 0.14, {
    id: "flag",
    kind: "flag",
    title: locker.team,
    subtitle: locker.name,
    blurb: `${locker.name} has run ${locker.team} for ${locker.seasons.length} ${locker.seasons.length === 1 ? "season" : "seasons"}. ${locker.summary}.`,
    stats: locker.stats,
    links: [{ label: "Full Profile", href: `alltime.html#owner=${locker.ownerId}` }]
  });
  cursor -= SIZE.flagHalf * 2 + 0.12 + ROW_GAP;

  /* -------------------------------------------------------------- pennants */
  if (locker.berths.length) {
    label("PLAYOFF BERTHS", 0, cursor, 1.9);
    const railY = cursor - CAPTION_DROP;
    const spots = spread(locker.berths.length, {
      perRow: 6, gap: 0.46, top: railY, rowGap: SIZE.pennant + 0.22
    });
    locker.berths.forEach((berth, index) => {
      const spot = spots[index];
      const pennant = buildPennant({
        year: berth.year,
        color: accent,
        // A division crown flies gold cloth with gold braid, keeping only a
        // trace of the team's colour — blending the two halfway just produced
        // a washed-out version of the ordinary pennant.
        cloth: berth.division ? mix("#9c6c14", accent, 0.18) : accent,
        crown: berth.division,
        note: berth.division ? "DIVISION CHAMPS" : "PLAYOFFS"
      });
      mount(pennant, spot.x, spot.y, WALL_Z + 0.2, {
        id: `berth-${berth.year}`,
        kind: "pennant",
        title: berth.division ? `${berth.year} Division Champs` : `${berth.year} Playoffs`,
        subtitle: berth.team.name,
        blurb: berth.division
          ? `${locker.name} topped their division in ${berth.year} at ${berth.team.wins}–${berth.team.losses} and sat out the first round.`
          : `${locker.name} reached the ${berth.year} bracket with ${berth.team.name}, ${berth.team.wins}–${berth.team.losses} in the regular season.`,
        stats: [
          { label: "Record", value: `${berth.team.wins}–${berth.team.losses}` },
          { label: "Points For", value: berth.team.pf.toFixed(2) },
          { label: "Finish", value: `${berth.team.finalRank}` },
          { label: "Reached", value: ["Quarterfinal", "Semifinal", "Championship"][berth.depth] },
          ...(berth.division ? [{ label: "First Round", value: "Bye" }] : [])
        ],
        links: [{ label: `${berth.year} Season`, href: `${berth.year}.html` }]
      });
    });
    const rows = Math.ceil(locker.berths.length / 6);
    cursor = railY - rows * SIZE.pennant - (rows - 1) * 0.22 - ROW_GAP;
  }

  /* ------------------------------------------------------------ the shelf */
  /* The shelf is always here, stocked or bare. A manager with nothing on it
     should see the space their trophies are going to occupy. */
  {
    label("TROPHIES", 0, cursor, 1.9);
    const hasTitle = locker.trophies.some((entry) => entry.place === 1);
    const tallest = hasTitle ? SIZE.trophy : SIZE.bowl;
    const shelfY = cursor - CAPTION_DROP - tallest;

    const shelfGeometry = roundedBox(4.6, 0.11, 0.62, 0.03);
    shelfGeometry.computeBoundingBox();
    const shelfTop = shelfGeometry.boundingBox.max.y;
    const shelf = new THREE.Mesh(shelfGeometry, mat.darkMarble);
    shelf.position.set(0, shelfY - shelfTop, WALL_Z + 0.32);
    const shelfEdge = new THREE.Mesh(roundedBox(4.64, 0.022, 0.66, 0.01), teamMetal(accent, { emissive: 0.5 }));
    shelfEdge.position.set(0, shelfY - shelfTop - 0.062, WALL_Z + 0.32);
    for (const x of [-2.1, 0, 2.1]) {
      const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 10), mat.brass);
      bracket.position.set(x, shelfY - shelfTop - 0.145, WALL_Z + 0.14);
      bracket.userData.part = "bracket";
      wall.add(track(bracket));
    }
    shelf.userData.part = "shelf";
    shelfEdge.userData.part = "shelfEdge";
    wall.add(track(shelf), track(shelfEdge));

    const spots = spread(locker.trophies.length, {
      perRow: 5, gap: hasTitle ? 0.92 : 0.74, top: shelfY, rowGap: 1.15
    });

    const PLACE = { 1: "Champion", 2: "Runner-up", 3: "Third place" };
    locker.trophies.forEach((entry, index) => {
      const spot = spots[index];
      let object;
      if (entry.place === 1) {
        object = buildLeagueTrophy({
          year: entry.year,
          color: accent,
          icon: locker.icon,
          subtitle: locker.team,
          accent
        });
        object.scale.setScalar(SIZE.trophyScale);
      } else {
        object = buildPodiumBowl({ year: entry.year, metal: entry.metal, accent });
        object.scale.setScalar(SIZE.bowlScale);
      }
      mount(object, spot.x, spot.y, WALL_Z + 0.34, {
        id: `place-${entry.year}`,
        kind: entry.place === 1 ? "title" : "bowl",
        title: `${entry.year} ${PLACE[entry.place]}`,
        subtitle: entry.team.name,
        blurb: entry.lost
          ? `${locker.name} won the ${entry.year} league title. The season's box scores did not survive.`
          : `${locker.name} finished ${ordinal(entry.place)} of ${entry.size} in ${entry.year} at ${entry.team.wins}–${entry.team.losses}.`,
        stats: entry.lost ? [] : [
          { label: "Record", value: `${entry.team.wins}–${entry.team.losses}` },
          { label: "Points For", value: entry.team.pf.toFixed(2) },
          { label: "Points Against", value: entry.team.pa.toFixed(2) }
        ],
        links: [{ label: `${entry.year} Season`, href: `${entry.year}.html` }]
      }, { standsOn: shelfY });
    });

    cursor = shelfY - 0.16 - ROW_GAP;
  }

  /* --------------------------------------------------------------- plaques */
  if (locker.plaques.length) {
    label("PERSONAL BESTS", 0, cursor, 1.8);
    const spots = spread(locker.plaques.length, {
      perRow: 6, gap: 0.90, top: cursor - CAPTION_DROP - SIZE.plaqueHalf, rowGap: SIZE.plaqueHalf * 2 + 0.2
    });
    locker.plaques.forEach((entry, index) => {
      const spot = spots[index];
      const plaque = buildPlaque({
        title: entry.title,
        subtitle: entry.bigValue,
        bigValue: entry.bigValue,
        meta: entry.meta,
        accent,
        color: accent,
        icon: locker.icon,
        ownerId: locker.ownerId
      }, { mounted: true });
      plaque.scale.setScalar(SIZE.plaqueScale);
      mount(plaque, spot.x, spot.y, WALL_Z + 0.14, {
        id: `plaque-${entry.id}`,
        kind: "plaque",
        title: entry.title,
        subtitle: entry.bigValue,
        meta: entry.meta,
        blurb: entry.blurb,
        stats: entry.stats,
        links: []
      });
    });
  }

  /* Nothing on the wall may come down into the wainscot. Lift the whole
     composition to the floor line rather than moving the trim, which is what
     gives the room its floor to stand on. */
  wall.updateMatrixWorld(true);
  const reach = new THREE.Box3();
  items.forEach((holder) => reach.expandByObject(holder));
  const floorLift = Math.max(0, WALL_FLOOR - reach.min.y);
  wall.position.y = floorLift;

  // A pool of the team's colour on the floor in front of the wall.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3.4),
    new THREE.MeshBasicMaterial({
      map: radialTexture(), color: new THREE.Color(accent),
      transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.02 - floorLift, WALL_Z + 1.6);
  wall.add(track(pool));

  room.add(wall);
  wall.updateMatrixWorld(true);

  // Measure each piece where it ended up, so inspecting one needs no guesswork.
  items.forEach((holder) => {
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    holder.userData.frame = {
      centre: box.getCenter(new THREE.Vector3()),
      halfWidth: Math.hypot(size.x, size.z) / 2,
      halfHeight: size.y / 2
    };
  });

  // What the camera has to hold: the pieces themselves. Measuring the whole
  // wall would include the pool of light lying across the floor, which is
  // three metres deep and would push the camera back into the next room.
  const bounds = new THREE.Box3();
  items.forEach((holder) => bounds.expandByObject(holder));
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());

  return {
    wall,
    items,
    centre,
    size,
    dispose() {
      room.remove(wall);
      perishable.forEach((resource) => resource.dispose?.());
    }
  };
}

/* The small caption over each row. Drawn rather than modelled: it is a label,
   not an object, and it should not be clickable. */
function sectionLabelTexture(text, accent) {
  const element = document.createElement("canvas");
  element.width = 1024;
  element.height = 92;
  const ctx = element.getContext("2d");
  ctx.clearRect(0, 0, 1024, 92);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 46px "Space Grotesk", Inter, system-ui, sans-serif';
  ctx.letterSpacing = "14px";
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillText(text, 512, 50);
  ctx.fillStyle = accent;
  ctx.fillText(text, 512, 46);

  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
