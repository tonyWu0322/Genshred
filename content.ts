// content.ts

let isEnabled = true;
// These configs will now be sent to the backend
let sentenceCount = 5; // Number of difficult sentences to select per paragraph
let difficultyLevel = "simplify"; // Maps to userLevel on backend, e.g., "beginner", "intermediate"
// NEW: Customizable prompt template (frontend manages this)
let customPromptTemplate = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";


// Function to process paragraphs and send to backend
async function processParagraphs() {
  if (!isEnabled) return;

  const paragraphs = Array.from(document.querySelectorAll("p"));

  for (const p of paragraphs) {
    const textBlock = p.innerText.trim();

    if (textBlock.length < 50) { // Simple threshold for "paragraph" length
        // You might refine this threshold logic
        console.log("Skipping short paragraph:", textBlock.substring(0, 30) + "...");
        continue; // Skip very short blocks
    }

    console.log("Processing paragraph:", textBlock.substring(0, 50) + "...");

    // NEW: Send the entire paragraph block to the background script
    // Background script will forward to the backend
    let msg = {
        type: "PROCESS_TEXT_BLOCK", // New message type
        textBlock: textBlock,
        numSentences: sentenceCount,
        difficultyLevel: difficultyLevel, // Sent as userLevel to backend
        customPrompt: customPromptTemplate // Send custom prompt template
      }
    console.log("Sending message to background:", msg);
    chrome.runtime.sendMessage(
      {
        type: "PROCESS_TEXT_BLOCK", // New message type
        textBlock: textBlock,
        numSentences: sentenceCount,
        difficultyLevel: difficultyLevel, // Sent as userLevel to backend
        customPrompt: customPromptTemplate // Send custom prompt template
      },
      (response) => {
        console.log("Received response from background (backend):", response);

        // Expected response format: { "rewritten_sentences": [{ original_index: ..., rewritten_text: ... }, ...] }
        const rewrittenSentences = response?.rewritten_sentences;
        const error = response?.error;

        if (error) {
            console.error("Backend processing failed:", error);
            // Optionally show error to user
            return;
        }


        if (rewrittenSentences && rewrittenSentences.length > 0) {
          console.log("Applying rewrites to paragraph.");
          // Call a new function to apply rewrites to this specific paragraph element
          applyRewritesToParagraph(p, rewrittenSentences);

           // NEW: Track successful processing event
           chrome.runtime.sendMessage({
              type: "TRACK_EVENT",
              eventType: "paragraph_processed_success",
              eventData: {
                 paragraphLength: textBlock.length,
                 numSentencesRewritten: rewrittenSentences.length,
                 userLevel: difficultyLevel
              }
           });

        } else {
          console.log("No rewritten sentences returned for this paragraph.");
            // NEW: Track event even if no sentences were rewritten
            chrome.runtime.sendMessage({
              type: "TRACK_EVENT",
              eventType: "paragraph_processed_no_rewrite",
              eventData: {
                 paragraphLength: textBlock.length,
                 userLevel: difficultyLevel
              }
           });
        }
      }
    );
  }
}

