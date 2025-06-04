// content.ts
import './content.css';
const PROCESSING_DELAY = 1000; // 1 second delay between processing requests
const PARAGRAPH_CACHE = new Map<string, any>(); // Cache for processed paragraphs
const MIN_PARAGRAPH_LENGTH = 100; // Minimum characters to process
const MAX_PARAGRAPH_LENGTH = 5000; // Maximum characters to process
// lazyloading
let intersectionObserver: IntersectionObserver | null = null;
const observedElements = new WeakSet<Element>();
// Define keys for storage (should match popup.tsx)

async function processElement(element: HTMLElement) {
    try {
        if (!currentSettings[STORAGE_KEYS.IS_ON] || 
            element.classList.contains('genshred-processed') || 
            element.classList.contains('genshred-processing') ||
            element.closest('.genshred-rewritten')) {
            console.log("Skipping element - already processed or processing");
            return;
        }

        const textBlock = element.innerText.trim();
        console.log("Processing text block:", textBlock.substring(0, 50) + "...");

        if (textBlock.length < MIN_PARAGRAPH_LENGTH) {
            console.log("Text block too short, skipping");
            return;
        }

        // Mark as processing to prevent duplicate processing
        element.classList.add('genshred-processing');

        const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
        const effectivePromptInstruction = currentDifficultyMappings[selectedDifficulty] || "";
        const effectiveCustomPromptTemplate = currentSettings[STORAGE_KEYS.CUSTOM_PROMPT];
        
        console.log("Using difficulty:", selectedDifficulty);
        console.log("Using prompt instruction:", effectivePromptInstruction);

        const cacheKey = `${textBlock}_${effectivePromptInstruction}_${effectiveCustomPromptTemplate}_${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`;

        if (PARAGRAPH_CACHE.has(cacheKey)) {
            console.log("Using cached response");
            const cachedResponse = PARAGRAPH_CACHE.get(cacheKey);
            await applyRewritesToElement(element, cachedResponse.rewritten_sentences);
            element.classList.add('genshred-processed');
            element.classList.remove('genshred-processing');
            return;
        }

        // Process text in chunks
        const sentences = splitTextIntoSentences(textBlock);
        console.log(`Split text into ${sentences.length} sentences`);
        
        const chunkSize = Math.min(Number(currentSettings[STORAGE_KEYS.SENTENCE_COUNT]), 3);
        
        for (let i = 0; i < sentences.length; i += chunkSize) {
            const chunk = sentences.slice(i, i + chunkSize);
            const chunkText = chunk.join(' ');
            
            console.log(`Processing chunk ${i/chunkSize + 1}:`, chunkText.substring(0, 50) + "...");

            // Send message and wait for response
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        type: "PROCESS_TEXT_BLOCK",
                        textBlock: chunkText,
                        numSentences: chunk.length,
                        promptInstruction: effectivePromptInstruction,
                        customPromptTemplate: effectiveCustomPromptTemplate,
                        userLevel: selectedDifficulty,
                        originalIndexOffset: i
                    },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("Runtime error:", chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                            return;
                        }

                        if (!response?.error && response?.rewritten_sentences) {
                            const adjustedRewrites = response.rewritten_sentences.map(rw => ({
                                ...rw,
                                original_index: rw.original_index + i
                            }));
                            
                            applyRewritesToElement(element, adjustedRewrites);
                            const chunkKey = `${chunkText}_${effectivePromptInstruction}_${effectiveCustomPromptTemplate}_${chunk.length}`;
                            PARAGRAPH_CACHE.set(chunkKey, { rewritten_sentences: adjustedRewrites });
                        }
                        resolve(response);
                    }
                );
            });

            // Add delay between chunks
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        element.classList.add('genshred-processed');
        element.classList.remove('genshred-processing');
        
    } catch (error) {
        console.error("Error in processElement:", error);
        element.classList.remove('genshred-processing');
        throw error;
    }
}


const STORAGE_KEYS = {
    IS_ON: 'genShredPluginState',
    SENTENCE_COUNT: 'genShredSentenceCount',
    DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
    CUSTOM_PROMPT: 'genShredCustomPromptTemplate' // Assuming you'll add this later
};

// NEW: Use the consistent default for CUSTOM_PROMPT
const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";
const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.IS_ON]: true,
  [STORAGE_KEYS.SENTENCE_COUNT]: 5,
  [STORAGE_KEYS.DIFFICULTY_LEVEL]: 'Normal',
  [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT // Use the consistent default
};

