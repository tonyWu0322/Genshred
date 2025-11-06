// content.ts
import './content.css';
import { SERVER_URL } from "./config";
import { franc } from 'franc-min';
import AIChatWindow from '../components/AIChatWindow';
import React from 'react';
import * as ReactDOM from 'react-dom';
import {convert3To2} from '../scripts/language_code_converter';


// All from `dom-utilities.ts`
import { isElementVisible, isElementInViewport, getTextNodesWithOffsets, applyRewritesToElement, updateDarkModeStyling } from './lib/dom-utilities';
// All from `ui-components.ts`
import { createTooltip, showTooltip, hideTooltip, createLoadingSpan, createRewriteSpan, restoreOriginalText } from './lib/ui-components';
// All from `observers.ts`
import { startObservingDOMChanges, stopObservingDOMChanges, setupIntersectionObserver, processParagraphs } from './lib/observers';
// All from `api-helpers.ts`
import { processElement, getPromptForDifficultyAndLanguage, detectLanguage} from './lib/api-helpers';
// All from `utilities.ts`
import { debounce, escapeRegExp, escapeHTML, calculateComplexityScore, selectSentences, sha256, handleIframes, clearPageLanguageCache, testLanguageDetection, testLanguageModelSelection } from './lib/utilities';
// All from `constants.ts`
import { STORAGE_KEYS, DEFAULT_SETTINGS, MIN_PARAGRAPH_LENGTH, MAX_PARAGRAPH_LENGTH, PROCESSING_DELAY } from './constants';
// All from `types.ts`
import type { ProcessResponse, Settings } from './types';

import { currentSettings, loadSettings, registerSettingsUpdateCallback } from '~src/lib/state-management';

// lazyloading
let intersectionObserver: IntersectionObserver | null = null;
const observedElements = new WeakSet<Element>();
// Define keys for storage (should match popup.tsx)



// NEW: Use the consistent default for CUSTOM_PROMPT
// const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";

// 加载动画
// deprecated
// function createLoadingSpinner(): HTMLElement {
//     const spinner = document.createElement('span');
//     spinner.className = 'genshred-loading-spinner';
//     spinner.title = 'Processing...'; // Tooltip for accessibility
//     return spinner;
// }

// 添加防抖函数，避免频繁处理


// 添加MutationObserver来监听DOM变化
let mutationObserver: MutationObserver | null = null;

// 启动MutationObserver

// 初始化函数
function initialize() {
    loadSettings();
    createTooltip(); // 创建全局提示框
    
    // Clear page language cache on initialization
    clearPageLanguageCache();
    
    // Expose test functions to global scope for debugging
    (window as any).testLanguageDetection = testLanguageDetection;
    (window as any).clearPageLanguageCache = clearPageLanguageCache;
    (window as any).testLanguageModelSelection = testLanguageModelSelection;
    
    // Add event listeners for manual selection
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', hideRewriteButton); // Hide if user clicks elsewhere
    
    // 添加全局事件监听器，用于innerHTML方法添加的元素
    document.addEventListener('genshred-tooltip-show', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        showTooltip(detail.text, detail.event, detail.element);
    });
    
    document.addEventListener('genshred-tooltip-hide', () => {
        hideTooltip();
    });
    
    // 处理iframe内容
    handleIframes();

    // Listen for storage changes to handle AI chat visibility
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[STORAGE_KEYS.HIDE_AI_CHAT]) {
            // Re-inject or remove AI chat window based on new setting
            injectAIChatWindow();
        }
    });

    // Clean up observers when page is unloaded
    window.addEventListener('unload', () => {
        if (intersectionObserver) {
            intersectionObserver.disconnect();
        }
        if (mutationObserver) {
            mutationObserver.disconnect();
        }
    });
}


// 启动初始化
initialize();



// Function to apply rewrites to an element by manipulating text nodes directly


// Callback for setting update
function handleSettingsUpdate(newSettings: Settings) {
    console.log("Reacting to settings update:", newSettings);

    // This is where you put all the action logic that used to be in loadSettings and onChanged
    if (newSettings[STORAGE_KEYS.IS_ON]) {
        processParagraphs();
        startObservingDOMChanges();
    } else {
        // restoreOriginalText();
        stopObservingDOMChanges();
    }


    updateDarkModeStyling();
    }
    
    // You can also handle reading mode and other setting-specific actions here
    // if (newSettings[STORAGE_KEYS.READING_MODE]) {
    //     restoreOriginalText();
    //     if (newSettings[STORAGE_KEYS.IS_ON]) {
    //         processParagraphs();
    //     }
    // }


