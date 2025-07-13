// content.ts
import './content.css';
import { SERVER_URL } from "./config";

interface ProcessResponse {
    error?: string;
    rewritten_sentences?: Array<{
        original_text: string;
        rewritten_text: string;
        original_index: number;
    }>;
}
const PROCESSING_DELAY = 1000; // 1 second delay between processing requests
// const PARAGRAPH_CACHE = new Map<string, any>(); // Cache for processed paragraphs not yet effective 未实装
const MIN_PARAGRAPH_LENGTH = 100; // Minimum characters to process
const MAX_PARAGRAPH_LENGTH = 5000; // Maximum characters to process
// lazyloading
let intersectionObserver: IntersectionObserver | null = null;
const observedElements = new WeakSet<Element>();
// Define keys for storage (should match popup.tsx)

async function processElement(element: HTMLElement) {
    console.log("Attempting to process element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
    try {
        if (!currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Skipping element: Plugin is OFF.");
            return;
        }
        if (element.classList.contains('genshred-processed')) {
            console.log("Skipping element: Already processed.");
            return;
        }
        if (element.classList.contains('genshred-processing')) {
            console.log("Skipping element: Already processing.");
            return;
        }
        if (element.closest('.genshred-rewrite-container')) {
            console.log("Skipping element: Part of a rewritten block.");
            return;
        }
        if (element.closest('.genshred-tooltip-container')) {
            console.log("Skipping element: Part of the tooltip.");
            return;
        }

        // Helper function to extract all text nodes and their offsets from an element
        function getTextNodesWithOffsets(root: Node): { fullText: string, mappings: Array<{ node: Text, start: number, end: number }> } {
            let fullText = "";
            const mappings: Array<{ node: Text, start: number, end: number }> = [];
            let currentOffset = 0;

            function traverse(node: Node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = (node as Text).nodeValue || "";
                    if (text.trim().length > 0) {
                        const start = currentOffset;
                        fullText += text;
                        currentOffset += text.length;
                        mappings.push({ node: node as Text, start, end: currentOffset });
                    } else {
                        // Even if whitespace, still increment offset for accurate mapping
                        currentOffset += text.length;
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                   const element = node as HTMLElement;
                   // Skip script, style, and hidden elements from text extraction
                   if (element.tagName === 'SCRIPT' || 
                       element.tagName === 'STYLE' || 
                       element.tagName === 'NOSCRIPT' ||
                       element.tagName === 'META' ||
                       element.tagName === 'LINK' ||
                       element.tagName === 'HEAD' ||
                       element.tagName === 'IFRAME' || // Iframes handled separately but should be skipped for text content
                       !isElementVisible(element)) { // Reuse your existing visibility check
                       return; 
                   }
                    for (const child of Array.from(node.childNodes)) {
                        traverse(child);
                    }
                }
            }

            traverse(root);
            return { fullText, mappings };
        }

        const { fullText: textBlock, mappings: textNodeMappings } = getTextNodesWithOffsets(element);
        console.log("Extracted text block from element:", textBlock.substring(0, 200) + "...");
        console.log("Text block length:", textBlock.length);

        // Check for minimum and maximum paragraph length early
        if (textBlock.length < MIN_PARAGRAPH_LENGTH) {
            console.log(`Text block too short (${textBlock.length} chars), skipping. Min: ${MIN_PARAGRAPH_LENGTH}`);
            return;
        }
        if (textBlock.length > MAX_PARAGRAPH_LENGTH) {
            console.log(`Text block too long (${textBlock.length} chars), skipping. Max: ${MAX_PARAGRAPH_LENGTH}`);
            return;
        }
        
        console.log("Processing text block:", textBlock.substring(0, 50) + "...");

        // Mark as processing to prevent duplicate processing
        element.classList.add('genshred-processing');

        const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
        const effectivePromptInstruction = currentDifficultyMappings[selectedDifficulty] || "";
        const effectiveCustomPromptTemplate = currentSettings[STORAGE_KEYS.CUSTOM_PROMPT];
        
        console.log("Using difficulty:", selectedDifficulty);
        console.log("Using prompt instruction:", effectivePromptInstruction);

        // Create a unique hash for the cache key to handle long text blocks
        const textHash = await sha256(textBlock);
        const cacheKey = `genshred_cache_${textHash}_${selectedDifficulty}_${effectiveCustomPromptTemplate || 'no_custom_prompt'}_${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`;

        const cachedData = await chrome.storage.local.get(cacheKey);
        console.log("Checking cache for key:", cacheKey);
        console.log("Cached data retrieved:", cachedData);

        if (cachedData[cacheKey]) {
            console.log("Using cached response from chrome.storage.local for element:", textBlock.substring(0, 50) + "...");
            const { processedSentences, allOriginalSentences } = cachedData[cacheKey];
            applyRewritesToElement(element, processedSentences, allOriginalSentences, textNodeMappings);
            element.classList.add('genshred-processed');
            element.classList.remove('genshred-processing');
            return;
        }

        // Process text in chunks
        
        // Request sentence splitting from background script
        const splitResponse = await chrome.runtime.sendMessage({
            type: "SPLIT_SENTENCES",
            text: textBlock
        });

        if (splitResponse === undefined || splitResponse === null || splitResponse.error) {
            console.error("Error splitting sentences via background script:", splitResponse?.error || "No response or unknown error");
            return; // Stop processing if sentence splitting fails
        }
        const sentences = splitResponse.sentences;
        console.log(`Split text into ${sentences.length} sentences:`, sentences);

        const sentencesWithOriginalData = sentences.map((sentence, index) => ({
            sentence,
            index,
            startIndex: textBlock.indexOf(sentence), // Track original position
            complexity: calculateComplexityScore(sentence)
        }));

        console.log("Sentences with calculated complexity scores:", sentencesWithOriginalData);

        // Calculate number of sentences to rewrite based on percentage
        const percentageToRewrite = Number(currentSettings[STORAGE_KEYS.SENTENCE_COUNT]); // This is now a percentage (0-100)
        const numSentencesToRewrite = Math.round(sentences.length * (percentageToRewrite / 100));

        const selectedSentences = selectSentences(
            sentencesWithOriginalData,
            numSentencesToRewrite
        );
        console.log(`Selected ${selectedSentences.length} sentences for rewriting:`, selectedSentences);

        // // Calculate complexity scores
        //  const sentencesWithScores = sentences.map((sentence, index) => ({
        //     sentence,
        //     index,
        //     complexity: calculateComplexityScore(sentence)
        // }));

        // // Select most complex sentences
        // const numSentencesToRewrite = Math.min(
        //     Number(currentSettings[STORAGE_KEYS.SENTENCE_COUNT]), 
        //     sentencesWithScores.length
        // );
        // const selectedSentences = selectSentences(sentencesWithScores, numSentencesToRewrite);

        // Process each selected sentence separately
        const processedSentences: Array<{
            original_text: string;
            rewritten_text: string;
            original_index: number;
            start_position: number;
        }> = [];

        for (const { sentence, index, startIndex } of selectedSentences) {
            const result = await new Promise<ProcessResponse>((resolve) => {
                // Determine which prompt to use based on difficulty level
                // let promptToUse = selectedDifficulty === "Custom_1" 
                //     ? effectiveCustomPromptTemplate 
                //     : effectivePromptInstruction;
                let promptToUse = effectivePromptInstruction; // Use the mapped instruction
                chrome.runtime.sendMessage(
                    {
                        type: "PROCESS_TEXT_BLOCK",
                        textBlock: sentence,
                        numSentences: 1,
                        promptInstruction: promptToUse,  // Use the correctly selected prompt
                        customPromptTemplate: effectiveCustomPromptTemplate,
                        userLevel: selectedDifficulty,
                        originalIndex: index
                    },
                    (response) => resolve(response)
                );
            });

            if (result?.rewritten_sentences?.[0]) {
                processedSentences.push({
                    original_text: sentence,
                    rewritten_text: result.rewritten_sentences[0].rewritten_text,
                    original_index: index,
                    start_position: startIndex // Add position information
                });
            }
        }

        // Sort by position before applying
        processedSentences.sort((a, b) => a.start_position - b.start_position);


        if (processedSentences.length > 0) {
            // Store the processed sentences and all original sentences in cache
            console.log("Storing processed sentences in chrome.storage.local for cacheKey:", cacheKey);
            await chrome.storage.local.set({ [cacheKey]: { processedSentences, allOriginalSentences: sentences } });
            applyRewritesToElement(element, processedSentences, sentences, textNodeMappings); // Pass all original sentences and mappings
            element.classList.add('genshred-processed');
        }
    } catch (error) {
        console.error("Error in processElement:", error);
        element.classList.remove('genshred-processing');
    }
}
// Helper function to calculate complexity score
function calculateComplexityScore(sentence: string): number {
    const words = sentence.split(/\s+/).filter(word => word.length > 0);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length || 0;
    return words.length * 0.3 + avgWordLength * 0.7;
}

// Helper function to select sentences based on complexity
function selectSentences(sentencesWithScores: { sentence: string, index: number, complexity: number, startIndex: number }[], count: number): { sentence: string, index: number, complexity: number, startIndex: number }[] {
    const sortedSentences = sentencesWithScores.sort((a, b) => b.complexity - a.complexity);
    return sortedSentences.slice(0, count);
}

const STORAGE_KEYS = {
    IS_ON: 'genShredPluginState',
    SENTENCE_COUNT: 'genShredSentenceCount',
    DIFFICULTY_LEVEL: 'genShredDifficultyLevel',
    CUSTOM_PROMPT: 'genShredCustomPromptTemplate' // Assuming you'll add this later
};

// NEW: Use the consistent default for CUSTOM_PROMPT
// const CUSTOM_PROMPT_DEFAULT = "Rewrite the following sentence(s) for a user with language level {user_level}. Simplify vocabulary and sentence structure if necessary, while retaining the original meaning:\n\n{sentences_to_rewrite}";
const DEFAULT_SETTINGS = {
  [STORAGE_KEYS.IS_ON]: true,
  [STORAGE_KEYS.SENTENCE_COUNT]: 50, // Default to 50% of sentences
  [STORAGE_KEYS.DIFFICULTY_LEVEL]: 'Normal',
//   [STORAGE_KEYS.CUSTOM_PROMPT]: CUSTOM_PROMPT_DEFAULT // Use the consistent default
};

// Variables to hold current settings state in content script
let currentSettings = { ...DEFAULT_SETTINGS };
// NEW: Store the loaded difficulty mappings and custom prompts
let currentDifficultyMappings: { [key: string]: string } = {
    "Easy": "Simplify vocabulary and sentence structure for a beginner (A2 CEFR level).",
    "Normal": "Rewrite for an intermediate English speaker (B2 CEFR level). Use clear and concise language.",
    "Hard": "Rewrite for an advanced English speaker (C1 CEFR level). Use sophisticated vocabulary while maintaining clarity.",
};

// NEW: Store custom prompts loaded from storage
let currentCustomPrompts: Array<{ id: string; name: string; prompt: string }> = [];

// NEW: State for manual select mode
let manualSelectModeEnabled = false;

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

// 加载动画
// NEW: Function to create a loading spinner element
function createLoadingSpinner(): HTMLElement {
    const spinner = document.createElement('span');
    spinner.className = 'genshred-loading-spinner';
    spinner.title = 'Processing...'; // Tooltip for accessibility
    return spinner;
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
        'genShredDifficultyMapping', // Load the new mapping key
        'genShredCustomPrompts', // Load custom prompts
        'genShredManualSelect' // Load manual select mode
    ]);

    // Update currentSettings with loaded values, falling back to defaults
    currentSettings = {
        [STORAGE_KEYS.IS_ON]: storedSettings[STORAGE_KEYS.IS_ON] ?? DEFAULT_SETTINGS[STORAGE_KEYS.IS_ON],
        [STORAGE_KEYS.SENTENCE_COUNT]: storedSettings[STORAGE_KEYS.SENTENCE_COUNT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.SENTENCE_COUNT],
        [STORAGE_KEYS.DIFFICULTY_LEVEL]: storedSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] ?? DEFAULT_SETTINGS[STORAGE_KEYS.DIFFICULTY_LEVEL],
        // [STORAGE_KEYS.CUSTOM_PROMPT]: storedSettings[STORAGE_KEYS.CUSTOM_PROMPT] ?? DEFAULT_SETTINGS[STORAGE_KEYS.CUSTOM_PROMPT],
    };

    // Update difficulty mappings
    currentDifficultyMappings = storedSettings['genShredDifficultyMapping'] ?? currentDifficultyMappings;
    // NEW: Update custom prompts
    currentCustomPrompts = storedSettings['genShredCustomPrompts'] ?? [];
    // NEW: Load manual select mode state
    manualSelectModeEnabled = storedSettings['genShredManualSelect'] ?? false;

    console.log("Settings loaded:", currentSettings);
    console.log("Difficulty mappings loaded:", currentDifficultyMappings);
    console.log("Custom prompts loaded:", currentCustomPrompts);
    console.log("Manual select mode enabled:", manualSelectModeEnabled);

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
            // else if (key === STORAGE_KEYS.CUSTOM_PROMPT) {
            //     currentSettings[STORAGE_KEYS.CUSTOM_PROMPT] = changes[key].newValue;
            //     settingsChanged = true;
            //     console.log(`Custom prompt template changed`);
            // }
            else if (key === 'genShredDifficultyMapping') {
                currentDifficultyMappings = changes[key].newValue;
                settingsChanged = true;
                console.log(`Difficulty mappings updated:`, currentDifficultyMappings);
              }
            // NEW: Handle custom prompts storage change
            else if (key === 'genShredCustomPrompts') {
                currentCustomPrompts = changes[key].newValue;
                settingsChanged = true;
                console.log(`Custom prompts updated:`, currentCustomPrompts);
            }
            // NEW: Handle manual select mode storage change
            else if (key === 'genShredManualSelect') {
                manualSelectModeEnabled = changes[key].newValue;
                console.log(`Manual select mode changed to: ${manualSelectModeEnabled}`);
                // No need to re-process paragraphs here, as it's a mode toggle
                // We might need to hide/show the button based on this, handled by listeners
              }
          }

        // If any relevant settings changed and plugin is on, reprocess paragraphs
        if (settingsChanged && currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Settings changed, reprocessing paragraphs...");
            // Clear cache to ensure new settings are applied
            // PARAGRAPH_CACHE.clear(); // This line is removed as per the new_code
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
    
    // Consider element visible if:
    // 1. Any part of it is in viewport (with buffer)
    // 2. Or if it's very tall (longer than viewport), process it when top enters view
    const isPartiallyVisible = (
        (rect.top < (windowHeight + buffer) && rect.bottom > -buffer) && // Vertical visibility
        (rect.left >= -buffer && rect.right <= (windowWidth + buffer))   // Horizontal visibility
    );

    const isTallElement = rect.height > windowHeight * 1.5; // Element is taller than 1.5 viewport heights
    const isTallElementEnteringView = isTallElement && rect.top < (windowHeight / 2); // Top half entering view

    return isPartiallyVisible || isTallElementEnteringView;
}

