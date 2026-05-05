/**
 * Bin Location Parser Utility
 * Supports CSV, TXT, and XLSX formats
 */

/**
 * Parse bin locations from various formats
 * @param {string} fileType - File type (text/csv, text/plain, etc.)
 * @param {string} fileContent - File content as string
 * @returns {Promise<string[]>} Array of parsed bin locations
 */
export async function parseBinLocations(fileType, fileContent) {
    try {
        let locations = [];

        if (fileType.includes("csv") || fileType === "text/csv") {
            locations = parseCSV(fileContent);
        } else if (fileType.includes("text") || fileType === "text/plain") {
            locations = parsePlainText(fileContent);
        } else if (
            fileType.includes("spreadsheet") ||
            fileType.includes("officedocument.spreadsheet") ||
            fileType.includes("xlsx")
        ) {
            // For XLSX, we'd need a library. For now, treat as error
            throw new Error("XLSX support requires additional library. Please use CSV or TXT format.");
        } else {
            // Try to auto-detect format
            locations = parseAuto(fileContent);
        }

        // Clean and deduplicate
        locations = locations
            .map((loc) => loc.trim())
            .filter((loc) => loc.length > 0)
            .filter((loc) => loc.toLowerCase() !== "location") // Remove header
            .filter((loc) => loc.toLowerCase() !== "bin")
            .filter((loc) => loc.toLowerCase() !== "bin location")
            .filter((loc, idx, arr) => arr.indexOf(loc) === idx); // Remove duplicates

        if (locations.length === 0) {
            throw new Error("No valid bin locations found in file");
        }

        return locations.sort(); // Sort alphabetically
    } catch (error) {
        console.error("Error parsing bin locations:", error);
        throw error;
    }
}

/**
 * Parse CSV format
 */
function parseCSV(content) {
    const lines = content.split("\n");
    const locations = [];

    for (const line of lines) {
        // Handle quoted fields
        const fields = line.match(/(".*?"|[^,]+)/g) || [];
        for (const field of fields) {
            const cleaned = field.replace(/"/g, "").trim();
            if (cleaned) locations.push(cleaned);
        }
    }

    return locations;
}

/**
 * Parse plain text format (newline, space, comma, or semicolon separated)
 */
function parsePlainText(content) {
    // Try different delimiters
    const delimiters = ["\n", " ", ",", ";"];
    let locations = [];
    let maxCount = 0;

    for (const delim of delimiters) {
        const parts = content.split(delim).filter((p) => p.trim().length > 0);
        if (parts.length > maxCount) {
            maxCount = parts.length;
            locations = parts;
        }
    }

    return locations;
}

/**
 * Auto-detect format and parse
 */
function parseAuto(content) {
    // Count different potential delimiters
    const counts = {
        newline: (content.match(/\n/g) || []).length,
        comma: (content.match(/,/g) || []).length,
        semicolon: (content.match(/;/g) || []).length,
        space: (content.match(/ /g) || []).length,
    };

    // Use delimiter with highest count
    if (counts.newline > Math.max(counts.comma, counts.semicolon)) {
        return content.split("\n");
    } else if (counts.comma >= counts.semicolon) {
        return parseCSV(content);
    } else if (counts.semicolon > 0) {
        return content.split(";");
    } else {
        return content.split(/\s+/); // Split by whitespace
    }
}

/**
 * Validate file size
 * @param {File} file - File object
 * @param {number} maxSizeMB - Max file size in MB
 * @returns {boolean}
 */
export function validateFileSize(file, maxSizeMB = 5) {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
}

/**
 * Read file as text
 * @param {File} file - File object
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}
