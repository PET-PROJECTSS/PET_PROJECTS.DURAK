window.App = window.App || {};
(function () {
  const App = window.App;
  App.isTelegram = false;
  App.tg = null;
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      App.tg = window.Telegram.WebApp;
      App.isTelegram = true;
      App.tg.ready();
      App.tg.expand();
      if (App.tg.disableVerticalSwipes) App.tg.disableVerticalSwipes();
    }
  } catch (e) {}
  App.initData = App.tg ? App.tg.initData || "" : "";
  App.initDataUnsafe = App.tg ? App.tg.initDataUnsafe || {} : {};
})();