// Variables to hold current settings state in content script
let currentSettings = { ...DEFAULT_SETTINGS };
// NEW: Store the loaded difficulty mappings
let currentDifficultyMappings: { [key: string]: string } = {
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
    "Custom_1": "Rewrite for a user with specific needs, as defined by the custom prompt below."
};

// 全局提示框元素
let tooltipElement: HTMLElement | null = null;
// 添加全局状态控制变量
let isTooltipVisible = false;
let activeTooltipElement: Element | null = null;

// 创建全局提示框
function createTooltip() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'genshred-tooltip-container';
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

// 显示提示框
function showTooltip(text: string, event: MouseEvent, sourceElement?: Element) {
    // 如果已经显示了提示框，且是同一个元素触发的，则不做任何操作
    if (isTooltipVisible && sourceElement && activeTooltipElement === sourceElement) {
        return;
    }
    
    // 如果已经显示了提示框，但是不同元素触发的，先隐藏当前提示框
    if (isTooltipVisible) {
        hideTooltip();
    }
    
    const tooltip = createTooltip();
    tooltip.textContent = `Original: ${text}`;
    tooltip.style.display = 'block';
    
    // 根据鼠标位置定位提示框
    const viewportHeight = window.innerHeight;
    const tooltipHeight = tooltip.offsetHeight;
    
    // 如果鼠标在页面下半部分，将提示框显示在鼠标上方
    if (event.clientY > viewportHeight / 2) {
        tooltip.style.bottom = 'auto';
        tooltip.style.top = `${event.clientY - tooltipHeight - 10}px`;
    } else {
        // 否则显示在鼠标下方
        tooltip.style.top = 'auto';
        tooltip.style.bottom = `${viewportHeight - event.clientY - 10}px`;
    }
    
    // 水平居中于鼠标位置
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.transform = 'translateX(-50%)';
    
    // 更新全局状态
    isTooltipVisible = true;
    activeTooltipElement = sourceElement || null;
}

// 隐藏提示框
function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
        isTooltipVisible = false;
        activeTooltipElement = null;
    }
}

// 添加防抖函数，避免频繁处理
function debounce<F extends (...args: any[]) => any>(func: F, wait: number): (...args: Parameters<F>) => void {
    let timeout: number | undefined;
    
    return function(...args: Parameters<F>): void {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), wait);
    };
}

// 添加MutationObserver来监听DOM变化
let mutationObserver: MutationObserver | null = null;

// 启动MutationObserver
function startObservingDOMChanges() {
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // 创建一个防抖版本的processParagraphs
    const debouncedProcessParagraphs = debounce(processParagraphs, 500);
    
    // 创建MutationObserver实例
    mutationObserver = new MutationObserver((mutations) => {
        let shouldProcess = false;
        
        // 检查是否有相关变化需要处理
        for (const mutation of mutations) {
            // 如果添加了新节点
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of Array.from(mutation.addedNodes)) {
                    // 检查是否是元素节点且不是我们自己创建的
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        !(node as Element).classList.contains('genshred-rewritten') &&
                        !(node as Element).classList.contains('genshred-processed')) {
                        shouldProcess = true;
                        break;
                    }
                }
            }
            
            // 如果修改了属性或字符数据
            if ((mutation.type === 'attributes' || mutation.type === 'characterData') && 
                !mutation.target.parentElement?.classList.contains('genshred-rewritten')) {
                shouldProcess = true;
            }
            
            if (shouldProcess) break;
        }
        
        // 如果需要处理，调用防抖版本的processParagraphs
        if (shouldProcess && currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("DOM changes detected, processing new content...");
            debouncedProcessParagraphs();
        }
    });
    
    // 配置观察选项
    const observerConfig = {
        childList: true,     // 观察子节点的添加或删除
        subtree: true,       // 观察所有后代节点
        attributes: false,    // 不观察属性变化
        characterData: true  // 观察文本内容变化
    };
    
    // 开始观察整个文档
    mutationObserver.observe(document.body, observerConfig);
    console.log("Started observing DOM changes");
}

// 停止MutationObserver
function stopObservingDOMChanges() {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
        console.log("Stopped observing DOM changes");
    }
}

