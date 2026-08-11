window.App = window.App || {};
(function () {
  const App = window.App;
  App.isTelegram = false;
  App.tg = null;
  App.launchParams = {};
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      App.tg = window.Telegram.WebApp;
      App.isTelegram = true;
      App.tg.ready();
      App.tg.expand();
      if (App.tg.disableVerticalSwipes) App.tg.disableVerticalSwipes();
    }
  } catch (e) {}
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
