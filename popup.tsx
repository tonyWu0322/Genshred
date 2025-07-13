// popup.tsx
import React, { useState, useEffect, useCallback } from 'react'; // Import useEffect and useCallback
import './popup.css'; // 创建一个基础的 CSS 文件用于样式
import PromptSettingsModal from './PromptSettingsModal'; // Import the modal component
import UserModal from './UserModal'; // Import the user modal component

// Define keys for storage
export const STORAGE_KEYS = {
  IS_ON: 'genShredPluginState',
  SENTENCE_COUNT: 'genShredSentenceCount',
  DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
  CUSTOM_PROMPT: 'genShredCustomPromptTemplate', // Assuming you'll add this later
  DIFFICULTY_MAPPING: 'genShredDifficultyMapping', // Added for storing prompt mappings
  MANUAL_SELECT: 'genShredManualSelect' // Added for manual select mode
};
// Define default values
const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";

// Define the difficulty mapping type
// type DifficultyMapping = Record<string, string>; // Removed duplicate definition
type DifficultyMappings = Record<string, string>;

export const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.IS_ON]: true,
  [STORAGE_KEYS.SENTENCE_COUNT]: 50, // Default to 50% of sentences
  [STORAGE_KEYS.DIFFICULTY_LEVEL]: 'Normal',
  [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT, // Now consistently defined
  [STORAGE_KEYS.DIFFICULTY_MAPPING]: {
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
    "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
  } as DifficultyMappings
};

function Popup() {
  // Variables to hold current settings state in popup
  const [isOn, setIsOn] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON] as boolean);
  const [sentencesToRewrite, setSentencesToRewrite] = useState<number>(DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT] as number);
  const [difficulty, setDifficulty] = useState<string>(DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL] as string);
  const [manualSelect, setManualSelect] = useState(false); // State for manual selection mode
  
  // State for prompt settings modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // State for user modal
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
  // State to track if user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // State for user-defined difficulty mappings
  const [difficultyMappings, setDifficultyMappings] = useState<DifficultyMappings>({
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
  });
  // NEW: State for custom prompts
  const [customPrompts, setCustomPrompts] = useState<Array<{ id: string; name: string; prompt: string }>>([]);

  // --- NEW: Load settings from storage when the popup mounts ---
  useEffect(() => {
    const loadSettings = async () => {
      // Use chrome.storage.local.get to retrieve multiple keys at once
      const storedSettings = await chrome.storage.local.get([
        STORAGE_KEYS.IS_ON,
        STORAGE_KEYS.SENTENCE_COUNT,
        STORAGE_KEYS.DIFFICULTY_LEVEL,
        STORAGE_KEYS.DIFFICULTY_MAPPING,
        'genShredDifficultyMapping', // Load difficulty mappings
        'genShredCustomPrompts', // Load custom prompts
        'genShredManualSelect' // Load manual select state
      ]);

      // Update state with loaded values, fall back to defaults if not set
      setIsOn(storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON]);
      setSentencesToRewrite(storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT]);
      setDifficulty(String(storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL]));
      // NEW: Load manual select state
      setManualSelect(storedSettings['genShredManualSelect'] ?? false);
      
      // Initialize difficulty mapping if not set
      if (!storedSettings['genShredDifficultyMapping']) {
        await chrome.storage.local.set({ 
          'genShredDifficultyMapping': DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_MAPPING] 
        });
      } else {
        setDifficultyMappings(prev => ({ ...prev, ...storedSettings['genShredDifficultyMapping'] }));
      }
      
      // setCustomPrompt(storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT]); // Load prompt
      // NEW: Load custom prompts
      if (storedSettings['genShredCustomPrompts']) {
        setCustomPrompts(storedSettings['genShredCustomPrompts']);
      }

      // Optional: Send initial state to content script on load if plugin was already enabled
      // However, content script should load state itself on page load.
      // Sending state from popup on load is useful if the popup controls the active state
      // *immediately* without page reload. Let's send all current settings on load.
       chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs[0]?.id) {
           // Send all loaded settings to content script
           chrome.tabs.sendMessage(tabs[0].id, {
             type: "SYNC_SETTINGS", // New message type to sync all settings
             settings: {
               enabled: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
               sentenceCount: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
               difficulty: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
               // customPrompt: storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT],
             }
           });
         }
       });

    };

    loadSettings();
  }, []); // Empty dependency array means this effect runs only once after the initial render

  // Add a new useEffect to check user login status
  useEffect(() => {
    const checkLoginStatus = async () => {
      const storedUser = await chrome.storage.local.get(['currentUser']);
      if (storedUser.currentUser) {
        setIsLoggedIn(true);
        setCurrentUser(storedUser.currentUser);
      }
    };
    
    checkLoginStatus();
  }, []);

  // Function to open settings modal
  const goToSettings = () => {
    setIsModalOpen(true);
  };
  
  // Function to open user modal
  const openUserModal = () => {
    setIsUserModalOpen(true);
  };

  // 开关切换处理函数
  const handleToggle = async () => { // Make async to use await for storage
    const newState = !isOn;
    setIsOn(newState);
    console.log('Plugin is now:', newState ? 'On' : 'Off');

    // --- NEW: Save the new state to storage ---
    await chrome.storage.local.set({ [STORAGE_KEYS.IS_ON]: newState });

    // Also send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "TOGGLE_PLUGIN", // Existing message type
          enabled: newState
        });
      }
    });
  };

  const handleSliderChange = async (event: React.ChangeEvent<HTMLInputElement>) => { // Make async
    const value = Number(event.target.value);
    setSentencesToRewrite(value);
    console.log('Sentences to rewrite:', value);

    // --- NEW: Save the new count to storage ---
    await chrome.storage.local.set({ [STORAGE_KEYS.SENTENCE_COUNT]: value });

    // Also send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_REWRITE_COUNT", // Existing message type
          count: value
        });
      }
    });
  };

  // 难度选择变更处理函数
  const handleDifficultyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => { // Make async
    const value = event.target.value;

    // Handle the "Add Custom..." option separately
    if (value === "Add Custom...") {
      goToSettings(); // Open prompt settings modal
      return; // Don't change state or save if "Add Custom..." is selected
    }

    setDifficulty(value);
    console.log('Selected difficulty:', value);

    // --- NEW: Save the new difficulty to storage ---
    await chrome.storage.local.set({ [STORAGE_KEYS.DIFFICULTY_LEVEL]: value });

    // Determine the effective prompt instruction to send to content script
    let promptInstructionToSend = "";
    if (difficultyMappings[value as keyof DifficultyMappings]) {
        promptInstructionToSend = difficultyMappings[value as keyof DifficultyMappings];
    } else {
        // Check if it's a custom prompt by ID
        const selectedCustomPrompt = customPrompts.find(cp => cp.id === value);
        if (selectedCustomPrompt) {
            promptInstructionToSend = selectedCustomPrompt.prompt;
        }
    }

    // Also send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_DIFFICULTY", // Existing message type
          difficulty: value,
          promptInstruction: promptInstructionToSend // Send the actual instruction
        });
      }
    });
  };

  // Handle manual select toggle
  const handleManualSelectToggle = async () => {
    const newState = !manualSelect;
    setManualSelect(newState);
    console.log('Manual Select is now:', newState ? 'On' : 'Off');

    await chrome.storage.local.set({ [STORAGE_KEYS.MANUAL_SELECT]: newState });

    // Send message to content script to update manual select mode
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_MANUAL_SELECT_MODE",
          enabled: newState
        });
      }
    });
  };

  // Add this handler after your other handler functions