// NEW: Function to load settings from storage
async function loadSettings() {
    console.log("Content script loading settings...");
    const storedSettings = await chrome.storage.local.get([
        ...Object.values(STORAGE_KEYS),
        'genShredDifficultyMapping' // Load the new mapping key
    ]);

    // Update currentSettings with loaded values, falling back to defaults
    currentSettings = {
        [STORAGE_KEYS.IS_ON]: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
        [STORAGE_KEYS.SENTENCE_COUNT]: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
        [STORAGE_KEYS.DIFFICULTY_LEVEL]: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
        [STORAGE_KEYS.CUSTOM_PROMPT]: storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT],
    };

    // Update difficulty mappings
    currentDifficultyMappings = storedSettings['genShredDifficultyMapping'] ?? currentDifficultyMappings;

    console.log("Settings loaded:", currentSettings);
    console.log("Difficulty mappings loaded:", currentDifficultyMappings);

    // --- Initial Action based on loaded state ---
    if (currentSettings[STORAGE_KEYS.IS_ON]) {
        restoreOriginalText();
        processParagraphs();
        startObservingDOMChanges();
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
            if (key === STORAGE_KEYS.IS_ON) {
                currentSettings[STORAGE_KEYS.IS_ON] = changes[key].newValue;
                 settingsChanged = true;
                console.log(`Plugin state changed to: ${currentSettings[STORAGE_KEYS.IS_ON]}`);
                
                // Handle enabling/disabling the plugin
                if (currentSettings[STORAGE_KEYS.IS_ON]) {
                    processParagraphs();
                    startObservingDOMChanges();
                } else {
                    restoreOriginalText();
                    stopObservingDOMChanges();
                }
            } 
            else if (key === STORAGE_KEYS.SENTENCE_COUNT) {
                currentSettings[STORAGE_KEYS.SENTENCE_COUNT] = changes[key].newValue;
                settingsChanged = true;
                console.log(`Sentence count changed to: ${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`);
            }
            else if (key === STORAGE_KEYS.DIFFICULTY_LEVEL) {
                currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] = changes[key].newValue;
                settingsChanged = true;
                console.log(`Difficulty level changed to: ${currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]}`);
            }
            else if (key === STORAGE_KEYS.CUSTOM_PROMPT) {
                currentSettings[STORAGE_KEYS.CUSTOM_PROMPT] = changes[key].newValue;
                settingsChanged = true;
                console.log(`Custom prompt template changed`);
            }
            else if (key === 'genShredDifficultyMapping') {
                currentDifficultyMappings = changes[key].newValue;
                settingsChanged = true;
                console.log(`Difficulty mappings updated:`, currentDifficultyMappings);
              }
          }

        // If any relevant settings changed and plugin is on, reprocess paragraphs
        if (settingsChanged && currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Settings changed, reprocessing paragraphs...");
            // Clear cache to ensure new settings are applied
            PARAGRAPH_CACHE.clear();
            // First restore original text, then process with new settings
            restoreOriginalText();
            processParagraphs();
        }
    }
});

// 初始化函数
function initialize() {
    loadSettings();
    createTooltip(); // 创建全局提示框
    
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

// 处理iframe内容
function handleIframes() {
    // 如果当前页面是iframe，则不需要处理其他iframe
    if (window.self !== window.top) {
        console.log("Running in iframe, skipping iframe handling");
        return;
    }
    
    // 查找所有iframe
    const processIframes = () => {
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    // 尝试访问iframe内容
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    
                    if (iframeDoc && currentSettings[STORAGE_KEYS.IS_ON]) {
                        // 在iframe内应用相同的处理逻辑
                        console.log("Processing iframe content");
                        
                        // 这里可以添加iframe内容处理逻辑
                        // 注意：由于同源策略限制，这只对同源iframe有效
                    }
                } catch (e) {
                    // 跨域iframe会抛出错误，这是正常的
                    console.log("Cannot access iframe content (likely cross-origin)");
                }
            });
        } catch (e) {
            console.error("Error processing iframes:", e);
        }
    };
    
    // 初始处理
    processIframes();
    
    // 设置定期检查新iframe
    setInterval(processIframes, 5000);
}

// 启动初始化
initialize();

// 我是懒加载 lazy loading
function isElementInViewport(el: HTMLElement, buffer: number = 300): boolean {
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
        rect.top >= (0 - buffer) &&
        rect.left >= 0 &&
        rect.bottom <= (windowHeight + buffer) &&
        rect.right <= windowWidth
    );
}

