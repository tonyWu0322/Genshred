const STORAGE_KEYS = {
    IS_ON: 'genShredPluginState',
    SENTENCE_COUNT: 'genShredSentenceCount',
    DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
    CUSTOM_PROMPT: 'genShredCustomPromptTemplate', // Assuming you'll add this later
    DARK_MODE: 'genShredDarkMode', // Added for dark mode toggle
    READING_MODE: 'genShredReadingMode', // Added for reading mode
    MANUAL_SELECT: 'genShredManualSelect' // Added for manual select mode
};

const DEFAULT_SETTINGS = {
    [STORAGE_KEYS.IS_ON]: true,
    [STORAGE_KEYS.SENTENCE_COUNT]: 50, // Default to 50% of sentences
    [STORAGE_KEYS.DIFFICULTY_LEVEL]: 'Normal',
    [STORAGE_KEYS.DARK_MODE]: false, // Default to light mode
    [STORAGE_KEYS.READING_MODE]: false, // Default to normal mode
    [STORAGE_KEYS.MANUAL_SELECT]: true, // Default to enabled manual select mode
  //   [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT // Use the consistent default
  };
  
const PROCESSING_DELAY = 1000; // 1 second delay between processing requests
// const PARAGRAPH_CACHE = new Map<string, any>(); // Cache for processed paragraphs not yet effective 未实装
const MIN_PARAGRAPH_LENGTH = 100; // Minimum characters to process
const MAX_PARAGRAPH_LENGTH = 11451419; // Maximum characters to process
export {STORAGE_KEYS, DEFAULT_SETTINGS, MIN_PARAGRAPH_LENGTH, MAX_PARAGRAPH_LENGTH, PROCESSING_DELAY };