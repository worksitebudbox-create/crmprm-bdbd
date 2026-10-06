import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminAuditLogsTable = pgTable(
  "crm_admin_audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("crm_admin_audit_logs_created_at_idx").on(table.createdAt),
    index("crm_admin_audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);