function setupIntersectionObserver() {
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && currentSettings[STORAGE_KEYS.IS_ON]) {
                    const element = entry.target;
                    if (!element.classList.contains('genshred-processed')) {
                        processElement(element as HTMLElement);
                    }
                    // Stop observing after processing
                    intersectionObserver?.unobserve(element);
                }
            });
        },
        {
            rootMargin: '300px 0px', // Start loading 300px before element enters viewport
            threshold: 0.1
        }
    );
}

// --- Function to process paragraphs and send to backend ---
// async function processParagraphs() {
//     if (!currentSettings[STORAGE_KEYS.IS_ON]) return;

//     // 增加对更多元素类型的支持，不仅仅是段落
//     const textElements = Array.from(document.querySelectorAll("p, div, span, h1, h2, h3, h4, h5, h6, li, td, th"));
//     let lastProcessingTime = 0;

//     for (const element of textElements) {
//         // 跳过已经处理过的元素或不可见元素
//         if (element.classList.contains('genshred-processed') || 
//             element.closest('.genshred-rewritten') || 
//             !isElementVisible(element)) {
//             continue;
//         }

//         // 获取元素文本，处理不同类型的元素
//         let textBlock = "";
//         if (element instanceof HTMLElement) {
//             textBlock = element.innerText.trim();
//         } else {
//             textBlock = (element.textContent || "").trim();
//         }

//         if (textBlock.length < MIN_PARAGRAPH_LENGTH) {
//             // console.log("Skipping short paragraph:", textBlock.substring(0, 30) + "...");
//             continue;
//         }

//         // NEW: Determine the actual prompt instruction and/or template to use for caching
//         const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
//         let effectivePromptInstruction = currentDifficultyMappings[selectedDifficulty] || "";
//         let effectiveCustomPromptTemplate = currentSettings[STORAGE_KEYS.CUSTOM_PROMPT];

//         // If the selected difficulty is 'Custom_1', then the instruction is fixed, and the customPromptTemplate takes precedence
//         if (selectedDifficulty === "Custom_1") {
//             // In this case, `effectivePromptInstruction` is just a description, the real instruction is the template.
//             // So we'll pass the template as the "instruction" for the cache key, but keep the instruction for the backend.
//             effectivePromptInstruction = String(effectiveCustomPromptTemplate); // Use the actual template for cache key
//         }
        
//         const cacheKey = `${textBlock}_${effectivePromptInstruction}_${effectiveCustomPromptTemplate}_${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`;

//         if (PARAGRAPH_CACHE.has(cacheKey)) {
//             console.log("Using cached response for paragraph");
//             const cachedResponse = PARAGRAPH_CACHE.get(cacheKey);
//             applyRewritesToElement(element, cachedResponse.rewritten_sentences);
            
//             // 标记元素已处理
//             element.classList.add('genshred-processed');
//             continue;
//         }

//         const now = Date.now();
//         if (now - lastProcessingTime < PROCESSING_DELAY) {
//             await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY));
//         }
//         lastProcessingTime = now;

//         console.log("Processing element:", textBlock.substring(0, 50) + "...");

//         // Send to backend
//         chrome.runtime.sendMessage(
//             {
//                 type: "PROCESS_TEXT_BLOCK",
//                 textBlock: textBlock,
//                 numSentences: currentSettings[STORAGE_KEYS.SENTENCE_COUNT],
//                 // NEW: Pass the actual prompt instruction and the custom prompt template
//                 promptInstruction: effectivePromptInstruction, // This is the mapped instruction
//                 customPromptTemplate: effectiveCustomPromptTemplate, // This is the full template
//                 // We still send difficultyLevel for tracking and backend logic,
//                 // but the prompt itself will be constructed based on promptInstruction/customPromptTemplate
//                 userLevel: selectedDifficulty // Keeping `userLevel` name for backend's API
//             },
//             (response) => {
//                 if (!response?.error && response?.rewritten_sentences) {
//                     PARAGRAPH_CACHE.set(cacheKey, response); // Cache with the new, more specific key
//                     applyRewritesToElement(element, response.rewritten_sentences);
                    
//                     // 标记元素已处理
//                     element.classList.add('genshred-processed');
//                 }
//                 console.log("Received response from background (backend):", response);

