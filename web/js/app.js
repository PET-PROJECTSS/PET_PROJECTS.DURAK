window.App = window.App || {};
(function () {
  const App = window.App;

  App.guestName = localStorage.getItem("durak_guest_name") || "";

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
      if (App.game && App.game.state && !App.game.state.finished) {
        if (!confirm("Покинуть игру?")) return;
      }
      App.leaveGame();
    });
  }

  boot();
})();
