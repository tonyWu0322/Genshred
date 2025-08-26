const STORAGE_KEYS = {
    IS_ON: 'genShredPluginState',
    SENTENCE_COUNT: 'genShredSentenceCount',
    DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
    DIFFICULTY_MAPPING:'genShredDifficultyMapping', // NEW
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
    [STORAGE_KEYS.DIFFICULTY_MAPPING]:  {
      "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
      "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
      "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
  }
  //   [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT // Use the consistent default
  };
  
const PROCESSING_DELAY = 1000; // 1 second delay between processing requests
// const PARAGRAPH_CACHE = new Map<string, any>(); // Cache for processed paragraphs not yet effective 未实装
const MIN_PARAGRAPH_LENGTH = 20; // Reduced from 100 to 20 for better Chinese support
const MIN_CHINESE_PARAGRAPH_LENGTH = 10; // Special minimum for Chinese text (more concise)
const MAX_PARAGRAPH_LENGTH = 11451419; // Maximum characters to process
export {STORAGE_KEYS, DEFAULT_SETTINGS, MIN_PARAGRAPH_LENGTH, MIN_CHINESE_PARAGRAPH_LENGTH, MAX_PARAGRAPH_LENGTH, PROCESSING_DELAY };