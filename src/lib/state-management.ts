// src/lib/state-management.ts

import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../constants";
import type { Settings } from '../types';

// The core state variables
export let currentSettings: Settings = { ...DEFAULT_SETTINGS };
export let currentDifficultyMappings: { [key: string]: string } = {
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
};
export let currentCustomPrompts: Array<{ id: string; name: string; prompt: string }> = [];

// A variable to hold the callback function
let onSettingsUpdatedCallback: ((newSettings: Settings) => void) | null = null;

// Function to register a callback from another module
export function registerSettingsUpdateCallback(callback: (newSettings: Settings) => void) {
    onSettingsUpdatedCallback = callback;
}

// Function to load settings from storage
export async function loadSettings() {
    console.log("Content script loading settings...");
    const storedSettings = await chrome.storage.local.get([
        ...Object.values(STORAGE_KEYS),
        'genShredDifficultyMapping',
        'genShredCustomPrompts',
    ]);

    // Update state variables with loaded values
    currentSettings = {
        ...DEFAULT_SETTINGS, // Start with defaults
        
        [STORAGE_KEYS.IS_ON]: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
        [STORAGE_KEYS.SENTENCE_COUNT]: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
        [STORAGE_KEYS.DIFFICULTY_LEVEL]: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
        [STORAGE_KEYS.DARK_MODE]: storedSettings[STORAGE_KEYS.DARK_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DARK_MODE],
        [STORAGE_KEYS.READING_MODE]: storedSettings[STORAGE_KEYS.READING_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.READING_MODE],
        [STORAGE_KEYS.MANUAL_SELECT]: storedSettings[STORAGE_KEYS.MANUAL_SELECT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.MANUAL_SELECT],
        [STORAGE_KEYS.HIDE_AI_CHAT]: storedSettings[STORAGE_KEYS.HIDE_AI_CHAT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.HIDE_AI_CHAT],
        [STORAGE_KEYS.MIN_PARAGRAPH_LENGTH]: storedSettings[STORAGE_KEYS.MIN_PARAGRAPH_LENGTH] ?? DEFAULT_SETTINGS[STORAGE_KEYS.MIN_PARAGRAPH_LENGTH],
    };

    currentDifficultyMappings = storedSettings['genShredDifficultyMapping'] ?? currentDifficultyMappings;
    currentCustomPrompts = storedSettings['genShredCustomPrompts'] ?? [];

    console.log("Settings loaded:", currentSettings);
    // Call the callback to notify the main script
    if (onSettingsUpdatedCallback) {
        onSettingsUpdatedCallback(currentSettings);
    }
}

// Listen for storage changes and update state, then notify the callback
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let settingsUpdated = false;
        // Update currentSettings based on what changed
        for (let key in changes) {
            if (Object.values(STORAGE_KEYS).includes(key)) {
                currentSettings[key] = changes[key].newValue;
                settingsUpdated = true;
            } else if (key === 'genShredDifficultyMapping') {
                currentDifficultyMappings = changes[key].newValue;
                settingsUpdated = true;
            } else if (key === 'genShredCustomPrompts') {
                currentCustomPrompts = changes[key].newValue;
                settingsUpdated = true;
            }
        }
        if (settingsUpdated && onSettingsUpdatedCallback) {
            onSettingsUpdatedCallback(currentSettings);
        }
    }
});

// Export only the state, not the actions
// export {
//     currentSettings,
//     currentDifficultyMappings,
//     currentCustomPrompts,
//     loadSettings,
//     registerSettingsUpdateCallback,
// };