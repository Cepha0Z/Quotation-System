import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaceState = sqliteTable('workspace_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
