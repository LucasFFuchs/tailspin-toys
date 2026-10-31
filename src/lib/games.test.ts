import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, gameAdditionalCategories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].categories).toEqual([{ id: expect.any(Number), name: 'Strategy' }]);
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('filters by any selected category and ranks games by the number of matches', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'cat' })
            .returning({ id: categories.id });
        const [adventure] = await db
            .insert(categories)
            .values({ name: 'Adventure', description: 'cat' })
            .returning({ id: categories.id });
        const [simulation] = await db
            .insert(categories)
            .values({ name: 'Simulation', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });
        const [threeMatches] = await db.insert(games).values({
            title: 'Three Matches',
            description: 'Matches all selected categories',
            categoryId: strategy.id,
            publisherId: publisher.id,
        }).returning({ id: games.id });
        const [twoMatches] = await db.insert(games).values({
            title: 'Two Matches',
            description: 'Matches two selected categories',
            categoryId: strategy.id,
            publisherId: publisher.id,
        }).returning({ id: games.id });
        await db.insert(gameAdditionalCategories).values([
            { gameId: threeMatches.id, categoryId: puzzle.id },
            { gameId: threeMatches.id, categoryId: adventure.id },
            { gameId: twoMatches.id, categoryId: puzzle.id },
        ]);
        await db.insert(games).values([
            {
                title: 'One Match A',
                description: 'Matches one selected category',
                categoryId: puzzle.id,
                publisherId: publisher.id,
            },
            {
                title: 'One Match B',
                description: 'Matches one selected category',
                categoryId: adventure.id,
                publisherId: publisher.id,
            },
            {
                title: 'No Matches',
                description: 'Matches no selected categories',
                categoryId: simulation.id,
                publisherId: publisher.id,
            },
        ]);

        const filtered = await getAllGames(db, {
            categoryIds: [strategy.id, puzzle.id, adventure.id],
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Three Matches',
            'Two Matches',
            'One Match A',
            'One Match B',
        ]);
        expect(filtered[0].categories.map((category) => category.name)).toEqual(['Strategy', 'Adventure', 'Puzzle']);
    });

    it('filters by publisher', async () => {
        await seedGames(db, 2);
        const [otherPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'pub' })
            .returning({ id: publishers.id });
        const [category] = await db.select({ id: categories.id }).from(categories).limit(1);
        await db.insert(games).values({
            title: 'Other Publisher Game',
            description: 'Description',
            categoryId: category.id,
            publisherId: otherPublisher.id,
        });

        const filtered = await getAllGames(db, { publisherId: otherPublisher.id });

        expect(filtered.map((game) => game.title)).toEqual(['Other Publisher Game']);
    });

    it('combines category and publisher filters', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'cat' })
            .returning({ id: categories.id });
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'cat' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: 'pub' })
            .returning({ id: publishers.id });
        const [otherPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'pub' })
            .returning({ id: publishers.id });
        await db.insert(games).values([
            {
                title: 'Matching Game',
                description: 'Matches both filters',
                categoryId: strategy.id,
                publisherId: publisher.id,
            },
            {
                title: 'Wrong Category',
                description: 'Category does not match',
                categoryId: puzzle.id,
                publisherId: publisher.id,
            },
            {
                title: 'Wrong Publisher',
                description: 'Publisher does not match',
                categoryId: strategy.id,
                publisherId: otherPublisher.id,
            },
        ]);

        const filtered = await getAllGames(db, {
            categoryIds: [strategy.id],
            publisherId: publisher.id,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Matching Game']);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
