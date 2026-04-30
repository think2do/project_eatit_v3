"""Mock LLM gateway for the locust perf scaffold.

A21 红线:perf 必须用 mock LLM,不得调用真 LLM。本模块提供一个最小的
``MockLlmGateway``,在 P50 / P95 两档 sleep 之间随机抽样,模拟"理想环境"
下的端到端延迟。首次接入时由 ``app.infra.llm`` 的依赖注入点 wire 进来,
具体连接代码与 baseline.md 一并由人工补齐。

注意:

- 文件名带 ``conftest_`` 前缀但**不**是 pytest fixture(perf 目录从
  ``norecursedirs`` 排除)— 命名沿用 spec 文案,等同于"perf 专用配置"。
- 本节点只落骨架,实测留给人工。
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass


# Latency budget (in seconds) — pulled from PRD §性能, scaled down so the
# scaffold matches the spec's "1.5s P50 / 8s P95" target.
_P50_SECONDS = 1.5
_P95_SECONDS = 8.0
_P95_THRESHOLD = 0.05  # 5% of calls hit the long tail.


@dataclass
class MockLlmResponse:
    """Stand-in for whatever the real gateway returns."""

    content: str = "{}"


class MockLlmGateway:
    """Async LLM gateway that sleeps instead of calling out to a vendor.

    Usage(by the operator wiring locust against the FastAPI app)::

        app.dependency_overrides[get_llm_gateway] = lambda: MockLlmGateway()
    """

    async def complete(self, *_args: object, **_kwargs: object) -> MockLlmResponse:
        if random.random() < _P95_THRESHOLD:
            await asyncio.sleep(_P95_SECONDS)
        else:
            await asyncio.sleep(_P50_SECONDS)
        return MockLlmResponse()
