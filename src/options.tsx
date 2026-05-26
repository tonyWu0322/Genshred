// options.tsx
import React, { useState, useEffect } from 'react';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'
import { SERVER_URL } from './config'

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

function toFiniteNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

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
    const [minParagraphLength, setMinParagraphLength] = useState<number>(20);
    const [backendMode, setBackendMode] = useState<'official' | 'custom'>('official');
    const [customSplitUrl, setCustomSplitUrl] = useState('');
    const [customLlmUrl, setCustomLlmUrl] = useState('');
    const [customLlmApiKey, setCustomLlmApiKey] = useState('');
    const [customLlmModel, setCustomLlmModel] = useState('gpt-4o-mini');
    const [customLlmTemperature, setCustomLlmTemperature] = useState<number>(0.7);
    const [customLlmTopP, setCustomLlmTopP] = useState<number>(0.7);
    const [customLlmMaxTokens, setCustomLlmMaxTokens] = useState<number>(512);
    const [customLlmTimeoutMs, setCustomLlmTimeoutMs] = useState<number>(20000);
    useEffect(() => {
        const loadSettings = async () => {
            const storedSettings = await chrome.storage.local.get([
                STORAGE_KEYS.CUSTOM_PROMPT,
                'genShredDifficultyMapping',
                'genshred_ignore_languages',
                'genshred_prompt_matrix',
                STORAGE_KEYS.MIN_PARAGRAPH_LENGTH,
                STORAGE_KEYS.BACKEND_MODE,
                STORAGE_KEYS.CUSTOM_SPLIT_URL,
                STORAGE_KEYS.CUSTOM_LLM_URL,
                STORAGE_KEYS.CUSTOM_LLM_API_KEY,
                STORAGE_KEYS.CUSTOM_LLM_MODEL,
                STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE,
                STORAGE_KEYS.CUSTOM_LLM_TOP_P,
                STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS,
                STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS,
            ]);
            setCustomPrompt(storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? CUSTOM_PROMPT_DEFAULT);
            setDifficultyMapping(storedSettings['genShredDifficultyMapping'] ?? difficultyMapping);
            setIgnoreLangs(storedSettings['genshred_ignore_languages'] ?? []);
            setPromptMatrix(storedSettings['genshred_prompt_matrix'] ?? DEFAULT_PROMPT_MATRIX);
            setMinParagraphLength(storedSettings[STORAGE_KEYS.MIN_PARAGRAPH_LENGTH] ?? 20);
            const bm = storedSettings[STORAGE_KEYS.BACKEND_MODE];
            setBackendMode(bm === 'custom' ? 'custom' : 'official');
            setCustomSplitUrl(storedSettings[STORAGE_KEYS.CUSTOM_SPLIT_URL] ?? '');
            setCustomLlmUrl(storedSettings[STORAGE_KEYS.CUSTOM_LLM_URL] ?? '');
            setCustomLlmApiKey(storedSettings[STORAGE_KEYS.CUSTOM_LLM_API_KEY] ?? '');
            setCustomLlmModel(storedSettings[STORAGE_KEYS.CUSTOM_LLM_MODEL] ?? 'gpt-4o-mini');
            setCustomLlmTemperature(toFiniteNumber(storedSettings[STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE], 0.7));
            setCustomLlmTopP(toFiniteNumber(storedSettings[STORAGE_KEYS.CUSTOM_LLM_TOP_P], 0.7));
            setCustomLlmMaxTokens(toFiniteNumber(storedSettings[STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS], 512));
            setCustomLlmTimeoutMs(toFiniteNumber(storedSettings[STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS], 20000));
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        await chrome.storage.local.set({
            [STORAGE_KEYS.CUSTOM_PROMPT]: customPrompt,
            'genShredDifficultyMapping': difficultyMapping,
            'genshred_ignore_languages': ignoreLangs,
            'genshred_prompt_matrix': promptMatrix,
            [STORAGE_KEYS.MIN_PARAGRAPH_LENGTH]: minParagraphLength,
            [STORAGE_KEYS.BACKEND_MODE]: backendMode,
            [STORAGE_KEYS.CUSTOM_SPLIT_URL]: customSplitUrl.trim(),
            [STORAGE_KEYS.CUSTOM_LLM_URL]: customLlmUrl.trim(),
            [STORAGE_KEYS.CUSTOM_LLM_API_KEY]: customLlmApiKey,
            [STORAGE_KEYS.CUSTOM_LLM_MODEL]: customLlmModel.trim() || 'gpt-4o-mini',
            [STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE]: toFiniteNumber(customLlmTemperature, 0.7),
            [STORAGE_KEYS.CUSTOM_LLM_TOP_P]: toFiniteNumber(customLlmTopP, 0.7),
            [STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS]: toFiniteNumber(customLlmMaxTokens, 512),
            [STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS]: toFiniteNumber(customLlmTimeoutMs, 20000),
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
        setMinParagraphLength(20);
        setBackendMode('official');
        setCustomSplitUrl('');
        setCustomLlmUrl('');
        setCustomLlmApiKey('');
        setCustomLlmModel('gpt-4o-mini');
        setCustomLlmTemperature(0.7);
        setCustomLlmTopP(0.7);
        setCustomLlmMaxTokens(512);
        setCustomLlmTimeoutMs(20000);
        await chrome.storage.local.set({
            [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT,
            'genShredDifficultyMapping': { // Ensure full reset in storage
                "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
                "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
                "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
                "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
            },
            [STORAGE_KEYS.MIN_PARAGRAPH_LENGTH]: 20,
            [STORAGE_KEYS.BACKEND_MODE]: DEFAULT_SETTINGS[STORAGE_KEYS.BACKEND_MODE],
            [STORAGE_KEYS.CUSTOM_SPLIT_URL]: '',
            [STORAGE_KEYS.CUSTOM_LLM_URL]: '',
            [STORAGE_KEYS.CUSTOM_LLM_API_KEY]: '',
            [STORAGE_KEYS.CUSTOM_LLM_MODEL]: 'gpt-4o-mini',
            [STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE]: 0.7,
            [STORAGE_KEYS.CUSTOM_LLM_TOP_P]: 0.7,
            [STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS]: 512,
            [STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS]: 20000,
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

    const handleMinParagraphLengthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(event.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 1000) {
            setMinParagraphLength(value);
        }
    };
    const officialBase = SERVER_URL.replace(/\/+$/, '');

    return (
        <div className="options-container">
            <h1>Genshred Advanced Settings</h1>

            <section>
                <h2>1. Backend &amp; API Endpoints</h2>
                <p>
                    Choose the official bundled server or your own Parabasis-compatible backend.
                    Sentence splitting and rewrite requests use the URLs below; track/chat still use the official base from build config.
                </p>
                <p style={{ fontSize: 13, color: '#555' }}>
                    <strong>Official base (from build):</strong>{' '}
                    <code>{officialBase}</code>
                    <span style={{ marginLeft: 8 }}>→ <code>{officialBase}/split_sentences</code>, <code>{officialBase}/process_text</code></span>
                </p>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ marginRight: 16 }}>
                        <input
                            type="radio"
                            name="backend-mode"
                            checked={backendMode === 'official'}
                            onChange={() => setBackendMode('official')}
                        />{' '}
                        Official server
                    </label>
                    <label>
                        <input
                            type="radio"
                            name="backend-mode"
                            checked={backendMode === 'custom'}
                            onChange={() => setBackendMode('custom')}
                        />{' '}
                        Custom backend
                    </label>
                </div>
                {backendMode === 'custom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
                        <div>
                            <label htmlFor="custom-split-url" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                Sentence split endpoint (full URL)
                            </label>
                            <input
                                id="custom-split-url"
                                type="url"
                                value={customSplitUrl}
                                onChange={(e) => setCustomSplitUrl(e.target.value)}
                                placeholder={`e.g. ${officialBase}/split_sentences`}
                                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                            />
                            <small style={{ color: '#666' }}>Must accept POST JSON <code>{`{ text, language?, model? }`}</code> like Parabasis <code>/split_sentences</code>.</small>
                        </div>
                        <div>
                            <label htmlFor="custom-llm-url" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                Rewrite / LLM endpoint (full URL)
                            </label>
                            <input
                                id="custom-llm-url"
                                type="url"
                                value={customLlmUrl}
                                onChange={(e) => setCustomLlmUrl(e.target.value)}
                                placeholder={`e.g. ${officialBase}/process_text`}
                                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                            />
                            <small style={{ color: '#666' }}>
                                OpenAI-compatible full endpoint, e.g. <code>https://api.openai.com/v1/chat/completions</code>.
                            </small>
                        </div>
                        <div>
                            <label htmlFor="custom-llm-api-key" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                API key for rewrite (optional)
                            </label>
                            <input
                                id="custom-llm-api-key"
                                type="password"
                                autoComplete="off"
                                value={customLlmApiKey}
                                onChange={(e) => setCustomLlmApiKey(e.target.value)}
                                placeholder="Bearer token sent as Authorization header"
                                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                            />
                            <small style={{ color: '#666' }}>If set, requests use <code>Authorization: Bearer &lt;your key&gt;</code>. Leave empty for no auth.</small>
                        </div>
                        <div>
                            <label htmlFor="custom-llm-model" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                Custom model ID
                            </label>
                            <input
                                id="custom-llm-model"
                                type="text"
                                value={customLlmModel}
                                onChange={(e) => setCustomLlmModel(e.target.value)}
                                placeholder="e.g. gpt-4o-mini, deepseek-chat, qwen-plus"
                                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 12 }}>
                            <div>
                                <label htmlFor="custom-llm-temperature" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                    Temperature
                                </label>
                                <input
                                    id="custom-llm-temperature"
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={customLlmTemperature}
                                    onChange={(e) => setCustomLlmTemperature(Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="custom-llm-top-p" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                    Top P
                                </label>
                                <input
                                    id="custom-llm-top-p"
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={customLlmTopP}
                                    onChange={(e) => setCustomLlmTopP(Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="custom-llm-max-tokens" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                    Max tokens
                                </label>
                                <input
                                    id="custom-llm-max-tokens"
                                    type="number"
                                    min="1"
                                    max="8192"
                                    step="1"
                                    value={customLlmMaxTokens}
                                    onChange={(e) => setCustomLlmMaxTokens(Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label htmlFor="custom-llm-timeout-ms" style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
                                    Timeout (ms)
                                </label>
                                <input
                                    id="custom-llm-timeout-ms"
                                    type="number"
                                    min="1000"
                                    max="120000"
                                    step="1000"
                                    value={customLlmTimeoutMs}
                                    onChange={(e) => setCustomLlmTimeoutMs(Number(e.target.value))}
                                    style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <section>
                <h2>2. Custom Prompt Matrix (per Difficulty & Language)</h2>
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
                <h2>3. Language Preferences</h2>
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

            <section>
                <h2>4. Minimum Paragraph Length</h2>
                <p>Set the minimum character count for paragraphs to be processed. Smaller values will process more short paragraphs, larger values will only process longer paragraphs.</p>
                <div style={{ marginBottom: '16px' }}>
                    <label htmlFor="min-paragraph-length" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        Minimum Paragraph Length (characters):
                    </label>
                    <input
                        type="number"
                        id="min-paragraph-length"
                        min="1"
                        max="1000"
                        value={minParagraphLength}
                        onChange={handleMinParagraphLengthChange}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            fontSize: '14px',
                            width: '120px',
                            marginRight: '12px'
                        }}
                    />
                    <span style={{ fontSize: '14px', color: '#666' }}>
                        Current setting: {minParagraphLength} characters
                    </span>
                </div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
                    <p><strong>Recommended values:</strong></p>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                        <li>Chinese content: 10-20 characters</li>
                        <li>English content: 20-50 characters</li>
                        <li>Mixed content: 20-30 characters</li>
                    </ul>
                </div>
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