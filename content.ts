// content.ts
import './content.css';
const PROCESSING_DELAY = 1000; // 1 second delay between processing requests
const PARAGRAPH_CACHE = new Map<string, any>(); // Cache for processed paragraphs
const MIN_PARAGRAPH_LENGTH = 100; // Minimum characters to process
const MAX_PARAGRAPH_LENGTH = 5000; // Maximum characters to process
// NEW: Import storage API
// In Plasmo, you can often access chrome APIs directly.
// For better type safety, you might need @types/chrome

// Define keys for storage (should match popup.tsx)
const STORAGE_KEYS = {
    IS_ON: 'genShredPluginState',
    SENTENCE_COUNT: 'genShredSentenceCount',
    DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
    CUSTOM_PROMPT: 'genShredCustomPromptTemplate' // Assuming you'll add this later
};

// Define default values (should match popup.tsx)
const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.IS_ON]: true,
  [STORAGE_KEYS.SENTENCE_COUNT]: 5,
  [STORAGE_KEYS.DIFFICULTY_LEVEL]: 'Normal',
  [STORAGE_KEYS.CUSTOM_PROMPT]: "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}" // Default prompt
};


// Variables to hold current settings state in content script
let currentSettings = { ...DEFAULT_SETTINGS }; // Initialize with defaults


// NEW: Function to load settings from storage
async function loadSettings() {
    console.log("Content script loading settings...");
    const storedSettings = await chrome.storage.local.get(Object.values(STORAGE_KEYS)); // Get all defined keys

    // Update currentSettings with loaded values, falling back to defaults
    currentSettings = {
        [STORAGE_KEYS.IS_ON]: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
        [STORAGE_KEYS.SENTENCE_COUNT]: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
        [STORAGE_KEYS.DIFFICULTY_LEVEL]: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
        [STORAGE_KEYS.CUSTOM_PROMPT]: storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT],
    };
    console.log("Settings loaded:", currentSettings);

    // --- Initial Action based on loaded state ---
    // If plugin was enabled when the page loaded, process text immediately
    if (currentSettings[STORAGE_KEYS.IS_ON]) {
        // Restore first in case of previous run on this page
        restoreOriginalText(); // Clean up any previous modifications
        processParagraphs(); // Start processing
    }
}

// NEW: Listen for storage changes. This allows background/popup to change settings
// and the content script reacts without needing explicit messages or page reload.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        console.log('Storage change detected:', changes);
        let settingsChanged = false;
        // Update currentSettings based on what changed
        for (let key in changes) {
             if (STORAGE_KEYS.hasOwnProperty(key)) { // Only react to our known keys
                 currentSettings[key] = changes[key].newValue;
                 settingsChanged = true;
             }
        }

        // If relevant settings changed, re-apply logic
        // This is a simple approach; you might need more granular logic
        // depending on which specific setting changed.
        if (settingsChanged) {
          //   console.log("Relevant settings changed. Re-evaluating state.");
          //   // Restore original text before applying new settings
          //   restoreOriginalText(); // Clean up
          // // Check specifically if the IS_ON key changed
          if (changes[STORAGE_KEYS.IS_ON] !== undefined && changes[STORAGE_KEYS.IS_ON].newValue !== undefined) {
              const newIsOnState = changes[STORAGE_KEYS.IS_ON].newValue;
              currentSettings[STORAGE_KEYS.IS_ON] = newIsOnState; // Update the state variable

              console.log(`Plugin state changed via storage: ${newIsOnState}`);

              if (newIsOnState) {
                  // Plugin turned ON
                  restoreOriginalText(); // Clean up any old state/spans
                  processParagraphs(); // Start processing
              } else {
                  // Plugin turned OFF
                  restoreOriginalText(); // Simply restore original text
              }
              // No need to continue checking other settings changes for the ON/OFF toggle action
              // Other setting changes (count, difficulty) will be handled if plugin is ON
              return; // Exit the listener after handling ON/OFF
          }
          // If IS_ON didn't change, check if other relevant settings changed
          // (sentence count, difficulty, prompt)
          let otherSettingsChanged = false;
          for (let key in changes) {
              // Check if it's one of our keys BUT NOT the IS_ON key
              if (STORAGE_KEYS.hasOwnProperty(key) && key !== STORAGE_KEYS.IS_ON) {
                  if (changes[key].newValue !== undefined) { // Make sure it's a new value
                      currentSettings[key] = changes[key].newValue; // Update the state variable
                      otherSettingsChanged = true;
                      console.log(`Setting "${key}" changed via storage.`);
                  }
              }
          }

          // If other settings changed AND the plugin is currently ON, re-process
          if (otherSettingsChanged && currentSettings[STORAGE_KEYS.IS_ON]) {
              console.log("Other settings changed and plugin is ON. Re-processing.");
              restoreOriginalText(); // Clean up before applying new settings
              processParagraphs(); // Re-process with new settings
          }
        }
    }
});


