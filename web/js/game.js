window.App = window.App || {};
(function () {
  const App = window.App;
  const esc = App.esc;

  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VAL = {};
  RANKS.forEach((r, i) => (RANK_VAL[r] = i));
  const SUIT_IMG = { S: "piki", C: "kresti", H: "chervi", D: "bubni" };
  const SUIT_RED = { H: true, D: true };
  const CARD_PATH = "assets/big/cards/";

  function rankOf(card) {
    return card.slice(0, -1);
  }
  function suitOf(card) {
    return card.slice(-1);
  }
  function beats(def, atk, trump) {
    if (suitOf(def) === suitOf(atk)) return RANK_VAL[rankOf(def)] > RANK_VAL[rankOf(atk)];
    return suitOf(def) === trump;
  }

  function cardImg(card) {
    return `${CARD_PATH}${SUIT_IMG[suitOf(card)]}_${rankOf(card)}.png`;
  }

  function cardFaceHtml(card) {
    return `<div class="cardface"><img src="${cardImg(card)}" alt="${rankOf(card)}" draggable="false"></div>`;
  }

  App.joinGame = function (data) {
    if (data.balance != null) App.balance = data.balance;
    App.game = {
      roomId: data.room_id,
      token: data.token,
      pid: data.pid,
      ws: null,
      state: null,
      selected: null,
      target: null,
      prevTurn: null,
      round: null,
      deal: false,
      roomName: data.room ? data.room.name : "Игра",
    };
    window.addEventListener("resize", fitScene);
    document.body.classList.remove("app-tab");
    App.showScreen("screen-game");
    connect();
  };

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(App.game.token)}`);
    App.game.ws = ws;
    ws.onopen = () => {
      App.toast("Подключено", "ok");
    };
    ws.onmessage = (e) => {
      let d;
      try {
        d = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (d.type === "state") {
        if (!App.game.state || App.game.round !== d.state.round) App.game.deal = true;
        App.game.round = d.state.round;
        App.game.state = d.state;
        render();
      } else if (d.type === "waiting") {
        App.game.state = null;
        renderWaiting(d);
      } else if (d.type === "emoji") {
        showEmote(d.from, d.emoji);
      } else if (d.type === "error") {
        App.toast(d.text, "error");
      }
    };
    ws.onclose = () => {
      if (!App.game) return;
      if (App.game._leaving) return;
      const st = App.game.state;
      if (st && st.finished) return;
      renderDisconnected();
    };
    ws.onerror = () => {};
  }

  function send(obj) {
    if (App.game && App.game.ws && App.game.ws.readyState === 1) {
      App.game.ws.send(JSON.stringify(obj));
    }
  }

  function sceneEl(id) {
    return document.getElementById(id);
  }

  function scenePosOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    const scene = sceneEl("game-scene");
    const sr = scene.getBoundingClientRect();
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    return {
      x: (r.left + r.width / 2 - sr.left) / sx,
      y: (r.top + r.height / 2 - sr.top) / sy,
    };
  }

  function oppPos() {
    return scenePosOf(document.querySelector(".game-scene .opp")) || { x: 288, y: 120 };
  }

  function deckPos() {
    return scenePosOf(document.querySelector(".game-scene .deck")) || { x: 40, y: 460 };
  }

  function tablePos() {
    return scenePosOf(sceneEl("table-zone")) || { x: 288, y: 650 };
  }

  function flyFromHand(card) {
    const el = document.querySelector(`.game-scene .hand-card[data-card="${esc(card)}"]`);
    const p = scenePosOf(el);
    if (p) App.game._fly = { card, x: p.x, y: p.y };
  }

  function fitScene() {
    const screen = sceneEl("screen-game");
    if (!screen) return;
    const w = screen.clientWidth || 0;
    const h = screen.clientHeight || 0;
    if (!w || !h) return;
    const sx = w / 576;
    const sy = h / 1280;
    const scene = sceneEl("game-scene");
    if (scene) {
      scene.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
      scene._scaleX = sx;
      scene._scaleY = sy;
    }
    const wait = sceneEl("waiting-screen");
    if (wait) {
      wait.style.transform = `translate(-50%, -50%) scale(${sx}, ${sy})`;
    }
  }

  function render() {
    const s = App.game.state;
    if (!s) return;
    const g = App.game;
    showGameUi();
    fitScene();

    if (s.balance != null) App.balance = s.balance;

    if (g.prevTurn !== s.turn) {
      g.selected = null;
      g.target = null;
    }
    if (g.selected && s.my_cards.indexOf(g.selected) < 0) g.selected = null;
    if (g.target && !s.table.some((p) => p[0] === g.target && p[1] === null)) g.target = null;
    g.prevTurn = s.turn;

    sceneEl("game-balance").textContent = App.balance != null ? App.balance : "";
    sceneEl("deck-count").textContent = s.deck > 0 ? s.deck : "";

    const trumpEl = sceneEl("trump-card");
    trumpEl.innerHTML = s.trump ? cardFaceHtml(s.trump) : "";
    trumpEl.classList.toggle("off", !s.trump);
    const deckEl = document.querySelector(".game-scene .deck");
    if (deckEl) deckEl.classList.toggle("empty", !(s.deck > 0));

    renderOpp(s);
    renderMine(s);
    const prevTable = App.game._prevTable;
    if (prevTable && prevTable.size && !s.table.length && s.my_cards.length > (App.game._prevHandCount || 0)) {
      App.game._takeFly = true;
    }
    App.game._prevHandCount = s.my_cards.length;
    renderTable(s);
    renderHand(s);
    renderTurn(s);
    initEmojiControls();
    if (g.deal) startDeal();
  }

  /* ---------- соперники ---------- */
  function opponentsList(s) {
    const order = s.order || [];
    const players = s.players || [];
    const me = App.game.pid;
    const myIdx = order.indexOf(me);
    const opps = [];
    for (let i = 1; i < order.length; i++) {
      const pid = order[(myIdx + i) % order.length];
      const p = players.find((x) => x.id === pid);
      if (!p) continue;
      opps.push({
        id: pid,
        name: p.name || "Игрок",
        photo: p.photo || "",
        cards: (s.cards_by_player && s.cards_by_player[pid]) || 0,
        ended: (s.ended || []).indexOf(pid) >= 0,
      });
    }
    return opps;
  }

  function fanBacks(n) {
    const count = Math.max(0, Math.min(n, 7));
    let html = "";
    for (let i = 0; i < count; i++) {
      html += `<div class="back" style="--d:${100 + i * 70}ms"><i></i></div>`;
    }
    return html;
  }

  function renderOpp(s) {
    const opps = opponentsList(s);
    const main = opps[0];
    const slot = sceneEl("opp-slot");
    const moreEl = sceneEl("opp-more");
    if (!main) {
      slot.innerHTML = "";
      moreEl.innerHTML = "";
      return;
    }
    const isActive = !s.finished && s.active_id === main.id;
    const photo = main.photo ? ` style="background-image:url('${esc(main.photo)}')"` : "";
    slot.innerHTML = `
      <div class="fan">${fanBacks(main.cards)}</div>
      <div class="avatar ${main.photo ? "photo" : ""}${isActive ? " turn" : ""}"${photo}>
        <div class="stack${main.ended ? " gray" : ""}">${main.cards}<i></i></div>
        <div class="avatar-label">${esc(main.name)} <span class="star">★</span></div>
      </div>
      ${emoteHtml(main.id)}`;

    const more = opps.slice(1);
    moreEl.innerHTML = more
      .map((o) => {
        const act = !s.finished && s.active_id === o.id ? " turn" : "";
        const inner = o.photo
          ? `<img src="${esc(o.photo)}" alt="">`
          : `<div class="mini-init">${esc((o.name || "?").trim().charAt(0) || "?")}</div>`;
        return `<div class="opp-mini${act}">${inner}<div class="mini-count">${o.cards}</div><div class="mini-name">${esc(o.name)}</div></div>`;
      })
      .join("");
  }

  function renderMine(s) {
    const you = s.you || {};
    const myTurn = !s.finished && s.active_id === App.game.pid;
    const el = sceneEl("my-avatar");
    el.className = "my-avatar" + (you.photo ? " photo" : "") + (myTurn ? " turn" : "");
    if (you.photo) el.style.backgroundImage = `url('${esc(you.photo)}')`;
    else el.style.backgroundImage = "";
    el.innerHTML = `${emoteHtml(App.game.pid)}
      <div class="stack gray">${s.my_cards.length}<i></i></div>
      <div class="avatar-label">${esc(you.name || "Вы")} <span class="star">★</span></div>`;
  }

  /* ---------- стол ---------- */
  function renderTable(s) {
    const zone = sceneEl("table-zone");
    const prevTable = App.game._prevTable;
    const curTable = new Set();
    s.table.forEach((p) => {
      curTable.add(p[0]);
      if (p[1]) curTable.add(p[1]);
    });
    App.game._prevTable = curTable;

    if (!s.table.length) {
      zone.innerHTML = "";
      return;
    }

    const fly = prevTable ? new Set() : null;
    curTable.forEach((c) => {
      if (prevTable && !prevTable.has(c)) fly.add(c);
    });

    zone.innerHTML = s.table
      .map((pair) => {
        const atk = pair[0];
        const def = pair[1];
        const targeted = App.game.target === atk;
        const beatable = s.can_defend && !def;
        const atkFly = fly && fly.has(atk) ? " fly-in" : "";
        const defFly = fly && def && fly.has(def) ? " fly-in" : "";
        return `<div class="t-pair">
          <div class="t-card t-attack ${targeted ? "t-targeted" : ""} ${beatable ? "beatable" : ""}${atkFly}" data-target="${esc(atk)}" data-card="${esc(atk)}">${cardFaceHtml(atk)}</div>
          ${def ? `<div class="t-card t-defend${defFly}" data-card="${esc(def)}">${cardFaceHtml(def)}</div>` : ""}
        </div>`;
      })
      .join("");

    if (fly && fly.size) {
      const src = App.game._fly ? { x: App.game._fly.x, y: App.game._fly.y } : oppPos();
      zone.querySelectorAll(".t-card.fly-in").forEach((el) => {
        const dest = scenePosOf(el);
        if (!dest) return;
        el.style.setProperty("--fx", src.x - dest.x + "px");
        el.style.setProperty("--fy", src.y - dest.y + "px");
        el.style.setProperty("--fr", el.classList.contains("t-defend") ? "8deg" : "-6deg");
      });
    }
    if (App.game._fly) App.game._fly = null;

    zone.querySelectorAll(".beatable").forEach((el) => {
      el.addEventListener("click", () => {
        const st = App.game.state;
        if (!st || !st.can_defend) return;
        App.game.target = el.dataset.target;
        renderTable(st);
        renderTurn(st);
      });
    });
  }

  /* ---------- рука + drag ---------- */
  let dragActive = false;

  function renderHand(s) {
    const zone = sceneEl("hand-zone");
    const cards = s.my_cards;
    const n = cards.length;
    const canInteract = !s.finished && (s.can_attack || s.can_defend || s.can_throw);
    const prevHand = App.game._prevHand;
    const curHand = new Set(cards);
    App.game._prevHand = curHand;
    const newCards = prevHand ? cards.filter((c) => !prevHand.has(c)) : [];
    zone.innerHTML = cards
      .map((c, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        const left = 6 + 434 * t;
        const top = 74 - 4 * t;
        const angle = -6 + 9 * t;
        const cls = ["hand-card"];
        if (App.game.selected === c) cls.push("selected");
        if (!canInteract) cls.push("disabled");
        if (App.game.deal) cls.push("deal");
        return `<div class="${cls.join(" ")}" data-card="${esc(c)}" data-angle="${angle}"
          style="left:${left}px;top:${top}px;z-index:${i + 1};transform:rotate(${angle}deg);--dr:${angle}deg">${cardFaceHtml(c)}</div>`;
      })
      .join("");

    if (newCards.length && !App.game.deal) {
      const src = App.game._takeFly ? tablePos() : deckPos();
      zone.querySelectorAll(".hand-card").forEach((el) => {
        if (newCards.indexOf(el.dataset.card) >= 0) {
          const dest = scenePosOf(el);
          if (dest) {
            el.classList.add("fly-in");
            el.style.setProperty("--fx", src.x - dest.x + "px");
            el.style.setProperty("--fy", src.y - dest.y + "px");
          }
        }
      });
    }
    if (App.game._takeFly) App.game._takeFly = false;

    zone.querySelectorAll(".hand-card").forEach((el) => {
      el.addEventListener("pointerdown", (e) => startDrag(e, el));
      el.addEventListener("pointermove", onDragMove);
      el.addEventListener("pointerup", onDragUp);
      el.addEventListener("pointercancel", onDragUp);
      el.addEventListener("click", () => {
        if (!dragActive) onHandClick(s, el.dataset.card);
      });
    });
  }

  function onHandClick(s, card) {
    if (!s) return;
    if (s.finished) return;
    if (s.can_attack) {
      App.game.selected = App.game.selected === card ? null : card;
    } else if (s.can_defend) {
      App.game.selected = card;
      if (!App.game.target) {
        const first = s.table.find((p) => p[1] === null);
        if (first) App.game.target = first[0];
      }
    } else if (s.can_throw) {
      App.game.selected = App.game.selected === card ? null : card;
    } else {
      App.toast("Сейчас не ваш ход");
      return;
    }
    renderHand(s);
    renderTurn(s);
  }

  function startDrag(e, cardEl) {
    if (e.button !== 0) return;
    const s = App.game.state;
    if (!s || s.finished) return;
    App._drag = {
      card: cardEl.dataset.card,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ghost: null,
      el: cardEl,
    };
    try {
      cardEl.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function onDragMove(e) {
    const d = App._drag;
    if (!d) return;
    if (!d.moved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      dragActive = true;
      const scene = sceneEl("game-scene");
      const rect = d.el.getBoundingClientRect();
      d.ghost = document.createElement("div");
      d.ghost.className = "drag-ghost";
      d.ghost.innerHTML = d.el.innerHTML;
      d.ghost.style.width = rect.width + "px";
      d.ghost.style.height = rect.height + "px";
      scene.appendChild(d.ghost);
      d.el.classList.add("dragging");
    }
    const scene = sceneEl("game-scene");
    const srect = scene.getBoundingClientRect();
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    const x = (e.clientX - srect.left) / sx;
    const y = (e.clientY - srect.top) / sy;
    d.ghost.style.left = x - d.ghost.offsetWidth / 2 + "px";
    d.ghost.style.top = y - d.ghost.offsetHeight / 2 + "px";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under ? under.closest(".t-attack") : null;
    document.querySelectorAll(".game-scene .t-attack.drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (target) target.classList.add("drag-over");
  }

  function onDragUp(e) {
    const d = App._drag;
    if (!d) return;
    App._drag = null;
    setTimeout(() => {
      dragActive = false;
    }, 80);
    document.querySelectorAll(".game-scene .t-attack.drag-over").forEach((el) => el.classList.remove("drag-over"));
    d.el.classList.remove("dragging");
    if (d.ghost) {
      d.ghost.remove();
      d.ghost = null;
    }
    if (!d.moved) return;

    const s = App.game.state;
    if (!s || s.finished) return;
    const card = d.card;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const hoverCard = under ? under.closest(".t-attack") : null;
    const onTable = under ? under.closest(".table-zone") : null;
    if (!onTable) return;

    if (s.can_defend && hoverCard && hoverCard.classList.contains("beatable")) {
      const atk = hoverCard.dataset.target;
      if (beats(card, atk, s.trump_suit)) {
        flyFromHand(card);
        send({ type: "beat", attack: atk, defend: card });
        clearSel();
      } else {
        App.toast("Эта карта не бьёт выбранную");
      }
      return;
    }
    if (s.can_attack || s.can_throw) {
      if (canAddCard(s, card)) {
        flyFromHand(card);
        send({ type: "attack", card });
        clearSel();
      } else {
        App.toast("Эту карту нельзя подложить");
      }
      return;
    }
    if (s.can_defend) {
      App.toast("Нажмите «Взять», чтобы забрать карты");
      return;
    }
    App.toast("Сейчас не ваш ход");
  }

  function canAddCard(s, card) {
    if (!card) return false;
    if (!s.table.length) return true;
    if (s.table.length >= Math.min(6, s.opponent_cards)) return false;
    const ranks = new Set();
    s.table.forEach((p) => {
      ranks.add(rankOf(p[0]));
      if (p[1]) ranks.add(rankOf(p[1]));
    });
    return ranks.has(rankOf(card));
  }

  function clearSel() {
    App.game.selected = null;
    App.game.target = null;
  }

  /* ---------- нижняя панель ---------- */
  function turnStatus(s) {
    if (s.turn === "attack") return s.can_attack ? "Ваш ход" : `Ходит ${nameShort(s, s.active_id)}`;
    return s.can_defend ? "Отбивайтесь" : `Отбивается ${nameShort(s, s.active_id)}`;
  }

  function nameShort(s, pid) {
    if (!pid) return "соперник";
    const p = (s.players || []).find((x) => x.id === pid);
    return p && p.name ? p.name : "соперник";
  }

  function renderTurn(s) {
    const zone = sceneEl("turn-zone");
    const sel = App.game.selected;
    const html = [];

    if (s.finished) {
      html.push(`<div class="res">${s.winner === App.game.pid ? "Вы выиграли!" : "Вы проиграли"}</div>`);
      html.push(`<button class="big-btn" id="act-restart">Сыграть ещё</button>`);
      html.push(`<button class="big-btn ghost" id="act-leave">В лобби</button>`);
    } else if (s.turn === "attack") {
      const allBeat = s.table.length && !s.table.some((p) => p[1] === null);
      if (s.i_am_attacker && allBeat) html.push(`<button class="big-btn" id="act-done">Бито</button>`);
      if (s.table.length && (s.can_attack || s.can_throw) && sel && canAddCard(s, sel)) {
        html.push(`<button class="big-btn ghost" id="act-throw">Подложить</button>`);
      }
      if (!s.table.length && s.can_attack && sel) html.push(`<button class="big-btn" id="act-attack">Ваш ход</button>`);
      if (!html.length) html.push(`<div class="turn-text">${turnStatus(s)}</div>`);
    } else if (s.can_defend) {
      const valid = sel && App.game.target && beats(sel, App.game.target, s.trump_suit);
      if (valid) html.push(`<button class="big-btn" id="act-beat">Побить</button>`);
      html.push(`<button class="big-btn" id="act-take">Взять</button>`);
      if (s.mode === "perevodnoi" && s.can_transfer && sel && s.table.length && rankOf(sel) === rankOf(s.table[0][0])) {
        html.push(`<button class="big-btn ghost" id="act-transfer">Перевести</button>`);
      }
    } else {
      html.push(`<div class="turn-text">${turnStatus(s)}</div>`);
    }

    zone.innerHTML = html.join("");

    const bind = (id, fn) => {
      const b = sceneEl(id);
      if (b) b.addEventListener("click", fn);
    };
    bind("act-attack", () => {
      if (App.game.selected) {
        flyFromHand(App.game.selected);
        send({ type: "attack", card: App.game.selected });
        clearSel();
      }
    });
    bind("act-throw", () => {
      if (App.game.selected) {
        flyFromHand(App.game.selected);
        send({ type: "attack", card: App.game.selected });
        clearSel();
      }
    });
    bind("act-beat", () => {
      if (App.game.selected && App.game.target) {
        flyFromHand(App.game.selected);
        send({ type: "beat", attack: App.game.target, defend: App.game.selected });
        clearSel();
      }
    });
    bind("act-take", () => {
      send({ type: "take" });
      clearSel();
    });
    bind("act-transfer", () => {
      if (App.game.selected) {
        flyFromHand(App.game.selected);
        send({ type: "transfer", card: App.game.selected });
        clearSel();
      }
    });
    bind("act-done", () => send({ type: "done" }));
    bind("act-restart", () => send({ type: "restart" }));
    bind("act-leave", leaveGame);
  }

  /* ---------- раздача ---------- */
  function startDeal() {
    const scene = sceneEl("game-scene");
    if (!scene) return;
    scene.classList.add("dealing");
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    const srect = scene.getBoundingClientRect();
    let dx0 = 30;
    let dy0 = 440;
    const deckEl = document.querySelector(".game-scene .deck");
    if (deckEl && deckEl.getBoundingClientRect().width > 0) {
      const r = deckEl.getBoundingClientRect();
      dx0 = (r.left + r.width / 2 - srect.left) / sx;
      dy0 = (r.top + r.height / 2 - srect.top) / sy;
    }
    const cards = Array.prototype.slice.call(scene.querySelectorAll(".hand-card.deal"));
    cards.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const cx = (r.left + r.width / 2 - srect.left) / sx;
      const cy = (r.top + r.height / 2 - srect.top) / sy;
      el.style.setProperty("--dx", dx0 - cx + "px");
      el.style.setProperty("--dy", dy0 - cy + "px");
      el.style.setProperty("--d", i * 60 + "ms");
    });
    const total = 500 + cards.length * 60 + 300;
    setTimeout(() => {
      scene.classList.remove("dealing");
      cards.forEach((el) => el.classList.remove("deal"));
      if (App.game) App.game.deal = false;
    }, total);
  }

  /* ---------- эмодзи ---------- */
  const EMOTE_TTL = 2600;

  function emoteHtml(pid) {
    const e = App.game.emotes && App.game.emotes[pid];
    if (!e || Date.now() - e.ts >= EMOTE_TTL) return "";
    return `<div class="emote-pop">${e.emoji}</div>`;
  }

  function showEmote(pid, emoji) {
    if (!App.game) return;
    App.game.emotes = App.game.emotes || {};
    App.game.emotes[pid] = { emoji, ts: Date.now() };
    const s = App.game.state;
    if (s) {
      renderOpp(s);
      renderMine(s);
    }
    setTimeout(() => {
      if (App.game && App.game.emotes[pid] && Date.now() - App.game.emotes[pid].ts >= EMOTE_TTL) {
        delete App.game.emotes[pid];
        const st = App.game.state;
        if (st) {
          renderOpp(st);
          renderMine(st);
        }
      }
    }, EMOTE_TTL + 200);
  }

  function initEmojiControls() {
    const btn = sceneEl("game-emoji");
    const palette = sceneEl("emoji-palette");
    if (!btn || !palette || palette.dataset.done) return;
    palette.dataset.done = "1";
    btn.addEventListener("click", () => {
      palette.classList.toggle("hidden");
    });
    palette.querySelectorAll(".emoji-btn").forEach((b) => {
      b.addEventListener("click", () => {
        send({ type: "emoji", emoji: b.dataset.emoji });
        palette.classList.add("hidden");
      });
    });
    sceneEl("screen-game").addEventListener("click", (e) => {
      if (!e.target.closest("#emoji-palette, #game-emoji")) palette.classList.add("hidden");
    });
  }

  function renderWaiting(d) {
    App.game.state = null;
    if (d.balance != null) App.balance = d.balance;
    const room = d.room || {};
    const players = d.players || [];
    const ready = d.ready || [];
    const you = d.you || {};
    const max = room.max != null ? room.max : 2;
    const others = players.filter((p) => p.id !== App.game.pid);
    const slots = Math.max(0, max - 1);
    const many = others.length > 2;
    const deck = room.deck_size != null ? room.deck_size : 36;
    const meReady = ready.indexOf(App.game.pid) >= 0;
    const allReady = players.length > 0 && players.every((p) => ready.indexOf(p.id) >= 0);

    showWaitingUi();

    const playerCards = [];
    for (let i = 0; i < slots; i++) {
      const p = others[i];
      if (!p) {
        playerCards.push(`<div class="player">
          <div class="card empty"><div class="letter">?</div></div>
          <div class="number">${i + 1}</div>
        </div>`);
        continue;
      }
      const isReady = ready.indexOf(p.id) >= 0;
      const cls = isReady ? "card brown" : "card purple";
      const check = isReady ? '<div class="check"></div>' : "";
      const initial = esc((p.name || "?").trim().charAt(0).toUpperCase() || "?");
      const score = p.score != null ? p.score : 0;
      playerCards.push(`<div class="player">
        <div class="${cls}">${check}<div class="letter">${initial}</div><div class="name">${esc(p.name)}</div><div class="score">${score}</div></div>
        <div class="number">${i + 1}</div>
      </div>`);
    }

    const readyText = meReady
      ? allReady && players.length >= 2
        ? "Раздача..."
        : "Ожидание игроков..."
      : "Нажмите Готов";
    const readyBtn = meReady
      ? `<button class="ready-btn done" disabled>Готов</button>`
      : `<button class="ready-btn" id="wait-ready">Готов</button>`;

    const meReadyCls = meReady ? " ready" : "";
    const meCheck = meReady ? '<div class="check"></div>' : "";
    const myAvatar = you.photo
      ? `<div class="avatar photo${meReadyCls}" style="background-image:url('${esc(you.photo)}')">${meCheck}<div class="avatar-label">${esc(you.name || "Вы")}</div></div>`
      : `<div class="avatar${meReadyCls}">${meCheck}<div class="avatar-label">${esc(you.name || "Вы")}</div></div>`;

    const balance = App.balance != null ? App.balance : 0;

    const waitEl = sceneEl("waiting-screen");
    waitEl.innerHTML = `
      <div class="top-white"></div>
      <button class="scene-btn scene-leave" id="wait-leave" title="Выход">
        <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 5 8.5 13l7 8"/></svg>
      </button>
      <div class="money">${balance} <span class="bill">▰</span></div>
      <div class="top-icons"><i class="ti round"></i><i class="ti x"></i><i class="ti"></i><i class="ti round"></i></div>
      <section class="players${many ? " many" : ""}${slots === 1 ? " single" : ""}">${playerCards}</section>
      <div class="left-num">${deck}</div>
      <div class="map-edge"></div>
      <div class="ready-text">${readyText}</div>
      <div class="warning">При обнаружении шулера нажмите на нечестно<br>брошенную карту</div>
      <div class="bottom">
        ${readyBtn}
        ${myAvatar}
        <div class="actions">
          <div class="action red"><svg viewBox="0 0 40 40" fill="none" stroke-width="2.8"><rect x="12" y="5" width="20" height="29" rx="2" transform="rotate(-9 12 5)"/><path d="m18 13 8 11m0-11-8 11"/></svg><span class="coin">1 <b class="coin-dot">●</b></span></div>
          <div class="action red"><svg viewBox="0 0 40 40" fill="none" stroke-width="2.7"><rect x="8" y="11" width="25" height="19" rx="3" transform="rotate(-9 8 11)"/><circle cx="21" cy="21" r="6"/><path d="M12 9 29 6"/></svg><span class="coin">3 <b class="coin-dot">●</b></span></div>
          <div class="action"><svg viewBox="0 0 40 40" fill="none" stroke="#555" stroke-width="2.7"><rect x="10" y="8" width="22" height="28" rx="3" transform="rotate(-8 10 8)"/><circle cx="22" cy="19" r="7"/><path d="m27 25 7 7"/></svg><span class="coin">2 <b class="coin-dot">●</b></span></div>
        </div>
        <div class="footer-stats"><span>0 <b class="coin-dot">●</b></span><span>${balance} <b class="coin-square">▰</b></span></div>
      </div>`;

    const btn = sceneEl("wait-ready");
    if (btn) {
      btn.addEventListener("click", () => {
        send({ type: "ready" });
        btn.classList.add("done");
        btn.disabled = true;
        const rt = waitEl.querySelector(".ready-text");
        if (rt) rt.textContent = "Ожидание игроков...";
        const av = waitEl.querySelector(".avatar");
        if (av) {
          av.classList.add("ready");
          if (!av.querySelector(".check")) {
            const chk = document.createElement("div");
            chk.className = "check";
            av.insertBefore(chk, av.firstChild);
          }
        }
      });
    }

    const leaveBtn = sceneEl("wait-leave");
    if (leaveBtn) leaveBtn.addEventListener("click", App.requestLeave);

    fitScene();
  }

  /* ---------- переключение экранов ---------- */
  function showGameUi() {
    const wait = sceneEl("waiting-screen");
    const wrap = document.querySelector(".game-wrap");
    if (wait) wait.classList.add("hidden");
    if (wrap) wrap.classList.remove("hidden");
  }

  function showWaitingUi() {
    const wait = sceneEl("waiting-screen");
    const wrap = document.querySelector(".game-wrap");
    if (wait) wait.classList.remove("hidden");
    if (wrap) wrap.classList.add("hidden");
  }

  function renderDisconnected() {
    showGameUi();
    const zone = sceneEl("turn-zone");
    zone.innerHTML = `
      <div class="turn-text dc">Соединение потеряно</div>
      <button class="big-btn" id="act-leave">В лобби</button>`;
    const leave = sceneEl("act-leave");
    if (leave) leave.addEventListener("click", leaveGame);
  }

  function leaveGame() {
    if (App.game && App.game.ws) {
      try {
        App.game.ws.close();
      } catch (e) {}
    }
    App.game = null;
    App.showScreen("screen-lobby");
    App.setTab("open");
  }

  App.requestLeave = function () {
    const g = App.game;
    const active = !!(g && g.state && !g.state.finished);
    const title = active ? "Вы точно хотите выйти из игры?" : "Выйти из комнаты ожидания?";
    const text = active
      ? "При выходе из активной игры вам засчитается поражение и спишется ставка."
      : "Вы вернётесь в лобби.";
    App.confirm(title, text, (ok) => {
      if (!ok) return;
      if (g) {
        g._leaving = true;
        if (active && g.state.stake > 0) {
          App.toast("Поражение, минус " + g.state.stake, "error");
        }
      }
      App.leaveGame();
    });
  };

  App.leaveGame = leaveGame;
})();