// Call the function to load initial settings, then register the callback to listen for future changes
loadSettings();
registerSettingsUpdateCallback(handleSettingsUpdate);

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // All state-related changes are dealt within the popup now
    // if (message.type === "SET_MANUAL_SELECT_MODE") {
    //     genShredManualSelect = message.enabled;
    //     console.log(`Manual select mode changed to: ${genShredManualSelect}`);
    //     // Hide rewrite button if manual select mode is disabled
    //     if (!genShredManualSelect) {
    //         hideRewriteButton();
    //     }
    //     return false;
    // }

    // ... (existing TOGGLE_PLUGIN, SET_REWRITE_COUNT) ...
    // These will mostly be handled by storage.onChanged now.

    // NEW: Handle CLEAR_CACHE message (as discussed previously)
    if (message.type === "CLEAR_CACHE") {
        console.log("Content script received CLEAR_CACHE message. Clearing chrome.storage.local cache.");
        // Clear all items that start with 'genshred_cache_' prefix
        chrome.storage.local.get(null, (items) => {
            const keysToRemove = Object.keys(items).filter(key => key.startsWith('genshred_cache_'));
            if (keysToRemove.length > 0) {
                chrome.storage.local.remove(keysToRemove, () => {
                    console.log(`Removed ${keysToRemove.length} items from cache.`);
        // restoreOriginalText(); // Revert any changes on the page
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs(); // Re-process the page with current settings
        }
                });
            } else {
                console.log("No cache items found to remove.");
                restoreOriginalText();
                if (currentSettings[STORAGE_KEYS.IS_ON]) {
                    processParagraphs();
                }
            }
        });
        return false; // No async response needed
    }

    // NEW: Handle CLEAR_ALL_REWRITES message
    if (message.type === "CLEAR_ALL_REWRITES") {
        console.log("Content script received CLEAR_ALL_REWRITES message. Clearing all rewrites.");
        restoreOriginalText(); // Revert all changes on the page
        return false; // No async response needed
    }

    return false;
});


// NEW: Function to handle text selection
let rewriteButton: HTMLElement | null = null;
let currentSelectionRange: Range | null = null; // Store the selection range

function showRewriteButton(x: number, y: number) {
    if (!rewriteButton) {
        rewriteButton = document.createElement('button');
        rewriteButton.textContent = 'Rewrite Selected';
        rewriteButton.className = 'genshred-rewrite-button';
        rewriteButton.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        rewriteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('按钮被点击');
            handleRewriteSelectedText();
        });
        document.body.appendChild(rewriteButton);
    }
    rewriteButton.style.display = 'block';
    rewriteButton.style.position = 'absolute';
    rewriteButton.style.left = `${x}px`;
    rewriteButton.style.top = `${y}px`;
    rewriteButton.style.zIndex = '2147483647';
}

function hideRewriteButton() {
    if (rewriteButton) {
        rewriteButton.style.display = 'none';
    }
    currentSelectionRange = null;
}

