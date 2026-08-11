window.App = window.App || {};
(function () {
  const App = window.App;

  App.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  App.lockIcon = function () {
    return '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  };

  App.humanIconHtml = function (size) {
    const s = size || 64;
    return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Аватар"><rect width="100" height="100" fill="#dde3e8"/><circle cx="50" cy="36" r="24" fill="#93a1ad"/><path d="M20 96c2-30 17-46 30-46s28 16 30 46z" fill="#b2bec8"/></svg>`;
  };

  App.tgAvatarHtml = function (photo, size) {
    const s = size || 64;
    return `<span class="tg-avatar" style="width:${s}px;height:${s}px">${App.humanIconHtml(s)}${photo ? `<img src="${App.esc(photo)}" alt="" onload="this.classList.add('loaded')" onerror="this.remove()">` : ""}</span>`;
  };

  App.avatarHtml = function (name, photo, size, source) {
    const s = size || 64;
    const initial = App.esc((name || "?").trim().charAt(0).toUpperCase() || "?");
    const isTg = source === "telegram";
    if (isTg) return App.tgAvatarHtml(photo, s);
    if (photo) {
      return `<img class="avatar" src="${App.esc(photo)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover;border-radius:50%" onerror="this.outerHTML='<div class=\'avatar avatar-init\' style=\'width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px\'>${initial}</div>'">`;
    }
    return `<div class="avatar avatar-init" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${initial}</div>`;
  };

  function applyScale() {
    const vh = window.innerHeight || 680;
    const s = Math.max(0.68, Math.min(1, vh / 680));
    document.documentElement.style.setProperty("--s", s.toFixed(3));
  }
  applyScale();
  window.addEventListener("resize", applyScale);
  window.addEventListener("orientationchange", applyScale);

  const TILE_COLORS = ["#8b5fbf", "#5a3d2b", "#2f7a4f", "#2f5f8f", "#a3492f", "#6b6b2f"];
  App.seatAvatarHtml = function (name, photo) {
    const clean = (name || "?").trim();
    const initial = App.esc(clean.charAt(0).toUpperCase() || "?");
    if (photo) {
      return `<img src="${App.esc(photo)}" alt="">`;
    }
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
    const color = TILE_COLORS[hash % TILE_COLORS.length];
    return `<div style="width:100%;height:100%;display:grid;place-items:center;background:${color};color:#fff;font-weight:800;font-size:26px;">${initial}</div>`;
  };

  let toastTimer = null;
  App.toast = function (text, type) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.className = "toast show" + (type ? " toast-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "toast";
    }, 2600);
  };

  App.showScreen = function (id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
    window.scrollTo(0, 0);
  };

  App.setTab = function (tab) {
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    const styledTab = ["profile", "open", "private", "create"].indexOf(tab) !== -1;
    document.body.classList.toggle("app-tab", styledTab);
    const renderers = {
      profile: App.renderProfile,
      open: () => App.renderRooms("open"),
      private: () => App.renderRooms("private"),
      create: App.renderCreate,
    };
    if (renderers[tab]) renderers[tab]();
  };

  App.confirm = function (title, text, cb) {
    let modal = document.getElementById("modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">${App.esc(title || "Подтверждение")}</div>
          <p class="modal-sub">${App.esc(text || "")}</p>
          <div class="modal-actions">
            <button id="modal-no" class="btn btn-ghost">Нет</button>
            <button id="modal-yes" class="btn btn-primary">Да</button>
          </div>
        </div>
      </div>`;
    modal.classList.remove("hidden");
    const close = () => modal.classList.add("hidden");
    modal.querySelector("#modal-no").addEventListener("click", () => {
      close();
      cb(false);
    });
    modal.querySelector("#modal-yes").addEventListener("click", () => {
      close();
      cb(true);
    });
  };

  App.promptPassword = function (cb) {
    let modal = document.getElementById("modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">Приватная комната</div>
          <p class="modal-sub">Введите пароль для входа</p>
          <input id="modal-pass" class="input" type="password" maxlength="20" placeholder="Пароль" />
          <div class="modal-actions">
            <button id="modal-cancel" class="btn btn-ghost">Отмена</button>
            <button id="modal-ok" class="btn btn-primary">Войти</button>
          </div>
        </div>
      </div>`;
    modal.classList.remove("hidden");
    const close = () => modal.classList.add("hidden");
    modal.querySelector("#modal-cancel").addEventListener("click", close);
    modal.querySelector("#modal-ok").addEventListener("click", () => {
      const v = modal.querySelector("#modal-pass").value;
      close();
      cb(v);
    });
    modal.querySelector("#modal-pass").addEventListener("keydown", (e) => {
      if (e.key === "Enter") modal.querySelector("#modal-ok").click();
    });
    setTimeout(() => modal.querySelector("#modal-pass").focus(), 60);
  };
})();