// NEW: Function to apply rewrites to a specific paragraph element
function applyRewritesToParagraph(paragraphElement: Element, rewrites: { original_index: number, rewritten_text: string }[]) {
    const originalText = paragraphElement.innerText;
    // Need to re-split the paragraph text into sentences to match the backend's original_index
    // Use the same or similar splitting logic as the backend (ideally spaCy, but regex for simplicity here)
    const sentencesInParagraph = originalText.match(/[^.!?]+[.!?]+/g) || [];

    let currentHtml = paragraphElement.innerHTML; // Get current HTML to preserve some formatting

    rewrites.forEach(rewrite => {
        const originalIndex = rewrite.original_index;
        const rewrittenText = rewrite.rewritten_text;

        if (originalIndex >= 0 && originalIndex < sentencesInParagraph.length) {
            const originalSentence = sentencesInParagraph[originalIndex].trim();

            // Find and replace the original sentence in the HTML string
            // This is a VERY simple find/replace and might break HTML structure.
            // A more robust approach would involve DOM traversal and manipulation.
            // For prototype: replace the first occurrence of the exact sentence string
            // Note: This assumes the HTML structure doesn't break the sentence text node.
            const regex = new RegExp(escapeRegExp(originalSentence), 'g'); // Use global flag to replace all occurrences if needed, but usually just the first

            // Check if the sentence exists in the current HTML before replacing
             if (currentHtml.includes(originalSentence)) {
                 // Replace only the first occurrence for safety in simple cases
                 currentHtml = currentHtml.replace(originalSentence, `<span data-original="${escapeHTML(originalSentence)}">${escapeHTML(rewrittenText)}</span>`);
             } else {
                 console.warn(`Original sentence not found in HTML for replacement (index ${originalIndex}):`, originalSentence);
             }

        } else {
            console.warn(`Invalid original_index ${originalIndex} for paragraph. Skipping rewrite.`);
        }
    });

    // Replace the entire paragraph's innerHTML with the modified HTML
    paragraphElement.innerHTML = currentHtml;

    // NEW: Add mouseover/mouseout listeners to the paragraph for potential feedback/restore features later
    // Add event listeners to the paragraph element itself or the new spans if needed
     // paragraphElement.addEventListener('mouseover', handleParagraphHover);
     // paragraphElement.addEventListener('mouseout', handleParagraphOut);
}

// Helper function to escape string for use in RegExp
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Helper function to escape HTML for attribute values and text content
function escapeHTML(string) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(string));
    return div.innerHTML;
}


// Restore original text logic (can remain the same)
function restoreOriginalText() {
  const modifiedSpans = document.querySelectorAll("span[data-original]");
  modifiedSpans.forEach((span) => {
    const original = span.getAttribute("data-original");
    if (original) {
      // Create a text node from the original text
      const textNode = document.createTextNode(original);
      // Replace the span with the text node
      span.parentNode?.replaceChild(textNode, span);
    }
  });
}


// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "TOGGLE_PLUGIN") {
    isEnabled = message.enabled;
    console.log("插件启用状态：", isEnabled);
    if (isEnabled) {
      // When enabling, process text
      processParagraphs(); // Call the new function
    } else {
      // When disabling, restore original text
      restoreOriginalText();
    }
  }

  if (message.type === "SET_REWRITE_COUNT") {
    sentenceCount = message.count;
    console.log("句子数量：", sentenceCount);
    // If plugin is enabled, re-process with new setting
    if (isEnabled) {
       // Restore first to avoid double-processing on same elements
       restoreOriginalText();
       processParagraphs(); // Call the new function
    }
  }

  if (message.type === "SET_DIFFICULTY") {
    difficultyLevel = message.difficulty;
    console.log("难度：", difficultyLevel);
     // If plugin is enabled, re-process with new setting
    if (isEnabled) {
       // Restore first
       restoreOriginalText();
       processParagraphs(); // Call the new function
    }
  }

   // NEW: Handle setting custom prompt from popup (if you add this feature)
  if (message.type === "SET_CUSTOM_PROMPT") {
      customPromptTemplate = message.prompt;
      console.log("自定义提示词模板：", customPromptTemplate);
       // If plugin is enabled, re-process with new setting
       if (isEnabled) {
           restoreOriginalText();
           processParagraphs();
       }
  }

  // OLD: Remove or ignore the old ADJUST_TEXT message listener from background
  // This is no longer needed as processing starts from content script
  // if (message.type === "ADJUST_TEXT") {
  //   // This listener is obsolete, logic moved to PROCESS_TEXT_BLOCK response handler
  //   console.warn("Received obsolete ADJUST_TEXT message in content script.");
  // }

});

// Initial processing when the script is injected (if enabled by default)
// You might want to trigger this based on plugin state stored in storage
// For testing, you could add a button in your popup to trigger processParagraphs manually.
// Or run it directly if plugin should be active on page load:
// processParagraphs(); // Uncomment if you want it to run immediately on page load