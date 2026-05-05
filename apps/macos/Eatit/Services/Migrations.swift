import Foundation

// §E1 老用户数据不迁移;v3.4 视为新 app。
// §E2 Migration 格式:每条 idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)。
// §E3 写入秘密前调用方需 redactSecrets()(M3 起实现)。
// REDACT: 本文件 SQL 不绑定任何用户输入参数,纯 schema DDL;运行时绑定 column 值的 caller 必须 redactSecrets() 处理 ARK_API_KEY 等(详 KeychainService)。
//
// §6.2 v3.4 简化规则:
//   - 删除 users 表:单用户单设备,user_id 恒为字符串常量 "local"
//   - 删除 interview_configs 表:配置已合并进 interview_sessions.config_snapshot JSON 列
//   - 删除 coach_observations 表:数据已在 user_insight_cache
//   - interview_reports 主键改为 session_id(每 session 一份报告)
//   - candidate_assets / interview_sessions 不再有 FK → users

let MIGRATIONS: [(version: Int, sql: String)] = [

    // Version 1: candidate_assets
    (version: 1, sql: """
        CREATE TABLE IF NOT EXISTS candidate_assets (
            id                   TEXT NOT NULL PRIMARY KEY,
            user_id              TEXT NOT NULL,
            resume_file_ref      TEXT,
            resume_filename      TEXT,
            resume_content_type  TEXT,
            jd_file_ref          TEXT,
            jd_filename          TEXT,
            jd_content_type      TEXT,
            status               TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_candidate_assets_user_id ON candidate_assets (user_id);
        """),

    // Version 2: parse_results
    (version: 2, sql: """
        CREATE TABLE IF NOT EXISTS parse_results (
            id                   TEXT NOT NULL PRIMARY KEY,
            candidate_asset_id   TEXT NOT NULL UNIQUE REFERENCES candidate_assets(id) ON DELETE CASCADE,
            status               TEXT NOT NULL,
            payload              TEXT NOT NULL,
            match_summary        TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_parse_results_candidate_asset_id ON parse_results (candidate_asset_id);
        """),

    // Version 3: interview_sessions (no FK → users; user_id is TEXT constant "local")
    (version: 3, sql: """
        CREATE TABLE IF NOT EXISTS interview_sessions (
            id                   TEXT NOT NULL PRIMARY KEY,
            user_id              TEXT NOT NULL,
            candidate_asset_id   TEXT NOT NULL REFERENCES candidate_assets(id) ON DELETE CASCADE,
            status               TEXT NOT NULL,
            started_at           TEXT,
            ended_at             TEXT,
            turn_count           INTEGER NOT NULL DEFAULT 0,
            config_snapshot      TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_interview_sessions_user_id ON interview_sessions (user_id);
        CREATE INDEX IF NOT EXISTS ix_interview_sessions_status ON interview_sessions (status);
        CREATE INDEX IF NOT EXISTS ix_interview_sessions_candidate_asset_id ON interview_sessions (candidate_asset_id);
        """),

    // Version 4: direction_frameworks
    (version: 4, sql: """
        CREATE TABLE IF NOT EXISTS direction_frameworks (
            id                   TEXT NOT NULL PRIMARY KEY,
            interview_session_id TEXT NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
            payload              TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_direction_frameworks_interview_session_id ON direction_frameworks (interview_session_id);
        """),

    // Version 5: interview_turns
    (version: 5, sql: """
        CREATE TABLE IF NOT EXISTS interview_turns (
            id                   TEXT NOT NULL PRIMARY KEY,
            interview_session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
            turn_index           INTEGER NOT NULL,
            stage_name           TEXT,
            question_tag         TEXT NOT NULL,
            question_text        TEXT NOT NULL,
            answer_text          TEXT,
            answer_hint          TEXT,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_interview_turns_interview_session_id ON interview_turns (interview_session_id);
        """),

    // Version 6: turn_assessments
    (version: 6, sql: """
        CREATE TABLE IF NOT EXISTS turn_assessments (
            id                   TEXT NOT NULL PRIMARY KEY,
            interview_turn_id    TEXT NOT NULL UNIQUE REFERENCES interview_turns(id) ON DELETE CASCADE,
            strengths            TEXT NOT NULL,
            weaknesses           TEXT NOT NULL,
            evidence             TEXT NOT NULL,
            score_optional       REAL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_turn_assessments_interview_turn_id ON turn_assessments (interview_turn_id);
        """),

    // Version 7: compressed_turn_summaries
    (version: 7, sql: """
        CREATE TABLE IF NOT EXISTS compressed_turn_summaries (
            id                   TEXT NOT NULL PRIMARY KEY,
            interview_turn_id    TEXT NOT NULL UNIQUE REFERENCES interview_turns(id) ON DELETE CASCADE,
            interview_session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
            payload              TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_compressed_turn_summaries_interview_session_id ON compressed_turn_summaries (interview_session_id);
        CREATE INDEX IF NOT EXISTS ix_compressed_turn_summaries_interview_turn_id ON compressed_turn_summaries (interview_turn_id);
        """),

    // Version 8: interview_reports — PK is session_id (§6.2: one report per session)
    (version: 8, sql: """
        CREATE TABLE IF NOT EXISTS interview_reports (
            session_id           TEXT NOT NULL PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE,
            status               TEXT NOT NULL,
            requested_at         TEXT,
            generated_at         TEXT,
            payload              TEXT NOT NULL,
            created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        """),

    // Version 9: app_settings
    (version: 9, sql: """
        CREATE TABLE IF NOT EXISTS app_settings (
            key        TEXT NOT NULL PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        """),

    // Version 10: meta_reports (no FK → users; user_id is TEXT constant "local")
    (version: 10, sql: """
        CREATE TABLE IF NOT EXISTS meta_reports (
            id                  TEXT NOT NULL PRIMARY KEY,
            user_id             TEXT NOT NULL,
            covered_session_ids TEXT NOT NULL,
            status              TEXT NOT NULL,
            payload             TEXT,
            created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_meta_reports_user_id ON meta_reports (user_id);
        """),

    // Version 11: research_cache
    (version: 11, sql: """
        CREATE TABLE IF NOT EXISTS research_cache (
            cache_key  TEXT NOT NULL PRIMARY KEY,
            payload    TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_research_cache_expires_at ON research_cache (expires_at);
        """),

    // Version 12: user_insight_cache (no FK → users; user_id is TEXT constant "local")
    (version: 12, sql: """
        CREATE TABLE IF NOT EXISTS user_insight_cache (
            user_id                   TEXT NOT NULL PRIMARY KEY,
            based_on_session_count    INTEGER NOT NULL,
            based_on_last_session_id  TEXT NOT NULL,
            payload                   TEXT NOT NULL,
            status                    TEXT NOT NULL,
            generated_at              TEXT NOT NULL,
            created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_uic_user_session ON user_insight_cache (user_id, based_on_last_session_id);
        """),

    // Version 13: reflection_reports
    (version: 13, sql: """
        CREATE TABLE IF NOT EXISTS reflection_reports (
            id           TEXT NOT NULL PRIMARY KEY,
            session_id   TEXT NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
            payload      TEXT NOT NULL,
            status       TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
            updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );
        CREATE INDEX IF NOT EXISTS ix_rr_session ON reflection_reports (session_id);
        """),
]
