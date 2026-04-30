"""app_settings service.

Stores local UI state (onboarding step, theme, last-used provider name).
Hard invariant: the caller is forbidden from writing any key that smells like
an LLM secret. Enforced both by an allow-list and by a blocklist pattern
check on both the key name and the value payload.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

ALLOWED_KEYS: frozenset[str] = frozenset(
    {
        "onboarding_completed_at",
        "ui_theme",
        "last_selected_provider_hint",
        "observer_panel_enabled",
        "interview_input_mode",
        "interviewer_tts_enabled",
        # F-320 V32.M2.3.2 — opt-in flag for the connected Research Agent.
        # Default-off; only flips on after the user accepts the privacy modal.
        "research_opt_in",
    }
)

# Double-guard: reject keys or values that look like secret material.
_SECRET_PATTERN = re.compile(
    r"(?:^|[_\.\-])(api[_\.\-]?key|secret|token|password|bearer|authorization)(?:$|[_\.\-])",
    re.IGNORECASE,
)


class UnknownSettingKeyError(KeyError):
    """Raised when a caller tries to read/write a non-whitelisted key."""


class SecretPayloadRejectedError(ValueError):
    """Raised when a key or value looks like an LLM secret."""


def _require_allowed(key: str) -> None:
    if key not in ALLOWED_KEYS:
        raise UnknownSettingKeyError(f"{key!r} is not an allowed app_setting key.")


def _reject_secret_like(key: str, value: Any) -> None:
    if _SECRET_PATTERN.search(key):
        raise SecretPayloadRejectedError(
            "Refusing to persist a secret-looking key in app_settings."
        )
    # Scan string values; pydantic-clean compound values are scanned recursively.
    stack: list[Any] = [value]
    while stack:
        node = stack.pop()
        if isinstance(node, str):
            if _SECRET_PATTERN.search(node):
                raise SecretPayloadRejectedError(
                    "Refusing to persist a secret-looking value in app_settings."
                )
        elif isinstance(node, dict):
            stack.extend(node.keys())
            stack.extend(node.values())
        elif isinstance(node, (list, tuple, set)):
            stack.extend(node)


async def get_setting(session: AsyncSession, key: str) -> Any | None:
    _require_allowed(key)
    result = await session.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row is not None else None


async def set_setting(session: AsyncSession, key: str, value: Any) -> None:
    _require_allowed(key)
    _reject_secret_like(key, value)

    existing = await session.get(AppSetting, key)
    if existing is None:
        session.add(AppSetting(key=key, value=value))
    else:
        existing.value = value
    await session.commit()


async def delete_setting(session: AsyncSession, key: str) -> bool:
    _require_allowed(key)
    existing = await session.get(AppSetting, key)
    if existing is None:
        return False
    await session.delete(existing)
    await session.commit()
    return True
