// This script will now act as a proxy to forward messages to the backend server
import { SERVER_URL } from "./config";
import { buildProcessTextHeaders, resolveBackendEndpoints } from "./lib/backend-endpoints";
import * as log from "./lib/logger";

function buildFinalPrompt(
  textBlock: string,
  userLevel: string,
  promptInstruction: string,
  customPromptTemplate?: string
): string {
  if (userLevel === "Custom_1" && customPromptTemplate) {
    return customPromptTemplate
      .replace("{user_level}", userLevel)
      .replace("{sentences_to_rewrite}", textBlock);
  }
  const finalPromptBase = `Rewrite the following sentence(s) for a user with language level ${userLevel}. ${promptInstruction}\n\n{sentences_to_rewrite}`;
  return finalPromptBase.replace("{sentences_to_rewrite}", textBlock);
}

function buildProcessResponse(
  textBlock: string,
  rewrittenText: string,
  originalIndex: number
) {
  return {
    rewritten_sentences: [
      {
        original_text: textBlock,
        rewritten_text: rewrittenText,
        original_index: originalIndex
      }
    ],
    error: null
  };
}

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
    log.messageIo("in", message.type);

    if (message.type === "PROCESS_TEXT_BLOCK") {
      const { textBlock, numSentences, userLevel, promptInstruction, customPromptTemplate, originalIndex } = message;
      
      // Handle async operation properly
      (async () => {
        try {
          const userId = await getUserId();
          const difficultyPrompt = await getPromptForDifficulty(userLevel);
          const endpoints = await resolveBackendEndpoints();
          const backendUrl = endpoints.processTextUrl;
          const requestBody = {
            userId: userId,
            text: textBlock,
            numSentences: numSentences,
            userLevel: userLevel,
            promptInstruction: promptInstruction || difficultyPrompt,
            customPromptTemplate: customPromptTemplate,
            originalIndex: originalIndex || 0
          };
          log.debug("process_text", endpoints.mode, backendUrl);

          if (endpoints.mode === "custom") {
            const finalPromptText = buildFinalPrompt(
              textBlock,
              userLevel,
              promptInstruction || difficultyPrompt,
              customPromptTemplate
            );
            log.promptFull(finalPromptText);
            const openAiPayload: Record<string, any> = {
              model: endpoints.customLlmModel,
              messages: [{ role: "user", content: finalPromptText }],
              stream: false,
              temperature: endpoints.customLlmTemperature,
              top_p: endpoints.customLlmTopP
            };
            if (endpoints.customLlmMaxTokens > 0) {
              openAiPayload.max_tokens = endpoints.customLlmMaxTokens;
            }

            log.net("out", `POST ${backendUrl}`, {
              model: openAiPayload.model,
              temperature: openAiPayload.temperature,
              top_p: openAiPayload.top_p,
              max_tokens: openAiPayload.max_tokens,
              messages: openAiPayload.messages
            });
            const llmResponse = await fetch(backendUrl, {
              method: "POST",
              headers: buildProcessTextHeaders(endpoints.llmApiKey),
              body: JSON.stringify(openAiPayload),
              signal: AbortSignal.timeout(endpoints.customLlmTimeoutMs)
            });

            if (!llmResponse.ok) {
              const errorText = await llmResponse.text();
              sendResponse({ error: `[Process Text] Custom LLM error: ${llmResponse.status} - ${errorText}` });
              return;
            }

            const rawLlmText = await llmResponse.text();
            let llmData: any = null;
            try {
              llmData = JSON.parse(rawLlmText);
            } catch {
              sendResponse({
                error: `[Process Text] Custom LLM returned non-JSON. url=${backendUrl}, preview=${rawLlmText.slice(0, 200)}`
              });
              return;
            }

            const rewrittenText = llmData?.choices?.[0]?.message?.content?.trim();
            if (!rewrittenText) {
              sendResponse({
                error: `[Process Text] Invalid OpenAI-compatible response: missing choices[0].message.content`
              });
              return;
            }

            log.net("in", `POST ${backendUrl}`, llmData);
            sendResponse(buildProcessResponse(textBlock, rewrittenText, originalIndex || 0));
            return;
          }

          log.promptFull(
            buildFinalPrompt(
              textBlock,
              userLevel,
              promptInstruction || difficultyPrompt,
              customPromptTemplate
            )
          );
          log.net("out", `POST ${backendUrl}`, requestBody);
          const response = await fetch(backendUrl, {
            method: "POST",
            headers: buildProcessTextHeaders(endpoints.llmApiKey),
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
              const errorText = await response.text();
              sendResponse({ error: `[Process Text] Backend error: ${response.status} - ${errorText}` });
              return;
          }

          // Some backends (wrong URL / reverse proxy / 404 redirect) may return HTML.
          // Parse safely to avoid "Unexpected token '<'" JSON parse errors.
          const rawText = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {
            log.error("Non-JSON backend response", {
              url: backendUrl,
              status: response.status,
              contentType: response.headers.get("content-type"),
              preview: rawText.slice(0, 200),
            });
            sendResponse({
              error: `[Process Text] Backend returned non-JSON. url=${backendUrl}, status=${response.status}, contentType=${response.headers.get("content-type")}, preview=${rawText.slice(0, 200)}`,
            });
            return;
          }

          log.net("in", `POST ${backendUrl}`, data);
          sendResponse(data);
        } catch (err) {
          log.error("Error in PROCESS_TEXT_BLOCK:", err);
          sendResponse({ error: `[Process Text] Frontend fetch error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "SPLIT_SENTENCES") {
      const { text, language, model } = message;

      // Handle async operation properly
      (async () => {
        try {
          const endpoints = await resolveBackendEndpoints();
          const backendUrl = endpoints.splitUrl;
          const body: any = { text };
          if (language) {
            body.language = language;
          }
          if (model) {
            body.model = model;
          }

          log.debug("split_sentences", endpoints.mode, backendUrl, {
            textLen: text?.length,
            language,
            model
          });
          log.net("out", `POST ${backendUrl}`, body);

          const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
          });

          if (!response.ok) {
            const errorText = await response.text();
            log.error("Backend error for SPLIT_SENTENCES:", response.status, errorText);
            sendResponse({ error: `[Sentence Splitting] Backend error: ${response.status} - ${errorText}` });
            return;
          }

          const rawText = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(rawText);
          } catch {
            log.error("Non-JSON backend response (split)", {
              url: backendUrl,
              status: response.status,
              contentType: response.headers.get("content-type"),
              preview: rawText.slice(0, 200),
            });
            sendResponse({
              error: `[Sentence Splitting] Backend returned non-JSON. url=${backendUrl}, status=${response.status}, contentType=${response.headers.get("content-type")}, preview=${rawText.slice(0, 200)}`,
            });
            return;
          }

          log.net("in", `POST ${backendUrl}`, data);
          sendResponse(data);
        } catch (err) {
          log.error("Error in SPLIT_SENTENCES:", err);
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
          log.error("Error calling backend /track_event:", err);
          sendResponse({ error: `[Track Event] Error: ${err.message}` });
        }
      })();
      
      return true; // Keep message channel open for async response
    }

    if (message.type === "ADJUST_TEXT") {
      log.warn("ADJUST_TEXT message type is deprecated. Use PROCESS_TEXT_BLOCK instead.");
      sendResponse({ error: "ADJUST_TEXT message type deprecated." });
      return false; // No async operation needed
    }

    // If no message type matches, return false
    log.warn("Unknown message type:", message.type);
    sendResponse({ error: `Unknown message type: ${message.type}` });
    return false;
  }
);