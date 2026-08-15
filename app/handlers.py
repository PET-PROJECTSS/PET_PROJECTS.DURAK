from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from app.server import web_app_url

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Играть в Дурак", web_app=WebAppInfo(url=web_app_url()))
    ]])
    user = message.from_user
    name = user.full_name if user else "Игрок"
    await message.answer(
        f"Привет, {name}!\n\nТвой профиль уже связан с Telegram — открой приложение и играй в Дурак с друзьями прямо здесь.",
        reply_markup=kb,
    )
