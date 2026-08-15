import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.types import MenuButtonWebApp, WebAppInfo

import config
from app.handlers import router
from app.server import web_app_url

logger = logging.getLogger("bot")


def build_session() -> AiohttpSession:
    if config.USE_PROXY and config.HTTP_PROXY:
        try:
            return AiohttpSession(proxy=config.HTTP_PROXY)
        except Exception as exc:
            logger.warning("proxy session failed (%s), continuing without proxy", exc)
    return AiohttpSession()


def build_bot() -> Bot:
    session = build_session()
    return Bot(
        token=config.BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


async def run_aiogram_bot():
    bot = build_bot()
    dp = Dispatcher()
    dp.include_router(router)
    if config.APP_URL.startswith("https://"):
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="Играть", web_app=WebAppInfo(url=web_app_url()))
            )
        except Exception as exc:
            logger.warning("set menu button failed: %s", exc)
    else:
        logger.info("APP_URL is not https (%s), menu button skipped in dev", config.APP_URL)
    logger.info("aiogram bot polling started, web app url: %s", config.APP_URL)
    await dp.start_polling(bot)