function setupIntersectionObserver() {
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver(
        async (entries) => {
            for (const entry of entries) {
                const element = entry.target as HTMLElement;
                
                // Skip if plugin is off or element is already processed
                if (!currentSettings[STORAGE_KEYS.IS_ON] || 
                    element.classList.contains('genshred-processed') ||
                    element.classList.contains('genshred-processing')) {
                    continue;
                }

                // Process if element is entering viewport
                if (entry.isIntersecting) {
                    try {
                        await processElement(element);
                    } catch (error) {
                        console.error("Error processing element:", error);
                        element.classList.remove('genshred-processing');
                    }
                }
            }
        },
        {
            rootMargin: '500px 0px',
            threshold: [0, 0.1]
        }
    );

    // Add scroll event listener for dynamic content
    const handleScroll = debounce(() => {
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs();
        }
    }, 200);

    // Remove existing listener if any
    window.removeEventListener('scroll', handleScroll);
    // Add new scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
}

async function processParagraphs() {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) {
        console.log("Plugin is turned off");
        return;
    }
    console.log("Processing paragraphs...");
    
    // Select all potential text elements
    const textElements = Array.from(document.querySelectorAll("p, div, span, h1, h2, h3, h4, h5, h6, li, td, th"))
        .filter(element => {
            const trimmedTextLength = element.textContent?.trim().length || 0;
            // Logging for debugging filter conditions
            if (!(element instanceof HTMLElement)) {
                // console.log("Filtering out non-HTMLElement:", element);
                return false;
            }
            if (element.classList.contains('genshred-processed')) {
                // console.log("Filtering out already processed element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (element.classList.contains('genshred-processing')) {
                // console.log("Filtering out element currently processing:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (element.closest('.genshred-rewrite-container')) {
                // console.log("Filtering out element part of rewrite container:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (element.closest('.genshred-tooltip-container')) {
                // console.log("Filtering out element part of tooltip container:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (observedElements.has(element)) {
                // console.log("Filtering out already observed element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (trimmedTextLength < MIN_PARAGRAPH_LENGTH) {
                console.log(`Filtering out element due to short text length (${trimmedTextLength} chars):`, element.nodeName, element.textContent?.substring(0, 50) + "...");
                if (element instanceof HTMLElement) { // Ensure it's an HTMLElement before adding class
                    element.classList.add('genshred-processed');
                }
                return false;
            }
            if (trimmedTextLength > MAX_PARAGRAPH_LENGTH) {
                console.log(`Filtering out element due to long text length (${trimmedTextLength} chars):`, element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }

            // NEW: Additional filtering for elements that are likely not human-readable content
            const tagName = element.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON') {
                // console.log("Filtering out form control element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            if (element.isContentEditable) {
                // console.log("Filtering out contenteditable element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            // Elements inside SVG or Canvas are usually graphical or programmatically generated
            if (element.closest('svg') || element.closest('canvas')) {
                // console.log("Filtering out element inside SVG/Canvas:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }
            // Heuristic: check if the text contains very few alphabetic characters, indicating it might be code or symbols
            const alphabeticCharCount = (element.textContent?.match(/[a-zA-Z]/g) || []).length;
            const totalCharCount = element.textContent?.length || 0;
            // If it's a short string (e.g., < 20 chars) and less than 30% alphabetic, likely not natural language
            if (totalCharCount > 0 && totalCharCount < 50 && (alphabeticCharCount / totalCharCount < 0.3)) {
                // console.log("Filtering out element due to low alphabetic char count:", element.nodeName, element.textContent?.substring(0, 50) + "...");
                return false;
            }

            return true;
        });

    console.log(`Found ${textElements.length} new elements to process after initial filtering.`);

    // Set up intersection observer if not already set up
    if (!intersectionObserver) {
        setupIntersectionObserver();
    }

    // Process elements and observe them
    for (const element of textElements) {
        if (element instanceof HTMLElement) {
            observedElements.add(element);
            intersectionObserver?.observe(element);
            
            // If element is already in viewport, process it immediately
            if (isElementInViewport(element)) {
                try {
                    await processElement(element);
                } catch (error) {
                    console.error("Error processing element:", error);
                    element.classList.remove('genshred-processing');
                }
            }
        }
    }
}


// Helper function to escape string for use in RegExp
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 表示整个匹配的字符串
}

