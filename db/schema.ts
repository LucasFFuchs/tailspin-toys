import { sqliteTable, integer, text, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const publishers = sqliteTable('publishers', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    description: text('description'),
});

export const categories = sqliteTable('categories', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    description: text('description'),
});

export const games = sqliteTable('games', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    starRating: real('star_rating'),
    categoryId: integer('category_id')
        .notNull()
        .references(() => categories.id),
    publisherId: integer('publisher_id')
        .notNull()
        .references(() => publishers.id),
});

/** Stores category associations beyond each game's primary category. */
export const gameAdditionalCategories = sqliteTable(
    'game_additional_categories',
    {
        gameId: integer('game_id')
            .notNull()
            .references(() => games.id),
        categoryId: integer('category_id')
            .notNull()
            .references(() => categories.id),
    },
    (table) => [primaryKey({ columns: [table.gameId, table.categoryId] })],
);

export type PublisherRow = typeof publishers.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type GameRow = typeof games.$inferSelect;
