'use strict';

/**
 * Migration 001: Initial unified SQLite schema for AUTONMAX vNext.
 * Defines core tables, foreign keys, check constraints, and indexes.
 */
const SQL = `
-- Parceiros / Estabelecimentos
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  store_segment TEXT,
  is_active INTEGER DEFAULT 1,
  personality_prompt TEXT,
  business_rules TEXT,
  working_hours_json TEXT,
  policies_json TEXT,
  welcome_message TEXT DEFAULT 'Olá! Como posso te ajudar hoje?',
  pdf_files_json TEXT DEFAULT '[]',
  image_files_json TEXT DEFAULT '[]',
  owner_jid TEXT,
  feature_flags_json TEXT DEFAULT '{"bookings":true,"orders":true,"voiceStt":true,"voiceTts":false,"googleCalendar":false,"webhooks":false,"softPause":true,"ownerCommands":true}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessões de Usuários Administrativos / Painel
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo de Produtos e Serviços
CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('SERVICE', 'PRODUCT')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  duration_minutes INTEGER DEFAULT 30,
  category TEXT DEFAULT 'geral',
  active INTEGER DEFAULT 1,
  version_hash TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clientes Finais (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  facts_json TEXT DEFAULT '{}',
  visits_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  UNIQUE(partner_id, channel, external_id)
);

-- Conversas Ativas e Estado de Transbordo Humano
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  is_paused INTEGER DEFAULT 0,
  human_requested INTEGER DEFAULT 0,
  paused_context_json TEXT DEFAULT '[]',
  last_message_at DATETIME,
  UNIQUE(partner_id, channel, external_chat_id)
);

-- Histórico Detalhado de Mensagens (Auditoria e Janela de Tokens)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('INBOUND', 'OUTBOUND')),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'operator', 'system')),
  content_type TEXT DEFAULT 'text',
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agendamentos de Serviços
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id),
  item_name_snapshot TEXT NOT NULL,
  price_cents_snapshot INTEGER NOT NULL,
  duration_minutes_snapshot INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  customer_phone TEXT,
  date_str TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED')),
  idempotency_key TEXT UNIQUE,
  external_calendar_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índice Único Parcial anti-Double Booking para Agendamentos
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot
ON appointments(partner_id, date_str, time_slot)
WHERE status = 'CONFIRMED';

-- Pedidos de Produtos
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  client_name TEXT NOT NULL,
  customer_phone TEXT,
  items_json TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  payment_method TEXT,
  delivery_type TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'DELIVERED')),
  idempotency_key TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Idempotência de Eventos Recebidos
CREATE TABLE IF NOT EXISTS processed_events (
  event_key TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Fila de Envio Outbound (Persistência Durável)
CREATE TABLE IF NOT EXISTS outbox_queue (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lembretes Agendados
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Log Unificado de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Integrações de Parceiros
CREATE TABLE IF NOT EXISTS partner_integrations (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials_json TEXT NOT NULL,
  expires_at INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, provider)
);

-- Índices Adicionais de Leitura
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_appointments_partner_date ON appointments(partner_id, date_str);
CREATE INDEX IF NOT EXISTS idx_orders_partner_created ON orders(partner_id, created_at);
`;

module.exports = {
  version: 1,
  name: '001_initial_schema',
  up(db) {
    db.exec(SQL);
  },
};
