// This script will now act as a proxy to forward messages to the backend server
import { SERVER_URL } from "./config";

// Function to generate or retrieve a unique user ID
async function getUserId(): Promise<string> {
  // Use chrome.storage.local to store the user ID persistently
  const storageKey = 'genShredUserId';
  const storedId = await chrome.storage.local.get(storageKey);

  if (storedId[storageKey]) {
    return storedId[storageKey];
  } else {
    // Generate a simple UUID (you might need a library for a proper UUID)
    // For Plasmo, you might use a package like 'uuid'
    // As a simple placeholder:
    
    const newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await chrome.storage.local.set({ [storageKey]: newId });
    return newId;
  }
}

// Function to get the prompt for a specific difficulty level
async function getPromptForDifficulty(difficultyLevel: string): Promise<string> {
  const mappingStorageKey = 'genShredDifficultyMapping';
  const storedMapping = await chrome.storage.local.get(mappingStorageKey);
  
  if (storedMapping[mappingStorageKey] && storedMapping[mappingStorageKey][difficultyLevel]) {
    return storedMapping[mappingStorageKey][difficultyLevel];
  } else {
    // Default mappings if not found in storage
    const defaultMapping: Record<string, string> = {
      "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
      "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
      "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
      "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
    };
    return defaultMapping[difficultyLevel] || defaultMapping["Normal"];
  }
}

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    console.log("[bg] Received message:", message.type);
    
    if (message.type === "PROCESS_TEXT_BLOCK") {
      console.log("[bg info] PROCESS_TEXT_BLOCK message received")
      const { textBlock, numSentences, userLevel, promptInstruction, customPromptTemplate } = message;
      
      // Handle async operation properly
      (async () => {
        try {
          const userId = await getUserId();
          const difficultyPrompt = await getPromptForDifficulty(userLevel);

          const backendUrl = `${SERVER_URL}/process_text`;
          const response = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId,
              text: textBlock,
              numSentences: numSentences,
              userLevel: userLevel,
              promptInstruction: difficultyPrompt,
              customPromptTemplate: customPromptTemplate
            })
          });

          if (!response.ok) {
              const errorText = await response.text();
              sendResponse({ error: `[Process Text] Backend error: ${response.status} - ${errorText}` });
              return;
          }

          const data = await response.json();
          sendResponse(data);
        } catch (err) {
          console.error("[bg] Error in PROCESS_TEXT_BLOCK:", err);
          sendResponse({ error: `[Process Text] Frontend fetch error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "SPLIT_SENTENCES") {
      const { text } = message;
      console.log("[bg] Processing SPLIT_SENTENCES for text length:", text.length);

      // Handle async operation properly
      (async () => {
        try {
          const backendUrl = `${SERVER_URL}/split_sentences`;
          const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(10000)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[bg] Backend error for SPLIT_SENTENCES:", response.status, errorText);
            sendResponse({ error: `[Sentence Splitting] Backend error: ${response.status} - ${errorText}` });
            return;
          }

          const data = await response.json();
          console.log("[bg] SPLIT_SENTENCES success, sentences count:", data.sentences?.length || 0);
          sendResponse(data);
        } catch (err) {
          console.error("[bg] Error in SPLIT_SENTENCES:", err);
          sendResponse({ error: `[Sentence Splitting] Frontend fetch error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "TRACK_EVENT") {
      const { eventType, eventData } = message;
      
      // Handle async operation properly
      (async () => {
        try {
          const userId = await getUserId();
          const backendUrl = `${SERVER_URL}/track_event`;
          await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: userId,
              eventType: eventType,
              eventData: eventData
            })
          });
          sendResponse({ success: true }); // Always send a response
        } catch (err) {
          console.error("[bg] Error calling backend /track_event:", err);
          sendResponse({ error: `[Track Event] Error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "AI_CHAT_MESSAGE") {
      const { chatMessage } = message;
      
      // Handle async operation properly
      (async () => {
        try {
          const userId = await getUserId();
          const backendUrl = `${SERVER_URL}/chat`;
          const response = await fetch(backendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: chatMessage, userId })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            sendResponse({ error: `[AI Chat] Backend error: ${response.status} - ${errorText}` });
            return;
          }
          
          const data = await response.json();
          sendResponse(data);
        } catch (err) {
          console.error("[bg] Error in AI_CHAT_MESSAGE:", err);
          sendResponse({ error: `[AI Chat] Frontend fetch error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "ADJUST_TEXT") {
      console.warn("ADJUST_TEXT message type is deprecated. Use PROCESS_TEXT_BLOCK instead.");
      sendResponse({ error: "ADJUST_TEXT message type deprecated." });
      return false; // No async operation needed
    }

    // If no message type matches, return false
    console.warn("[bg] Unknown message type:", message.type);
    sendResponse({ error: `Unknown message type: ${message.type}` });
    return false;
  }
);