// 手动模式
async function handleRewriteSelectedText() {
    console.log("handleRewriteSelectedText function started."); // Add this line
    if (!currentSelectionRange) {
        console.log("handleRewriteSelectedText: No currentSelectionRange, returning."); // More specific log
        return;
    }

    const selectedText = currentSelectionRange.toString().trim();
    if (selectedText.length === 0) {
        console.log("handleRewriteSelectedText: Selected text is empty, returning."); // More specific log
        return;
    }

    console.log("Rewriting selected text:", selectedText);
    // hideRewriteButton(); // Hide button immediately - REMOVED to prevent immediate disappearance after click

    // Get the last known position of the button before it's hidden or moved
    // We'll use this if we need to re-show the button after an error without a new selection
    const lastButtonX = rewriteButton ? parseFloat(rewriteButton.style.left) : 0;
    const lastButtonY = rewriteButton ? parseFloat(rewriteButton.style.top) : 0;

    // 发送请求前，先用 loading 动画替换选区
    const loadingSpan = createLoadingSpan(selectedText);
    const range = currentSelectionRange;
    range.deleteContents();
    range.insertNode(loadingSpan);

    try {
        const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
        const detectedlanguage = detectLanguage(selectedText);
        if (detectedlanguage === 'und') {
            console.log("Manual rewrite - Undetected language, skipping.");
            return;
        }
        const effectivePromptInstruction = await getPromptForDifficultyAndLanguage(selectedDifficulty, detectedlanguage);
        const effectiveCustomPromptTemplate = currentSettings[STORAGE_KEYS.CUSTOM_PROMPT];
        console.log("Manual rewrite - Original sentence being sent:", selectedText);
        console.log("Manual rewrite - Using prompt instruction:", effectivePromptInstruction);
        console.log("Manual rewrite - Selected difficulty:", selectedDifficulty);
        console.log("Manual rewrite - Detected language:", detectedlanguage);
        const result = await new Promise<ProcessResponse>((resolve) => {
            let promptToUse = effectivePromptInstruction;
            chrome.runtime.sendMessage(
                {
                    type: "PROCESS_TEXT_BLOCK",
                    textBlock: selectedText,
                    numSentences: 1,
                    promptInstruction: promptToUse,
                    customPromptTemplate: effectiveCustomPromptTemplate,
                    userLevel: selectedDifficulty,
                    originalIndex: 0
                },
                (response) => resolve(response)
            );
        });
        console.log("Manual rewrite - Sentence sent to backend.");
        console.log("Manual rewrite - Full response from backend:", result);
        if (result?.rewritten_sentences?.[0]) {
            const rewrittenText = result.rewritten_sentences[0].rewritten_text;
            console.log("Manual rewrite - Rewritten text received:", rewrittenText);
            // 替换 loading 动画为最终改写内容
            if (loadingSpan.parentNode) {
                loadingSpan.parentNode.replaceChild(createRewriteSpan(selectedText, rewrittenText), loadingSpan);
            }
            // After successful rewrite, re-evaluate button visibility based on current selection
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showRewriteButton(rect.right + window.scrollX + 5, rect.top + window.scrollY);
            } else {
                hideRewriteButton();
            }
        } else if (result?.error) {
            console.error("Error rewriting selected text:", result.error);
            // 重新插入原文本
            if (loadingSpan.parentNode) {
                loadingSpan.parentNode.replaceChild(document.createTextNode(selectedText), loadingSpan);
            }
            alert(`Error rewriting text: ${result.error}`);
            // After error, re-evaluate button visibility based on current selection
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showRewriteButton(rect.right + window.scrollX + 5, rect.top + window.scrollY);
            } else {
                hideRewriteButton();
            }
        } else {
            console.warn("No rewritten text received.");
            // 重新插入原文本
            if (loadingSpan.parentNode) {
                loadingSpan.parentNode.replaceChild(document.createTextNode(selectedText), loadingSpan);
            }
            alert("Could not rewrite text. No response from AI.");
            // After error, re-evaluate button visibility based on current selection
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showRewriteButton(rect.right + window.scrollX + 5, rect.top + window.scrollY);
            } else {
                hideRewriteButton();
            }
        }
    } catch (error) {
        console.error("Error during manual text rewrite:", error);
        // 重新插入原文本
        if (loadingSpan.parentNode) {
            loadingSpan.parentNode.replaceChild(document.createTextNode(selectedText), loadingSpan);
        }
        alert("An unexpected error occurred during rewriting.");
        // After error, re-evaluate button visibility based on current selection
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            showRewriteButton(rect.right + window.scrollX + 5, rect.top + window.scrollY);
        } else {
            hideRewriteButton();
        }
    }
}

