import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

export type WarehouseStockSnapshot = {
  items: Array<{
    sku: string;
    name: string;
    totalQuantity: number;
    locations: Array<{ name: string; quantity: number }>;
  }>;
  updatedAt: string;
  fileName: string;
};

export const warehouseStockSnapshotsTable = pgTable("crm_warehouse_stock_snapshot", {
  id: integer("id").primaryKey().default(1),
  snapshot: jsonb("snapshot").$type<WarehouseStockSnapshot>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
