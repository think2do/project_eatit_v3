"""Prompt registry.

Each agent has its own directory under `app/prompts/<agent>/` containing:
  - `system.j2`  — role, boundaries, guardrails, few-shots
  - `user.j2`    — the templated user message

Consumers call `render_prompt(agent_name, role, **variables)` and get back a
plain string ready to be sent as a chat message.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

PROMPTS_ROOT: Path = Path(__file__).resolve().parent

AGENT_NAMES: tuple[str, ...] = (
    "parse",
    "framework",
    "interviewer",
    "reference",
    "compression",
    "report",
    "meta_report",
    "observer",
    # F-320 V32.M2.3.1 — 8th agent, runs parallel with parse during intake.
    "research",
    # F-318 V32.M3.1.1 — 9th agent, async post-report cross-session insight.
    "coach",
)

PromptRole = Literal["system", "user"]


def _build_environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(PROMPTS_ROOT)),
        autoescape=select_autoescape(enabled_extensions=("html", "htm")),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


_env = _build_environment()


def render_prompt(agent_name: str, role: PromptRole, **variables) -> str:
    if agent_name not in AGENT_NAMES:
        raise ValueError(f"Unknown agent: {agent_name!r}")
    template = _env.get_template(f"{agent_name}/{role}.j2")
    return template.render(**variables)


__all__ = ["AGENT_NAMES", "PROMPTS_ROOT", "PromptRole", "render_prompt"]
