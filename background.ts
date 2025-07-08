// This script will now act as a proxy to forward messages to the backend server
import { SERVER_URL } from "./config";

// Function to generate or retrieve a unique user ID
async function getUserId(): Promise<string> {
  // Use chrome.storage.local to store the user ID persistently
  console.log("Retrieving user ID from storage...");
  const storageKey = 'genShredUserId';
  const storedId = await chrome.storage.local.get(storageKey);

  if (storedId[storageKey]) {
    console.log("User ID found in storage:", storedId[storageKey]);
    return storedId[storageKey];
  } else {
    // Generate a simple UUID (you might need a library for a proper UUID)
    // For Plasmo, you might use a package like 'uuid'
    // As a simple placeholder:
    
    const newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log("No user ID found, generating a new one:", newId);
    await chrome.storage.local.set({ [storageKey]: newId });

    console.log("Generated new user ID:", newId);
    return newId;
  }
}

// Function to get the prompt for a specific difficulty level
async function getPromptForDifficulty(difficultyLevel: string): Promise<string> {
  const mappingStorageKey = 'genShredDifficultyMapping';
  const storedMapping = await chrome.storage.local.get(mappingStorageKey);
  
  if (storedMapping[mappingStorageKey] && storedMapping[mappingStorageKey][difficultyLevel]) {
    console.log(`Using stored prompt for ${difficultyLevel}:`, storedMapping[mappingStorageKey][difficultyLevel]);
    return storedMapping[mappingStorageKey][difficultyLevel];
  } else {
    // Default mappings if not found in storage
    console.log(`No stored prompt found for ${difficultyLevel}, using default mapping.`);
    const defaultMapping: Record<string, string> = {
      "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
      "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
      "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
      "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
    };
    
    console.log(`No stored prompt found for ${difficultyLevel}, using default:`, defaultMapping[difficultyLevel]);
    return defaultMapping[difficultyLevel] || defaultMapping["Normal"];
  }
}

