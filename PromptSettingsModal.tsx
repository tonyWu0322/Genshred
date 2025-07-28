import React, { useState, useEffect } from 'react';
import './PromptSettingsModal.css';

interface PromptSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PromptSettingsModal: React.FC<PromptSettingsModalProps> = ({ isOpen, onClose }) => {
  const [difficultyMapping, setDifficultyMapping] = useState({
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
  });
  // NEW: State for custom prompts, allowing multiple and editable names
  const [customPrompts, setCustomPrompts] = useState<Array<{ id: string; name: string; prompt: string }>>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [newCustomPromptName, setNewCustomPromptName] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const storedSettings = await chrome.storage.local.get(['genShredDifficultyMapping', 'genShredCustomPrompts']);
      if (storedSettings['genShredDifficultyMapping']) {
        // Only update non-custom mappings if they are different from current defaults
        setDifficultyMapping(prev => ({ ...prev, ...storedSettings['genShredDifficultyMapping'] }));
      }
      if (storedSettings['genShredCustomPrompts']) {
        setCustomPrompts(storedSettings['genShredCustomPrompts']);
      }
    };
    
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleMappingChange = (level: string, value: string) => {
    // Handles changes for fixed difficulty prompts
    setDifficultyMapping(prev => ({ ...prev, [level]: value }));
  };

  const handleCustomPromptChange = (id: string, field: 'name' | 'prompt', value: string) => {
    // Handles changes for custom prompts (name or prompt text)
    setCustomPrompts(prev =>
      prev.map(cp => (cp.id === id ? { ...cp, [field]: value } : cp))
    );
  };

  const handleAddCustomPrompt = () => {
    if (newCustomPromptName.trim() === '') {
      setStatusMessage('Prompt name cannot be empty.');
      setTimeout(() => setStatusMessage(''), 2000);
      return;
    }
    if (customPrompts.some(cp => cp.name === newCustomPromptName.trim())) {
        setStatusMessage('Prompt with this name already exists.');
        setTimeout(() => setStatusMessage(''), 2000);
        return;
    }

    const newId = `Custom_${Date.now()}`;
    setCustomPrompts(prev => [
      ...prev,
      { id: newId, name: newCustomPromptName.trim(), prompt: "Rewrite for a user with specific needs. Use the following format: {sentences_to_rewrite}" }
    ]);
    setNewCustomPromptName(''); // Clear input field
    setStatusMessage('Custom prompt added!');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleDeleteCustomPrompt = (id: string) => {
    setCustomPrompts(prev => prev.filter(cp => cp.id !== id));
    setStatusMessage('Custom prompt deleted.');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleSave = async () => {
    await chrome.storage.local.set({
      'genShredDifficultyMapping': difficultyMapping, // Save fixed mappings
      'genShredCustomPrompts': customPrompts // Save custom prompts
    });
    setStatusMessage('Settings saved!');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleReset = async () => {
    const defaultMapping = {
      "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
      "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
      "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
    };
    setDifficultyMapping(defaultMapping);
    setCustomPrompts([]); // Clear custom prompts on reset

    await chrome.storage.local.set({
      'genShredDifficultyMapping': defaultMapping,
      'genShredCustomPrompts': []
    });
    setStatusMessage('Reset to defaults!');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Prompt Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <p className="modal-description">
            Define what each difficulty level means for the AI when rewriting sentences.
            Use `{`sentences_to_rewrite`}` as a placeholder for the sentences to be processed.
          </p>
          
          <div className="difficulty-settings">
            {['Easy', 'Normal', 'Hard'].map((level) => (
              <div key={level} className="difficulty-setting">
                <label htmlFor={`prompt-${level}`}>{level}:</label>
                <textarea
                  id={`prompt-${level}`}
                  value={difficultyMapping[level as keyof typeof difficultyMapping]}
                  onChange={(e) => handleMappingChange(level, e.target.value)}
                  rows={3}
                />
              </div>
            ))}

            <h3>Custom Prompts:</h3>
            <div className="custom-prompt-add">
                <input
                    type="text"
                    placeholder="New custom prompt name"
                    value={newCustomPromptName}
                    onChange={(e) => setNewCustomPromptName(e.target.value)}
                />
                <button onClick={handleAddCustomPrompt}>Add Prompt</button>
            </div>

            {customPrompts.map((cp) => (
              <div key={cp.id} className="difficulty-setting custom-prompt-item">
                <div className="custom-prompt-header">
                    <input
                        type="text"
                        value={cp.name}
                        onChange={(e) => handleCustomPromptChange(cp.id, 'name', e.target.value)}
                        className="custom-prompt-name-input"
                    />
                    <button onClick={() => handleDeleteCustomPrompt(cp.id)} className="delete-button">×</button>
                </div>
                <textarea
                  value={cp.prompt}
                  onChange={(e) => handleCustomPromptChange(cp.id, 'prompt', e.target.value)}
                  rows={3}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => {
                if (chrome.runtime.openOptionsPage) {
                  chrome.runtime.openOptionsPage();
                } else {
                  window.open(chrome.runtime.getURL('options.html'));
                }
              }}
              style={{ fontSize: '0.95em', color: '#1976d2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Go to Advanced Settings
            </button>
          </div>
          <div className="modal-actions">
            <button className="reset-button" onClick={handleReset}>Reset</button>
            <button className="save-button" onClick={handleSave}>Save</button>
          </div>
          
          {statusMessage && (
            <div className="status-message">
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptSettingsModal; 