// 检查元素是否可见
function isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           element.getBoundingClientRect().height > 0;
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

/**
 * Helper function to create the rewrite container span with its children and event listeners.
 */
function createRewriteSpan(originalText: string, rewrittenText: string): HTMLSpanElement {
    const containerSpan = document.createElement('span');
    containerSpan.className = 'genshred-rewrite-container';
    containerSpan.setAttribute('data-original-text', escapeHTML(originalText));

    const rewrittenSpan = document.createElement('span');
    rewrittenSpan.className = 'genshred-rewritten';
    rewrittenSpan.textContent = rewrittenText;

    const originalHiddenSpan = document.createElement('span');
    originalHiddenSpan.className = 'genshred-original-hidden';
    originalHiddenSpan.textContent = originalText;

    containerSpan.appendChild(rewrittenSpan);
    containerSpan.appendChild(originalHiddenSpan);
    
    // Add event listeners
    containerSpan.addEventListener('mouseover', (e) => {
        showTooltip(originalText, e as MouseEvent, containerSpan);
    });
    containerSpan.addEventListener('mouseout', () => {
                hideTooltip();
            });
    containerSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (rewrittenSpan.style.display !== 'none') {
            rewrittenSpan.style.display = 'none';
            originalHiddenSpan.style.display = 'inline';
        } else {
            rewrittenSpan.style.display = 'inline';
            originalHiddenSpan.style.display = 'none';
        }
    });

    return containerSpan;
}

