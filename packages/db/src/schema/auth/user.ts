import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  username: text("username"),
  bio: text("bio"),
  language: text("language").default("en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Persistent administrator grants. A row's existence means the user is an
 * admin — there is no in-between role. ADMIN_EMAILS remains a bootstrap/
 * fallback mechanism, while day-to-day access is managed through this table.
 */
export const AppAdmin = pgTable("app_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  grantedBy: text("granted_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
