# Perf Tests — locust scaffold (V32.M4.4)

本目录是**本地性能基线**脚本,**CI 不跑**(A21 红线:数字对环境敏感)。
pytest 通过 `pyproject.toml` 的 `norecursedirs = ["tests/perf"]` 把这个
目录从单测收集里排除,所以 `uv run pytest` 不会误触。CI runner 上跑出来
的数字横向不可比,所以由人工本地跑 + 写 `baseline.md` 锚定。

## 文件清单

- `parse_baseline.py` — locust HttpUser,目标端点 `POST /api/v1/sessions/parse`
- `conftest_perf.py` — `MockLlmGateway`,模拟 1.5s P50 / 8s P95 延迟
- `baseline.md` — 跑出来的 P50 / P95 / P99 / RPS 由人工填
- `README.md` — 你正在读的这个

## 本地跑(首次实测,留给人工)

1. **启动 backend** —
   ```bash
   cd apps/api
   EATIT_LLM_BACKEND=mock uv run uvicorn app.main:app --port 8000
   ```
   `EATIT_LLM_BACKEND=mock` 必须设置,否则会打到真 LLM —— A21 / A20 红线。

2. **准备 fixtures** — 把 `tests/fixtures/sample_resume.pdf` 与
   `tests/fixtures/sample_jd.txt` 准备好(任何能让 ParseAgent 跑通的样本即可)。

3. **跑 locust** —
   ```bash
   cd apps/api
   uv run locust -f tests/perf/parse_baseline.py \
     --headless -u 5 -r 1 -t 60s --host http://localhost:8000
   ```

4. **填 baseline.md** — 把 locust 输出的 P50 / P95 / P99 / RPS / failure
   rate 抄进 `baseline.md`,作为后续优化的对比锚。

## 为什么本地跑

- 性能数字对 runner 的 CPU / IO / 网络抖动极度敏感,自动化环境跑出来的
  P95 在不同机器上能差 5-10 倍,没有横向可比性。
- locust 即使用 mock LLM 也要起 backend 进程,体积太大不适合 PR check。
- 人工本地跑 + 把数字写到 `baseline.md`,review 时看 diff 即可。

排除由 `norecursedirs` 与本 README 双重锁定;perf 节点 PR 不要把
`norecursedirs` 删掉。