// Function to apply rewrites to an element by manipulating text nodes directly
function applyRewritesToElement(
    element: HTMLElement,
    rewrites: Array<{
        original_text: string;
        rewritten_text: string;
        original_index: number;
        start_position: number;
    }>,
    allOriginalSentences: string[], // Still useful for context, but not for direct DOM mapping
    textNodeMappings: Array<{ node: Text, start: number, end: number }>
) {
    if (!rewrites || rewrites.length === 0) {
        element.classList.add('genshred-processed');
        element.classList.remove('genshred-processing');
        return; // Nothing to rewrite
    }

    // Sort rewrites by their start position to process them sequentially
    rewrites.sort((a, b) => a.start_position - b.start_position);

    // Create a map for quick lookup of rewritten sentences based on their original_index
    const rewrittenContentByIndex = new Map<number, { original_text: string, rewritten_text: string, start_position: number }>();
    rewrites.forEach(r => rewrittenContentByIndex.set(r.original_index, r));

    // Iterate through textNodeMappings in reverse order to safely perform splits and replacements.
    // This way, changes to child nodes don't affect indices of nodes yet to be processed.
    for (let i = textNodeMappings.length - 1; i >= 0; i--) {
        const { node: originalTextNode, start: nodeStartInFullText, end: nodeEndInFullText } = textNodeMappings[i];
        let currentTextNode = originalTextNode; // This reference will change if splitText is called
        
        // Track the current offset within the *original full text block* that `currentTextNode` represents
        let currentTextNodeAbsStart = nodeStartInFullText;

        // Iterate through rewrites that overlap with this text node, from newest to oldest within this node
        // (to handle overlapping rewrites correctly with splitText from right to left)
        const overlappingRewrites = rewrites.filter(rewrite =>
            rewrite.start_position < nodeEndInFullText && 
            rewrite.start_position + rewrite.original_text.length > nodeStartInFullText
        ).sort((a, b) => (b.start_position + b.original_text.length) - (a.start_position + a.original_text.length)); // Sort by end position descending

        for (const rewrite of overlappingRewrites) {
            const rewriteStartInFullText = rewrite.start_position;
            const rewriteEndInFullText = rewriteStartInFullText + rewrite.original_text.length;

            // Calculate the overlap segment within the current `currentTextNode`'s content
            const overlapStartAbs = Math.max(currentTextNodeAbsStart, rewriteStartInFullText);
            const overlapEndAbs = Math.min(currentTextNodeAbsStart + (currentTextNode.textContent?.length || 0), rewriteEndInFullText);

            if (overlapStartAbs >= overlapEndAbs) {
                // No overlap, or already processed part
                continue;
            }

            // Calculate split points relative to the `currentTextNode`'s current content
            const splitStartOffsetInNode = overlapStartAbs - currentTextNodeAbsStart;
            const splitEndOffsetInNode = overlapEndAbs - currentTextNodeAbsStart;

            // Split the node: [before_overlap_text][overlap_text][after_overlap_text]
            let afterOverlapNode: Text | null = null;
            if (splitEndOffsetInNode < (currentTextNode.textContent?.length || 0)) {
                afterOverlapNode = currentTextNode.splitText(splitEndOffsetInNode);
            }
            
            let overlapNode: Text = currentTextNode;
            if (splitStartOffsetInNode > 0) {
                overlapNode = currentTextNode.splitText(splitStartOffsetInNode);
            }

            // Create the rewrite span element for the overlapping part
            const rewriteSpan = createRewriteSpan(rewrite.original_text, rewrite.rewritten_text);

            // Replace the `overlapNode` (which is the actual Text node containing the rewrite) with the span
            if (overlapNode.parentNode) {
                overlapNode.parentNode.replaceChild(rewriteSpan, overlapNode);
            }
            
            // The `currentTextNode` for the next iteration is now the `afterOverlapNode`
            // If `afterOverlapNode` is null, it means the rewrite extended to the end of `currentTextNode`.
            if (afterOverlapNode) {
                currentTextNode = afterOverlapNode;
                currentTextNodeAbsStart = overlapEndAbs; // Update the absolute start position for the remaining part
                    } else {
                // The current Text node was fully consumed or no `afterOverlapNode` was created.
                // We should break from the inner loop and continue with the next original `textNodeMappings` entry.
                // Set currentTextNode to null to signify it's processed for this rewrite loop.
                currentTextNode = null;
                break;
            }
        }
    }

    // Mark the original element as processed
    element.classList.add('genshred-processed');
    element.classList.remove('genshred-processing');
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

    // NEW: Handle SET_DIFFICULTY message from popup, which now sends promptInstruction
    if (message.type === "SET_DIFFICULTY") {
        currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] = message.difficulty; // Update stored difficulty level
        // The promptInstruction is now directly sent from popup
        // We don't need to look it up in currentDifficultyMappings or currentCustomPrompts here
        // as popup has already determined the correct instruction.
        console.log(`Difficulty level changed to: ${currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL]} and prompt instruction updated.`);
        restoreOriginalText();
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs();
        }
        return false;
    }

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
        restoreOriginalText(); // Revert any changes on the page
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
        rewriteButton.addEventListener('click', handleRewriteSelectedText);
        document.body.appendChild(rewriteButton);
    }
    rewriteButton.style.display = 'block';
    rewriteButton.style.left = `${x}px`;
    rewriteButton.style.top = `${y}px`;
}

