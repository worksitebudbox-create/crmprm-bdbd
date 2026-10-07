import { pool } from "@workspace/db";

export async function ensureCrmAccessSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_user_accesses (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'manager'
        CHECK (role IN ('owner', 'director', 'sales_manager', 'manager', 'warehouse', 'accountant', 'auditor')),
      team TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_admin_audit_logs (
      id SERIAL PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE crm_user_accesses
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_chat_messages (
      id SERIAL PRIMARY KEY,
      sender_user_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      edited_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE crm_chat_messages
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_chat_messages_conversation_idx
      ON crm_chat_messages (sender_user_id, recipient_user_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_chat_messages_recipient_idx
      ON crm_chat_messages (recipient_user_id, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_company_contact_links (
      company_id INTEGER NOT NULL REFERENCES crm_companies(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT crm_company_contact_links_pk PRIMARY KEY (company_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_company_contact_links_contact_idx
      ON crm_company_contact_links (contact_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_admin_audit_logs_created_at_idx
      ON crm_admin_audit_logs (created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_admin_audit_logs_entity_idx
      ON crm_admin_audit_logs (entity_type, entity_id)
  `);
}
