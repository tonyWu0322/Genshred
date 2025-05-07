import type { PlasmoCSConfig } from "plasmo"
import React, { useState, useEffect } from 'react';

// This is necessary for Plasmo to know where to inject the content script
// See https://docs.plasmo.com/cs#content-script-configuration
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"], // You might want to refine this later
  run_at: "document_idle" // Wait for the DOM to be ready
}

// Define the types of messages we expect to receive
interface PlasmoMessage {
  name: string;
  body: any;
}

// State to track if the plugin is active on this page
let isPluginActive = false;
// State to store the selected difficulty level
let currentDifficulty = 'Normal'; // Default difficulty

console.log("Genshred Content Script Loaded");

// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((request: PlasmoMessage, sender, sendResponse) => {
  console.log("Content script received message:", request);

  if (request.name === 'togglePlugin') {
    isPluginActive = request.body.enabled;
    console.log("Plugin state updated:", isPluginActive);
    if (isPluginActive) {
      // If activated, start the process
      processPageContent();
    } else {
      // If deactivated, revert changes (placeholder)
      revertPageChanges();
    }
    sendResponse({ status: "ok", received: request.name });
  } else if (request.name === 'updateDifficulty') {
    currentDifficulty = request.body.difficulty;
    console.log("Difficulty updated:", currentDifficulty);
    // If the plugin is active, re-process the page with the new difficulty
    if (isPluginActive) {
        processPageContent(); // Re-process or update existing graded text
    }
    sendResponse({ status: "ok", received: request.name });
  }
  // Add more message handlers for other settings if needed (e.g., sentences to rewrite)
});


// Function to find and process text content
function processPageContent() {
    if (!isPluginActive) {
        console.log("Plugin is not active. Skipping processing.");
        return;
    }

    console.log("Starting page content processing...");

    // --- Text Selection Logic (Inspired by enhance.js but simplified) ---
    // In enhance.js, they have sophisticated logic to find main content containers,
    // ignore specific tags (script, style, etc.), and handle different structures.
    // For this prototype, let's just target all paragraph elements (<p>).
    // You will need to make this more robust later to handle different websites.

    const textElements = document.querySelectorAll('p'); // Example: select all paragraphs

    if (textElements.length === 0) {
        console.log("No paragraph elements found on this page.");
        return;
    }

    console.log(`Found ${textElements.length} potential text elements.`);

    textElements.forEach((element, index) => {
        const originalText = element.innerText.trim();

        if (originalText.length > 0) {
            console.log(`Processing element ${index + 1}:`, originalText.substring(0, 100) + '...'); // Log first 100 chars

            // --- Send Text to Background Script for AI Processing ---
            // This is where you'd send the text to background.ts.
            // The background script will then call the LLM API.

            chrome.runtime.sendMessage({
                name: 'processTextForGrading',
                body: {
                    text: originalText,
                    difficulty: currentDifficulty // Send the current difficulty setting
                    // Include other relevant settings from the popup if needed (e.g., sentencesToRewrite)
                }
            }, (response) => {
                // --- Receive Graded Text Back (Placeholder) ---
                // The background script will send back the graded text in its response.
                console.log("Received response from background:", response);

                if (response && response.status === 'success' && response.gradedText) {
                    // --- Inject Graded Text (Placeholder) ---
                    // This is where you would inject the graded text back into the page.
                    // How you do this depends on your desired display method:
                    // 1. Replace the original text: element.innerText = response.gradedText;
                    // 2. Display side-by-side: Create new elements and insert them near the original.
                    // 3. Create a toggleable view: Like enhance.js's copy approach, hide/show original/graded.
                    // 4. Use tooltips or overlays.

                    console.log("Attempting to inject graded text...");

                    // Example: Simple replacement (You'll need a more sophisticated method)
                    // element.innerText = response.gradedText; // BE CAREFUL: This removes all original HTML formatting!

                    // A better approach might be to create a new element and insert it,
                    // or use a library that helps with text replacement while preserving structure.
                    // For this prototype, let's just log that we *would* inject it.
                     const originalHtml = element.innerHTML; // Preserve original HTML

                    // Create a new element to hold the graded text
                    const gradedElement = document.createElement('div');
                    gradedElement.classList.add('genshred-graded-text'); // Add a class for styling
                    gradedElement.style.color = 'green'; // Example style to make it visible
                    gradedElement.innerHTML = response.gradedText; // Set the graded text

                    // Insert the graded element after the original element
                    element.parentNode?.insertBefore(gradedElement, element.nextSibling);

                    // Optional: Hide the original element or style it differently
                    // element.style.display = 'none'; // Hide original
                    // element.style.textDecoration = 'line-through'; // Or strike through original


                } else {
                    console.error("Failed to get graded text from background:", response);
                }
            });
        }
    });
}

// Function to revert changes when the plugin is deactivated (Placeholder)
function revertPageChanges() {
    console.log("Reverting page changes...");
    // Find all elements you added (e.g., with a specific class) and remove them.
    const gradedElements = document.querySelectorAll('.genshred-graded-text');
    gradedElements.forEach(el => el.remove());

    // If you hid original elements, make them visible again.
    // You'd need a way to track which elements were hidden (e.g., using a data attribute).
    // const hiddenOriginals = document.querySelectorAll('[data-genshred-original-hidden="true"]');
    // hiddenOriginals.forEach(el => {
    //     // Restore original display style
    //     const originalDisplay = el.getAttribute('data-genshred-original-display');
    //     if(originalDisplay) {
    //         (el as HTMLElement).style.display = originalDisplay;
    //     } else {
    //         (el as HTMLElement).style.removeProperty('display');
    //     }
    //     el.removeAttribute('data-genshred-original-hidden');
    // });

    console.log("Page changes reverted.");
}


// You might want to automatically process the page when the content script loads,
// based on the last known state of the plugin (which you'd retrieve from storage).
// For this prototype, we'll rely on the 'togglePlugin' message to start processing.

// Example of how you *could* get initial settings from storage on load:
// chrome.storage.sync.get(['isPluginActive', 'currentDifficulty'], (result) => {
//     isPluginActive = result.isPluginActive ?? false; // Use stored value or default
//     currentDifficulty = result.currentDifficulty ?? 'Normal'; // Use stored value or default
//     console.log("Content script loaded with initial settings:", { isPluginActive, currentDifficulty });
//     if (isPluginActive) {
//         processPageContent();
//     }
// });

// If you need to inject a React component into the page using the content script:
// This is a more advanced topic and requires a different setup in Plasmo (using mount-ui).
// The current structure is for a standard content script that manipulates the DOM directly.

/*
// Example of a simple React component you *could* inject (requires Plasmo UI setup)
const GradedTextComponent = ({ text }: { text: string }) => {
    return (
        <span style={{ color: 'blue', fontWeight: 'bold' }}>
            {text}
        </span>
    );
};

// Example of how you might inject a React component (requires Plasmo UI setup)
function injectReactComponent(element: Element, gradedText: string) {
    const container = document.createElement('div');
    element.parentNode?.insertBefore(container, element.nextSibling);
    ReactDOM.render(<GradedTextComponent text={gradedText} />, container);
}
*/

// You could also use a MutationObserver to detect changes to the DOM
// and process newly added content, similar to some advanced content scripts.
// This is more complex and not included in this basic prototype.