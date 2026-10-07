import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const chatMessagesTable = pgTable(
  "crm_chat_messages",
  {
    id: serial("id").primaryKey(),
    senderUserId: text("sender_user_id").notNull(),
    recipientUserId: text("recipient_user_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("crm_chat_messages_conversation_idx").on(table.senderUserId, table.recipientUserId, table.createdAt),
    index("crm_chat_messages_recipient_idx").on(table.recipientUserId, table.createdAt),
  ],
);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
