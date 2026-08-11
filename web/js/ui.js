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

  App.telegramIconHtml = function (size) {
    const s = size || 64;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-label="Telegram"><defs><linearGradient id="tg-grad-${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37BBED"/><stop offset="1" stop-color="#1E96C8"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#tg-grad-${s})"/><path fill="#fff" d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.529 1.462l4.552 1.42 10.532-6.645c.499-.303.953-.14.579.192l-8.533 7.701-.321 4.705c.253 0 .362-.117.503-.248l2.247-2.161 4.652 3.435c.857.47 1.463.228 1.678-.787l3.04-14.292c.312-1.237-.54-1.745-1.092-1.578z"/></svg>`;
  };

  App.avatarHtml = function (name, photo, size, source) {
    const s = size || 64;
    const initial = App.esc((name || "?").trim().charAt(0).toUpperCase() || "?");
    const isTg = source === "telegram";
    if (photo) {
      const fallback = isTg
        ? `this.outerHTML=App.telegramIconHtml(${s})`
        : `this.outerHTML='<div class="avatar avatar-init" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${initial}</div>'`;
      return `<img class="avatar" src="${App.esc(photo)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover" onerror="${fallback}">`;
    }
    if (isTg) return App.telegramIconHtml(s);
    return `<div class="avatar avatar-init" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${initial}</div>`;
  };

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
