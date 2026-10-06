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
    CREATE INDEX IF NOT EXISTS crm_admin_audit_logs_created_at_idx
      ON crm_admin_audit_logs (created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS crm_admin_audit_logs_entity_idx
      ON crm_admin_audit_logs (entity_type, entity_id)
  `);
}