//                 const rewrittenSentences = response?.rewritten_sentences;
//                 const error = response?.error;

//                 if (error) {
//                     console.error("Backend processing failed:", error);
//                     chrome.runtime.sendMessage({
//                         type: "TRACK_EVENT",
//                         eventType: "paragraph_processed_error",
//                         eventData: {
//                             paragraphLength: textBlock.length,
//                             userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL],
//                             error: error
//                         }
//                     });
//                     return;
//                 }

//                 if (rewrittenSentences && rewrittenSentences.length > 0) {
//                     console.log("Applying rewrites to element.");

//                     chrome.runtime.sendMessage({
//                         type: "TRACK_EVENT",
//                         eventType: "paragraph_processed_success",
//                         eventData: {
//                             paragraphLength: textBlock.length,
//                             numSentencesRewritten: rewrittenSentences.length,
//                             userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]
//                         }
//                     });
//                 } else {
//                     console.log("No rewritten sentences returned for this element.");
//                     chrome.runtime.sendMessage({
//                         type: "TRACK_EVENT",
//                         eventType: "paragraph_processed_no_rewrite",
//                         eventData: {
//                             paragraphLength: textBlock.length,
//                             userLevel: currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]
//                         }
//                     });
//                 }
//             }
//         );
//     }
// }
async function processParagraphs() {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) {
        console.log("Plugin is turned of");
        return;
    }
    console.log("Processing paragraphs...");
    // Set up intersection observer
    setupIntersectionObserver();
    
    // Select all potential text elements
    const textElements = Array.from(document.querySelectorAll("p, div, span, h1, h2, h3, h4, h5, h6, li, td, th"));
    console.log(`Found ${textElements.length} potential elements to process`);

    let processedCount = 0;
       // Process each visible element immediately and independently
    for (const element of textElements) {
        if (element instanceof HTMLElement && 
            !observedElements.has(element) && 
            isElementVisible(element)) {
            
            console.log("Processing element:", element.textContent?.substring(0, 50) + "...");
            
            // Add to observed set
            observedElements.add(element);

            // Start observing the element
            intersectionObserver?.observe(element);

            // If element is in viewport, process it immediately
            if (isElementInViewport(element)) {
                try {
                    await processElement(element);
                    processedCount++;
                    console.log(`Successfully processed element ${processedCount}`);
                } catch (error) {
                    console.error("Error processing element:", error);
                }
            }
        }
    }

    console.log(`Finished processing. Processed ${processedCount} elements`);
}

// Helper function to escape string for use in RegExp
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 表示整个匹配的字符串
}

// Helper function to escape HTML for attribute values and text content
function escapeHTML(string: string): string {
    return string
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 检查元素是否可见
function isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           element.getBoundingClientRect().height > 0;
}

function applyRewritesToElement(element: Element, rewrites: { original_index: number, rewritten_text: string }[]) {
    if (!rewrites || rewrites.length === 0) return;
    
    // Get original text content
    const originalText = element instanceof HTMLElement ? element.innerText : element.textContent || "";
    const sentences = splitTextIntoSentences(originalText);
    
    // Process each rewrite independently
    rewrites.forEach(rewrite => {
        const originalSentence = sentences[rewrite.original_index];
        if (!originalSentence) return;
        
        // Find existing rewritten span for this sentence
        const existingSpan = Array.from(element.querySelectorAll('.genshred-rewritten'))
            .find(span => span.getAttribute('data-original-text') === originalSentence);
            
        if (existingSpan) return; // Skip if already rewritten
        
        try {
            // Create new span for this sentence
            const span = document.createElement('span');
            span.textContent = rewrite.rewritten_text;
            span.classList.add('genshred-rewritten');
            span.setAttribute('data-original-text', originalSentence);
            
            // Add hover events
            span.addEventListener('mouseover', (e) => {
                showTooltip(originalSentence, e as MouseEvent, span);
            });
            
            span.addEventListener('mouseout', () => {
                hideTooltip();
            });
            
            // Find and replace the original sentence
            replaceTextInElement(element, originalSentence, span);
        } catch (error) {
            console.error('Error applying rewrite:', error);
        }
    });
}

