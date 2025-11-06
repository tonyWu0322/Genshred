import React, { useState, useEffect } from 'react';
import './popup.css';
import PromptSettingsModal from './PromptSettingsModal';
import UserModal from './UserModal';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '~src/constants';
export {STORAGE_KEYS}; // ???
// Define the difficulty mapping type
type DifficultyMappings = Record<string, string>;

function Popup() {
  // === State Variables ===
  // Note: These states should now only be updated when storage changes or on user input.
  const [isOn, setIsOn] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON] as boolean);
  const [sentencesToRewrite, setSentencesToRewrite] = useState<number>(DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT] as number);
  const [difficulty, setDifficulty] = useState<string>(DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL] as string);
  const [manualSelect, setManualSelect] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.MANUAL_SELECT] as boolean);
  const [darkMode, setDarkMode] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.DARK_MODE] as boolean);
  const [readingMode, setReadingMode] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.READING_MODE] as boolean);
  const [hideAIChat, setHideAIChat] = useState<boolean>(DEFAULT_SETTINGS[STORAGE_KEYS.HIDE_AI_CHAT] as boolean);
  
  // Modal states
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  
  // User login states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Prompt states
  const [difficultyMappings, setDifficultyMappings] = useState<DifficultyMappings>(
    DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_MAPPING] as DifficultyMappings
  );
  const [customPrompts, setCustomPrompts] = useState<Array<{ id: string; name: string; prompt: string }>>([]);

  // === Load settings from storage when the popup mounts ===
  useEffect(() => {
    const loadSettings = async () => {
      // Use chrome.storage.local.get to retrieve all keys at once
      const storedSettings = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
      
      // Update state with loaded values, falling back to defaults if not set
      setIsOn(storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON]);
      setSentencesToRewrite(storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT]);
      setDifficulty(String(storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL]));
      setManualSelect(storedSettings[STORAGE_KEYS.MANUAL_SELECT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.MANUAL_SELECT]);
      setDarkMode(storedSettings[STORAGE_KEYS.DARK_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DARK_MODE]);
      setReadingMode(storedSettings[STORAGE_KEYS.READING_MODE] ?? DEFAULT_SETTINGS[STORAGE_KEYS.READING_MODE]);
      setHideAIChat(storedSettings[STORAGE_KEYS.HIDE_AI_CHAT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.HIDE_AI_CHAT]);
      setDifficultyMappings(storedSettings[STORAGE_KEYS.DIFFICULTY_MAPPING] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_MAPPING]);
      setCustomPrompts(storedSettings['genShredCustomPrompts'] ?? []);
    };
    loadSettings();

    // Add a listener for storage changes. This keeps the popup's state in sync
    // with any changes made by other parts of the extension.
    const storageListener = (changes, namespace) => {
      if (namespace === 'local') {
        if (changes[STORAGE_KEYS.IS_ON]) setIsOn(changes[STORAGE_KEYS.IS_ON].newValue);
        if (changes[STORAGE_KEYS.SENTENCE_COUNT]) setSentencesToRewrite(changes[STORAGE_KEYS.SENTENCE_COUNT].newValue);
        if (changes[STORAGE_KEYS.DIFFICULTY_LEVEL]) setDifficulty(changes[STORAGE_KEYS.DIFFICULTY_LEVEL].newValue);
        if (changes[STORAGE_KEYS.MANUAL_SELECT]) setManualSelect(changes[STORAGE_KEYS.MANUAL_SELECT].newValue);
        if (changes[STORAGE_KEYS.DARK_MODE]) setDarkMode(changes[STORAGE_KEYS.DARK_MODE].newValue);
        if (changes[STORAGE_KEYS.READING_MODE]) setReadingMode(changes[STORAGE_KEYS.READING_MODE].newValue);
        if (changes[STORAGE_KEYS.HIDE_AI_CHAT]) setHideAIChat(changes[STORAGE_KEYS.HIDE_AI_CHAT].newValue);
        if (changes['genShredDifficultyMapping']) setDifficultyMappings(changes['genShredDifficultyMapping'].newValue);
        if (changes['genShredCustomPrompts']) setCustomPrompts(changes['genShredCustomPrompts'].newValue);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    // Cleanup listener on unmount
    return () => chrome.storage.onChanged.removeListener(storageListener);

  }, []); // Empty dependency array means this effect runs only once

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

  // === Handlers - Now only communicate with chrome.storage ===

  // Function to open prompt settings modal
  const goToPromptSettings = () => {
    setIsPromptModalOpen(true);
  };
  
  // Function to open user modal
  const openUserModal = () => {
    setIsUserModalOpen(true);
  };

  // Toggle handler, now only sets storage
  const handleToggle = async () => {
    const newState = !isOn;
    // setIsOn(newState); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.IS_ON]: newState });
  };

  // Slider handler, now only sets storage
  const handleSliderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    // setSentencesToRewrite(value); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.SENTENCE_COUNT]: value });
  };

  // Difficulty change handler, now only sets storage
  const handleDifficultyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "Add Custom...") {
      goToPromptSettings();
      return;
    }
    // setDifficulty(value); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.DIFFICULTY_LEVEL]: value });
  };

  // Manual select toggle, now only sets storage
  const handleManualSelectToggle = async () => {
    const newState = !manualSelect;
    // setManualSelect(newState); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.MANUAL_SELECT]: newState });
  };

  // Dark mode toggle, now only sets storage
  const handleDarkModeToggle = async () => {
    const newState = !darkMode;
    // setDarkMode(newState); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.DARK_MODE]: newState });
  };

  // Reading mode toggle, now only sets storage
  const handleReadingModeToggle = async () => {
    const newState = !readingMode;
    // setReadingMode(newState); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.READING_MODE]: newState });
  };

  // Hide AI chat toggle, now only sets storage
  const handleHideAIChatToggle = async () => {
    const newState = !hideAIChat;
    // setHideAIChat(newState); // State will be updated by the listener
    await chrome.storage.local.set({ [STORAGE_KEYS.HIDE_AI_CHAT]: newState });
  };

  // Add this handler after your other handler functions
  const handleClearCache = () => {
    // This is a direct command, so we still use sendMessage
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "CLEAR_CACHE"
        });
      }
    });
  };

  // Handle clear all rewrites
  const handleClearAllRewrites = () => {
    // This is a direct command, so we still use sendMessage
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "CLEAR_ALL_REWRITES"
        });
      }
    });
  };

  // Function to refresh custom prompts from storage after a save
  const refreshCustomPrompts = async () => {
    const stored = await chrome.storage.local.get(['genShredCustomPrompts']);
    if (stored['genShredCustomPrompts']) {
      setCustomPrompts(stored['genShredCustomPrompts']);
    }
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-icon" onClick={goToPromptSettings}>
          ⚙️
        </div>
        <div className="header-title">Genshred</div>
        <div className="header-icon" onClick={openUserModal}>
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
          <label htmlFor="on-off-toggle">Auto Rewrite On/ Off</label>
          <label className="switch">
            <input
              type="checkbox"
              id="on-off-toggle"
              checked={!!isOn}
              onChange={handleToggle}
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="control-group">
          <label htmlFor="sentences-slider">Percentage of Sentences to Rewrite</label>
          <input
            type="range"
            id="sentences-slider"
            min="0"
            max="100"
            value={Number(sentencesToRewrite)}
            onChange={handleSliderChange}
          />
          <span>{Number(sentencesToRewrite)}%</span>
        </div>

        <div className="control-group">
          <label htmlFor="difficulty-select">Choose Difficulty</label>
          <select id="difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
            {Object.keys(difficultyMappings).map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
            {customPrompts.map((cp) => (
              <option key={cp.id} value={cp.id}>{cp.name}</option>
            ))}
            <option value="Add Custom...">Add Custom...</option>
          </select>
        </div>

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

        <div className="control-group">
          <label htmlFor="dark-mode-toggle">Dark Mode</label>
          <label className="switch">
            <input
              type="checkbox"
              id="dark-mode-toggle"
              checked={!!darkMode}
              onChange={handleDarkModeToggle}
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="control-group">
          <label htmlFor="hide-ai-chat-toggle">AI Chat</label>
          <label className="switch">
            <input
              type="checkbox"
              id="hide-ai-chat-toggle"
              checked={!hideAIChat}
              onChange={handleHideAIChatToggle}
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="control-group" style={{display:"none"}}>
          <label htmlFor="reading-mode-toggle">Reading Mode</label>
          <label className="switch">
            <input
              type="checkbox"
              id="reading-mode-toggle"
              checked={!!readingMode}
              onChange={handleReadingModeToggle}
            />
            <span className="slider round"></span>
          </label>
          <small style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            More conservative processing for complex pages
          </small>
        </div>

        <div className="control-group">
            <button
                className="clear-cache-button"
                onClick={handleClearCache}
            >
                Clear Cache
            </button>
        </div>

        <div className="control-group">
            <button
                className="clear-rewrites-button"
                onClick={handleClearAllRewrites}
            >
                Clear All Rewrites
            </button>
        </div>
      </section>

      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
      />

      <PromptSettingsModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        onSave={refreshCustomPrompts}
      />
    </div>
  );
}

export default Popup;