function handleTextSelection(event: MouseEvent) {
    
    console.log("handleTextSelection called, genShredManualSelect:", currentSettings.genShredManualSelect);
    
    // Ensure that currentSelectionRange is always set to the actual selection if genShredManualSelect
    const selection = window.getSelection();
      // ✅ 忽略光标点击（未选中任何文本）
      if (!selection || selection.isCollapsed) {
        console.log("Selection is collapsed (caret move), ignoring...");
        return;
    }

    console.log("Selection:", selection, "rangeCount:", selection?.rangeCount, "isCollapsed:", selection?.isCollapsed, "genShredManualSelect:", currentSettings.genShredManualSelect);

    // See constants.ts
    // const MAX_PARAGRAPH_LENGTH = 1000; // Define a reasonable max length for selected text
    
    if (currentSettings.genShredManualSelect && selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        // Only show button if text length is reasonable and not within existing Genshred elements
        if (selectedText.length > 0 && selectedText.length < MAX_PARAGRAPH_LENGTH &&
            !range.commonAncestorContainer.parentElement?.closest('.genshred-rewrite-container') &&
            !range.commonAncestorContainer.parentElement?.closest('.genshred-tooltip-container'))
        {
            currentSelectionRange = range;
            const rect = range.getBoundingClientRect();
            // Position the button near the selected text
            showRewriteButton(rect.right + window.scrollX + 5, rect.top + window.scrollY);
        } else {
            hideRewriteButton();
        }
    } else {
        hideRewriteButton();
    }
}

// NEW: Function to replace selected text in DOM with rewritten text
function replaceSelectionWithRewrittenText(range: Range, rewrittenText: string, originalText: string) {
    // 使用与正常改写功能完全相同的createRewriteSpan函数
    const containerSpan = createRewriteSpan(originalText, rewrittenText);

    // 删除当前选中的内容并插入新的容器
    range.deleteContents();
    range.insertNode(containerSpan);

    // 清除选择
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
    }
}



// Inject AIChatWindow into the page using a shadow DOM
async function injectAIChatWindow() {
    // Check if AI chat should be hidden
    const settings = await chrome.storage.local.get([STORAGE_KEYS.HIDE_AI_CHAT]);
    const hideAIChat = settings[STORAGE_KEYS.HIDE_AI_CHAT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.HIDE_AI_CHAT];
    
    if (hideAIChat) {
        // Remove existing chat window if it exists
        const existingContainer = document.getElementById('genshred-ai-chat-root');
        if (existingContainer) {
            existingContainer.remove();
        }
        return;
    }

    if (document.getElementById('genshred-ai-chat-root')) return; // Prevent double-injection
    const container = document.createElement('div');
    container.id = 'genshred-ai-chat-root';
    container.style.position = 'fixed';
    container.style.zIndex = '2147483647';
    container.style.all = 'unset';
    document.body.appendChild(container);

    // Use shadow DOM to avoid style conflicts
    const shadow = container.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    // Inject CSS into shadow root (inline for reliability)
    const style = document.createElement('style');
    style.textContent = `
.ai-chat-fab {
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 9999;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 56px;
  height: 56px;
  font-size: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  cursor: pointer;
  transition: background 0.2s;
}
.ai-chat-fab:hover {
  background: #1565c0;
}

.ai-chat-window {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 340px;
  max-width: 95vw;
  height: 420px;
  max-height: 80vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}

.ai-chat-header {
  background: #1976d2;
  color: #fff;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: bold;
  font-size: 1.1rem;
}
.ai-chat-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.3rem;
  cursor: pointer;
  margin-left: 8px;
}

.ai-chat-history {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  background: #f7f7fa;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-chat-msg {
  padding: 8px 12px;
  border-radius: 16px;
  max-width: 80%;
  word-break: break-word;
  font-size: 1rem;
  line-height: 1.4;
}
.ai-chat-msg-user {
  align-self: flex-end;
  background: #e3f2fd;
  color: #1976d2;
}
.ai-chat-msg-ai {
  align-self: flex-start;
  background: #fff;
  color: #333;
  border: 1px solid #e0e0e0;
}

.ai-chat-input-row {
  display: flex;
  padding: 10px 12px;
  background: #f1f1f5;
  border-top: 1px solid #e0e0e0;
}
.ai-chat-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #bdbdbd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  margin-right: 8px;
}
.ai-chat-send {
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0 18px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
.ai-chat-send:disabled {
  background: #bdbdbd;
  cursor: not-allowed;
}
.ai-chat-send:not(:disabled):hover {
  background: #1565c0;
}
`;
    shadow.appendChild(style);

    ReactDOM.render(React.createElement(AIChatWindow), mountPoint);
}


// Call injectAIChatWindow on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAIChatWindow);
} else {
    injectAIChatWindow();
}