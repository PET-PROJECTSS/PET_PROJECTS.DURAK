window.App = window.App || {};
(function () {
  const App = window.App;

  function loadedBuild() {
    let max = 0;
    document.querySelectorAll("script[src],link[href]").forEach((el) => {
      const m = (el.getAttribute("src") || el.getAttribute("href") || "").match(/[?&]v=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    return max;
  }

  (function autoUpdate() {
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) location.reload();
    });
    fetch("/api/build", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.build !== "number") return;
        if (d.build === loadedBuild()) return;
        if (App.game && App.game.state && !App.game.state.finished) return;
        location.reload();
      })
      .catch(() => {});
  })();

  App.guestName = localStorage.getItem("durak_guest_name") || "";
  let guestPid = localStorage.getItem("durak_guest_pid");
  if (!guestPid) {
    guestPid = "guest_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("durak_guest_pid", guestPid);
  }
  App.guestPid = guestPid;

  function boot() {
    let me = { source: "guest", id: "", name: App.guestName || "Гость", photo: "" };
    const tgUser = App.initDataUnsafe && App.initDataUnsafe.user;
    if (tgUser) {
      me = {
        source: "telegram",
        id: String(tgUser.id || ""),
        name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || "Игрок",
        photo: tgUser.photo_url || "",
      };
    }
    App.api
      .me()
      .then((data) => {
        if (data.balance != null) App.balance = data.balance;
        if (data.source === "telegram") {
          me = { source: "telegram", id: data.id, name: data.name, photo: data.photo };
        }
      })
      .catch(() => {})
      .then(() => {
        App.me = me;
        const hu = document.getElementById("header-user");
        hu.innerHTML = App.avatarHtml(me.name, me.photo, 34, me.source);
        hu.addEventListener("click", () => App.setTab("profile"));
        App.setTab("profile");
      });
  }

  document.querySelectorAll(".nav-item").forEach((b) => {
    b.addEventListener("click", () => App.setTab(b.dataset.tab));
  });

  const back = document.getElementById("game-leave");
  if (back) {
    back.addEventListener("click", () => {
      if (App.requestLeave) App.requestLeave();
    });
  }

  boot();
})();
