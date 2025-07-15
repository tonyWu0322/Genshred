import React from 'react';

const ACTION_PROMPTS = [
  { label: 'Explain', prompt: 'As a language expert, explain the following item clearly for a language learner: ' },
  { label: 'Give a simple definition', prompt: 'Give a simple, beginner-friendly definition for: ' },
  { label: 'Use in a sentence', prompt: 'Use the following word or phrase in a natural example sentence: ' },
  { label: 'Grammar breakdown', prompt: 'Break down the grammar of the following sentence and explain each part: ' },
  { label: 'Synonyms and antonyms', prompt: 'List synonyms and antonyms for the following word, with simple explanations: ' },
  { label: 'Pronunciation guide', prompt: 'Provide a pronunciation guide (IPA and tips) for: ' },
  { label: 'Cultural context', prompt: 'Explain any cultural or idiomatic context for the following: ' },
  { label: 'Translate to [target language]', prompt: 'Translate the following to [target language] and explain any nuances: ' },
  { label: 'Common mistakes', prompt: 'What are common mistakes learners make with the following word/phrase, and how to avoid them?' },
  { label: 'Formal vs informal', prompt: 'Explain the difference between formal and informal usage for: ' },
  { label: 'Word origin', prompt: 'What is the etymology or origin of the following word?' },
];

interface Props {
  onSelect: (prompt: string) => void;
}

const AIChatQuickActions: React.FC<Props> = ({ onSelect }) => {
  return (
    <select
      className="ai-chat-quick-action-select"
      defaultValue=""
      onChange={e => {
        const value = e.target.value;
        if (value) onSelect(value);
      }}
      title="Quickly select a prompt template"
    >
      <option value="" disabled>
        Quick Action…
      </option>
      {ACTION_PROMPTS.map((ap, i) => (
        <option key={i} value={ap.prompt}>{ap.label}</option>
      ))}
    </select>
  );
};

export default AIChatQuickActions; 