const handleClearCache = async () => {
    // Send message to content script to clear cache
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: "CLEAR_CACHE"
            });
        }
    });
};
  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-icon" onClick={goToSettings}>
          {/* 设置图标 */}
          ⚙️
        </div>
        <div className="header-title">Genshred</div>
        <div className="header-icon" onClick={openUserModal}>
          {/* 用户图标，根据登录状态显示不同样式 */}
          {isLoggedIn ? (
            <div className="user-logged-in" title={`Logged in as ${currentUser}`}>
              👤
            </div>
          ) : (
            <div className="user-logged-out" title="Login or Register">
              👤
            </div>
          )}
        </div>
      </header>

      <section className="popup-body">
        <div className="control-group">
          <label htmlFor="on-off-toggle">On/ Off</label>
          {/* Switch Toggle Component */}
          <label className="switch">
          <input
            type="checkbox"
            id="on-off-toggle"
            checked={!!isOn} // Ensure boolean
            onChange={handleToggle} // Use handler
          />
            <span className="slider round"></span>
          </label>
        </div>

        {/* "重写句子数量"滑块 */}
        <div className="control-group">
          <label htmlFor="sentences-slider">Percentage of Sentences to Rewrite</label>
          <input
            type="range"
            id="sentences-slider"
            min="0" // Minimum percentage
            max="100" // Maximum percentage
            value={Number(sentencesToRewrite)} // Ensure value is a number
            onChange={handleSliderChange} // Use handler
          />
          {/* 可选：显示当前滑块值 */}
          <span>{Number(sentencesToRewrite)}%</span> {/* Use state and add percentage sign */}
        </div>

        {/* 难度选择 */}
        <div className="control-group">
          <label htmlFor="difficulty-select">Choose Difficulty</label>
          {/* 使用标准下拉框组件，适合原型阶段 */}
          <select id="difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
            <option value="Easy">Easy</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
            {/* Dynamically add custom prompts */}
            {customPrompts.map((cp) => (
              <option key={cp.id} value={cp.id}>{cp.name}</option>
            ))}
            <option value="Add Custom...">Add Custom...</option>
          </select>
          {/* 从 Figma 获取的搜索和清除图标需要更复杂的组件实现 */}
        </div>

        {/* Manual Select Toggle */}
        <div className="control-group">
          <label htmlFor="manual-select-toggle">Manual Select Mode</label>
          <label className="switch">
            <input
              type="checkbox"
              id="manual-select-toggle"
              checked={!!manualSelect}
              onChange={handleManualSelectToggle}
            />
            <span className="slider round"></span>
          </label>
        </div>

        {/* Clear Cache Button */}
       <div className="control-group">
            <button 
                className="clear-cache-button"
                onClick={handleClearCache}
            >
                Clear Cache
            </button>
        </div>
        
      </section>

        {/* User Modal */}
        <UserModal 
          isOpen={isUserModalOpen} 
          onClose={() => setIsUserModalOpen(false)} 
        />
        
        {/* Prompt Settings Modal */}
        <PromptSettingsModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
        />
    </div>
  );
}

export default Popup;