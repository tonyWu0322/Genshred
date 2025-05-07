//import type { PlasmoMessaging } from "plasmo"

// Although Plasmo has its own messaging API (PlasmoMessaging),
// we'll use the standard chrome.runtime.onMessage for compatibility with the content script prototype
// and the structure you provided. You could refactor to PlasmoMessaging later if desired.

console.log("Genshred Background Script Loaded");

// Listen for messages from content scripts or other parts of the extension
chrome.runtime.onMessage.addListener(
  (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    // Ensure the function returns true to indicate that sendResponse will be called asynchronously
    let isAsync = false;

    if (request.name === 'processTextForGrading') {
      isAsync = true; // We will send the response asynchronously

      const originalText: string = request.body.text;
      const difficulty: string = request.body.difficulty; // Get the difficulty level

      console.log("Background script received text for grading:", originalText.substring(0, 100) + '...'); // Log first 100 chars
      console.log("Desired difficulty:", difficulty);

      // --- Construct the AI Prompt for Graded Reading ---
      // This is the core change from the translation script.
      // The prompt needs to instruct the AI to rewrite the text to a specific level.
      // You will need to refine this prompt significantly through testing.

      let systemPrompt = `You are an AI assistant for foreign language learners. Your task is to rewrite the following English text to a reading level suitable for a "${difficulty}" learner. Keep the original meaning as close as possible. Simplify complex sentence structures, replace advanced vocabulary with simpler synonyms, and adjust the overall complexity as needed for the specified level. Only provide the rewritten text. Do not add any explanations or conversational text.`;

      // You could make the system prompt more specific based on difficulty,
      // or use the difficulty level to adjust parameters like temperature or max_tokens if the API supports it and it helps.

      // For custom difficulty levels (like "Custom_1"), you might need a different approach,
      // possibly including user-defined instructions from storage in the prompt.

      const options: RequestInit = {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer sk-panaghczpcpdhwnmmslvelnvzfjhudrcxlkqjoihvfibsqqi', // ★ REPLACE WITH YOUR ACTUAL TOKEN ★
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "Qwen/Qwen3-8B", // Use the specified model
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: originalText
            }
          ],
          stream: false, // We want a single response
          max_tokens: 1000, // Adjust based on expected length of rewritten text
          temperature: 0.5, // Adjust temperature - lower for more predictable, higher for more creative
          top_p: 0.9, // Adjust top_p
          // top_k: 50, // SiliconFlow documentation might specify which parameters are supported
          // frequency_penalty: 0.5, // Adjust penalty parameters if supported and helpful
          n: 1, // Request one completion
          // response_format: { type: "text" } // Already the default for this type of endpoint
        })
      };

      // --- Call the AI API ---
      fetch("https://api.siliconflow.cn/v1/chat/completions", options)
        .then((res) => {
          if (!res.ok) {
            // Handle non-200 responses
            return res.json().then(errorData => {
                console.error("API Error Response:", errorData);
                throw new Error(`API error: ${res.status} ${res.statusText} - ${errorData.message || 'Unknown error'}`);
            });
          }
          return res.json();
        })
        .then((data) => {
          // --- Extract the Graded Text from the Response ---
          const gradedText = data?.choices?.[0]?.message?.content;

          if (gradedText) {
            console.log("Graded Text received:", gradedText.substring(0, 100) + '...'); // Log first 100 chars
            // --- Send the Graded Text back to the Content Script ---
            sendResponse({ status: "success", gradedText: gradedText });
          } else {
            console.error("API response did not contain graded text in the expected format:", data);
            sendResponse({ status: "error", message: "Could not extract graded text from AI response." });
          }
        })
        .catch((err) => {
          console.error("Error during AI grading API call:", err);
          // --- Send an Error Response back to the Content Script ---
          sendResponse({ status: "error", message: `Failed to grade text: ${err.message}` });
        });
    }
    // You can add more message handlers here for other background tasks if needed

    return isAsync; // Important: Return true for asynchronous responses
  }
);

// You might want to add other background script functionalities here,
// such as handling context menus, browser actions, or alarms if your project requires them.
// Plasmo allows you to export named functions for specific background tasks.
// See https://docs.plasmo.com/quickstarts/background

/*
// Example of a Plasmo exported function for a specific task
export const handleInstall = () => {
  // Code to run when the extension is installed
  console.log("Genshred extension installed!");
};
*/