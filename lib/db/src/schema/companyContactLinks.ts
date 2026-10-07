import { index, integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { contactsTable } from "./contacts";

export const companyContactLinksTable = pgTable(
  "crm_company_contact_links",
  {
    companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "crm_company_contact_links_pk", columns: [table.companyId, table.contactId] }),
    index("crm_company_contact_links_contact_idx").on(table.contactId),
  ],
);

export type CompanyContactLink = typeof companyContactLinksTable.$inferSelect;
