# Дурак Онлайн

Онлайн-дурак: веб-сайт + Telegram Mini App (web app) в Telegram-боте.
Стек: Python (aiogram 3 + aiohttp) / JS / CSS / HTML. Без внешних зависимостей в фронте, WebSocket для игры в реальном времени.

## Возможности
- Telegram Mini App: профиль с аккаунтом Telegram, вкладки «Профиль», «Открытые», «Приватные», «Создать игру».
- Комнаты на 2 игрока (открытые и приватные с паролем), ремэтч.
- Полноценный движок дурака: козырь, подкидывание карт того же достоинства, «бито»/«взять», добор из колоды, выход из игры.
- Вход без Telegram — как гость (для браузера).

## Запуск на деве
1. Установи зависимости: `pip install -r requirements.txt`
2. Скопируй `.env.example` в `.env` и впиши токен бота (`USE_PROXY=0`, `APP_URL=http://127.0.0.1:8080`).
3. `python main.py` — поднимет сайт на `http://127.0.0.1:8080` и бота (aiogram).

Бот ходит в Telegram по Bot API (HTTP). Если `api.telegram.org` в твоей сети заблокирован,
бот в деве не подключится — это нормально, сайт всё равно работает как гость. На сервере — подключится.

Кнопка «Играть в Дурак» в `/start` — это Mini App кнопка, Telegram принимает её только с HTTPS.
В деве (`APP_URL=http://127.0.0.1:8080`) она просто не показывается в меню бота; на проде с `https://` включится сама.

## Структура
- `main.py` — точка входа (сервер + бот одновременно)
- `config.py` — конфиг из `.env`
- `game/durak.py` — игровой движок
- `app/` — auth (проверка initData), комнаты, WebSocket, HTTP API, бот (aiogram)
- `web/` — фронтенд (без сборки, vanilla JS)

## Продакшен-деплой

- Репозиторий: `PET-PROJECTSS/PET_PROJECTS.DURAK`. Пуш в `main` деплоит на сервер через GitHub Actions
  (см. `.github/workflows/deploy.yml`, переиспользует `PET-PROJECTS.ACTIONS/deploy.yml`) и шлёт результат в Telegram.
- На сервере код лежит в `/opt/projects/durak-online` (git-чекаут), рядом — `.env.prod` (в git не хранится):
  ```
  BOT_TOKEN=...
  USE_PROXY=0
  GUEST_ALLOWED=1
  APP_URL=https://64-188-70-11.sslip.io:4433
  ```
- Секреты воркфлоу (репо): `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`; `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` — на уровне org.

### HTTPS-схема сервера (порты 80/443 заняты xray-VPN)
- xray-VPN (VLESS+Reality на 443/8443/2053 и ws80 на 80) **не трогается**.
- Сайт отдаёт Caddy на **`https://64-188-70-11.sslip.io:4433`** (systemd-сервис `caddy`, конфиг `/etc/caddy/Caddyfile`)
  и проксирует в контейнер durak (`127.0.0.1:18080`).
- Домен `*.sslip.io` — бесплатный wildcard-DNS: `64-188-70-11.sslip.io → 64.188.70.11`.
- Сертификат Let's Encrypt выпущен через HTTP-01 (порт 80 на время выпуска освобождался остановкой xray).
- Продление — раз в месяц cron `/usr/local/bin/durak-cert-renew.sh`: останавливает xray на ~1 минуту,
  рестартует Caddy (он сам продлевает по HTTP-01) и возвращает xray.

### Один раз в BotFather
`@BotFather → /setdomain → @durak_onlnee_bot → 64-188-70-11.sslip.io`
(whitelist домена нужен, чтобы Telegram открывал Mini App кнопку «Играть»).

## Тесты
`python -m unittest discover -s tests`