function hideRewriteButton() {
    if (rewriteButton) {
        rewriteButton.style.display = 'none';
    }
    currentSelectionRange = null; // Clear selection range when button is hidden
}

async function handleRewriteSelectedText() {
    if (!currentSelectionRange) return;

    const selectedText = currentSelectionRange.toString().trim();
    if (selectedText.length === 0) return;

    console.log("Rewriting selected text:", selectedText);
    hideRewriteButton(); // Hide button immediately

    // You might want to show a loading spinner here
    // For now, let's send it to the background script
    try {
        const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
        const effectivePromptInstruction = currentDifficultyMappings[selectedDifficulty] || "";
        // If selected difficulty is a custom prompt, get its instruction from currentCustomPrompts
        const customPrompt = currentCustomPrompts.find(cp => cp.id === selectedDifficulty);
        const finalPromptInstruction = customPrompt ? customPrompt.prompt : effectivePromptInstruction;

        const response = await chrome.runtime.sendMessage({
            type: "PROCESS_TEXT_BLOCK",
            textBlock: selectedText,
            numSentences: 1, // Always rewrite as a single block for manual selection
            promptInstruction: finalPromptInstruction,
            customPromptTemplate: customPrompt?.prompt || "", // Pass custom prompt if applicable
            userLevel: selectedDifficulty,
        });

        if (response?.rewritten_sentences?.[0]) {
            const rewrittenText = response.rewritten_sentences[0].rewritten_text;
            console.log("Rewritten text:", rewrittenText);
            // Replace the selected text in the DOM
            // This is a simplified replacement. A more robust solution might involve DOM range manipulation.
            replaceSelectionWithRewrittenText(currentSelectionRange, rewrittenText, selectedText);
        } else if (response?.error) {
            console.error("Error rewriting selected text:", response.error);
            alert(`Error rewriting text: ${response.error}`);
        } else {
            console.warn("No rewritten text received.");
            alert("Could not rewrite text. No response from AI.");
        }
    } catch (error) {
        console.error("Error during manual text rewrite:", error);
        alert("An unexpected error occurred during rewriting.");
    }
}

