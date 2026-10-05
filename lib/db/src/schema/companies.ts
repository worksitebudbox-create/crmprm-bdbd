import { createInsertSchema } from "drizzle-zod";
import { doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const companiesTable = pgTable("crm_companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  taxId: text("tax_id"),
  customerType: text("customer_type").notNull(),
  city: text("city"),
  manager: text("manager").notNull(),
  warehouse: text("warehouse"),
  paymentForm: text("payment_form").notNull().default("ПДВ"),
  creditLimitUah: doublePrecision("credit_limit_uah").notNull().default(0),
  paymentTermsDays: integer("payment_terms_days").notNull().default(0),
  discountPercent: doublePrecision("discount_percent").notNull().default(0),
  priceTier: text("price_tier"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;