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

## Продакшен-деплой (Docker + авто-HTTPS)

Образ лёгкий (`python:3.12-slim`, без telethon), наружу торчит только Caddy — он сам получает
и продлевает Let's Encrypt сертификаты и проксирует WebSocket игры.

1. На сервере создай папку и положи туда файлы проекта (через git или rsync/scp).
2. Рядом с `docker-compose.yml` создай два файла:
   - `.env` — поддомен: `DURAK_DOMAIN=durak.example.com`
     (укажи DNS-запись `A durak.example.com → <IP сервера>`)
   - `.env.prod` — токен бота:
     ```
     BOT_TOKEN=ваш_токен_из_botfather
     USE_PROXY=0
     GUEST_ALLOWED=1
     ```
   `APP_URL` соберётся из `DURAK_DOMAIN` автоматически (`https://durak.example.com`).
3. Запуск:
   ```
   docker compose up -d --build
   docker compose logs -f durak
   ```

После первого запроса Caddy выпустит сертификат (обычно за 1–2 минуты). Проверь: `https://durak.example.com/api/rooms`.

> Если на сервере 80/443 уже заняты общим nginx (как у «timeline» и др.) — Caddy не запустится.
> Тогда используй вариант через общий nginx: см. `deploy/durak.example.conf` (там инструкция + certbot).

`.github/workflows/deploy.example.yml` — автодеплой по push в `main` (GitHub Actions → SSH → docker compose).
Нужно добавить секреты `SSH_HOST`, `SSH_USER`, `SSH_KEY` и разместить `.env`/`.env.prod` на сервере в `/opt/durak_online`.

## Тесты
`python -m unittest discover -s tests`
