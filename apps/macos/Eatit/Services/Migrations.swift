import Foundation

// §E1 老用户数据不迁移;v3.4 视为新 app。
// §E2 Migration 格式:每条 idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)。
// §E3 写入秘密前调用方需 redactSecrets()(M3 起实现)。
//
// M3 起逐 Agent 节点追加 migration:sessions / turns / parse_results / app_settings / ...
// 现有 Python 后端参考(供 M3 移植):User / InterviewSession / InterviewReport / MetaReport /
// ReflectionReportRow / ResearchCache / UserInsightCacheRow / AppSetting / CandidateAsset / ParseResult
// (16 alembic versions in apps/api/alembic/versions)
let MIGRATIONS: [(version: Int, sql: String)] = [
    // M2.3 baseline: empty schema. M3 nodes append entries here.
]