// --- Function to process paragraphs and send to backend ---
async function processParagraphs() {
  if (!currentSettings[STORAGE_KEYS.IS_ON]) return;

  const paragraphs = Array.from(document.querySelectorAll("p"));
  let lastProcessingTime = 0;

  for (const p of paragraphs) {
    const textBlock = p.innerText.trim();
    
    // Skip if too short
    if (textBlock.length < MIN_PARAGRAPH_LENGTH) {
      console.log("Skipping short paragraph:", textBlock.substring(0, 30) + "...");
      continue;
    }

    // Check cache first
    const cacheKey = `${textBlock}_${currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]}_${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`;
    if (PARAGRAPH_CACHE.has(cacheKey)) {
      console.log("Using cached response for paragraph");
      const cachedResponse = PARAGRAPH_CACHE.get(cacheKey);
      applyRewritesToParagraph(p, cachedResponse.rewritten_sentences);
      continue;
    }

    // Throttle API requests
    const now = Date.now();
    if (now - lastProcessingTime < PROCESSING_DELAY) {
      await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY));
    }
    lastProcessingTime = now;

    console.log("Processing paragraph:", textBlock.substring(0, 50) + "...");

    // Send the entire paragraph block to the background script
    // Background script will forward to the backend
    chrome.runtime.sendMessage(
      {
        type: "PROCESS_TEXT_BLOCK", // Message type
        textBlock: textBlock,
        // Use current settings from state
        numSentences: currentSettings[STORAGE_KEYS.SENTENCE_COUNT],
        difficultyLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL],
        customPrompt: currentSettings[STORAGE_KEYS.CUSTOM_PROMPT] // Use prompt from state
      },
      (response) => {
        if (!response?.error && response?.rewritten_sentences) {
          // Cache successful response
          PARAGRAPH_CACHE.set(cacheKey, response);
          applyRewritesToParagraph(p, response.rewritten_sentences);
        }
        console.log("Received response from background (backend):", response);

        const rewrittenSentences = response?.rewritten_sentences;
        const error = response?.error;

        if (error) {
            console.error("Backend processing failed:", error);
             // NEW: Track processing error
             chrome.runtime.sendMessage({
                 type: "TRACK_EVENT",
                 eventType: "paragraph_processed_error",
                 eventData: {
                    paragraphLength: textBlock.length,
                    userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL],
                    error: error
                 }
            });
            // Optionally show error to user
            return;
        }

        if (rewrittenSentences && rewrittenSentences.length > 0) {
          console.log("Applying rewrites to paragraph.");
          // Call function to apply rewrites to this specific paragraph element
          applyRewritesToParagraph(p, rewrittenSentences);

           // Track successful processing event
           chrome.runtime.sendMessage({
              type: "TRACK_EVENT",
              eventType: "paragraph_processed_success",
              eventData: {
                 paragraphLength: textBlock.length,
                 numSentencesRewritten: rewrittenSentences.length,
                 userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]
              }
           });

        } else {
          console.log("No rewritten sentences returned for this paragraph.");
            // Track event even if no sentences were rewritten
            chrome.runtime.sendMessage({
              type: "TRACK_EVENT",
              eventType: "paragraph_processed_no_rewrite",
              eventData: {
                 paragraphLength: textBlock.length,
                 userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]
              }
           });
        }
      }
    );
  }
}

