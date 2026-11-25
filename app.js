(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const KEYS = { stats: "mp.stats", favs: "mp.favs", launch: "mp.launch", sort: "mp.sort" };

  // ---------- storage (every access guarded: private mode etc.) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  const state = {
    games: [],
    stats: store.get(KEYS.stats, {}),      // { id: { plays, last } }
    favs: new Set(store.get(KEYS.favs, [])),
    launch: store.get(KEYS.launch, "fullscreen"),
    sort: store.get(KEYS.sort, "recent"),
    filter: "all",                          // "all" | "fav" | "tag:<name>"
    query: "",
    current: null,
    loadError: false,
  };

  // ---------- helpers ----------
  const slug = (s) => String(s).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");

  function normalize(raw, i) {
    const name = String(raw.name || raw["이름"] || `게임 ${i + 1}`);
    const url = String(raw.url || raw["주소"] || "");
    return {
      id: String(raw.id || slug(url || name)),
      name,
      url,
      icon: raw.icon || raw["아이콘"] || "",
      description: String(raw.description || raw["설명"] || ""),
      tags: Array.isArray(raw.tags || raw["태그"]) ? (raw.tags || raw["태그"]).map(String) : [],
      orientation: raw.orientation || "",
      // "tab" for sites that refuse to be framed (X-Frame-Options / frame-ancestors)
      launch: raw.launch === "tab" ? "tab" : "",
      order: i,
    };
  }

  function relTime(ts) {
    const diff = Math.max(0, Date.now() - ts) / 1000;
    if (diff < 60) return "방금";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
    const d = new Date(ts);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }

  const PALETTE = ["#8b7cff", "#ffb547", "#5ee2c0", "#ff7a9c", "#62b6ff", "#c48bff"];
  function letterIcon(game) {
    const ch = [...game.name.trim()][0] || "?";
    const color = PALETTE[[...game.id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="48" y="64" font-family="sans-serif" font-weight="700" font-size="46" text-anchor="middle" fill="#17132a">${ch.replace(/[<&>"]/g, "")}</text></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  function emojiIcon(emoji) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#2b2450"/><text x="48" y="66" font-size="54" text-anchor="middle">${emoji.replace(/[<&>"]/g, "")}</text></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  function iconSrc(game) {
    const icon = String(game.icon || "").trim();
    if (!icon) return letterIcon(game);
    if (/^(https?:|data:|\.{0,2}\/)|\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(icon)) return icon;
    return emojiIcon(icon);
  }
  function setIcon(img, game) {
    img.onerror = () => { img.onerror = null; img.src = letterIcon(game); };
    img.src = iconSrc(game);
  }

  const statOf = (id) => state.stats[id] || { plays: 0, last: 0 };

  function metaText(game) {
    const s = statOf(game.id);
    if (!s.plays) return "아직 플레이 전";
    return `${s.plays}회 플레이 · ${relTime(s.last)}`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---------- play tracking ----------
  function recordPlay(game) {
    const s = statOf(game.id);
    state.stats[game.id] = { plays: s.plays + 1, last: Date.now() };
    store.set(KEYS.stats, state.stats);
  }

  function launch(game, mode = game.launch || state.launch) {
    if (!game.url) { toast("이 항목에는 주소가 없어요"); return; }
    recordPlay(game);
    if (mode === "tab") {
      window.open(game.url, "_blank", "noopener");
      render();
    } else {
      openPlayer(game);
    }
  }

  // ---------- player (in-launcher fullscreen) ----------
  const player = $("#player");
  const bar = $("#player-bar");
  let frame = null;
  let playerToken = null;
  let dimTimer;

  function wakeBar() {
    bar.classList.remove("dim");
    clearTimeout(dimTimer);
    dimTimer = setTimeout(() => bar.classList.add("dim"), 2500);
  }

  // A fresh iframe per launch (src set before insertion) keeps the game's own
  // navigation out of the launcher's back-button history; removing it on close
  // drops those entries again.
  function openPlayer(game) {
    state.current = game;
    frame = document.createElement("iframe");
    frame.title = game.name;
    frame.allow = "fullscreen; autoplay; gamepad; screen-wake-lock; clipboard-write";
    frame.allowFullscreen = true;
    frame.src = game.url;
    player.prepend(frame);
    player.hidden = false;
    document.body.style.overflow = "hidden";
    playerToken = `${game.id}:${Date.now()}`;
    history.pushState({ player: playerToken }, "");
    const fs = player.requestFullscreen || player.webkitRequestFullscreen;
    if (fs) {
      Promise.resolve(fs.call(player, { navigationUI: "hide" }))
        .then(() => {
          if (game.orientation && screen.orientation && screen.orientation.lock) {
            screen.orientation.lock(game.orientation).catch(() => {});
          }
        })
        .catch(() => {});
    }
    wakeBar();
    frame.focus();
  }

  // Step back until the launcher's own entry is current. A game's own entries
  // don't change our history.state, so popstate alone can't tell us when to stop.
  function unwindHistory(tries = 6) {
    if (!tries || !(history.state && history.state.player)) return;
    history.back();
    setTimeout(() => { if (player.hidden) unwindHistory(tries - 1); }, 80);
  }

  function closePlayer({ fromHistory = false } = {}) {
    if (player.hidden) return;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      try { Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document)).catch(() => {}); } catch { /* ignore */ }
    }
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch { /* ignore */ }
    if (frame) { frame.remove(); frame = null; }
    player.hidden = true;
    document.body.style.overflow = "";
    state.current = null;
    playerToken = null;
    if (!fromHistory) unwindHistory();
    render();
  }

  $("#player-close").addEventListener("click", () => closePlayer());
  $("#player-newtab").addEventListener("click", () => {
    const g = state.current;
    if (!g) return;
    window.open(g.url, "_blank", "noopener");
    closePlayer();
  });
  player.addEventListener("pointerdown", wakeBar);
  bar.addEventListener("pointerenter", wakeBar);
  // Back button: leave the player when we land on any entry that isn't this
  // launch's own. Games may push their own entries (e.g. a back-button trap);
  // those stay behind after the iframe is gone, so keep stepping back past
  // stale player entries until we reach the launcher's own.
  window.addEventListener("popstate", (e) => {
    const token = e.state && e.state.player;
    if (!player.hidden) {
      if (token !== playerToken) closePlayer({ fromHistory: true });
      if (token && token !== playerToken) history.back();
    } else if (token) {
      history.back();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !player.hidden && !document.fullscreenElement) closePlayer();
  });

  // ---------- favorites ----------
  function toggleFav(game, btn) {
    if (state.favs.has(game.id)) {
      state.favs.delete(game.id);
      toast("즐겨찾기에서 뺐어요");
    } else {
      state.favs.add(game.id);
      toast("즐겨찾기에 넣었어요");
    }
    store.set(KEYS.favs, [...state.favs]);
    render();
    const again = document.querySelector(`.card[data-id="${CSS.escape(game.id)}"] .fav`);
    if (again && btn) { again.classList.add("pop"); again.focus(); }
  }

  // ---------- hero tint from icon colour ----------
  const tintCache = new Map();
  function tintFrom(src) {
    if (tintCache.has(src)) { applyTint(tintCache.get(src)); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]);
          const min = Math.min(d[i], d[i + 1], d[i + 2]);
          const sat = max ? (max - min) / max : 0;
          const weight = sat * sat * (max / 255) * (d[i + 3] / 255);
          r += d[i] * weight; g += d[i + 1] * weight; b += d[i + 2] * weight; w += weight;
        }
        if (w < 1) return;
        const rgb = [r / w, g / w, b / w].map(Math.round).join(", ");
        tintCache.set(src, rgb);
        applyTint(rgb);
      } catch { /* tainted canvas: keep default tint */ }
    };
    img.src = src;
  }
  function applyTint(rgb) { document.documentElement.style.setProperty("--hero-tint", rgb); }

  // ---------- rendering ----------
  function sorted(list) {
    const arr = [...list];
    if (state.sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (state.sort === "plays") arr.sort((a, b) => statOf(b.id).plays - statOf(a.id).plays || a.order - b.order);
    else arr.sort((a, b) => statOf(b.id).last - statOf(a.id).last || a.order - b.order);
    return arr;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.games.filter((g) => {
      if (state.filter === "fav" && !state.favs.has(g.id)) return false;
      if (state.filter.startsWith("tag:") && !g.tags.includes(state.filter.slice(4))) return false;
      if (!q) return true;
      return [g.name, g.description, ...g.tags].some((t) => t.toLowerCase().includes(q));
    });
  }

  function renderHero() {
    const hero = $("#hero");
    if (!state.games.length) { hero.hidden = true; return; }
    const recent = sorted(state.games).filter((g) => statOf(g.id).plays)[0];
    const game = recent || state.games[0];
    const s = statOf(game.id);
    hero.hidden = false;
    $("#hero-kicker").textContent = recent ? "이어하기" : "처음 시작하기";
    $("#hero-title").textContent = game.name;
    $("#hero-meta").textContent = recent
      ? `${relTime(s.last)} 플레이, 총 ${s.plays}회`
      : game.description;
    $("#hero-play-label").textContent = recent ? "이어서 플레이" : "플레이";
    const icon = $("#hero-icon");
    setIcon(icon, game);
    $("#hero-play").onclick = () => launch(game);
    tintFrom(iconSrc(game));
  }

  function renderRecent() {
    const played = state.games.filter((g) => statOf(g.id).plays)
      .sort((a, b) => statOf(b.id).last - statOf(a.id).last)
      .slice(0, 12);
    const shelf = $("#recent-shelf");
    shelf.hidden = played.length < 2;
    if (shelf.hidden) return;
    const list = $("#recent-list");
    list.replaceChildren(...played.map((g) => {
      const li = document.createElement("li");
      li.className = "shelf-item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shelf-btn";
      btn.setAttribute("aria-label", `${g.name} 플레이`);
      const img = document.createElement("img");
      img.alt = "";
      setIcon(img, g);
      const label = document.createElement("span");
      label.textContent = g.name;
      btn.append(img, label);
      btn.addEventListener("click", () => launch(g));
      li.append(btn);
      return li;
    }));
  }

  function renderChips() {
    const tags = [...new Set(state.games.flatMap((g) => g.tags))];
    const chips = [
      { key: "all", label: "전체" },
      { key: "fav", label: "★ 즐겨찾기", cls: "chip-fav" },
      ...tags.map((t) => ({ key: `tag:${t}`, label: `#${t}` })),
    ];
    if (!chips.some((c) => c.key === state.filter)) state.filter = "all";
    $("#chips").replaceChildren(...chips.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (c.cls ? " " + c.cls : "");
      b.textContent = c.label;
      b.setAttribute("aria-pressed", String(state.filter === c.key));
      b.addEventListener("click", () => { state.filter = state.filter === c.key ? "all" : c.key; render(); });
      return b;
    }));
  }

  const tpl = $("#card-tpl");
  function renderGrid() {
    const list = sorted(filtered());
    $("#library-count").textContent = String(state.games.length);
    $("#grid").replaceChildren(...list.map((g) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = g.id;
      const main = node.querySelector(".card-main");
      main.setAttribute("aria-label", `${g.name} 플레이 (${(g.launch || state.launch) === "tab" ? "새 탭" : "전체화면"})`);
      main.addEventListener("click", () => launch(g));
      setIcon(node.querySelector(".card-icon"), g);
      node.querySelector(".card-name").textContent = g.name;
      node.querySelector(".card-desc").textContent = g.description;
      node.querySelector(".card-meta").textContent = metaText(g);
      const fav = node.querySelector(".fav");
      const isFav = state.favs.has(g.id);
      fav.setAttribute("aria-pressed", String(isFav));
      fav.setAttribute("aria-label", isFav ? `${g.name} 즐겨찾기 해제` : `${g.name} 즐겨찾기`);
      fav.addEventListener("click", () => toggleFav(g, fav));
      const nt = node.querySelector(".newtab");
      nt.href = g.url;
      nt.setAttribute("aria-label", `${g.name} 새 탭에서 열기`);
      nt.addEventListener("click", () => { recordPlay(g); setTimeout(render, 0); });
      node.querySelector(".card-tags").replaceChildren(...g.tags.map((t) => {
        const li = document.createElement("li");
        li.textContent = `#${t}`;
        return li;
      }));
      return node;
    }));

    const empty = $("#empty");
    if (list.length) { empty.hidden = true; return; }
    empty.hidden = false;
    if (state.loadError) empty.textContent = "게임 목록(games.json)을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.";
    else if (!state.games.length) empty.textContent = "games.json에 게임을 추가하면 여기에 나타나요.";
    else if (state.query) empty.textContent = `‘${state.query}’에 맞는 게임이 없어요. 검색어를 바꾸거나 지워 보세요.`;
    else if (state.filter === "fav") empty.textContent = "즐겨찾기한 게임이 없어요. 카드의 ★를 눌러 추가하세요.";
    else empty.textContent = "이 태그에 해당하는 게임이 없어요.";
  }

  function render() {
    renderHero();
    renderRecent();
    renderChips();
    renderGrid();
  }

  // ---------- controls ----------
  const sortSel = $("#sort");
  sortSel.value = state.sort;
  sortSel.addEventListener("change", () => { state.sort = sortSel.value; store.set(KEYS.sort, state.sort); render(); });

  $("#search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });

  const sheet = $("#settings");
  $("#settings-btn").addEventListener("click", () => {
    sheet.querySelector(`input[value="${state.launch}"]`).checked = true;
    sheet.showModal();
  });
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  sheet.querySelectorAll('input[name="launch"]').forEach((r) => r.addEventListener("change", () => {
    state.launch = r.value;
    store.set(KEYS.launch, state.launch);
    toast(r.value === "tab" ? "이제 새 탭으로 열어요" : "이제 전체화면으로 열어요");
    renderGrid();
  }));
  $("#reset-stats").addEventListener("click", () => {
    if (!confirm("최근 플레이와 플레이 횟수를 모두 지울까요? 즐겨찾기는 그대로 둡니다.")) return;
    state.stats = {};
    store.set(KEYS.stats, state.stats);
    sheet.close();
    render();
    toast("플레이 기록을 지웠어요");
  });

  function syncOnline() { $("#offline-note").hidden = navigator.onLine; }
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();

  // relative times drift; refresh once a minute while visible
  setInterval(() => { if (!document.hidden && player.hidden) render(); }, 60000);

  // ---------- boot ----------
  async function load() {
    try {
      const res = await fetch("./games.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      state.games = (Array.isArray(data) ? data : data.games || []).map(normalize);
    } catch (err) {
      state.games = [];
      state.loadError = true;
    }
    render();
  }
  load();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
