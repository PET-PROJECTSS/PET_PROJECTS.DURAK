window.App = window.App || {};
(function () {
  const App = window.App;
  App.isTelegram = false;
  App.tg = null;
  App.launchParams = {};

  function initTg() {
    if (App.tg) return;
    if (!(window.Telegram && window.Telegram.WebApp)) return;
    App.tg = window.Telegram.WebApp;
    App.isTelegram = true;
    try {
      App.tg.ready();
      App.tg.expand();
      if (App.tg.disableVerticalSwipes) App.tg.disableVerticalSwipes();
      if (App.tg.onEvent && App.refreshViewport) {
        App.tg.onEvent("viewportStableHeightChanged", App.refreshViewport);
        App.tg.onEvent("viewportChanged", App.refreshViewport);
      }
    } catch (e) {}
  }
  initTg();
  setTimeout(initTg, 300);
  setTimeout(initTg, 1000);
  try {
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (hash) {
      for (const pair of hash.split("&")) {
        const i = pair.indexOf("=");
        if (i === -1) continue;
        App.launchParams[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
      }
    }
  } catch (e) {}
  App.initData = (App.tg && App.tg.initData) || App.launchParams.tgWebAppData || "";
  App.initDataUnsafe = (App.tg && App.tg.initDataUnsafe) || {};
  if (!App.initDataUnsafe.user && App.initData) {
    try {
      const q = new URLSearchParams(App.initData);
      for (const [k, v] of q) {
        try {
          App.initDataUnsafe[k] = JSON.parse(v);
        } catch (e) {
          App.initDataUnsafe[k] = v;
        }
      }
    } catch (e) {}
  }
  if (App.initData) App.isTelegram = true;
})();