// NEW: Function to apply rewrites to a specific paragraph element
// This function needs to find the sentence within the specific paragraph element's DOM structure
// based on the original_index. This is still a simplification.
function applyRewritesToParagraph(paragraphElement: Element, rewrites: { original_index: number, rewritten_text: string }[]) {
    // Get the original text content of the paragraph to re-split
    const originalText = (paragraphElement as HTMLElement).innerText; // Use innerText for text content
    // Re-split the original text into sentences using the same logic (or regex) as the backend/analysis
    // NOTE: This regex split is simple and might not perfectly match backend's spaCy split.
    // For robustness, consider using a library in frontend or sending sentence boundaries from backend.
    const sentencesInParagraph = originalText.match(/[^.!?]+[.!?]+/g) || [];

    // --- More Robust DOM Manipulation Approach ---
    // Instead of replacing innerHTML string (which destroys event listeners and complex HTML),
    // traverse the DOM nodes within the paragraph.

    const walker = document.createTreeWalker(
        paragraphElement,
        NodeFilter.SHOW_TEXT, // Only look for text nodes
        null
    );

    const textNodes: Text[] = [];
    let cumulativeText = "";
    while(walker.nextNode()) {
        const node = walker.currentNode as Text;
        textNodes.push(node);
        cumulativeText += node.textContent;
    }

    // Re-split the *cumulative* text from text nodes to get sentences and their offsets
    const sentenceRegex = /[^.!?]+[.!?]+/g; // Use the same regex as before for consistency
    let match;
    const sentencesWithOffsets = [];
    while ((match = sentenceRegex.exec(cumulativeText)) !== null) {
        sentencesWithOffsets.push({
            text: match[0].trim(),
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    // Now, match the rewritten sentences to these detected sentences by original index
    // The original_index from the backend refers to the index in the sentencesInParagraph array (from simple regex)
    // Or ideally, it should map to the index in the sentencesWithOffsets array (from TreeWalker + regex)

    // Let's map backend index to sentencesWithOffsets index
    // This assumes the regex split in frontend matches the order and count of sentences
    // that the backend's spaCy split resulted in for the *selected* sentences.
    // This is still a potential point of failure if splits don't match perfectly.

    // A better way: backend should return the *start/end offsets* of the original sentences
    // within the text block, or a unique ID assigned by frontend.
    // For this prototype, let's assume original_index *roughly* corresponds to the index in sentencesWithOffsets.

    const rewritesMap = new Map(rewrites.map(rw => [rw.original_index, rw.rewritten_text]));

    // Sort rewrites by original index to apply them in order
    rewrites.sort((a, b) => a.original_index - b.original_index);

    // Apply rewrites by finding text nodes
    // This is tricky: need to replace text within text nodes.
    // A common technique is to find the span of text and replace it.

    let currentOffset = 0;
    const nodesToReplace: { node: Text, start: number, end: number, rewrittenText: string }[] = [];

    // Identify which text spans correspond to the sentences that need replacing
    sentencesWithOffsets.forEach((sentenceInfo, sentenceIndex) => {
         const rewrittenText = rewritesMap.get(sentenceIndex);
         if (rewrittenText !== undefined) {
             // Found a rewrite for this sentence index.
             // Now find the text node(s) containing this original sentence text.
             // This requires mapping offsets back to text nodes.

             let currentTextNodeOffset = 0;
             for (const textNode of textNodes) {
                 const nodeText = textNode.textContent || "";
                 const nodeLength = nodeText.length;

                 // Check if the current sentence falls within or spans this text node
                 if (sentenceInfo.start >= currentTextNodeOffset && sentenceInfo.start < currentTextNodeOffset + nodeLength) {
                     // Sentence starts in this node
                     const relativeStart = sentenceInfo.start - currentTextNodeOffset;
                     const relativeEnd = relativeStart + (sentenceInfo.end - sentenceInfo.start); // End relative to start of node + sentence length

                     // If the whole sentence is within this node
                     if (relativeEnd <= nodeLength) {
                         nodesToReplace.push({
                             node: textNode,
                             start: relativeStart,
                             end: relativeEnd,
                             rewrittenText: rewrittenText
                         });
                         break; // Found the node for this sentence
                     } else {
                         // Sentence spans multiple nodes - this becomes much more complex.
                         // For a simple prototype, we might skip multi-node sentences or use innerHTML replacement as a fallback.
                         console.warn(`Sentence spans multiple text nodes (index ${sentenceIndex}). Skipping DOM replace or using innerHTML fallback.`);
                         // Fallback to innerHTML replace (less robust)
                         replaceSentenceInDOMString(paragraphElement, sentenceInfo.text, rewrittenText); // Use the old simpler function
                         return; // Skip the TreeWalker logic for this sentence
                     }
                 }
                 currentTextNodeOffset += nodeLength;
             }
         }
    });

    // Apply the replacements to the identified text nodes
    // Iterate backwards to avoid index issues
    nodesToReplace.sort((a, b) => b.node.compareDocumentPosition(a.node) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1); // Sort by document order descending


nodesToReplace.forEach(({ node, start, end, rewrittenText }) => {
    const originalText = node.textContent || "";
    const before = originalText.substring(0, start);
    const after = originalText.substring(end);
    const originalSentencePart = originalText.substring(start, end);

    // Create the new span element
    const span = document.createElement("span");
    span.textContent = rewrittenText;
    span.classList.add('genshred-rewritten');
    
    // Create tooltip element
    const tooltip = document.createElement("span");
    tooltip.classList.add('genshred-original-tooltip');
    tooltip.textContent = `Original: ${originalSentencePart}`;
    span.appendChild(tooltip);

    // Create document fragment and replace node
    const newNodeContent = document.createDocumentFragment();
    newNodeContent.appendChild(document.createTextNode(before));
    newNodeContent.appendChild(span);
    newNodeContent.appendChild(document.createTextNode(after));

    node.parentNode?.replaceChild(newNodeContent, node);
});


    // --- Old Simple innerHTML Replacement Fallback ---
    // This simpler function replaces text in the HTML string, potentially breaking markup.
    // Keep as a fallback if the TreeWalker approach is too complex for some cases.
    function replaceSentenceInDOMString(paragraphElement: Element, original: string, adjusted: string) {
         // Escape original and adjusted text for use in HTML and RegEx
         const escapedOriginal = escapeRegExp(escapeHTML(original)); // Escape both RegEx chars and HTML entities
         const escapedAdjusted = escapeHTML(adjusted); // Escape rewritten text for safe HTML insertion

         const currentHtml = paragraphElement.innerHTML;

         // Create a regex to find the sentence, considering potential HTML within it
         // This is still very difficult to make robust with RegEx.
         // Example simple regex (might fail):
         const regex = new RegExp(`(${escapedOriginal.split(/\s+/).join('\\s+')})`, 'g'); // Match words with flexible whitespace

         // Check if the sentence (or its simplified form) exists before replacing
         if (currentHtml.includes(original.trim())) { // Check using plain text content
              // Replace the first occurrence in the HTML string
              const newHtml = currentHtml.replace(original.trim(), `<span data-original="${escapeHTML(original.trim())}">${escapedAdjusted}</span>`);

              // Only update if a replacement occurred to avoid breaking HTML unnecessarily
              if (newHtml !== currentHtml) {
                 paragraphElement.innerHTML = newHtml;
              } else {
                 console.warn("Failed simple string replace for sentence:", original.trim());
              }
         } else {
              console.warn("Original sentence not found in HTML string for replacement:", original.trim());
         }
    }


     // You might still need the old restoreOriginalText function to revert changes
     // restoreOriginalText logic can remain, it finds spans with data-original
}


// Helper function to escape string for use in RegExp
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Helper function to escape HTML for attribute values and text content
function escapeHTML(string: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(string));
    return div.innerHTML;
}


// Restore original text logic (remains the same)
function restoreOriginalText() {
  const modifiedSpans = document.querySelectorAll("span[data-original]");
  modifiedSpans.forEach((span) => {
    const original = span.getAttribute("data-original");
    if (original) {
      const textNode = document.createTextNode(original);
      // Replace the span with the text node
      span.parentNode?.replaceChild(textNode, span);
    }
  });
}


// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  // NEW: Handle syncing all settings from popup on load
  if (message.type === "SYNC_SETTINGS") {
      console.log("Content script received SYNC_SETTINGS message.");
      const settings = message.settings;
      // Update currentSettings based on the message
      // Note: This is less robust than listening to storage.onChanged,
      // but useful for ensuring popup state syncs immediately on opening.
      currentSettings = { ...currentSettings, ...settings };
       console.log("Synced settings:", currentSettings);

       // Re-apply logic based on new synced settings
       restoreOriginalText(); // Clean up before applying
       if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs(); // Start processing with synced settings
       }

       return false; // No async response needed
  }


  // OLD Message handlers - these are now less critical as storage.onChanged
  // is the primary trigger, but keep them for potential immediate reaction
  // when popup is open and user interacts.

  if (message.type === "TOGGLE_PLUGIN") {
    // State update will happen via storage.onChanged listener now
    // isEnabled = message.enabled; // Remove direct state update
    console.log("Content script received TOGGLE_PLUGIN message. State update via storage.");
    // Action will be triggered by storage.onChanged
    // if (isEnabled) { processParagraphs(); } else { restoreOriginalText(); }
    return false; // No async response needed
  }

  if (message.type === "SET_REWRITE_COUNT") {
    // State update will happen via storage.onChanged listener
    // sentenceCount = message.count; // Remove direct state update
    console.log("Content script received SET_REWRITE_COUNT message. State update via storage.");
     // Action will be triggered by storage.onChanged
    // if (isEnabled) { restoreOriginalText(); processParagraphs(); }
    return false; // No async response needed
  }

  if (message.type === "SET_DIFFICULTY") {
    // State update will happen via storage.onChanged listener
    // difficultyLevel = message.difficulty; // Remove direct state update
    console.log("Content script received SET_DIFFICULTY message. State update via storage.");
    // Action will be triggered by storage.onChanged
    // if (isEnabled) { restoreOriginalText(); processParagraphs(); }
    return false; // No async response needed
  }

   // NEW: Handle setting custom prompt from popup (if you add this feature)
   if (message.type === "SET_CUSTOM_PROMPT") {
       // State update will happen via storage.onChanged listener
       // customPromptTemplate = message.prompt; // Remove direct state update
       console.log("Content script received SET_CUSTOM_PROMPT message. State update via storage.");
        // Action will be triggered by storage.onChanged
        // if (isEnabled) { restoreOriginalText(); processParagraphs(); }
        return false; // No async response needed
   }


  // OLD: Remove or ignore the old ADJUST_TEXT message listener from background
  // This is no longer needed as processing starts from content script
  // if (message.type === "ADJUST_TEXT") { ... }


  // If no message type matches, return false
  return false;
});

// --- NEW: Load settings from storage when the content script is injected ---
// This makes the content script initialize based on saved state, not just popup messages.
loadSettings();