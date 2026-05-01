import { getModelRegistry } from "../../shared/model-registry.js";

/**
 * @param {string} argumentPrefix
 * @returns {Promise<any[]>}
 */
export async function getModelCompletions(argumentPrefix) {
    const modelRegistry = getModelRegistry();
    const models = modelRegistry.getAvailable();

    await Promise.resolve();

    const lowerPrefix = argumentPrefix.toLowerCase();
    return models
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => {
            const value = `${m.provider}/${m.id}`;
            return {
                value,
                label: value,
                description: m.name,
                provider: m.provider,
                id: m.id,
            };
        })
        .filter((item) =>
            item.value.toLowerCase().startsWith(lowerPrefix) ||
            item.id.toLowerCase().startsWith(lowerPrefix) ||
            item.provider.toLowerCase().startsWith(lowerPrefix) ||
            // Handle OpenRouter-style IDs with slashes (e.g., google/gemini-flash)
            item.id.toLowerCase().split("/").some((part) => part.startsWith(lowerPrefix))
        );
}
