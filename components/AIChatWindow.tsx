import React, { useState, useRef, useEffect } from 'react';
import './AIChatWindow.css';
import AIChatQuickActions from './AIChatQuickActions';

interface ChatMessage {
  sender: 'user' | 'ai' | 'system';
  text: string;
}

const AIChatWindow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);

  // Simple markdown processor for basic formatting
  const processMarkdown = (text: string): string => {
    return text
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic text
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks
      .replace(/\n/g, '<br>');
  };

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Robust outside click for shadow DOM: use composedPath
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const path = (e.composedPath && e.composedPath()) || [];
      if (windowRef.current && !path.includes(windowRef.current)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setMessages([...messages, { sender: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'AI_CHAT_MESSAGE', chatMessage: trimmed }, (response) => {
      setLoading(false);
      if (response?.reply) {
        setMessages(msgs => [...msgs, { sender: 'ai', text: response.reply }]);
      } else if (response?.error) {
        setMessages(msgs => [...msgs, { sender: 'system', text: `Error: ${response.error}` }]);
      } else {
        setMessages(msgs => [...msgs, { sender: 'system', text: 'Unknown error.' }]);
      }
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  // Quick action handler
  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
  };

  if (!open) {
    return (
      <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 9999, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="ai-chat-fab" onClick={() => setOpen(true)} title="Open AI Chat">
          💬
        </button>
      </div>
    );
  }

  return (
    <div className="ai-chat-window" ref={windowRef}>
      <div className="ai-chat-header">
        <span>AI Chat</span>
        <button className="ai-chat-close" onClick={() => setOpen(false)} title="Close">×</button>
      </div>
      <div className="ai-chat-quick-action-row">
        <AIChatQuickActions onSelect={handleQuickAction} />
      </div>
      <div className="ai-chat-history">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ai-chat-msg-${msg.sender}`}>
            {msg.sender === 'ai' ? (
              <div 
                dangerouslySetInnerHTML={{ 
                  __html: processMarkdown(msg.text)
                }} 
              />
            ) : (
              msg.text
            )}
          </div>
        ))}
        {loading && (
          <div className="ai-chat-msg ai-chat-msg-ai ai-chat-loading">Thinking…</div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="ai-chat-input-row">
        <input
          className="ai-chat-input"
          type="text"
          placeholder="Ask about vocabulary, grammar..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={loading}
        />
        <button className="ai-chat-send" onClick={handleSend} disabled={!input.trim() || loading}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default AIChatWindow; 