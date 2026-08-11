window.App = window.App || {};
(function () {
  const App = window.App;

  App.api = {
    async json(url, opts) {
      const res = await fetch(url, opts);
      let data = {};
      try {
        data = await res.json();
      } catch (e) {}
      if (!res.ok) throw new Error(data.error || "Ошибка запроса");
      return data;
    },

    me() {
      const params = new URLSearchParams();
      if (App.initData) params.set("init_data", App.initData);
      return this.json(`/api/me?${params.toString()}`);
    },

    rooms() {
      return this.json("/api/rooms");
    },

    create(payload) {
      return this.json("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },

    join(roomId, payload) {
      return this.json(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
})();
