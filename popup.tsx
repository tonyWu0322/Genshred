import React, { useState } from 'react';
import './popup.css'; // We'll create a basic CSS file for styling

function Popup() {
  // State for the On/Off toggle
  const [isOn, setIsOn] = useState(true);

  // State for the "No. of Sentences Rewritten" slider
  const [sentencesToRewrite, setSentencesToRewrite] = useState(5); // Default value

  // State for the selected difficulty
  const [difficulty, setDifficulty] = useState('Normal');

  // Placeholder functions for navigation (linking to settings)
  const goToSettings = () => {
    // In a real Plasmo extension, you'd open the options page like this:
    chrome.runtime.openOptionsPage();
    // For this prototype, we'll just log a message
    console.log('Navigate to settings page');
  };

  // Handler for the toggle switch
  const handleToggle = () => {
    setIsOn(!isOn);
    console.log('Plugin is now:', !isOn ? 'On' : 'Off');
    // Here you would send a message to the content script or background script
    // to actually enable/disable the plugin's functionality on the active tab.
    // Example (requires setting up message passing):
    // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //   if (tabs[0]?.id) {
    //     chrome.tabs.sendMessage(tabs[0].id, { action: 'togglePlugin', enabled: !isOn });
    //   }
    // });
  };

  // Handler for the slider
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSentencesToRewrite(Number(event.target.value));
    console.log('Sentences to rewrite:', event.target.value);
    // You would likely use this value to inform the content script/AI
    // about the desired level of rewriting, possibly in conjunction with difficulty.
  };

  // Handler for the difficulty dropdown
  const handleDifficultyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setDifficulty(event.target.value);
    console.log('Selected difficulty:', event.target.value);
    // This value would be crucial for the AI prompt engineering to get
    // text rewritten to the appropriate level.
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-icon" onClick={goToSettings}>
          {/* Placeholder for menu icon */}
          ☰
        </div>
        <div className="header-title">Genshred</div>
        <div className="header-icon" onClick={goToSettings}>
          {/* Placeholder for user icon */}
          👤
        </div>
      </header>

      <section className="popup-body">
        <div className="control-group">
          <label htmlFor="on-off-toggle">On/ Off</label>
          {/* Basic toggle switch - can be styled further with CSS */}
          <input
            type="checkbox"
            id="on-off-toggle"
            checked={isOn}
            onChange={handleToggle}
            // A more visually appealing toggle would typically use CSS and labels
          />
        </div>

        {/* Slider for "No. of Sentences Rewritten" */}
        <div className="control-group">
          <label htmlFor="sentences-slider">No. of Sentences Rewritten</label>
          <input
            type="range"
            id="sentences-slider"
            min="1" // Example min value
            max="10" // Example max value - adjust as needed
            value={sentencesToRewrite}
            onChange={handleSliderChange}
          />
          {/* Optional: Display the current slider value */}
          <span>{sentencesToRewrite}</span>
        </div>

        {/* Difficulty Selection */}
        <div className="control-group">
          <label htmlFor="difficulty-select">Choose Difficulty</label>
          {/* Using a standard select dropdown for simplicity in prototype */}
          <select id="difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
            <option value="Easy">Easy</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
            <option value="Custom_1">Custom_1</option>
            {/* "Add Custom..." would likely be a button or link that opens settings */}
            {/* For now, it's just an option indicating where to go for custom settings */}
             <option value="Add Custom...">Add Custom...</option> {/* This option wouldn't typically be selectable */}
          </select>
          {/* The search and clear icons from Figma would require more complex component implementation */}
        </div>

        {/* You can add more control groups for future features here */}

      </section>
    </div>
  );
}

export default Popup;