// Helper function to replace text in element
function replaceTextInElement(element: Element, searchText: string, replacement: Node) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    
    while (node = walker.nextNode() as Text) {
        const index = node.textContent?.indexOf(searchText) ?? -1;
        if (index >= 0) {
            const before = node.textContent?.slice(0, index) ?? '';
            const after = node.textContent?.slice(index + searchText.length) ?? '';
            
            const fragment = document.createDocumentFragment();
            if (before) fragment.appendChild(document.createTextNode(before));
            fragment.appendChild(replacement);
            if (after) fragment.appendChild(document.createTextNode(after));
            
            node.parentNode?.replaceChild(fragment, node);
            break;
        }
    }
}
// 使用Range API精确定位和替换文本
function processTextNodesWithRanges(element: Element, sentences: string[], rewritesMap: Map<number, string>) {
    // 创建一个文档范围
    const range = document.createRange();
    const elementText = element.textContent || "";
    
    // 对每个句子进行处理，从后往前处理以避免位置偏移问题
    for (let i = sentences.length - 1; i >= 0; i--) {
        const sentence = sentences[i];
        const rewrittenText = rewritesMap.get(i);
        
        if (!rewrittenText) continue; // 跳过没有改写的句子
        
        // 查找句子在元素文本中的位置
        const sentenceIndex = elementText.indexOf(sentence);
        if (sentenceIndex === -1) continue;
        
        // 设置范围以包含整个句子
        try {
            // 使用文本节点查找器定位句子的开始和结束
            const sentenceRange = findRangeForText(element, sentence, sentenceIndex);
            if (!sentenceRange) continue;

            // 创建替换元素
            const span = document.createElement("span");
            span.textContent = rewrittenText;
            span.classList.add('genshred-rewritten');
            span.setAttribute("data-original-text", sentence);
            
            // 添加鼠标事件监听器，使用全局提示框
            span.addEventListener('mouseover', (e) => {
                showTooltip(sentence, e as MouseEvent, span);
            });
            
            span.addEventListener('mouseout', () => {
                hideTooltip();
            });
            
            // 删除范围内容并插入新元素
            sentenceRange.deleteContents();
            sentenceRange.insertNode(span);
        } catch (e) {
            console.warn(`Failed to create range for sentence: "${sentence.substring(0, 20)}..."`, e);
            throw e; // 重新抛出异常以触发回退方法
        }
    }
}

// 辅助函数：为文本查找Range
function findRangeForText(rootElement: Element, text: string, approximateIndex: number): Range | null {
    // 创建一个文本节点遍历器
    const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        null
    );

    let currentNode: Text | null = walker.nextNode() as Text;
    let currentOffset = 0;
    
    // 遍历所有文本节点
    while (currentNode) {
        const nodeText = currentNode.textContent || "";
        const nodeLength = nodeText.length;
        
        // 如果近似索引在当前节点范围内
        if (approximateIndex >= currentOffset && approximateIndex < currentOffset + nodeLength) {
            // 在节点内查找确切文本
            const nodeTextIndex = nodeText.indexOf(text);
            
            if (nodeTextIndex !== -1) {
                // 创建一个范围
                const range = document.createRange();
                range.setStart(currentNode, nodeTextIndex);
                range.setEnd(currentNode, nodeTextIndex + text.length);
                return range;
            }
        }
        
        // 如果文本跨越多个节点
        if (approximateIndex <= currentOffset + nodeLength) {
            // 尝试查找文本的开头部分
            for (let i = 0; i < nodeLength; i++) {
                const potentialStart = nodeText.substring(i);
                if (text.startsWith(potentialStart)) {
                    // 找到了开头部分，现在寻找剩余部分
                    const remainingText = text.substring(potentialStart.length);
                    const startRange = document.createRange();
                    startRange.setStart(currentNode, i);
                    startRange.setEnd(currentNode, nodeLength);
                    
                    // 继续在后续节点中查找
                    let nextNode = walker.nextNode() as Text;
                    let collectedText = potentialStart;
                    
                    while (nextNode && collectedText.length < text.length) {
                        const nextNodeText = nextNode.textContent || "";
                        collectedText += nextNodeText;
                        
                        if (collectedText.length >= text.length) {
                            // 找到了完整文本
                            const endRange = document.createRange();
                            endRange.setStart(currentNode, i);
                            endRange.setEnd(nextNode, text.length - potentialStart.length);
                            return endRange;
                        }
                        
                        nextNode = walker.nextNode() as Text;
                    }
                }
            }
        }
        
        currentOffset += nodeLength;
        currentNode = walker.nextNode() as Text;
    }
    
    return null;
}

