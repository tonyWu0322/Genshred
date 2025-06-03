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
    "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
  });
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const storedSettings = await chrome.storage.local.get(['genShredDifficultyMapping']);
      if (storedSettings['genShredDifficultyMapping']) {
        setDifficultyMapping(storedSettings['genShredDifficultyMapping']);
      }
    };
    
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleMappingChange = (level: string, value: string) => {
    setDifficultyMapping(prev => ({ ...prev, [level]: value }));
  };

  const handleSave = async () => {
    await chrome.storage.local.set({
      'genShredDifficultyMapping': difficultyMapping
    });
    setStatusMessage('Settings saved!');
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleReset = async () => {
    const defaultMapping = {
      "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
      "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
      "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
      "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
    };
    
    setDifficultyMapping(defaultMapping);
    await chrome.storage.local.set({
      'genShredDifficultyMapping': defaultMapping
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
          </p>
          
          <div className="difficulty-settings">
            {['Easy', 'Normal', 'Hard', 'Custom_1'].map((level) => (
              <div key={level} className="difficulty-setting">
                <label htmlFor={`prompt-${level}`}>{level}:</label>
                <textarea
                  id={`prompt-${level}`}
                  value={difficultyMapping[level]}
                  onChange={(e) => handleMappingChange(level, e.target.value)}
                  rows={3}
                />
              </div>
            ))}
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