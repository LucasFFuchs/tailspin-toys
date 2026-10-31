import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Database } from './db';
import { categories, gameAdditionalCategories, games, publishers } from '../../db/schema';
import type { Category, Game } from '../types/game';

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

export interface GameFilters {
    /** Include games matching any of these category IDs, ranked by match count. */
    categoryIds?: readonly number[];
    /** Restrict results to this publisher ID. */
    publisherId?: number;
}

/** Map a joined game row and its additional categories to the app-facing type. */
function mapGame(row: GameSelectionRow, additionalCategories: Category[] = []): Game {
    const gameCategories: Category[] = [];
    if (row.categoryId !== null && row.categoryName !== null) {
        gameCategories.push({ id: row.categoryId, name: row.categoryName });
    }
    for (const category of additionalCategories) {
        if (!gameCategories.some((existing) => existing.id === category.id)) {
            gameCategories.push(category);
        }
    }

    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        categories: gameCategories,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/** Load the additional category associations for the supplied game IDs. */
async function getAdditionalCategoriesByGameId(
    db: Database,
    gameIds: number[],
): Promise<Map<number, Category[]>> {
    if (gameIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            gameId: gameAdditionalCategories.gameId,
            id: categories.id,
            name: categories.name,
        })
        .from(gameAdditionalCategories)
        .innerJoin(categories, eq(gameAdditionalCategories.categoryId, categories.id))
        .where(inArray(gameAdditionalCategories.gameId, gameIds))
        .orderBy(asc(categories.name));
    const categoriesByGame = new Map<number, Category[]>();
    for (const row of rows) {
        const gameCategories = categoriesByGame.get(row.gameId) ?? [];
        gameCategories.push({ id: row.id, name: row.name });
        categoriesByGame.set(row.gameId, gameCategories);
    }
    return categoriesByGame;
}

/** Games matching the optional filters, ordered by category matches then title. */
export async function getAllGames(db: Database, filters: GameFilters = {}): Promise<Game[]> {
    const conditions: SQL[] = [];
    if (filters.publisherId !== undefined) {
        conditions.push(eq(publishers.id, filters.publisherId));
    }

    const query = baseGamesQuery(db);
    const rows = conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(asc(games.title))
        : await query.orderBy(asc(games.title));
    const selectedCategoryIds = new Set(filters.categoryIds ?? []);
    const additionalCategories = await getAdditionalCategoriesByGameId(
        db,
        rows.map((row) => row.id),
    );
    const mappedGames = rows.map((row) =>
        mapGame(row, additionalCategories.get(row.id) ?? []),
    );
    const filteredGames = selectedCategoryIds.size > 0
        ? mappedGames.filter((game) =>
            game.categories.some((category) => selectedCategoryIds.has(category.id)),
        )
        : mappedGames;

    return filteredGames.sort((a, b) => {
        const aMatches = a.categories.filter((category) => selectedCategoryIds.has(category.id)).length;
        const bMatches = b.categories.filter((category) => selectedCategoryIds.has(category.id)).length;
        return bMatches - aMatches;
    });
}

/** All game ids ordered by title. */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    if (!row) {
        return null;
    }
    const additionalCategories = await getAdditionalCategoriesByGameId(db, [row.id]);
    return mapGame(row, additionalCategories.get(row.id) ?? []);
}