// 使用TreeWalker处理文本节点
function processTextNodesWithTreeWalker(element: Element, sentences: string[], rewritesMap: Map<number, string>) {
    // 创建一个文本节点遍历器
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
    );

    // 收集所有文本节点
    const textNodes: Text[] = [];
    let cumulativeText = "";
    
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        textNodes.push(node);
        cumulativeText += node.textContent || "";
    }

    // 为每个句子找到对应的文本节点和位置
    const nodesToReplace: { node: Text, start: number, end: number, originalText: string, rewrittenText: string }[] = [];
    
    sentences.forEach((sentence, sentenceIndex) => {
        const rewrittenText = rewritesMap.get(sentenceIndex);
        if (!rewrittenText) return; // 跳过没有改写的句子
        
        // 在累积文本中查找句子位置
        const sentenceStart = cumulativeText.indexOf(sentence);
        if (sentenceStart === -1) return;
        
        const sentenceEnd = sentenceStart + sentence.length;
        
        // 找到包含句子的节点
    let currentOffset = 0;
        let sentenceStartNode: Text | null = null;
        let sentenceStartOffset = 0;
        let sentenceEndNode: Text | null = null;
        let sentenceEndOffset = 0;
        
        for (const node of textNodes) {
            const nodeText = node.textContent || "";
                 const nodeLength = nodeText.length;
            const nodeEnd = currentOffset + nodeLength;
            
            // 检查句子是否开始于此节点
            if (sentenceStart >= currentOffset && sentenceStart < nodeEnd) {
                sentenceStartNode = node;
                sentenceStartOffset = sentenceStart - currentOffset;
            }
            
            // 检查句子是否结束于此节点
            if (sentenceEnd > currentOffset && sentenceEnd <= nodeEnd) {
                sentenceEndNode = node;
                sentenceEndOffset = sentenceEnd - currentOffset;
                break;
            }
            
            currentOffset = nodeEnd;
        }
        
        // 如果句子完全包含在一个节点内
        if (sentenceStartNode && sentenceEndNode && sentenceStartNode === sentenceEndNode) {
                         nodesToReplace.push({
                node: sentenceStartNode,
                start: sentenceStartOffset,
                end: sentenceEndOffset,
                originalText: sentence,
                             rewrittenText: rewrittenText
                         });
        } else if (sentenceStartNode && sentenceEndNode) {
            // 句子跨越多个节点，这种情况比较复杂
            // 为简单起见，我们使用innerHTML替换整个句子
            console.warn("Sentence spans multiple nodes, using innerHTML fallback for:", sentence);
            throw new Error("Multi-node sentence requires innerHTML fallback");
         }
    });

    // 对收集到的节点应用替换，从后往前处理以避免位置偏移问题
    nodesToReplace.sort((a, b) => {
        if (a.node === b.node) {
            return b.start - a.start;
        }
        return b.node.compareDocumentPosition(a.node) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
    });

    nodesToReplace.forEach(({ node, start, end, originalText, rewrittenText }) => {
        const nodeText = node.textContent || "";
        const before = nodeText.substring(0, start);
        const after = nodeText.substring(end);
        
        // 创建文档片段
        const fragment = document.createDocumentFragment();
        
        // 添加前部分文本
        if (before) {
            fragment.appendChild(document.createTextNode(before));
        }
        
        // 添加改写的span元素
    const span = document.createElement("span");
    span.textContent = rewrittenText;
    span.classList.add('genshred-rewritten');
        span.setAttribute("data-original-text", originalText);
        
        // 添加鼠标事件监听器，使用全局提示框
        span.addEventListener('mouseover', (e) => {
            showTooltip(originalText, e as MouseEvent, span);
        });
        
        span.addEventListener('mouseout', () => {
            hideTooltip();
        });
        
        fragment.appendChild(span);
        
        // 添加后部分文本
        if (after) {
            fragment.appendChild(document.createTextNode(after));
        }
        
        // 替换原始节点
        node.parentNode?.replaceChild(fragment, node);
});
}

