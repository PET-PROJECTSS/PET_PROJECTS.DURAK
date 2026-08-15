window.App = window.App || {};
(function () {
  const App = window.App;
  const esc = App.esc;

  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VAL = {};
  RANKS.forEach((r, i) => (RANK_VAL[r] = i));
  const SUIT_IMG = { S: "piki", C: "kresti", H: "chervi", D: "bubni" };
  const SUIT_ORDER = ["S", "C", "H", "D"];
  const SUIT_RED = { H: true, D: true };
  const CARD_PATH = "assets/big/cards/";
  const TARGET_SNAP = 130;

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

  function sortHand(cards, trump) {
    return (cards || []).slice().sort((a, b) => {
      const ta = suitOf(a) === trump;
      const tb = suitOf(b) === trump;
      if (ta !== tb) return ta ? 1 : -1;
      if (ta) return RANK_VAL[rankOf(a)] - RANK_VAL[rankOf(b)];
      const sa = SUIT_ORDER.indexOf(suitOf(a));
      const sb = SUIT_ORDER.indexOf(suitOf(b));
      return sa !== sb ? sa - sb : RANK_VAL[rankOf(a)] - RANK_VAL[rankOf(b)];
    });
  }

  function cardImg(card) {
    return `${CARD_PATH}${SUIT_IMG[suitOf(card)]}_${rankOf(card)}.png`;
  }

  function cardFaceHtml(card) {
    return `<div class="cardface"><img src="${cardImg(card)}" alt="${rankOf(card)}" draggable="false"></div>`;
  }

  App.joinGame = function (data) {
    if (App.game && App.game.ws && (App.game.ws.readyState === 0 || App.game.ws.readyState === 1)) {
      return;
    }
    if (data.balance != null) App.balance = data.balance;
    if (App.stopRoomsPoll) App.stopRoomsPoll();
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
    try {
      sessionStorage.setItem("durak_active", JSON.stringify({ roomId: data.room_id, pid: data.pid }));
    } catch (e) {}
    window.addEventListener("resize", fitScene);
    document.body.classList.remove("app-tab");
    App.showScreen("screen-game");
    connect();
  };

  let watchdogTimer = null;

  function watchdogReset() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      if (App.game && App.game.ws) {
        try {
          App.game.ws.close();
        } catch (e) {}
      }
    }, 30000);
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(App.game.token)}`);
    App.game.ws = ws;
    ws.onopen = () => {
      App.toast("Подключено", "ok");
      watchdogReset();
    };
    ws.onmessage = (e) => {
      watchdogReset();
      let d;
      try {
        d = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (d.type === "ping") {
        send({ type: "pong" });
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
        const st = App.game && App.game.state;
        if (st && !st.finished) {
          renderHand(st);
          renderTurn(st);
        }
      }
    };
    ws.onclose = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (!App.game) return;
      if (App.game._leaving) return;
      const st = App.game.state;
      if (st && st.finished) return;
      renderDisconnected();
      scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  let reconnectTimer = null;
  let reconnectAttempts = 0;

  function scheduleReconnect() {
    if (!App.game || App.game._leaving) return;
    if (reconnectTimer) return;
    if (reconnectAttempts >= 10) {
      renderDisconnected();
      return;
    }
    const delay = Math.min(60000, 1200 * Math.pow(1.7, reconnectAttempts));
    reconnectAttempts++;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (!App.game || App.game._leaving) return;
      try {
        const payload = {
          init_data: App.initData,
          guest_name: (App.me && App.me.name) || "Гость",
          guest_pid: App.guestPid,
        };
        const data = await App.api.join(App.game.roomId, payload);
        if (!data || !data.ok) {
          scheduleReconnect();
          return;
        }
        App.game.token = data.token;
        reconnectAttempts = 0;
        connect();
      } catch (err) {
        const msg = (err && err.message) || "";
        if (msg.indexOf("не найдена") >= 0 || msg.indexOf("Игра уже идёт") >= 0) {
          abandonGame();
          return;
        }
        scheduleReconnect();
      }
    }, delay);
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
    let r = el.getBoundingClientRect();
    if (!r.width && el.querySelector) {
      const face = el.querySelector(".cardface");
      if (face) {
        el = face;
        r = face.getBoundingClientRect();
      }
    }
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

  function discardPos() {
    return scenePosOf(sceneEl("discard-pile")) || { x: 522, y: 527 };
  }

  function tableCardPos(card) {
    const el = document.querySelector(`.game-scene .t-card[data-card="${esc(card)}"]`);
    return scenePosOf(el);
  }

  function floatCard(opts) {
    const scene = sceneEl("game-scene");
    if (!scene) return;
    const el = document.createElement("div");
    el.className = "float-card";
    el.innerHTML = opts.back
      ? `<img src="assets/big/cards/card_bg.png" alt="" draggable="false">`
      : cardFaceHtml(opts.card);
    if (opts.badge) {
      el.classList.add("float-badge");
      const b = document.createElement("div");
      b.className = "cheat-badge";
      b.innerHTML = `<img src="assets/general/appTexture44443/game_icon_bandit.png" alt="">`;
      el.appendChild(b);
    }
    const w = opts.w || 104;
    const h = opts.h || 148;
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.left = opts.srcX - w / 2 + "px";
    el.style.top = opts.srcY - h / 2 + "px";
    if (opts.z) el.style.zIndex = opts.z;
    scene.appendChild(el);
    const dx = opts.dstX - opts.srcX;
    const dy = opts.dstY - opts.srcY;
    const delay = opts.delay || 0;
    const dur = opts.dur || 460;
    const rot = opts.rot || 0;
    const ease = opts.ease || "cubic-bezier(0.25, 0.7, 0.3, 1)";
    const mx = opts.mx != null ? opts.mx : -dx * 0.1;
    const my = opts.my != null ? opts.my : Math.min(-60, -Math.abs(dx) * 0.22);
    const kf = [
      { transform: "translate(0px, 0px) rotate(0deg)", opacity: 1 },
      { offset: 0.5, transform: `translate(${dx * 0.5 + mx}px, ${dy * 0.5 + my}px) rotate(${rot * 0.5}deg)`, opacity: opts.fade ? 0.5 : 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: opts.fade ? 0 : 1 },
    ];
    const anim = el.animate(kf, {
      duration: dur,
      delay: delay,
      easing: ease,
      fill: "backwards",
    });
    anim.onfinish = () => el.remove();
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, delay + dur + 220);
  }

  function playBito(cards) {
    const dest = discardPos();
    if (!dest) return;
    let i = 0;
    cards.forEach((card) => {
      const src = tableCardPos(card);
      if (!src) return;
      floatCard({
        srcX: src.x,
        srcY: src.y,
        dstX: dest.x,
        dstY: dest.y,
        back: true,
        delay: i * 55,
        dur: 500,
        rot: -8 + i * 3,
      });
      i++;
    });
  }

  function nearestTarget(x, y, card, s) {
    const els = document.querySelectorAll(".game-scene .t-attack.beatable");
    let best = null;
    let bestD = Infinity;
    els.forEach((el) => {
      const atk = el.dataset.target;
      if (!s.shulers && !beats(card, atk, s.trump_suit)) return;
      const p = scenePosOf(el);
      if (!p) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    });
    return best ? { el: best, dist: bestD } : null;
  }

  function renderDiscard(s) {
    const el = sceneEl("discard-pile");
    if (!el) return;
    const n = s.discard || 0;
    const pile = Math.min(n, 5);
    let html = "";
    for (let i = 0; i < pile; i++) {
      html += `<div class="back d${i + 1}"><img src="assets/big/cards/card_bg.png" alt=""></div>`;
    }
    if (n > 0) html += `<div class="discard-count">${n}</div>`;
    el.innerHTML = html;
    el.classList.toggle("empty", n === 0);
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

    const prevS = g._prevState;
    g._bito = null;
    g._takeFly = false;
    g._takenCards = null;
    if (prevS && prevS.table.length && !s.table.length) {
      const prevCards = new Set();
      prevS.table.forEach((p) => {
        if (p[0]) prevCards.add(p[0]);
        if (p[1]) prevCards.add(p[1]);
      });
      if (s.discard > prevS.discard) {
        g._bito = prevCards;
      } else {
        g._takeFly = true;
        const posMap = {};
        prevCards.forEach((card) => {
          const p = tableCardPos(card);
          if (p) posMap[card] = p;
        });
        g._takenCards = posMap;
      }
    }
    if (g._bito && g._bito.size) playBito(g._bito);

    sceneEl("game-balance").innerHTML = (App.balance != null ? App.balance : "") + ' <span class="bill">▰</span>';
    sceneEl("footer-stats").innerHTML = `<span>0 <b class="coin-dot">●</b></span><span>${App.balance != null ? App.balance : ""} <b class="coin-square">▰</b></span>`;
    sceneEl("deck-count").textContent = s.deck > 0 ? s.deck : "";

    const trumpEl = sceneEl("trump-card");
    trumpEl.innerHTML = s.trump ? cardFaceHtml(s.trump) : "";
    trumpEl.classList.toggle("off", !s.trump);
    const deckEl = document.querySelector(".game-scene .deck");
    if (deckEl) deckEl.classList.toggle("empty", !(s.deck > 0));

    renderOpp(s);
    renderMine(s);
    renderDiscard(s);
    renderTable(s);
    renderHand(s);
    renderTurn(s);
    initEmojiControls();
    if (g.deal && !g._dealing) startDeal();

    g._prevState = s;
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

  function fanBacks(n, deal, dealFrom) {
    const count = Math.max(0, Math.min(n, 7));
    const degs = [-38, -25, -13, 0, 13, 25, 38];
    let html = "";
    for (let i = 0; i < count; i++) {
      const isNew = deal && i >= dealFrom;
      const cls = isNew ? "back deal" : "back";
      html += `<div class="${cls}" style="--d:${100 + i * 70}ms;--fr:${degs[i]}deg"><img src="assets/big/cards/card_bg.png" alt=""></div>`;
    }
    return html;
  }

  function turnTimerHtml(active, s) {
    const left = s && s.turn_seconds_left;
    if (!active || !left || left <= 0) return "";
    const ms = Math.round(Math.min(left, s.turn_seconds || 30) * 1000);
    return `<svg class="turn-timer" viewBox="0 0 100 100" preserveAspectRatio="none" style="--tt:${Math.max(250, ms)}ms"><rect x="4" y="4" width="92" height="92" rx="12" fill="none"/></svg>`;
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
    let dealFrom = null;
    if (App.game.deal) {
      const prevOpp = App.game._prevOppCards;
      if (prevOpp == null) dealFrom = 0;
      else if (main.cards > prevOpp) dealFrom = prevOpp;
    }
    App.game._prevOppCards = main.cards;
    slot.innerHTML = `
      <div class="fan">${fanBacks(main.cards, dealFrom != null, dealFrom)}</div>
      <div class="avatar ${main.photo ? "photo" : ""}${isActive ? " turn" : ""}"${photo}>
        ${turnTimerHtml(isActive, s)}
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
    el.innerHTML = `${emoteHtml(App.game.pid)}${turnTimerHtml(myTurn, s)}
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
      .map((pair, i) => {
        const atk = pair[0];
        const def = pair[1];
        const targeted = App.game.target === atk;
        const beatable = s.can_defend && !def;
        const atkFly = fly && fly.has(atk) ? " fly-in" : "";
        const defFly = fly && def && fly.has(def) ? " fly-in" : "";
        return `<div class="t-pair">
          <div class="t-card t-attack ${targeted ? "t-targeted" : ""} ${beatable ? "beatable" : ""}${atkFly}" data-target="${esc(atk)}" data-card="${esc(atk)}">${cardFaceHtml(atk)}</div>
          ${def ? `<div class="t-card t-defend${defFly}" data-card="${esc(def)}" data-defend="${esc(def)}" data-attack="${esc(atk)}">${cardFaceHtml(def)}</div>` : ""}
          ${s.can_transfer && i === 0 ? `<img class="transfer-arrow" src="assets/general/appTexture8888/arrow_hint_right.png" alt="">` : ""}
        </div>`;
      })
      .join("");

    if (fly && fly.size) {
      const src = App.game._fly ? { x: App.game._fly.x, y: App.game._fly.y } : oppPos();
      zone.querySelectorAll(".t-card.fly-in").forEach((el) => {
        const dest = scenePosOf(el);
        if (!dest) return;
        const isDef = el.classList.contains("t-defend");
        el.style.setProperty("--fx", src.x - dest.x + "px");
        el.style.setProperty("--fy", src.y - dest.y + "px");
        el.style.setProperty("--fr", isDef ? "8deg" : "-6deg");
        el.style.setProperty("--mx", "0px");
        el.style.setProperty("--my", isDef ? "-46px" : "-70px");
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

    zone.querySelectorAll(".t-defend").forEach((el) => {
      el.addEventListener("click", () => {
        const st = App.game.state;
        if (!st || !st.can_catch) return;
        const sp = scenePosOf(el);
        if (sp) {
          floatCard({
            card: el.dataset.defend,
            srcX: sp.x,
            srcY: sp.y,
            dstX: oppPos().x,
            dstY: oppPos().y,
            back: false,
            dur: 420,
            rot: 14,
            badge: true,
            z: 96,
          });
        }
        send({ type: "catch", attack: el.dataset.attack, defend: el.dataset.defend });
        App.toast("Шулер пойман!", "ok");
        clearSel();
      });
    });
  }

  /* ---------- рука + drag ---------- */
  let dragActive = false;

  function renderHand(s) {
    const zone = sceneEl("hand-zone");
    const cards = sortHand(s.my_cards, s.trump_suit);
    const n = cards.length;
    const canInteract = !s.finished && (s.can_attack || s.can_defend || s.can_throw);
    const prevHand = App.game._prevHand;
    const curHand = new Set(cards);
    App.game._prevHand = curHand;

    let newCards = [];
    if (!prevHand) {
      if (App.game.deal) newCards = cards.slice();
    } else {
      newCards = cards.filter((c) => !prevHand.has(c));
    }
    const dealing = !!(App.game.deal && !App.game._takeFly);
    const takenMap = App.game._takenCards || {};
    let cardW = n > 7 ? 104 : n > 5 ? 118 : 126;
    if (n > 12) {
      cardW = Math.max(72, Math.min(cardW, 576 - 8 - 40 * (n - 1)));
    }
    const margin = 4;
    const span = 576 - margin * 2 - cardW;
    zone.innerHTML = cards
      .map((c, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        const left = margin + span * t;
        const top = 74 - 10 * Math.sin(Math.PI * t);
        const angle = -6 + 12 * t;
        const cls = ["hand-card"];
        if (App.game.selected === c) cls.push("selected");
        if (!canInteract) cls.push("disabled");
        if (dealing && newCards.indexOf(c) >= 0) cls.push("deal");
        return `<div class="${cls.join(" ")}" data-card="${esc(c)}" data-angle="${angle}"
          style="left:${left}px;top:${top}px;--cw:${cardW}px;z-index:${i + 1};transform:rotate(${angle}deg);--dr:${angle}deg">${cardFaceHtml(c)}</div>`;
      })
      .join("");

    if (newCards.length) {
      let takeIdx = 0;
      zone.querySelectorAll(".hand-card").forEach((el) => {
        const c = el.dataset.card;
        if (newCards.indexOf(c) < 0 || el.classList.contains("deal")) return;
        el.classList.add("fly-in");
        let src = deckPos();
        if (App.game._takeFly && takenMap[c]) {
          src = takenMap[c];
          el.classList.add("fly-take");
          el.style.animationDelay = takeIdx * 90 + "ms";
          takeIdx++;
        }
        const dest = scenePosOf(el);
        if (dest) {
          el.style.setProperty("--fx", src.x - dest.x + "px");
          el.style.setProperty("--fy", src.y - dest.y + "px");
          el.style.setProperty("--mx", "40px");
          el.style.setProperty("--my", "-34px");
        }
      });
    }

    if (App.game._takeFly && takenMap) {
      const myTook = new Set(newCards);
      const dest = oppPos();
      let i = 0;
      Object.keys(takenMap).forEach((c) => {
        if (myTook.has(c)) return;
        const src = takenMap[c];
        floatCard({
          srcX: src.x,
          srcY: src.y,
          dstX: dest.x,
          dstY: dest.y,
          back: true,
          delay: i * 90,
          dur: 800,
          rot: -6 + i * 4,
        });
        i++;
      });
    }

    zone.querySelectorAll(".hand-card").forEach((el) => {
      el.addEventListener("pointerdown", (e) => startDrag(e, el));
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
    const scene = sceneEl("game-scene");
    const sx = (scene && scene._scaleX) || 1;
    const r = cardEl.getBoundingClientRect();
    App._drag = {
      card: cardEl.dataset.card,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: (e.clientX - r.left) / sx,
      grabDY: (e.clientY - r.top) / sx,
      moved: false,
      el: cardEl,
      orig: null,
    };
    try {
      cardEl.setPointerCapture(e.pointerId);
    } catch (err) {}
  }

  function onDragMove(e) {
    const d = App._drag;
    if (!d) return;
    const scene = sceneEl("game-scene");
    if (!scene) return;
    const srect = scene.getBoundingClientRect();
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    if (!d.moved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      dragActive = true;
      const hz = sceneEl("hand-zone");
      if (hz) hz.style.zIndex = 100;
      const el = d.el;
      d.orig = {
        left: el.style.left,
        top: el.style.top,
        zIndex: el.style.zIndex,
        transform: el.style.transform,
      };
    }
    const hz = sceneEl("hand-zone");
    const hr = (hz && hz.getBoundingClientRect()) || srect;
    d.el.style.left = (e.clientX - hr.left) / sx - d.grabDX + "px";
    d.el.style.top = (e.clientY - hr.top) / sy - d.grabDY + "px";
    d.el.style.transform = "rotate(6deg) scale(1.05)";
    d.el.style.zIndex = 90;
    d.el.classList.add("dragging");
    const st = App.game.state;
    document.querySelectorAll(".game-scene .t-attack.drag-over").forEach((el) => el.classList.remove("drag-over"));
    d._nearest = null;
    if (st && st.can_defend) {
      const c = scenePosOf(d.el);
      if (c) {
        const nt = nearestTarget(c.x, c.y, d.card, st);
        if (nt) {
          d._nearest = nt;
          nt.el.classList.add("drag-over");
        }
      }
    }
  }

  function onDragUp(e) {
    const d = App._drag;
    if (!d) return;
    App._drag = null;
    setTimeout(() => {
      dragActive = false;
    }, 80);
    document.querySelectorAll(".game-scene .t-attack.drag-over").forEach((el) => el.classList.remove("drag-over"));

    const s = App.game.state;
    const card = d.card;
    const wasMoved = d.moved;
    const scene = sceneEl("game-scene");
    const srect = scene.getBoundingClientRect();
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    const dropP = wasMoved && s && !s.finished ? scenePosOf(d.el) : null;
    if (dropP) App.game._fly = { card, x: dropP.x, y: dropP.y };

    let sent = false;

    if (dropP) {
      if (s.can_defend) {
        let targetEl = null;
        let targetDist = Infinity;
        document.querySelectorAll(".game-scene .t-attack.beatable").forEach((el) => {
          const atk = el.dataset.target;
          if (!s.shulers && !beats(card, atk, s.trump_suit)) return;
          const c = scenePosOf(el);
          if (!c) return;
          const dist = Math.hypot(c.x - dropP.x, c.y - dropP.y);
          if (dist < targetDist) {
            targetDist = dist;
            targetEl = el;
          }
        });
        if (targetEl && targetDist <= TARGET_SNAP) {
          const atk = targetEl.dataset.target;
          sent = true;
          send({ type: "beat", attack: atk, defend: card });
          clearSel();
        }
      } else {
        const zoneEl = sceneEl("table-zone");
        const zr = zoneEl ? zoneEl.getBoundingClientRect() : null;
        const handEl = sceneEl("hand-zone");
        const hr = handEl ? handEl.getBoundingClientRect() : null;
        const onTable =
          zr &&
          dropP.x >= (zr.left - srect.left) / sx &&
          dropP.x <= (zr.right - srect.left) / sx &&
          dropP.y < ((hr ? hr.top : zr.bottom) - srect.top) / sy - 20;
        if (onTable && (s.can_attack || s.can_throw)) {
          sent = true;
          send({ type: "attack", card });
          clearSel();
        }
      }
    }

    if (!sent && d.orig) {
      d.el.style.left = d.orig.left;
      d.el.style.top = d.orig.top;
      d.el.style.transform = d.orig.transform;
      d.el.style.zIndex = d.orig.zIndex;
    }
    d.el.classList.remove("dragging");
    const hz = sceneEl("hand-zone");
    if (hz) hz.style.zIndex = "";
  }

  function clearSel() {
    App.game.selected = null;
    App.game.target = null;
  }

  /* ---------- нижняя панель ---------- */
  function turnStatus(s) {
    if (s.turn === "attack") return s.can_attack ? "Ваш ход" : "Ожидание соперника";
    return s.can_defend ? "Отбивайтесь" : "Ожидание соперника";
  }

  function transferCard(s, sel) {
    if (!s || !s.table.length) return null;
    const rank = rankOf(s.table[0][0]);
    if (sel && rankOf(sel) === rank && s.my_cards.indexOf(sel) >= 0) return sel;
    return s.my_cards.find((c) => rankOf(c) === rank) || null;
  }

  function renderTurn(s) {
    const zone = sceneEl("turn-zone");
    const sel = App.game.selected;
    const html = [];

    if (s.opponent_gone && !s.finished) {
      html.push(`<div class="turn-text opp-gone">Соперник отключился. Ждём...</div>`);
    } else if (s.finished) {
      if (s.round > 0 && s.winner != null && !App.game._finishShown) {
        App.game._finishShown = true;
        showFinishOverlay(s.winner === App.game.pid);
      }
    } else if (s.turn === "attack") {
      const allBeat = s.table.length && !s.table.some((p) => p[1] === null);
      if (s.i_am_attacker && allBeat) html.push(`<button class="big-btn" id="act-done">Бито</button>`);
      if (!s.table.length && s.can_attack && sel) html.push(`<button class="big-btn" id="act-attack">Ваш ход</button>`);
      if (s.can_catch) html.push(`<div class="turn-text catch-hint">Нажмите на нечестно брошенную карту, чтобы поймать шулера!</div>`);
      if (!html.length) html.push(`<div class="turn-text">${turnStatus(s)}</div>`);
    } else if (s.can_defend) {
      html.push(`<button class="big-btn" id="act-take">Взять</button>`);
      if (s.mode === "perevodnoi" && s.can_transfer && s.table.length && transferCard(s, sel)) {
        html.push(`<button class="big-btn ghost" id="act-transfer">Перевести</button>`);
      }
    }

    if (!s.opponent_gone && s.table.length && (s.can_attack || s.can_throw) && sel) {
      html.push(`<button class="big-btn ghost" id="act-throw">Подложить</button>`);
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
    bind("act-take", () => {
      send({ type: "take" });
      clearSel();
    });
    bind("act-transfer", () => {
      const card = transferCard(App.game.state, App.game.selected);
      if (card) {
        flyFromHand(card);
        send({ type: "transfer", card });
        clearSel();
      }
    });
    bind("act-done", () => send({ type: "done" }));
    bind("act-leave", leaveGame);
  }

  /* ---------- конец игры ---------- */
  function showFinishOverlay(win) {
    const scene = sceneEl("game-scene");
    if (!scene) return;
    const g = App.game;
    const overlay = document.createElement("div");
    overlay.className = "finish-overlay";
    overlay.innerHTML = `
      <div class="finish-card ${win ? "win" : "lose"}">
        <div class="finish-title">${win ? "Победа!" : "Поражение"}</div>
        <div class="finish-sub">${win ? "Вы выиграли партию" : "Повезёт в следующий раз"}</div>
        <button class="finish-exit" type="button">Выйти</button>
      </div>`;
    scene.appendChild(overlay);
    overlay.querySelector(".finish-exit").addEventListener("click", () => {
      if (g) g._leaving = true;
      leaveGame();
    });
    setTimeout(() => {
      if (App.game === g) leaveGame();
    }, 3500);
  }

  /* ---------- раздача ---------- */
  function startDeal() {
    const scene = sceneEl("game-scene");
    if (!scene) return;
    const g = App.game;
    if (g._dealing) return;
    g._dealing = true;
    scene.classList.add("dealing");
    const src = deckPos();
    const myEls = Array.prototype.slice.call(scene.querySelectorAll(".hand-card.deal"));
    const oppEls = Array.prototype.slice.call(scene.querySelectorAll(".fan .back.deal"));
    const step = 90;
    const total = Math.max(myEls.length, oppEls.length);
    const anims = [];
    for (let i = 0; i < total; i++) {
      if (myEls[i]) anims.push({ el: myEls[i], d: i * step });
      if (oppEls[i]) anims.push({ el: oppEls[i], d: i * step + step / 2 });
    }
    const srect = scene.getBoundingClientRect();
    const sx = scene._scaleX || 1;
    const sy = scene._scaleY || 1;
    anims.forEach((a) => {
      const el = a.el;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const cx = (r.left + r.width / 2 - srect.left) / sx;
      const cy = (r.top + r.height / 2 - srect.top) / sy;
      el.style.setProperty("--dx", src.x - cx + "px");
      el.style.setProperty("--dy", src.y - cy + "px");
      el.style.setProperty("--d", a.d + "ms");
      const isHand = el.classList.contains("hand-card");
      el.style.setProperty("--mx", isHand ? "46px" : "-24px");
      el.style.setProperty("--my", isHand ? "-38px" : "44px");
    });
    const totalMs = total * step + 780;
    setTimeout(() => {
      scene.classList.remove("dealing");
      scene.querySelectorAll(".hand-card.deal, .fan .back.deal").forEach((el) => el.classList.remove("deal"));
      if (App.game) {
        App.game.deal = false;
        App.game._dealing = false;
      }
    }, totalMs);
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
        : "Ожидание соперника..."
      : players.length >= 2
        ? "Нажмите Готов"
        : "Ожидание соперника...";
    const readyBtn = players.length < 2
      ? `<div class="ready-btn spacer" aria-hidden="true"></div>`
      : meReady
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
        if (rt) rt.textContent = "Ожидание соперника...";
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
      <div class="turn-text dc-sub">Переподключение...</div>`;
  }

  function abandonGame() {
    try {
      sessionStorage.removeItem("durak_active");
    } catch (e) {}
    if (App.game) App.game._leaving = true;
    App.leaveGame();
  }

  function leaveGame() {
    if (App.game && App.game.ws) {
      try {
        App.game.ws.close();
      } catch (e) {}
    }
    try {
      sessionStorage.removeItem("durak_active");
    } catch (e) {}
    App.game = null;
    App.showScreen("screen-lobby");
    App.setTab("open");
  }

  App.resumeGame = async function () {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem("durak_active") || "null");
    } catch (e) {}
    if (!saved || !saved.roomId) return;
    try {
      const payload = {
        init_data: App.initData,
        guest_name: (App.me && App.me.name) || "Гость",
        guest_pid: App.guestPid,
      };
      const data = await App.api.join(saved.roomId, payload);
      if (!data || !data.ok) {
        try {
          sessionStorage.removeItem("durak_active");
        } catch (e) {}
        App.toast("Игра уже завершена", "error");
        return;
      }
      App.joinGame(data);
    } catch (err) {
      try {
        sessionStorage.removeItem("durak_active");
      } catch (e) {}
      App.toast(err.message || "Игра уже завершена", "error");
    }
  };

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

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragUp);
  document.addEventListener("pointercancel", onDragUp);
})();
