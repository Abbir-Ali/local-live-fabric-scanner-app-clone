import db from "../db.server";

/**
 * Get all bin locations for a shop, sorted alphabetically.
 * @param {string} shop
 * @returns {Promise<string[]>}
 */
export async function getBinLocations(shop) {
    const rows = await db.binLocation.findMany({
        where: { shop },
        orderBy: { location: "asc" },
        select: { location: true },
    });
    return rows.map((r) => r.location);
}

/**
 * Replace all file-imported bin locations for a shop.
 * Merges with existing manual entries — any location already in the DB is kept.
 * Duplicates between the new file and existing entries are silently ignored.
 *
 * @param {string} shop
 * @param {string[]} locations - Parsed locations from the uploaded file
 * @returns {Promise<{ added: number, duplicates: number, total: number }>}
 */
export async function importBinLocations(shop, locations) {
    const cleaned = [...new Set(locations.map((l) => l.trim()).filter(Boolean))];

    let added = 0;
    let duplicates = 0;

    for (const location of cleaned) {
        try {
            await db.binLocation.create({ data: { shop, location } });
            added++;
        } catch (e) {
            // Unique constraint violation = duplicate
            duplicates++;
        }
    }

    const total = await db.binLocation.count({ where: { shop } });
    return { added, duplicates, total };
}

/**
 * Add a single manual bin location.
 * @param {string} shop
 * @param {string} location
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function addManualBinLocation(shop, location) {
    const cleaned = location.trim();
    if (!cleaned) return { success: false, error: "Location cannot be empty." };

    try {
        await db.binLocation.create({ data: { shop, location: cleaned } });
        return { success: true };
    } catch (e) {
        return { success: false, error: `"${cleaned}" already exists.` };
    }
}

/**
 * Delete a single bin location.
 * @param {string} shop
 * @param {string} location
 */
export async function deleteBinLocation(shop, location) {
    await db.binLocation.deleteMany({ where: { shop, location } });
}

/**
 * Clear ALL bin locations for a shop.
 * @param {string} shop
 */
export async function clearAllBinLocations(shop) {
    await db.binLocation.deleteMany({ where: { shop } });
}
