import { DEFAULT_SETTINGS, STORAGE_KEYS } from "~src/constants";
// Variables to hold current settings state in content script
let currentSettings = { ...DEFAULT_SETTINGS };
// NEW: Store the loaded difficulty mappings and custom prompts
let currentDifficultyMappings: { [key: string]: string } = {
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
};

// NEW: Store custom prompts loaded from storage
let currentCustomPrompts: Array<{ id: string; name: string; prompt: string }> = [];

// NEW: State for manual select mode
let manualSelectModeEnabled = false;

// NEW: State for dark mode
let darkModeEnabled = false;

// NEW: State for reading mode
let readingModeEnabled = false;

// Performance tracking
let isProcessing = false;

// 全局提示框元素
let tooltipElement: HTMLElement | null = null;
// 添加全局状态控制变量
let isTooltipVisible = false;
let activeTooltipElement: Element | null = null;

// NEW: Function to load settings from storage
async function loadSettings() {
    console.log("Content script loading settings...");
    const storedSettings = await chrome.storage.local.get([
        ...Object.values(STORAGE_KEYS),
        'genShredDifficultyMapping', // Load the new mapping key
        'genShredCustomPrompts', // Load custom prompts
        'genShredManualSelect', // Load manual select mode
        STORAGE_KEYS.DARK_MODE, // Load dark mode state
        STORAGE_KEYS.READING_MODE // Load reading mode state
    ]);

    // Update currentSettings with loaded values, falling back to defaults
    currentSettings = {
        [STORAGE_KEYS.IS_ON]: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
        [STORAGE_KEYS.SENTENCE_COUNT]: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
        [STORAGE_KEYS.DIFFICULTY_LEVEL]: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
        [STORAGE_KEYS.DARK_MODE]: storedSettings[STORAGE_KEYS.DARK_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DARK_MODE],
        // [STORAGE_KEYS.CUSTOM_PROMPT]: storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT],
    };

    // Update difficulty mappings
    currentDifficultyMappings = storedSettings['genShredDifficultyMapping'] ?? currentDifficultyMappings;
    // NEW: Update custom prompts
    currentCustomPrompts = storedSettings['genShredCustomPrompts'] ?? [];
    // NEW: Load manual select mode state
    manualSelectModeEnabled = storedSettings[STORAGE_KEYS.MANUAL_SELECT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.MANUAL_SELECT];
    // 调试：强制启用手动选择模式
    manualSelectModeEnabled = true;
    // NEW: Load dark mode state
    darkModeEnabled = storedSettings[STORAGE_KEYS.DARK_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DARK_MODE];
    // NEW: Load reading mode state
    readingModeEnabled = storedSettings[STORAGE_KEYS.READING_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.READING_MODE];

    console.log("Settings loaded:", currentSettings);
    console.log("Difficulty mappings loaded:", currentDifficultyMappings);
    console.log("Custom prompts loaded:", currentCustomPrompts);
    console.log("Manual select mode enabled:", manualSelectModeEnabled);
    console.log("Dark mode enabled:", darkModeEnabled);
    console.log("Reading mode enabled:", readingModeEnabled);

    // --- Initial Action based on loaded state ---
    if (currentSettings[STORAGE_KEYS.IS_ON]) {
        restoreOriginalText();
        processParagraphs();
        startObservingDOMChanges();
    }
    
    // Apply dark mode styling to any existing elements
    updateDarkModeStyling();
}

// NEW: Listen for storage changes. This allows background/popup to change settings
// and the content script reacts without needing explicit messages or page reload.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        console.log('Storage change detected:', changes);
        let settingsChanged = false;
        // Update currentSettings based on what changed
        for (let key in changes) {
            if (key === STORAGE_KEYS.IS_ON) {
                currentSettings[STORAGE_KEYS.IS_ON] = changes[key].newValue;
                 settingsChanged = true;
                console.log(`Plugin state changed to: ${currentSettings[STORAGE_KEYS.IS_ON]}`);
                
                // Handle enabling/disabling the plugin
                if (currentSettings[STORAGE_KEYS.IS_ON]) {
                    processParagraphs();
                    startObservingDOMChanges();
                } else {
                    restoreOriginalText();
                    stopObservingDOMChanges();
                }
            } 
            else if (key === STORAGE_KEYS.SENTENCE_COUNT) {
                currentSettings[STORAGE_KEYS.SENTENCE_COUNT] = changes[key].newValue;
                settingsChanged = true;
                console.log(`Sentence count changed to: ${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`);
            }
            else if (key === STORAGE_KEYS.DIFFICULTY_LEVEL) {
                currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] = changes[key].newValue;
                settingsChanged = true;
                console.log(`Difficulty level changed to: ${currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]}`);
            }
            // else if (key === STORAGE_KEYS.CUSTOM_PROMPT) {
            //     currentSettings[STORAGE_KEYS.CUSTOM_PROMPT] = changes[key].newValue;
            //     settingsChanged = true;
            //     console.log(`Custom prompt template changed`);
            // }
            else if (key === 'genShredDifficultyMapping') {
                currentDifficultyMappings = changes[key].newValue;
                settingsChanged = true;
                console.log(`Difficulty mappings updated:`, currentDifficultyMappings);
              }
            // NEW: Handle custom prompts storage change
            else if (key === 'genShredCustomPrompts') {
                currentCustomPrompts = changes[key].newValue;
                settingsChanged = true;
                console.log(`Custom prompts updated:`, currentCustomPrompts);
            }
            // NEW: Handle manual select mode storage change
            else if (key === STORAGE_KEYS.MANUAL_SELECT) {
                manualSelectModeEnabled = changes[key].newValue;
                console.log(`Manual select mode changed to: ${manualSelectModeEnabled}`);
                // No need to re-process paragraphs here, as it's a mode toggle
                // We might need to hide/show the button based on this, handled by listeners
            }
            // NEW: Handle dark mode storage change
            else if (key === STORAGE_KEYS.DARK_MODE) {
                darkModeEnabled = changes[key].newValue;
                console.log(`Dark mode changed to: ${darkModeEnabled}`);
                // Update existing rewritten elements with new dark mode styling
                updateDarkModeStyling();
            }
            // NEW: Handle reading mode storage change
            else if (key === STORAGE_KEYS.READING_MODE) {
                readingModeEnabled = changes[key].newValue;
                console.log(`Reading mode changed to: ${readingModeEnabled}`);
                // Reprocess the page with new reading mode settings
                restoreOriginalText();
                if (currentSettings[STORAGE_KEYS.IS_ON]) {
                    processParagraphs();
                }
              }
          }

        // If any relevant settings changed and plugin is on, reprocess paragraphs
        if (settingsChanged && currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Settings changed, reprocessing paragraphs...");
            // Clear cache to ensure new settings are applied
            // PARAGRAPH_CACHE.clear(); // This line is removed as per the new_code
            // First restore original text, then process with new settings
            restoreOriginalText();
            processParagraphs();
        }
    }
});


export {currentCustomPrompts,currentSettings,currentDifficultyMappings,manualSelectModeEnabled,darkModeEnabled,tooltipElement,isTooltipVisible,isProcessing,activeTooltipElement,loadSettings};