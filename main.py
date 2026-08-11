import asyncio
import logging

import config
from app.bot import run_bot_safe
from app.server import run_server


async def main():
    tasks = [asyncio.create_task(run_server())]
    if config.BOT_TOKEN:
        tasks.append(asyncio.create_task(run_bot_safe()))
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
