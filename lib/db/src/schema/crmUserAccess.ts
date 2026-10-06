import { index, pgTable, serial, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const crmUserAccessTable = pgTable(
  "crm_user_accesses",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("manager"),
    team: text("team"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crm_user_accesses_user_id_uidx").on(table.userId),
    uniqueIndex("crm_user_accesses_email_uidx").on(table.email),
    index("crm_user_accesses_role_idx").on(table.role),
    index("crm_user_accesses_team_idx").on(table.team),
  ],
);

export type CrmUserAccess = typeof crmUserAccessTable.$inferSelect;
