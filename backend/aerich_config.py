"""Aerich entrypoint for commands run from the backend directory."""

from app.utils.config import TORTOISE_ORM

__all__ = ["TORTOISE_ORM"]
