import { createInsertSchema } from "drizzle-zod";
import { doublePrecision, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const ordersTable = pgTable(
  "crm_orders",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    stage: text("stage").notNull(),
    amountUah: doublePrecision("amount_uah").notNull().default(0),
    ttn: text("ttn"),
    invoiceNumber: text("invoice_number"),
    comment: text("comment"),
    deliveryStatus: text("delivery_status"),
    sender: text("sender"),
    warehouse: text("warehouse"),
    customerName: text("customer_name"),
    phone: text("phone"),
    itemCount: integer("item_count"),
    paymentMethod: text("payment_method"),
    paymentStatus: text("payment_status"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    marketingSource: text("marketing_source"),
    orderDate: text("order_date"),
    arrivalDate: text("arrival_date"),
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