// 最后的回退方法：使用innerHTML替换
function processWithInnerHTML(element: Element, sentences: string[], rewritesMap: Map<number, string>) {
    let html = element.innerHTML;
    
    // 从最长的句子开始处理，以避免部分匹配问题
    const sentencesWithIndex = sentences.map((sentence, index) => ({ sentence, index }));
    sentencesWithIndex.sort((a, b) => b.sentence.length - a.sentence.length);
    
    for (const { sentence, index } of sentencesWithIndex) {
        const rewrittenText = rewritesMap.get(index);
        if (!rewrittenText) continue;
        
        // 转义特殊字符
        const escapedSentence = escapeRegExp(escapeHTML(sentence));
        const escapedRewritten = escapeHTML(rewrittenText);
        
        // 创建替换HTML
        const replacement = `<span class="genshred-rewritten" data-original-text="${escapeHTML(sentence)}" onmouseover="(function(e){window.dispatchEvent(new CustomEvent('genshred-tooltip-show', {detail:{text:'${escapeHTML(sentence)}',event:e,element:this}}));})(event)" onmouseout="window.dispatchEvent(new CustomEvent('genshred-tooltip-hide'))">${escapedRewritten}</span>`;

        // 替换HTML中的句子
        html = html.replace(new RegExp(escapedSentence, 'g'), replacement);
    }
    
    element.innerHTML = html;
    
    // 为innerHTML方法添加的元素绑定事件
    document.addEventListener('genshred-tooltip-show', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        showTooltip(detail.text, detail.event, detail.element);
    });
    
    document.addEventListener('genshred-tooltip-hide', () => {
        hideTooltip();
    });
}

// 更健壮的句子分割方法
function splitTextIntoSentences(text: string): string[] {
    // 基本的句子分割正则表达式
    const basicSentenceRegex = /[^.!?]+[.!?]+/g;
    
    // 处理特殊情况的更复杂正则表达式
    // 例如：处理引号内的句子、缩写词中的句号等
    const complexSentenceRegex = /[^.!?]*(?:"[^"]*"[^.!?]*)*[.!?]+/g;
    
    let sentences: string[] = [];
    let match;
    
    // 尝试使用复杂正则表达式
    while ((match = complexSentenceRegex.exec(text)) !== null) {
        sentences.push(match[0].trim());
    }
    
    // 如果复杂正则表达式没有找到任何句子，回退到基本正则表达式
    if (sentences.length === 0) {
        while ((match = basicSentenceRegex.exec(text)) !== null) {
            sentences.push(match[0].trim());
        }
    }
    
    // 如果仍然没有找到句子，将整个文本作为一个句子
    if (sentences.length === 0 && text.trim()) {
        sentences.push(text.trim());
    }
    
    return sentences;
}

// Restore original text logic (updated for data-original-text)
function restoreOriginalText() {
  // 隐藏提示框
  hideTooltip();
  
  // 查找所有已改写的元素
  const modifiedSpans = document.querySelectorAll("span.genshred-rewritten[data-original-text], span[data-original]");
  modifiedSpans.forEach((span) => {
    // 尝试获取原始文本
    const original = span.getAttribute("data-original-text") || span.getAttribute("data-original");
    if (original) {
      const textNode = document.createTextNode(original);
      // 替换span为文本节点
      span.parentNode?.replaceChild(textNode, span);
    }
  });
  
  // 移除所有已处理标记
  document.querySelectorAll('.genshred-processed').forEach(el => {
    el.classList.remove('genshred-processed');
  });
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    // NEW: Handle syncing all settings from popup on load (update to also sync mappings)
    if (message.type === "SYNC_SETTINGS") {
        console.log("Content script received SYNC_SETTINGS message.");
        const settings = message.settings;
        currentSettings = { ...currentSettings, ...settings };
        // Also update mappings if they were synced (though storage.onChanged is primary for this)
        // This SYNC_SETTINGS might be expanded if you decide to send mappings from popup.
        console.log("Synced settings:", currentSettings);

        restoreOriginalText();
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs();
        }
        return false;
    }

    // ... (existing TOGGLE_PLUGIN, SET_REWRITE_COUNT, SET_DIFFICULTY) ...
    // These will mostly be handled by storage.onChanged now.

    // NEW: Handle CLEAR_CACHE message (as discussed previously)
    if (message.type === "CLEAR_CACHE") {
        console.log("Content script received CLEAR_CACHE message. Clearing cache.");
        PARAGRAPH_CACHE.clear(); // Clear the cache
        restoreOriginalText(); // Revert any changes on the page
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs(); // Re-process the page with current settings
        }
        return false; // No async response needed
    }

    return false;
});