// options.tsx
import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './popup'; // Re-use constants

// We'll also define the default custom prompt here for consistency
// This prompt will be passed to the backend, so make sure it uses {user_level} and {sentences_to_rewrite}
const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";

function Options() {
    const [customPrompt, setCustomPrompt] = useState(CUSTOM_PROMPT_DEFAULT);
    const [difficultyMapping, setDifficultyMapping] = useState({
        "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
        "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
        "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
        "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
    });
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        const loadSettings = async () => {
            const storedSettings = await chrome.storage.local.get([
                STORAGE_KEYS.CUSTOM_PROMPT,
                'genShredDifficultyMapping' // New key for storing custom mappings
            ]);

            setCustomPrompt(storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? CUSTOM_PROMPT_DEFAULT);
            setDifficultyMapping(storedSettings['genShredDifficultyMapping'] ?? difficultyMapping); // Load, or use default if not found
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        await chrome.storage.local.set({
            [STORAGE_KEYS.CUSTOM_PROMPT]: customPrompt,
            'genShredDifficultyMapping': difficultyMapping
        });
        setStatusMessage('Settings saved!');
        setTimeout(() => setStatusMessage(''), 3000); // Clear message after 3 seconds
    };

    const handleCustomPromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCustomPrompt(event.target.value);
    };

    const handleMappingChange = (level: string, value: string) => {
        setDifficultyMapping(prev => ({ ...prev, [level]: value }));
    };

    const handleResetToDefaults = async () => {
        setCustomPrompt(CUSTOM_PROMPT_DEFAULT);
        setDifficultyMapping({
            "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
            "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
            "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
            "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
        });
        await chrome.storage.local.set({
            [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT,
            'genShredDifficultyMapping': { // Ensure full reset in storage
                "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
                "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
                "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
                "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
            }
        });
        setStatusMessage('Settings reset to defaults!');
        setTimeout(() => setStatusMessage(''), 3000);
    };


    return (
        <div className="options-container">
            <h1>Genshred Advanced Settings</h1>

            <section>
                <h2>1. Difficulty Level Instructions for AI</h2>
                <p>Define what each difficulty level means for the AI when rewriting sentences. This is the instruction the AI will receive.</p>
                {Object.entries(difficultyMapping).map(([level, instruction]) => (
                    <div key={level} className="setting-group">
                        <label htmlFor={`mapping-${level}`}><strong>{level}:</strong></label>
                        <textarea
                            id={`mapping-${level}`}
                            value={instruction}
                            onChange={(e) => handleMappingChange(level, e.target.value)}
                            rows={2}
                            cols={50}
                        />
                    </div>
                ))}
            </section>

            <section>
                <h2>2. Custom Prompt Template (for 'Custom_1' Difficulty)</h2>
                <p>If you select 'Custom_1' difficulty, this prompt will be used. Use <code>{'{user_level}'}</code> as a placeholder for the chosen level and <code>{'{sentences_to_rewrite}'}</code> for the actual sentences.</p>
                <textarea
                    value={customPrompt}
                    onChange={handleCustomPromptChange}
                    rows={8}
                    cols={80}
                    className="custom-prompt-textarea"
                />
            </section>

            <div className="button-group">
                <button onClick={handleSave}>Save Settings</button>
                <button onClick={handleResetToDefaults}>Reset to Defaults</button>
                {statusMessage && <p className="status-message">{statusMessage}</p>}
            </div>
        </div>
    );
}

export default Options;