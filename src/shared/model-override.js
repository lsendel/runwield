/**
 * @module shared/model-override
 * Global user-selected model override state.
 * Lives in its own module to avoid circular imports between
 * chat-session.js and session.js.
 */

let userModelOverride = "";
let userProviderOverride = "";

/**
 * Set the user-selected model override (e.g. from `/model`).
 * @param {string} model
 * @param {string} [provider]
 */
export function setUserModelOverride(model, provider) {
    userModelOverride = model;
    userProviderOverride = provider || "";
}

/**
 * Get the current user model override, if any.
 * @returns {{ model: string; provider: string } | null}
 */
export function getUserModelOverride() {
    return userModelOverride ? { model: userModelOverride, provider: userProviderOverride } : null;
}

/**
 * Clear the user model override (e.g. when switching agents via `/agent`).
 */
export function clearUserModelOverride() {
    userModelOverride = "";
    userProviderOverride = "";
}
