'use strict';

/**
 * Migration 004: Composite multi-tenant performance indexes for high-concurrency
 * workloads (20+ simultaneous partners on 512 MB RAM containers).
 * 100% idempotent (`CREATE INDEX IF NOT EXISTS`).
 */
const SQL = `
CREATE INDEX IF NOT EXISTS idx_catalog_partner_active_type
  ON catalog_items(partner_id, active, item_type);

CREATE INDEX IF NOT EXISTS idx_messages_partner_conv_created
  ON messages(partner_id, conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_partner_last_msg
  ON conversations(partner_id, last_message_at);

CREATE INDEX IF NOT EXISTS idx_conversations_partner_paused
  ON conversations(partner_id, is_paused);

CREATE INDEX IF NOT EXISTS idx_outbox_status_session_next
  ON outbox_queue(status, session_key, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_audit_partner_id
  ON audit_logs(partner_id, id);

CREATE INDEX IF NOT EXISTS idx_customers_partner_last_seen
  ON customers(partner_id, last_seen_at);
`;

module.exports = {
  version: 4,
  name: '004_multitenant_perf_indexes',
  up(db) {
    db.exec(SQL);
  },
};