function handleTextSelection(event: MouseEvent) {
    const selection = window.getSelection();
    if (manualSelectModeEnabled && selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        // Only show button if text length is reasonable and not within existing Genshred elements
        if (selectedText.length > 0 && selectedText.length < MAX_PARAGRAPH_LENGTH &&
            !range.commonAncestorContainer.parentElement?.closest('.genshred-rewrite-container') &&
            !range.commonAncestorContainer.parentElement?.closest('.genshred-tooltip-container'))
        {
            currentSelectionRange = range; // Store the range
            const rect = range.getBoundingClientRect();
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
    // Create a new span element for the rewritten text
    const rewrittenSpan = document.createElement('span');
    rewrittenSpan.className = 'genshred-rewritten';
    rewrittenSpan.textContent = rewrittenText;

    // Create a hidden span for the original text
    const originalHiddenSpan = document.createElement('span');
    originalHiddenSpan.className = 'genshred-original-hidden';
    originalHiddenSpan.textContent = originalText;

    // Create a container for both (for toggling and tooltip)
    const containerSpan = document.createElement('span');
    containerSpan.className = 'genshred-rewrite-container';
    containerSpan.setAttribute('data-original-text', originalText);
    containerSpan.appendChild(rewrittenSpan);
    containerSpan.appendChild(originalHiddenSpan);

    // Add event listeners for toggling and tooltip
    containerSpan.addEventListener('mouseover', (e) => {
        showTooltip(originalText, e as MouseEvent, containerSpan);
    });
    containerSpan.addEventListener('mouseout', () => {
        hideTooltip();
    });
    containerSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (rewrittenSpan.style.display !== 'none') {
            rewrittenSpan.style.display = 'none';
            originalHiddenSpan.style.display = 'inline';
        } else {
            rewrittenSpan.style.display = 'inline';
            originalHiddenSpan.style.display = 'none';
        }
    });

    // Delete the currently selected content and insert the new container
    range.deleteContents();
    range.insertNode(containerSpan);

    // Clear selection after replacement
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
    }
}

// Helper function to generate SHA256 hash
async function sha256(message: string): Promise<string> {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hexHash;
}