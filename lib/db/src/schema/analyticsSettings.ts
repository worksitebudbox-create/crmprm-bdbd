import { createInsertSchema } from "drizzle-zod";
import { doublePrecision, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const analyticsSettingsTable = pgTable(
  "crm_analytics_settings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email"),
    planValue: doublePrecision("plan_value").notNull().default(0),
    selectedDate: text("selected_date"),
    selectedPeriod: text("selected_period"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("crm_analytics_settings_user_id_idx").on(table.userId)],
);

export const insertAnalyticsSettingsSchema = createInsertSchema(analyticsSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnalyticsSettings = z.infer<typeof insertAnalyticsSettingsSchema>;
export type AnalyticsSettings = typeof analyticsSettingsTable.$inferSelect;
