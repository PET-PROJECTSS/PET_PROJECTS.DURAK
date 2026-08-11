import asyncio
import logging

import config

logger = logging.getLogger("bot")


async def run_bot():
    if not config.BOT_TOKEN:
        logger.warning("BOT_TOKEN is empty, bot is disabled")
        return
    from app.bot_aiogram import run_aiogram_bot
    await run_aiogram_bot()


async def run_bot_safe():
    while True:
        try:
            await run_bot()
            logger.warning("bot task finished")
            break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("bot crashed: %s, restarting in 10s", exc)
            await asyncio.sleep(10)
