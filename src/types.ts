export interface ProcessResponse {
    error?: string;
    rewritten_sentences?: Array<{
        original_text: string;
        rewritten_text: string;
        original_index: number;
    }>;
};

/**
 * Defines the structure for the extension's settings.
 * All settings are stored in chrome.storage.
 */
export interface Settings {
    [key: string]: any; // Allows for any key, as settings can be dynamic
    // A more specific type definition would be:
    // [STORAGE_KEYS.IS_ON]: boolean;
    // [STORAGE_KEYS.SENTENCE_COUNT]: number;
    // [STORAGE_KEYS.DIFFICULTY_LEVEL]: string;
    // [STORAGE_KEYS.DARK_MODE]: boolean;
    // [STORAGE_KEYS.READING_MODE]: boolean;
    // [STORAGE_KEYS.MANUAL_SELECT]: boolean;
}