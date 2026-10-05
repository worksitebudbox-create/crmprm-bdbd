import { createInsertSchema } from "drizzle-zod";
import { doublePrecision, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const ordersTable = pgTable(
  "crm_orders",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    stage: text("stage").notNull(),
    amountUah: doublePrecision("amount_uah").notNull().default(0),
    ttn: text("ttn"),
    deliveryStatus: text("delivery_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("crm_orders_company_id_idx").on(table.companyId)],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;