chrome.runtime.onMessage.addListener(
  async (message, sender, sendResponse) => {
    // NEW: Handle message to process text block by sending to backend
    if (message.type === "PROCESS_TEXT_BLOCK") {
      // NEW: Destructure promptInstruction and customPromptTemplate
      const { textBlock, numSentences, userLevel, promptInstruction, customPromptTemplate } = message;
      console.log("Received text block for processing:", { textBlock: textBlock.substring(0, 100) + "...", numSentences, userLevel, promptInstruction, customPromptTemplate });
      const userId = await getUserId();
      
      // Get the prompt for the selected difficulty level
      const difficultyPrompt = await getPromptForDifficulty(userLevel);

      try {
        const backendUrl = `${SERVER_URL}/process_text`; // 使用配置文件中的URL
        console.log("Sending text block to backend:", { userId, numSentences, userLevel, promptInstruction: difficultyPrompt, customPromptTemplate, textBlock: textBlock.substring(0, 100) + "..." });

        const response = await fetch(backendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: userId,
            text: textBlock,
            numSentences: numSentences,
            userLevel: userLevel, // This is the 'Easy'/'Normal'/'Hard' string
            // NEW: Pass the explicit prompt instruction from the difficulty mapping
            promptInstruction: difficultyPrompt,
            customPromptTemplate: customPromptTemplate
          })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend HTTP error! Status: ${response.status}`, errorText);
            sendResponse({ error: `Backend error: ${response.status} - ${errorText}` });
            return true;
        }

        const data = await response.json();
        console.log("Received backend response:", data);
        sendResponse(data);

      } catch (err) {
        console.error("Error calling backend /process_text:", err);
        sendResponse({ error: `Frontend fetch error: ${err.message}` });
      }

      return true;
    }


    // NEW: Handle message to track arbitrary events
     if (message.type === "TRACK_EVENT") {
        const { eventType, eventData } = message;
        const userId = await getUserId(); // Get the user ID

        try {
             const backendUrl = `${SERVER_URL}/track_event`; // 使用配置文件中的URL
             console.log("Sending track event to backend:", { userId, eventType, eventData });

             const response = await fetch(backendUrl, {
                method: "POST",
                headers: {
                   "Content-Type": "application/json",
                },
                body: JSON.stringify({
                   userId: userId,
                   eventType: eventType,
                   eventData: eventData // Send arbitrary event data
                })
             });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Backend HTTP error for track event! Status: ${response.status}`, errorText);
            } else {
                console.log("Track event sent successfully.");
            }

        } catch (err) {
             console.error("Error calling backend /track_event:", err);
        }

         // Tracking doesn't need to wait for a response from the background script
         // sendResponse({}); // Optional: send empty response if needed by sender
         return false; // Indicate no async response needed for tracking
     }


    // OLD: Remove or repurpose the direct LLM API call handler
    // This logic is now handled by the backend's /process_text endpoint
    if (message.type === "ADJUST_TEXT") {
        console.warn("ADJUST_TEXT message type is deprecated. Use PROCESS_TEXT_BLOCK instead.");
        // Optionally send a dummy response or error back
        sendResponse({ error: "ADJUST_TEXT message type deprecated." });
        return false; // No async response needed
    }

    // Keep other message listeners if you have them...
    // ... (your other message listeners if any) ...
    if (message.type === "PROCESS_TEXT_BLOCK") {
      // NEW: Destructure promptInstruction and customPromptTemplate
      const { textBlock, numSentences, userLevel, promptInstruction, customPromptTemplate } = message;
      console.log("Received text block for processing:", { textBlock: textBlock.substring(0, 100) + "...", numSentences, userLevel, promptInstruction, customPromptTemplate });
      const userId = await getUserId();
      
      // Get the prompt for the selected difficulty level
      const difficultyPrompt = await getPromptForDifficulty(userLevel);

      try {
        const backendUrl = `${SERVER_URL}/process_text`; // 使用配置文件中的URL
        console.log("Sending text block to backend:", { userId, numSentences, userLevel, promptInstruction: difficultyPrompt, customPromptTemplate, textBlock: textBlock.substring(0, 100) + "..." });

        const response = await fetch(backendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: userId,
            text: textBlock,
            numSentences: numSentences,
            userLevel: userLevel, // This is the 'Easy'/'Normal'/'Hard' string
            // NEW: Pass the explicit prompt instruction from the difficulty mapping
            promptInstruction: difficultyPrompt,
            customPromptTemplate: customPromptTemplate
          })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend HTTP error! Status: ${response.status}`, errorText);
            sendResponse({ error: `Backend error: ${response.status} - ${errorText}` });
            return true;
        }

        const data = await response.json();
        console.log("Received backend response:", data);
        sendResponse(data);

      } catch (err) {
        console.error("Error calling backend /process_text:", err);
        sendResponse({ error: `Frontend fetch error: ${err.message}` });
      }

      return true;
    }

    // NEW: Handle message to split sentences
    if (message.type === "SPLIT_SENTENCES") {
      const { text } = message;
      console.log("Received text for sentence splitting:", text.substring(0, 100) + "...");

      try {
        const backendUrl = `${SERVER_URL}/split_sentences`;
        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(10000) // Keep the 10-second timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Backend HTTP error for sentence splitting! Status: ${response.status}`, errorText);
          sendResponse({ error: `Backend error: ${response.status} - ${errorText}` });
          return true;
        }

        const data = await response.json();
        console.log("Received sentence splitting response:", data);
        sendResponse(data);

      } catch (err) {
        console.error("Error calling backend /split_sentences:", err);
        sendResponse({ error: `Frontend fetch error: ${err.message}` });
      }
      return true;
    }


    // NEW: Handle message to track arbitrary events
     if (message.type === "TRACK_EVENT") {
        const { eventType, eventData } = message;
        const userId = await getUserId(); // Get the user ID

        try {
             const backendUrl = `${SERVER_URL}/track_event`; // 使用配置文件中的URL
             console.log("Sending track event to backend:", { userId, eventType, eventData });

             const response = await fetch(backendUrl, {
                method: "POST",
                headers: {
                   "Content-Type": "application/json",
                },
                body: JSON.stringify({
                   userId: userId,
                   eventType: eventType,
                   eventData: eventData // Send arbitrary event data
                })
             });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Backend HTTP error for track event! Status: ${response.status}`, errorText);
            } else {
                console.log("Track event sent successfully.");
            }

        } catch (err) {
             console.error("Error calling backend /track_event:", err);
        }

         // Tracking doesn't need to wait for a response from the background script
         // sendResponse({}); // Optional: send empty response if needed by sender
         return false; // Indicate no async response needed for tracking
     }


    // OLD: Remove or repurpose the direct LLM API call handler
    // This logic is now handled by the backend's /process_text endpoint
      if (message.type === "ADJUST_TEXT") {
          console.warn("ADJUST_TEXT message type is deprecated. Use PROCESS_TEXT_BLOCK instead.");
          // Optionally send a dummy response or error back
          sendResponse({ error: "ADJUST_TEXT message type deprecated." });
          return false; // No async response needed
      }

      // Keep other message listeners if you have them...
      // ... (your other message listeners if any) ...

      // If no message type matches, return false
      return false;
    }
  );

