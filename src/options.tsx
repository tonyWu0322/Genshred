// options.tsx
import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

import './options.css';
// We will not define the default custom prompt here for consistency
// This prompt will be passed to the backend, so make sure it uses {user_level} and {sentences_to_rewrite}
const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";
const LANGUAGES = [
    { code: 'default', name: 'Default for all languages' },
    { code: 'en', name: 'English' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ru', name: 'Russian' }
];
const DIFFICULTIES = [
    'Easy', 'Normal', 'Hard', 'Custom_1'
];

const DEFAULT_PROMPT_MATRIX = {
    Easy: { default: "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level)." },
    Normal: { default: "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language." },
    Hard: { default: "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity." },
    Custom_1: { default: "Rewrite for a user with specific needs, as defined by the custom prompt below." }
};

function Options() {
    const [customPrompt, setCustomPrompt] = useState(CUSTOM_PROMPT_DEFAULT);
    const [difficultyMapping, setDifficultyMapping] = useState({
        "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
        "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
        "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
        "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
    });
    const [statusMessage, setStatusMessage] = useState('');
    const [ignoreLangs, setIgnoreLangs] = useState<string[]>([]);
    const [promptMatrix, setPromptMatrix] = useState<any>(DEFAULT_PROMPT_MATRIX);
    const [cellActive, setCellActive] = useState(false);
    useEffect(() => {
        const loadSettings = async () => {
            const storedSettings = await chrome.storage.local.get([
                STORAGE_KEYS.CUSTOM_PROMPT,
                'genShredDifficultyMapping',
                'genshred_ignore_languages',
                'genshred_prompt_matrix'
            ]);
            setCustomPrompt(storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? CUSTOM_PROMPT_DEFAULT);
            setDifficultyMapping(storedSettings['genShredDifficultyMapping'] ?? difficultyMapping);
            setIgnoreLangs(storedSettings['genshred_ignore_languages'] ?? []);
            setPromptMatrix(storedSettings['genshred_prompt_matrix'] ?? DEFAULT_PROMPT_MATRIX);
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        await chrome.storage.local.set({
            [STORAGE_KEYS.CUSTOM_PROMPT]: customPrompt,
            'genShredDifficultyMapping': difficultyMapping,
            'genshred_ignore_languages': ignoreLangs,
            'genshred_prompt_matrix': promptMatrix
        });
        setStatusMessage('Settings saved!');
        setTimeout(() => setStatusMessage(''), 3000);
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

    const handleLangToggle = (lang: string) => {
        setIgnoreLangs(prev => {
            if (prev.includes(lang)) {
                return prev.filter(l => l !== lang);
            }
            return [...prev, lang];
        });
    };
    const handlePromptMatrixChange = (difficulty: string, lang: string, value: string) => {
        setPromptMatrix((prev: any) => ({
            ...prev,
            [difficulty]: {
                ...prev[difficulty],
                [lang]: value
            }
        }));
    };
    return (
        <div className="options-container">
            <h1>Genshred Advanced Settings</h1>

            <section>
                <h2>1. Custom Prompt Matrix (per Difficulty & Language)</h2>
                <p>Specify custom prompts for each difficulty and language. If a cell is left empty, the default for that difficulty will be used.</p>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ border: '1px solid #ccc', padding: 4 }}>Difficulty</th>
                            {LANGUAGES.map(lang => (
                                <th key={lang.code} style={{ border: '1px solid #ccc', padding: 4 }}>{lang.name}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                    {DIFFICULTIES.map(difficulty => (
                        <tr key={difficulty}>
                            <td style={{ border: '1px solid #ccc', padding: 4 }}><b>{difficulty}</b></td>
                            {LANGUAGES.map(lang => {
                            const isDefault = lang.code === 'default';
                            const isIgnored = !isDefault && ignoreLangs.includes(lang.code);
                            const cell = promptMatrix[difficulty]?.[lang.code] || { value: '', active: false };
                            const isActive = isDefault || (cell.active && !isIgnored);

                            return (
                                <td
                                key={lang.code}
                                style={{
                                    border: '1px solid #ccc',
                                    padding: 4,
                                    background: isIgnored
                                    ? '#f8d7da'
                                    : !isActive
                                        ? '#f0f0f0'
                                        : 'white',
                                    opacity: isIgnored || !isActive ? 0.6 : 1,
                                    position: 'relative'
                                }}
                                >
                                {!isDefault && (
                                    <button
                                    onClick={() => {
                                        if (isIgnored) return;
                                        setPromptMatrix((prev: any) => ({
                                        ...prev,
                                        [difficulty]: {
                                            ...prev[difficulty],
                                            [lang.code]: {
                                            ...prev[difficulty]?.[lang.code],
                                            active: !cell.active
                                            }
                                        }
                                        }));
                                    }}
                                    disabled={isIgnored}
                                    style={{
                                        marginBottom: 4,
                                        background: cell.active ? '#1976d2' : '#ccc',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: isIgnored ? 'not-allowed' : 'pointer',
                                        fontSize: 12,
                                        padding: '2px 8px'
                                    }}
                                    title={isIgnored ? 'Language ignored' : cell.active ? 'Deactivate' : 'Activate'}
                                    >
                                    {isIgnored ? '🚫' : cell.active ? 'Active' : 'Inactive'}
                                    </button>
                                )}
                                <textarea
                                    rows={2}
                                    cols={24}
                                    value={cell.value}
                                    onChange={e => setPromptMatrix((prev: any) => ({
                                    ...prev,
                                    [difficulty]: {
                                        ...prev[difficulty],
                                        [lang.code]: {
                                        ...prev[difficulty]?.[lang.code],
                                        value: e.target.value
                                        }
                                    }
                                    }))}
                                    placeholder={isDefault ? 'Default prompt' : `Override for ${lang.name}`}
                                    disabled={isIgnored || (!isDefault && !cell.active)}
                                    style={{
                                    width: '100%',
                                    background: isIgnored ? '#f8d7da' : !isActive ? '#f0f0f0' : 'white'
                                    }}
                                />
                                {isIgnored && (
                                    <div style={{
                                    position: 'absolute',
                                    top: 2,
                                    right: 2,
                                    fontSize: 14,
                                    color: '#a94442'
                                    }}>
                                    Ignored
                                    </div>
                                )}
                                </td>
                            );
                            })}
                        </tr>
                        ))}

                    </tbody>
                </table>
            </section>


            <section>
                <h2>2. Language Preferences</h2>
                <p>Select the languages you want to <b>ignore</b> (the extension will not rewrite these):</p>
                {[
                    { code: 'en', name: 'English' },
                    { code: 'zh', name: 'Chinese' },
                    { code: 'ja', name: 'Japanese' },
                    { code: 'es', name: 'Spanish' },
                    { code: 'fr', name: 'French' },
                    { code: 'de', name: 'German' },
                    { code: 'ru', name: 'Russian' }
                ].map(lang => (
                    <label key={lang.code} style={{ marginRight: 16 }}>
                    <input
                        type="checkbox"
                        checked={ignoreLangs.includes(lang.code)}
                        onChange={() => handleLangToggle(lang.code)}
                    />
                    {lang.name}
                    </label>
                ))}
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