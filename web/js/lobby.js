window.App = window.App || {};
(function () {
  const App = window.App;
  const esc = App.esc;
  const api = App.api;

  App.renderProfile = function () {
    const me = App.me;
    const host = document.getElementById("tab-content");
    const personIcon = `
      <svg class="person-icon" viewBox="0 0 160 135" aria-label="Аватар пользователя">
        <circle cx="80" cy="34" r="29" fill="#999"/>
        <path d="M16 132c3-34 29-57 64-57s61 23 64 57H16Z" fill="#999"/>
        <path d="M50 76c8 8 18 12 30 12s22-4 30-12" fill="none" stroke="#aaa" stroke-width="5" opacity=".45"/>
      </svg>`;
    const avatarInner = me.photo
      ? `<img class="person-icon" src="${esc(me.photo)}" alt="" style="border-radius:8px;object-fit:cover">`
      : personIcon;
    const menuCells = `
      <div class="cell"><div class="tournament-icon"></div><div class="text">Турниры</div></div>
      <div class="cell"><div class="new-badge">NEW!</div><div class="icon">i</div><div class="text">Новости</div></div>
      <div class="cell"><div class="friends-icon"><i class="head one"></i><i class="head two"></i><i class="body one"></i><i class="body two"></i></div><div class="text">Друзья</div></div>
      <div class="cell"><div class="icon">◉ <span class="num">3</span></div><div class="text">Предметы</div></div>
      <div class="cell"><div class="icon">♛</div><div class="text">Доска почета</div></div>
      <div class="cell"><div class="icon">★ <span class="num">14/58</span></div><div class="text">Достижения</div></div>
      <div class="cell"><div class="icon">⚙</div><div class="text">Настройки</div></div>
      <div class="cell"><div class="icon">⫶</div><div class="text">Поделиться</div></div>
      <div class="cell"><div class="icon">?</div><div class="text">Правила</div></div>
      <div class="cell"><div class="new-badge">NEW!</div><div class="icon">✚</div><div class="text">Ещё игры</div></div>`;
    host.innerHTML = `
      <header class="top">
        <div class="name">${esc(me.name)}</div>
        <div class="profile-row">
          <div class="avatar-wrap">${avatarInner}
            <div class="small-stat">89<div class="grade">+ +</div></div>
          </div>
          <div class="currency">
            <div class="money-line"><span>0</span><span class="coin">🪙</span><button class="btn-plus" type="button">+</button></div>
            <div class="money-line"><span>5 498</span><span class="cash">💵</span><button class="btn-plus" type="button">+</button></div>
          </div>
        </div>
      </header>
      <section class="blue-area">
        <div class="play"><span class="triangle">▶</span><div class="label">Быстрая игра</div></div>
        <div class="grid">${menuCells}</div>
      </section>
      <div id="tg-diag" style="padding:10px;font-size:11px;color:#99a;text-align:center;word-break:break-all;display:none"></div>`;
    if (App.isTelegram) {
      const diag = document.getElementById("tg-diag");
      diag.style.display = "block";
      diag.textContent = "tg:" + App.isTelegram
        + " · sdk:" + (App.tg ? 1 : 0)
        + " · initData:" + App.initData.length
        + " · hash:" + (window.location.hash || "").length
        + " · " + (window.location.hash || "").slice(0, 120);
    }

    host.querySelectorAll(".cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        const label = cell.querySelector(".text");
        if (label) App.toast(`${label.textContent} — скоро`, "ok");
      });
    });

    host.querySelectorAll(".btn-plus").forEach((b) => {
      b.addEventListener("click", () => App.toast("Пополнение баланса — скоро", "ok"));
    });

    const play = host.querySelector(".play");
    if (play) play.addEventListener("click", () => App.toast("Быстрая игра — скоро", "ok"));
  };

  App.renderRooms = function (kind) {
    const host = document.getElementById("tab-content");
    const icon = (name) => `assets/general/appTexture4444/${name}`;
    const isOpen = kind === "open";
    host.innerHTML = `
      <header class="top">
        <div class="title-row">
          <div class="name">${isOpen ? "Открытые игры" : "Приватные игры"}</div>
          <div class="diamond" title="Обновить список"></div>
        </div>
      </header>
      <section class="blue-area">
        <div class="filters-title">Настройки фильтров</div>
        <div class="filters">
          <div class="filters-row">
            <div class="icons">
              <span class="mini suitcase"></span>
              <span class="mini crown"></span>
              <span class="mini handshake"></span>
              <span class="mini eye"></span>
              <span style="width:18px"></span>
              <span class="arrow">▶</span>
              <span class="arrow" style="opacity:.35">▶</span>
            </div>
            <div class="smalltxt right">100 - 1K</div>
          </div>
          <div class="filters-row">
            <div class="icons">
              <span class="mini eye"></span>
              <span class="mini crown"></span>
              <span class="mini handshake"></span>
              <span class="mini eye"></span>
              <span class="numbox">24</span>
              <span class="numbox">36</span>
              <span class="numbox">52</span>
            </div>
            <div class="smalltxt">2,3,4,5,6</div>
          </div>
        </div>
        <div id="rooms-list" class="rooms-list"><div class="loader"></div></div>
      </section>`;

    const diamond = host.querySelector(".diamond");
    if (diamond) diamond.addEventListener("click", load);
    load();

    async function load() {
      const list = document.getElementById("rooms-list");
      if (!list) return;
      list.innerHTML = `<div class="loader"></div>`;
      try {
        const data = await api.rooms();
        const rooms = data.rooms.filter((r) => (isOpen ? !r.private : r.private));
        if (!rooms.length) {
          list.innerHTML = `<div class="empty">${isOpen ? "Пока нет открытых комнат. Создай первую!" : "Нет приватных комнат"}</div>`;
          return;
        }
        list.innerHTML = rooms
          .map((r) => {
            const modeIcon = r.mode === "perevodnoi" ? "game_icon_perevodnoi_durak.png" : "game_icon_podkidnoi_durak.png";
            const busy = r.players >= r.max || r.status === "playing";
            return `
            <div class="row ${busy ? "full" : ""}" data-join="${esc(r.id)}" data-private="${r.private ? 1 : 0}">
              <div class="left">
                <div class="name2">${esc(r.name)}${r.private ? `<img class="lockmini" src="${icon("game_icon_lock.png")}" alt="">` : ""}</div>
                <div class="meta"><span>100</span><span class="flag"></span><span>${r.players}/${r.max}</span><span class="people">◔</span></div>
              </div>
              <div class="rightside">
                <div class="chips">
                  <span class="chip">${r.deck_size}</span>
                  <span class="chip">◔</span>
                  <span class="chip">✕</span>
                  <span class="chip">✌</span>
                  <span class="chip chip-img"><img src="${icon(modeIcon)}" alt=""></span>
                  <span class="go">›</span>
                </div>
              </div>
            </div>`;
          })
          .join("");
        list.querySelectorAll(".row").forEach((row) => {
          row.addEventListener("click", () => {
            if (row.classList.contains("full")) {
              App.toast("Комната занята", "error");
              return;
            }
            joinRoom(row.dataset.join, row.dataset.private === "1");
          });
        });
      } catch (e) {
        list.innerHTML = `<div class="empty">Не удалось загрузить комнаты</div>`;
      }
    }

    async function joinRoom(id, isPrivate) {
      const payload = { init_data: App.initData };
      if (App.me.source === "guest") payload.guest_name = App.me.name;
      if (isPrivate) {
        App.promptPassword((pwd) => {
          if (pwd == null) return;
          payload.password = pwd;
          doJoin(id, payload);
        });
      } else {
        doJoin(id, payload);
      }
    }

    async function doJoin(id, payload) {
      try {
        const data = await api.join(id, payload);
        App.joinGame(data);
      } catch (e) {
        App.toast(e.message, "error");
      }
    }
  };

  App.renderCreate = function () {
    const host = document.getElementById("tab-content");
    const i4444 = (name) => `assets/general/appTexture4444/${name}`;
    const i44443 = (name) => `assets/general/appTexture44443/${name}`;

    const MODES = [
      { id: "podkidnoi", label: "подкидной", icon: i44443("game_icon_podkidnoi_durak.png") },
      { id: "sosedni", label: "соседи", icon: i4444("game_icon_podkidivanie_po_sosednim.png") },
      { id: "shuleri", label: "с шулерами", icon: i44443("game_icon_bandit.png") },
      { id: "klassika", label: "классика", icon: i44443("game_icon_nichya_off.png") },
      { id: "perevodnoi", label: "переводной", icon: i44443("game_icon_perevodnoi_durak.png") },
      { id: "vse", label: "все", icon: i44443("game_icon_podkidivanie_ot_vseh.png") },
      { id: "chestnaya", label: "честная", icon: i44443("game_icon_chestnaia_igra.png") },
      { id: "nichya", label: "ничья", icon: i44443("game_icon_nichya_on.png") },
    ];
    const DEFAULT_ON = ["sosedni", "klassika", "perevodnoi", "chestnaya"];
    const modesOn = new Set(DEFAULT_ON);
    const state = { players: 2, deck: 36, speed: "normal", private: false, stake: 100 };

    const imgSrc = (group, v, press) => {
      if (group === "deck") {
        const n = parseInt(v, 10);
        const tier = n === 24 ? "appTexture44442" : "appTexture44443";
        return `assets/general/${tier}/find_game_cards_${n}${press ? "_sel" : "_off"}.png`;
      }
      const tier = v === "fast" ? "appTexture44442" : "appTexture44443";
      return `assets/general/${tier}/find_game_speed_${v}${press ? "_sel" : "_off"}.png`;
    };

    host.innerHTML = `
      <div class="create-page">
        <header class="create-header">
          <div class="title">Создать игру</div>
          <div class="gem"></div>
        </header>
        <main class="create-content">
          <section class="bet">
            <div class="label script">Ваша ставка</div>
            <div class="amount"><span id="bet-value">100</span><span class="cash">💵</span></div>
          </section>
          <div class="slider" id="bet-slider">
            <div class="track"></div>
            <div class="thumb"></div>
          </div>
          <div class="scale"><span>100</span><span>1K</span><span>10K</span><span>100K</span><span>1M</span><span>10M</span></div>

          <h2 class="heading script">Игроки</h2>
          <div class="pill" id="players-pill">
            ${[2, 3, 4, 5, 6].map((n) => `<span data-val="${n}" class="${n === 2 ? "selected" : ""}">${n}</span>`).join("")}
          </div>

          <div class="subheads script"><span>Колода</span><span>Скорость</span></div>
          <div class="settings">
            <div class="settings-pill" id="deck-pill">
              ${[24, 36, 52].map((n) => `
                <span data-group="deck" data-val="${n}" class="${n === 36 ? "selected" : ""}">
                  <img src="${imgSrc("deck", n, n === 36)}" alt="${n}">
                </span>`).join("")}
            </div>
            <div class="settings-pill" id="speed-pill">
              <span data-group="speed" data-val="normal" class="selected">
                <img src="${imgSrc("speed", "normal", true)}" alt="">
              </span>
              <span data-group="speed" data-val="fast">
                <img src="${imgSrc("speed", "fast", false)}" alt="">
              </span>
            </div>
          </div>

          <h2 class="heading game-heading script">Режимы игры</h2>
          <div class="modes" id="modes">
            ${MODES.map((m) => `
              <div class="mode${modesOn.has(m.id) ? " on" : ""}" data-mode="${m.id}">
                ${modesOn.has(m.id) ? '<b class="mode-check">✓</b>' : ""}
                <img class="ico" src="${m.icon}" alt="">
                <small>${m.label}</small>
              </div>`).join("")}
          </div>
        </main>

        <div class="bottom">
          <div class="password" id="password-toggle">
            <div class="box"></div>
            <div class="text script">Пароль</div>
          </div>
          <div class="create script" id="room-create">Создать <b>▶</b></div>
        </div>
      </div>`;

    const slider = host.querySelector("#bet-slider");
    const track = slider.querySelector(".track");
    const thumb = slider.querySelector(".thumb");
    const valueEl = host.querySelector("#bet-value");
    const MIN = 100;
    const MAX = 10000000;
    const format = (v) => {
      if (v >= 1000000) {
        const m = v / 1000000;
        return (Number.isInteger(m) ? m : Math.round(m * 10) / 10) + "M";
      }
      if (v >= 1000) {
        const k = v / 1000;
        return (Number.isInteger(k) ? k : Math.round(k * 10) / 10) + "K";
      }
      return String(v);
    };
    const setFrac = (f) => {
      f = Math.max(0, Math.min(1, f));
      const tw = thumb.offsetWidth || 34;
      thumb.style.left = `calc(${(f * 100).toFixed(2)}% - ${(f * tw).toFixed(1)}px)`;
      state.stake = Math.round(MIN * Math.pow(MAX / MIN, f));
      valueEl.textContent = format(state.stake);
    };
    const fracFrom = (e) => {
      const r = track.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    const drag = () => {
      const move = (e) => setFrac(fracFrom(e));
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        slider.classList.remove("dragging");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      slider.classList.add("dragging");
    };
    thumb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drag();
    });
    track.addEventListener("pointerdown", (e) => {
      setFrac(fracFrom(e));
      drag();
    });
    setFrac(0);

    const singleSelect = (container, cb) => {
      container.querySelectorAll("span").forEach((span) => {
        span.addEventListener("click", () => {
          container.querySelectorAll("span").forEach((s) => s.classList.remove("selected"));
          span.classList.add("selected");
          cb(span.dataset.val);
        });
      });
    };
    singleSelect(host.querySelector("#players-pill"), (v) => {
      state.players = parseInt(v, 10);
    });
    host.querySelectorAll(".settings-pill").forEach((settingsPill) => {
      settingsPill.querySelectorAll("span[data-group]").forEach((span) => {
        span.addEventListener("click", () => {
          const group = span.dataset.group;
          settingsPill.querySelectorAll(`span[data-group="${group}"]`).forEach((s) => {
            s.classList.remove("selected");
            s.querySelector("img").src = imgSrc(group, s.dataset.val, false);
          });
          span.classList.add("selected");
          span.querySelector("img").src = imgSrc(group, span.dataset.val, true);
          if (group === "deck") state.deck = parseInt(span.dataset.val, 10);
          else state.speed = span.dataset.val;
        });
      });
    });

    host.querySelectorAll("#modes .mode").forEach((m) => {
      m.addEventListener("click", () => {
        const id = m.dataset.mode;
        const on = !modesOn.has(id);
        if (on) {
          modesOn.add(id);
          const badge = m.querySelector(".mode-check");
          if (!badge) {
            const b = document.createElement("b");
            b.className = "mode-check";
            b.textContent = "✓";
            m.insertBefore(b, m.firstChild);
          }
        } else {
          modesOn.delete(id);
          const badge = m.querySelector(".mode-check");
          if (badge) badge.remove();
        }
        m.classList.toggle("on", on);
      });
    });

    const passwordToggle = host.querySelector("#password-toggle");
    const passwordText = passwordToggle.querySelector(".text");
    passwordToggle.addEventListener("click", () => {
      state.private = !state.private;
      passwordToggle.classList.toggle("on", state.private);
      passwordText.textContent = state.private ? "Пароль: 1234" : "Пароль";
    });

    host.querySelector("#room-create").addEventListener("click", async () => {
      const payload = {
        name: App.me && App.me.name ? `Игра ${App.me.name}` : "Комната",
        private: state.private,
        password: state.private ? "1234" : "",
        mode: modesOn.has("perevodnoi") ? "perevodnoi" : "podkidnoi",
        max_players: state.players,
        deck_size: state.deck,
        throw_all: modesOn.has("vse"),
        settings: {
          s_shulerami: modesOn.has("shuleri"),
          klassika: modesOn.has("klassika"),
          nichya: modesOn.has("nichya"),
          speed: state.speed,
          stake: state.stake,
        },
        init_data: App.initData,
      };
      if (App.me && App.me.source === "guest") payload.guest_name = App.me.name;
      try {
        const data = await api.create(payload);
        App.joinGame(data);
      } catch (e) {
        App.toast(e.message, "error");
      }
    });
  };
})();
