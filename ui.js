/* Shared motion and season navigation for every page of the record book.

   Loaded (not deferred) in each page's <head>, ahead of the page's own
   script, so `UI` and `SeasonNav` exist by the time that script runs. Only
   definitions and a couple of passive listeners run here; nothing touches
   the page until it asks.

   UI.roll(el, text, dir)      a heading's text rolls out and the new text
                               rolls in, up when moving forward, down when
                               going back.
   UI.measureRows(root)        snapshot every team row in root's tables...
   UI.shuffleRows(root, snap)  ...then slide each row from where it was to
                               where it is now, washing green if it climbed
                               and red if it dropped.
   SeasonNav.mount(el, opts)   the season pages' pinned navigation: the view
   SeasonNav.render(state)     switcher across the top of a frosted capsule
                               and the week wheel under it (see below).

   Every animation is skipped under prefers-reduced-motion. */
(() => {
  "use strict";

  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)");
  const FINE = matchMedia("(hover: hover) and (pointer: fine)");
  const COARSE = matchMedia("(pointer: coarse)");
  const EASE = "cubic-bezier(.22,1,.36,1)";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  /* Short taps on phones that support vibration (Android): a tick for each
     week the wheel passes, a tap when something is chosen. */
  const HAPTIC = { tick: 4, tap: 6 };
  function haptic(kind) {
    if (!COARSE.matches || !navigator.vibrate) return;
    try { navigator.vibrate(HAPTIC[kind] || kind); } catch (_) { /* not allowed yet */ }
  }

  /* ---------------------------------------------------------------
     Title roll. The old text is laid over the new one and both run
     their half of the roll; the old copy is dropped once it is gone.
     --------------------------------------------------------------- */
  function roll(el, text, dir = "up") {
    if (!el) return;
    const old = el.dataset.t;
    if (old === text) return;
    el.dataset.t = text;
    if (old == null || REDUCE.matches) { el.innerHTML = `<span class="ui-roll"><span>${esc(text)}</span></span>`; return; }
    el.innerHTML = `<span class="ui-roll"><span class="ui-roll-out ${dir}" aria-hidden="true">${esc(old)}</span><span class="ui-roll-in ${dir}">${esc(text)}</span></span>`;
    clearTimeout(el._roll);
    el._roll = setTimeout(() => {
      if (el.dataset.t === text) el.innerHTML = `<span class="ui-roll"><span>${esc(text)}</span></span>`;
    }, 650);
  }

  /* ---------------------------------------------------------------
     Row shuffle (FLIP). A row is keyed by its table and the team it
     names, and measured against the top of its own table body, so a
     panel that grows or shrinks above it doesn't count as a move.
     --------------------------------------------------------------- */
  const UP = "22,131,74", DOWN = "215,25,32";
  function rowMap(root) {
    const m = new Map();
    root.querySelectorAll("tbody").forEach((tb, ti) => {
      if (!tb.offsetParent) return;
      const top = tb.getBoundingClientRect().top;
      [...tb.rows].forEach((tr) => {
        const t = tr.querySelector("[data-team]");
        if (t) m.set(`${ti}|${t.dataset.team}`, { el: tr, y: tr.getBoundingClientRect().top - top });
      });
    });
    return m;
  }
  function measureRows(root) {
    if (!root || REDUCE.matches || !root.offsetParent) return null;
    const m = rowMap(root);
    return m.size ? m : null;
  }
  function tint(el, rgb) {
    // fade back to the row's own fill rather than to transparent, so a
    // shaded row (a playoff seed, the champion) doesn't flash at the end
    const rest = getComputedStyle(el).backgroundColor;
    el.animate([{ backgroundColor: `rgba(${rgb},.16)` }, { backgroundColor: rest }], { duration: 1400, easing: "ease-out" });
  }
  function shuffleRows(root, before, { wash = true } = {}) {
    if (!before || !root) return false;
    let moved = false;
    rowMap(root).forEach(({ el, y }, k) => {
      const was = before.get(k);
      if (!was) return;
      const dy = was.y - y;
      if (Math.abs(dy) < 1) return;
      moved = true;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 650, easing: EASE, fill: "backwards" });
      if (wash) tint(el, dy > 0 ? UP : DOWN);
    });
    return moved;
  }

  /* Sorting a table by a column header (or the phone's sort menu) slides
     the rows into their new order instead of redrawing them in place. The
     page's own handler re-renders during the click; the rows are measured
     before it runs (capture phase) and animated in the frame after. */
  function sortFlip(event) {
    const trigger = event.target.closest && event.target.closest(".sort-button, .mobile-sort-direction, .mobile-sort-control select");
    if (!trigger) return;
    const card = trigger.closest(".card, section") || document;
    const before = measureRows(card);
    if (before) requestAnimationFrame(() => shuffleRows(card, before, { wash: false }));
  }
  document.addEventListener("click", sortFlip, true);
  document.addEventListener("change", sortFlip, true);

  /* The header gains a soft shadow once the page scrolls under it. */
  let scrollRaf = 0;
  window.addEventListener("scroll", () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const bar = document.querySelector(".topbar");
      if (bar) bar.classList.toggle("scrolled", window.scrollY > 4);
    });
  }, { passive: true });

  /* ===============================================================
     SEASON NAV

     One frosted capsule holding the season's views (Results,
     Standings, Playoffs, ...) as a segmented control that spans its
     whole width, and the week wheel under it. It pins under the
     header as the page scrolls and tightens into a floating card; its
     box in the page keeps its open height, so pinning never makes the
     page jump.

     Weeks are progress rings: a played week's ring is closed, a
     week still to come is an open track, and a navy disc glides to
     the selected one.
       Mouse: every week on one row, magnified under the pointer like
              the macOS Dock.
       Touch: an iOS-picker-style wheel. The week under the centre
              line is magnified, snaps into place and is chosen once
              the swipe settles.

     The page stays in charge of its data: it calls render() with the
     weeks and views it has, and hears back through onWeek / onView.
     =============================================================== */
  const SeasonNav = (() => {
    let root = null, cap = null, seg = null, segInd = null, wkbar = null, rail = null, sentinel = null;
    let opts = {};
    let weeks = [], views = [], week = null, view = null, prevWeek = null;
    let chips = [], railWeek = null, visWeek = null, segIds = "";
    let userScroll = false, touching = false, swiping = false, lastCentre = null, sraf = 0, mraf = 0, mx = 0, settleT = 0;
    let io = null;

    const arrow = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

    function mount(el, options = {}) {
      root = typeof el === "string" ? document.querySelector(el) : el;
      if (!root) return;
      opts = options;
      root.classList.add("season-nav");
      root.innerHTML = `<div class="sn-cap">
        <div class="sn-seg" role="tablist" aria-label="${esc(opts.viewsLabel || "Views")}"><span class="sn-seg-ind" aria-hidden="true"></span></div>
        <div class="sn-wkbar"><div class="sn-wkcap">
          <button class="sn-arrow l" type="button" aria-label="Earlier weeks" tabindex="-1">${arrow("m15 18-6-6 6-6")}</button>
          <div class="sn-rail" role="tablist" aria-label="Week"></div>
          <button class="sn-arrow r" type="button" aria-label="Later weeks" tabindex="-1">${arrow("m9 18 6-6-6-6")}</button>
        </div></div>
      </div>`;
      root.insertAdjacentHTML("beforebegin", '<div class="sn-sentinel" aria-hidden="true"></div>');
      sentinel = root.previousElementSibling;
      cap = root.querySelector(".sn-cap");
      seg = root.querySelector(".sn-seg");
      segInd = root.querySelector(".sn-seg-ind");
      wkbar = root.querySelector(".sn-wkbar");
      rail = root.querySelector(".sn-rail");
      wire();
    }

    /* ---- views ---------------------------------------------------- */
    function label(v) {
      return v.short && v.short !== v.label
        ? `<span class="l-lg">${esc(v.label)}</span><span class="l-sm">${esc(v.short)}</span>`
        : `<span>${esc(v.label)}</span>`;
    }
    function renderViews() {
      const ids = views.map((v) => v.id).join("|");
      if (ids !== segIds) {
        const first = !segIds;
        segIds = ids;
        seg.querySelectorAll("button").forEach((b) => b.remove());
        seg.insertAdjacentHTML("beforeend", views.map((v, i) =>
          `<button type="button" role="tab" data-view="${esc(v.id)}" style="--i:${i}">${label(v)}</button>`).join(""));
        seg.dataset.n = views.length;
        // a different set of views (a playoff week, the season overview)
        // ripples in; the white pill glides over to its new place
        if (!first && !REDUCE.matches) { seg.classList.remove("swap"); void seg.offsetWidth; seg.classList.add("swap"); }
      } else {
        // same views, a label may have changed (Results <-> Matchups)
        seg.querySelectorAll("button").forEach((b, i) => { const h = label(views[i]); if (b.innerHTML !== h) b.innerHTML = h; });
      }
      seg.querySelectorAll("button").forEach((b) => {
        const on = b.dataset.view === view;
        b.setAttribute("aria-selected", on);
        b.tabIndex = on ? 0 : -1;
      });
      placeSegInd();
    }
    function placeSegInd() {
      if (!seg || !seg.offsetParent) return;
      const on = seg.querySelector('[aria-selected="true"]');
      if (!on) return;
      segInd.style.width = `${on.offsetWidth}px`;
      segInd.style.transform = `translateX(${on.offsetLeft}px)`;
      if (!segInd.classList.contains("ready")) raf2(() => segInd.classList.add("ready"));
    }

    /* ---- weeks ---------------------------------------------------- */
    function buildRail() {
      rail.innerHTML = `<div class="sn-track"><span class="sn-disc" aria-hidden="true"></span>${
        weeks.map((k, i) => `<button type="button" class="sn-wk${String(k.num).length > 2 ? " txt" : ""}${k.playoff ? " po" : ""}${k.playoff && !(weeks[i - 1] || {}).playoff ? " po-first" : ""}" role="tab" data-w="${k.w}" style="--i:${i}">
          <span class="sn-wk-in">
            <svg class="sn-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="trk" cx="20" cy="20" r="18"/><circle class="prg" cx="20" cy="20" r="18" pathLength="100"/></svg>
            <span class="sn-num">${esc(k.num)}</span>
          </span><span class="sn-dot"></span></button>`).join("")}</div>`;
      chips = [...rail.querySelectorAll(".sn-wk")];
      if (!REDUCE.matches) { wkbar.classList.add("enter"); setTimeout(() => wkbar.classList.remove("enter"), 1300); }
    }
    const chipOf = (w) => chips.find((c) => +c.dataset.w === w);
    function renderWeeks() {
      if (chips.length !== weeks.length) buildRail();
      weeks.forEach((k, i) => {
        const c = chips[i];
        c.classList.toggle("final", !!k.played);
        c.classList.toggle("zero", !k.played);
        c.classList.toggle("now", !!k.now);
        if (!swiping) c.classList.toggle("on", k.w === week);
        c.setAttribute("aria-selected", k.w === week);
        c.tabIndex = k.w === week ? 0 : -1;
        c.setAttribute("aria-label", k.label || `Week ${k.w}`);
        c.title = k.label || `Week ${k.w}`;
        c.querySelector(".prg").style.strokeDashoffset = k.played ? "0" : "100";
      });
      if (!swiping) visWeek = week;
      layoutRail();
      if (railWeek !== week && rail.offsetParent) {
        centerWeek(week, railWeek === null || REDUCE.matches ? "auto" : "smooth");
        railWeek = week;
      }
      lensUpdate();
      placeDisc();
    }
    function setVis(w) {
      if (w === visWeek) return;
      const was = chipOf(visWeek);
      if (was) was.classList.remove("on");
      visWeek = w;
      const c = chipOf(w);
      if (c) c.classList.add("on");
      placeDisc();
    }
    function centerWeek(w, behavior) {
      const c = chipOf(w);
      if (c) rail.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - rail.clientWidth / 2, behavior });
    }
    /* the disc follows the selected ring, magnification and all */
    function placeDisc() {
      const disc = rail && rail.querySelector(".sn-disc"), c = chipOf(visWeek == null ? week : visWeek);
      if (!disc || !c || !rail.offsetParent) return;
      const sc = parseFloat(c.style.getPropertyValue("--s")) || 1;
      // CSS centres the disc on x (left: -ring/2), so it stays true while ring sizes animate
      disc.style.transform = `translate(${c.offsetLeft + c.offsetWidth / 2}px, ${(sc - 1) * -12}px) scale(${sc})`;
      if (!disc.classList.contains("ready")) raf2(() => disc.classList.add("ready"));
    }
    /* Spacers at both ends let the first and last weeks reach the centre
       line. Their width is set in px here: Safari can size a max-content
       track from the rings rather than the slots, and padding past
       overflowing items isn't scrollable, so the last week could never be
       centred. */
    function setRailEdge() {
      if (rail && rail.clientWidth) rail.style.setProperty("--edge", `${rail.clientWidth / 2 - 29}px`);
    }
    function layoutRail() {
      wkbar.classList.toggle("lens", !FINE.matches);
      setRailEdge();
      railEdges();
    }
    function railEdges() {
      const max = rail.scrollWidth - rail.clientWidth, x = rail.scrollLeft;
      const over = max > 1, canL = over && x > 2, canR = over && x < max - 2;
      wkbar.classList.toggle("over", over);
      wkbar.classList.toggle("can-l", canL);
      wkbar.classList.toggle("can-r", canR);
      rail.style.setProperty("--fl", canL ? "32px" : "0px");
      rail.style.setProperty("--fr", canR ? "32px" : "0px");
    }
    /* touch: magnify toward the centre line; returns the centred week */
    function lensUpdate() {
      if (!wkbar.classList.contains("lens") || !rail.offsetParent) return null;
      const r = rail.getBoundingClientRect(), cx = r.left + r.width / 2;
      let best = null, bd = Infinity;
      chips.forEach((c) => {
        const b = c.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - cx);
        if (!REDUCE.matches) {
          c.style.setProperty("--s", (1 + 0.2 * Math.exp(-(d * d) / (2 * 58 * 58))).toFixed(3));
          c.style.setProperty("--o", (0.4 + 0.6 * Math.exp(-(d * d) / (2 * 120 * 120))).toFixed(3));
        }
        if (d < bd) { bd = d; best = c; }
      });
      return best;
    }
    function goWeek(w) {
      if (w === week) return;
      if (opts.onWeek) opts.onWeek(w);
    }

    /* ---- pinning -------------------------------------------------- */
    /* How far down the capsule pins: under a header that runs across the
       top, or at the very top beside the desktop sidebar. */
    function navTop() {
      const bar = document.querySelector(".topbar");
      if (!bar) return 0;
      const pos = getComputedStyle(bar).position;
      if (pos !== "sticky" && pos !== "fixed") return 0;
      if (bar.getBoundingClientRect().right <= root.getBoundingClientRect().left + 1) return 0;
      return bar.offsetHeight;
    }
    function setStuck(on) { root.classList.toggle("stuck", on); }
    /* freeze the footprint at the open height; if it's pinned right now,
       measure the open layout with transitions off, then put it back */
    function measure() {
      if (!root || !root.offsetParent) return;
      root.style.setProperty("--sn-top", `${navTop()}px`);
      const stuck = root.classList.contains("stuck");
      root.classList.add("measuring");
      if (stuck) setStuck(false);
      root.style.height = "";
      root.style.height = `${cap.offsetHeight}px`;
      if (stuck) { setStuck(true); void cap.offsetHeight; }
      raf2(() => root.classList.remove("measuring"));
    }
    function watch() {
      if (io) io.disconnect();
      if (!("IntersectionObserver" in window) || !root) return;
      const top = navTop();
      io = new IntersectionObserver(([e]) => {
        const stuck = !e.isIntersecting && e.boundingClientRect.top < top + 1;
        if (stuck === root.classList.contains("stuck")) return;
        setStuck(stuck);
        // ring sizes animate for ~.55s; keep the disc and the edges in step
        const t0 = performance.now();
        const follow = () => { placeDisc(); railEdges(); if (performance.now() - t0 < 650) requestAnimationFrame(follow); };
        requestAnimationFrame(follow);
      }, { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: 0 });
      io.observe(sentinel);
    }
    /* Changing view from the pinned capsule starts the new view at its
       top: the page scrolls back to where the capsule just lets go. */
    function toContentTop() {
      const top = sentinel.getBoundingClientRect().top + window.scrollY - navTop();
      if (window.scrollY > top + 1) window.scrollTo({ top, behavior: REDUCE.matches ? "auto" : "smooth" });
    }
    const relayout = () => {
      if (!root || !root.offsetParent) return;
      layoutRail(); measure(); centerWeek(week, "auto"); lensUpdate(); placeDisc(); placeSegInd();
    };

    /* ---- events --------------------------------------------------- */
    function wire() {
      seg.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-view]");
        if (!b || b.dataset.view === view) return;
        haptic("tap");
        if (opts.onView) opts.onView(b.dataset.view);
        toContentTop();
      });
      // arrow keys move along the tabs, as in any tab list
      seg.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const bs = [...seg.querySelectorAll("button")], i = bs.findIndex((b) => b.dataset.view === view);
        const next = bs[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (!next) return;
        e.preventDefault(); e.stopPropagation();
        next.click(); next.focus();
      });

      rail.addEventListener("click", (e) => {
        const c = e.target.closest(".sn-wk");
        if (!c) return;
        if (+c.dataset.w !== week) haptic("tap");
        goWeek(+c.dataset.w);
      });
      /* mouse: Dock-style magnification under the pointer */
      rail.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || wkbar.classList.contains("lens") || REDUCE.matches) return;
        mx = e.clientX;
        if (!mraf) mraf = requestAnimationFrame(() => {
          mraf = 0;
          wkbar.classList.add("mag");
          const amp = root.classList.contains("stuck") ? 0.18 : 0.3;
          chips.forEach((c) => {
            const b = c.getBoundingClientRect(), d = b.left + b.width / 2 - mx;
            c.style.setProperty("--s", (1 + amp * Math.exp(-(d * d) / (2 * 50 * 50))).toFixed(3));
          });
          placeDisc();
        });
      });
      rail.addEventListener("pointerleave", () => {
        if (wkbar.classList.contains("lens")) return;
        cancelAnimationFrame(mraf); mraf = 0;
        wkbar.classList.remove("mag");
        chips.forEach((c) => c.style.setProperty("--s", 1));
        placeDisc();
      });
      /* touch: a swipe only "settles" once the finger is up and momentum
         and snapping are done; a pause mid-drag never selects anything */
      const HAS_SCROLLEND = "onscrollend" in window;
      rail.addEventListener("touchstart", () => { userScroll = true; touching = true; clearTimeout(settleT); }, { passive: true });
      rail.addEventListener("touchmove", () => { if (wkbar.classList.contains("lens")) swiping = true; }, { passive: true });
      /* Safari doesn't always fire scrollend, and iOS momentum can pause
         for a moment mid-glide, so the fallback only settles once the rail
         has actually stopped moving. Settling twice is harmless. */
      const settleWhenStill = (n = 0) => {
        clearTimeout(settleT);
        settleT = setTimeout(() => {
          const x = rail.scrollLeft;
          raf2(() => {
            if (touching) return;
            if (Math.abs(rail.scrollLeft - x) > 0.5 && n < 20) settleWhenStill(n + 1);
            else railSettle();
          });
        }, n ? 80 : 180);
      };
      const touchUp = () => { touching = false; settleWhenStill(); };
      rail.addEventListener("touchend", touchUp, { passive: true });
      rail.addEventListener("touchcancel", touchUp, { passive: true });
      rail.addEventListener("pointerdown", () => { userScroll = true; }, { passive: true });
      function railSettle() {
        clearTimeout(settleT);
        if (touching) return;
        wkbar.classList.remove("scrolling");
        const was = userScroll;
        userScroll = false; swiping = false;
        if (!wkbar.classList.contains("lens")) return;
        const c = lensUpdate();
        if (!c) return;
        const w = +c.dataset.w;
        if (was && w !== week) { railWeek = w; haptic("tap"); goWeek(w); return; }
        // otherwise the disc and the centre line must agree: bring the chosen week back
        setVis(week);
        if (w !== week) centerWeek(week, "smooth");
      }
      rail.addEventListener("scroll", () => {
        wkbar.classList.add("scrolling");
        if (!sraf) sraf = requestAnimationFrame(() => {
          sraf = 0;
          railEdges();
          const c = lensUpdate();
          if (c && userScroll && wkbar.classList.contains("lens")) swiping = true;
          if (c && swiping) setVis(+c.dataset.w); else placeDisc();
          if (c && c !== lastCentre) {
            if (lastCentre && swiping) haptic("tick");
            lastCentre = c;
          }
        });
        if (!touching) settleWhenStill();
      }, { passive: true });
      if (HAS_SCROLLEND) rail.addEventListener("scrollend", railSettle);
      /* a mouse wheel scrolls the row sideways when the weeks overflow */
      rail.addEventListener("wheel", (e) => {
        if (!wkbar.classList.contains("over") || wkbar.classList.contains("lens")) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { rail.scrollLeft += e.deltaY; e.preventDefault(); }
      }, { passive: false });
      root.querySelector(".sn-arrow.l").addEventListener("click", () => rail.scrollBy({ left: -rail.clientWidth * 0.7, behavior: "smooth" }));
      root.querySelector(".sn-arrow.r").addEventListener("click", () => rail.scrollBy({ left: rail.clientWidth * 0.7, behavior: "smooth" }));
      // the rail gets its size late when the page opens scrolled or hidden
      if ("ResizeObserver" in window) new ResizeObserver(setRailEdge).observe(rail);

      /* Left and right arrow keys step through the weeks, unless something
         else has the keyboard (a field, an open drawer or box score, a
         table that scrolls sideways). */
      document.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
        const t = e.target;
        if (t && t.closest && t.closest("input, select, textarea, [contenteditable], .sn-seg, .table-wrap, .bracket-scroll")) return;
        if (document.querySelector(".team-drawer.open, .bx-modal.open, .pc-card.open, [aria-modal='true'][aria-hidden='false']")) return;
        const i = weeks.findIndex((k) => k.w === week);
        const next = weeks[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) { e.preventDefault(); goWeek(next.w); }
      });

      let rz = 0;
      window.addEventListener("resize", () => {
        cancelAnimationFrame(rz);
        rz = requestAnimationFrame(() => { watch(); relayout(); });
      });
      if (FINE.addEventListener) FINE.addEventListener("change", relayout);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    }

    /* The page calls this with whatever changed: {weeks, week} after a
       week change, {views, view} after a view change, or both. */
    let started = false;
    function render(s) {
      if (!root) return;
      if (s.weeks) weeks = s.weeks;
      if (s.views) views = s.views;
      if (s.week !== undefined && s.week !== week) { prevWeek = week; week = s.week; }
      if (s.view !== undefined) view = s.view;
      if (s.weeks || s.week !== undefined) renderWeeks();
      if (s.views || s.view !== undefined) renderViews();
      if (!started && weeks.length && views.length) {
        started = true;
        raf2(() => { measure(); watch(); relayout(); });
      }
    }

    return {
      mount,
      render,
      /* which way the week just moved, for rolling a heading with it */
      get dir() { return prevWeek != null && week < prevWeek ? "down" : "up"; },
      relayout,
    };
  })();

  window.UI = { roll, measureRows, shuffleRows, haptic, reduced: () => REDUCE.matches };
  window.SeasonNav = SeasonNav;
})();
