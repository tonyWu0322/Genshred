import { processElement } from './api-helpers';
import { STORAGE_KEYS, MAX_PARAGRAPH_LENGTH,MIN_PARAGRAPH_LENGTH, MIN_CHINESE_PARAGRAPH_LENGTH } from '~src/constants';
import { currentSettings } from './state-management';
import { debounce, isChineseText, isMeaningfulChineseText, shouldSkipChineseElement, getChineseTextRatio } from './utilities';
import { isElementVisible, isElementInViewport } from './dom-utilities';
import * as log from './logger';
// 添加MutationObserver来监听DOM变化 **注意添加动画后亦会触发**
let mutationObserver: MutationObserver | null = null;
// Define the variables here, scoped to this module
let intersectionObserver: IntersectionObserver | null = null;
const observedElements = new WeakSet<Element>();
let isObserving = true;
let isProcessing = false;
let elementQueue: HTMLElement[]=[];
let isProcessingQueue = false;
// Function to start processing the queue
async function processQueue() {
    if (isProcessingQueue) {
        return;
    }
    isProcessingQueue = true;

    while (elementQueue.length > 0) {
        const element = elementQueue.shift();
        if (element) {
            await processElement(element);
        }
    }
    
    isProcessingQueue = false;
}
// In your MutationObserver and IntersectionObserver callbacks:
// Instead of calling processElement directly, add to the queue.
function handleFoundElement(element: HTMLElement) {
    if (!elementQueue.includes(element) && !element.classList.contains('genshred-processed')) {
        elementQueue.push(element);
        processQueue(); // Start or continue processing
    }
}

function startObservingDOMChanges() {
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // 创建一个防抖版本的processParagraphs
    const debouncedProcessParagraphs = debounce(processParagraphs, 500);
    
    // 创建MutationObserver实例
    mutationObserver = new MutationObserver((mutations) => {
        if (isObserving){
            return;
        }
        let shouldProcess = false;
        
        // 检查是否有相关变化需要处理
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of Array.from(mutation.addedNodes)) {
                    // Check if the added node is a child of an element we're currently processing
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node as Element).closest('.genshred-processing')) {
                        // Ignore mutations within a processing element
                        log.debug("Ignoring mutation within a processing element.");
                        continue;
                    }
                    // Check if the added node is a root processed/rewritten element
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        ((node as Element).classList.contains('genshred-rewritten') ||
                         (node as Element).classList.contains('genshred-processed') ||
                         (node as Element).classList.contains('genshred-processing'))) {
                        log.debug("Ignoring mutation on a processed or in-progress element.");
                        continue;
                    }
        
                    // All other added elements should trigger a process
                    shouldProcess = true;
                    break;
                }
            }
            
            // Original attribute/characterData logic can remain, but be cautious
            // The `mutation.target` is the element where the change happened.
            // Ensure you're not re-processing an element that is part of a rewritten block.
            if ((mutation.type === 'attributes' || mutation.type === 'characterData') && 
                !mutation.target.parentElement?.closest('.genshred-rewrite-container')) {
                shouldProcess = true;
            }
            
            if (shouldProcess) break;
        } ;
        
        // 如果需要处理，调用防抖版本的processParagraphs
        if (shouldProcess && currentSettings[STORAGE_KEYS.IS_ON]) {
            log.debug("DOM changes detected, processing new content...");
            isObserving=true;
            (async()=>{
                await  debouncedProcessParagraphs();
                isObserving =false;
            });
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
    log.debug("Started observing DOM changes");
}

// 停止MutationObserver
function stopObservingDOMChanges() {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
        log.debug("Stopped observing DOM changes");
    }
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
                        await handleFoundElement(element);
                    } catch (error) {
                        log.error("Error processing element:", error);
                        element.classList.remove('genshred-processing');
                    }
                }
            }
        },
        {
            rootMargin: '2000px 0px',
            threshold: [0, 0.1]
        }
    );

    // Add scroll event listener for dynamic content
    const handleScroll = debounce(() => {
        if (currentSettings[STORAGE_KEYS.IS_ON]) {
            processParagraphs();
        }
    }, 200); // readingmode deprecated

    // Remove existing listener if any
    window.removeEventListener('scroll', handleScroll);
    // Add new scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
}

async function processParagraphs() {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) {
        log.debug("Plugin is turned off");
        return;
    }
    
    // Prevent overlapping processing calls
    if (isProcessing) {
        log.debug("Already processing, skipping this call");
        return;
    }
    
    isProcessing = true;
    log.debug("Processing paragraphs...");
    
    // Select all potential text elements
    const textElements = Array.from(document.querySelectorAll("p, div, span, h1, h2, h3, h4, h5, h6, li, td, th"))
        .filter(element => {
            const trimmedTextLength = element.textContent?.trim().length || 0;
            
            // Early visibility check to avoid expensive operations on invisible elements
            if (!isElementVisible(element)) {
                return false;
            }
            
            // Logging for debugging filter conditions
            if (!(element instanceof HTMLElement)) {
                return false;
            }
            if (element.classList.contains('genshred-processed')) {
                return false;
            }
            if (element.classList.contains('genshred-processing')) {
                return false;
            }
            if (element.closest('.genshred-rewrite-container')) {
                return false;
            }
            if (element.closest('.genshred-tooltip-container')) {
                return false;
            }
            if (observedElements.has(element)) {
                return false;
            }
            // Get minimum paragraph length from settings
            const minParagraphLength = currentSettings.genShredMinParagraphLength ?? MIN_PARAGRAPH_LENGTH;
            
            if (trimmedTextLength < minParagraphLength) {
                // Check if it's Chinese text and use Chinese-specific minimum
                const chineseText = element.textContent || '';
                
                if (isChineseText(chineseText) && trimmedTextLength >= MIN_CHINESE_PARAGRAPH_LENGTH) {
                    // Chinese text with sufficient length, allow it
                    const chineseRatio = getChineseTextRatio(chineseText);
                    log.debug(`Allowing Chinese element with ${trimmedTextLength} chars (Chinese ratio: ${chineseRatio.toFixed(2)})`);
                } else {
                    log.debug(`Filtering out element due to short text length (${trimmedTextLength} chars, min: ${minParagraphLength}):`, element.nodeName);
                    if (element instanceof HTMLElement) {
                        element.classList.add('genshred-processed');
                    }
                    return false;
                }
            }
            if (trimmedTextLength > MAX_PARAGRAPH_LENGTH) {
                log.debug(`Filtering out element due to long text length (${trimmedTextLength} chars):`, element.nodeName);
                return false;
            }

            // Additional filtering for elements that are likely not human-readable content
            const tagName = element.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON') {
                return false;
            }
            if (element.isContentEditable) {
                return false;
            }
            // Elements inside SVG or Canvas are usually graphical or programmatically generated
            if (element.closest('svg') || element.closest('canvas')) {
                return false;
            }
            // Heuristic: check if the text contains very few alphabetic characters, indicating it might be code or symbols
            const alphabeticCharCount = (element.textContent?.match(/[a-zA-Z]/g) || []).length;
            const chineseCharCount = (element.textContent?.match(/[\u4e00-\u9fff]/g) || []).length;
            const totalCharCount = element.textContent?.length || 0;
            
            // Improved language detection for Chinese and other non-Latin scripts
            const hasChineseChars = chineseCharCount > 0;
            const hasLatinChars = alphabeticCharCount > 0;
            
            // Chinese-specific filtering logic
            if (hasChineseChars) {
                // Use Chinese text processing utilities
                const chineseText = element.textContent || '';
                const chineseRatio = getChineseTextRatio(chineseText);
                
                // Rule 1: Must be meaningful Chinese text
                if (!isMeaningfulChineseText(chineseText)) {
                    log.debug(`Filtering out Chinese element: not meaningful Chinese text`);
                    return false;
                }
                
                // Rule 2: Check for skip patterns
                if (shouldSkipChineseElement(chineseText)) {
                    log.debug(`Filtering out Chinese element: matches skip pattern`);
                    return false;
                }
                
                // Rule 3: Minimum Chinese characters
                if (chineseCharCount < 5) {
                    log.debug(`Filtering out Chinese element: too few Chinese characters (${chineseCharCount})`);
                    return false;
                }
                
                log.debug(`Chinese element passed all filters: ${chineseCharCount} chars, ratio: ${chineseRatio.toFixed(2)}`);
            } else if (hasLatinChars) {
                // Original English logic for Latin text
                if (totalCharCount > 0 && totalCharCount < 50) {
                    if (alphabeticCharCount / totalCharCount < 0.3) {
                        log.debug(`Filtering out Latin element: insufficient alphabetic characters`);
                        return false;
                    }
                }
            } else {
                // No recognizable characters, likely code or symbols
                log.debug(`Filtering out element: no recognizable characters`);
                return false;
            }
            // In observers.ts, inside your element discovery loop:
            // Check if the potential element to process is inside a container that is already handled
            if (element.closest('.genshred-processed') || element.closest('.genshred-processing')) {
                log.debug("Skipping element because it is inside an already processed or in-progress container.");
                return false;
            }

            return true;
        });

    log.debug(`Found ${textElements.length} new elements to process after initial filtering.`);

    // Limit the number of elements processed at once to prevent performance issues
    const maxElementsPerBatch = 10; // reading mode deprecated
    const elementsToProcess = textElements.slice(0, maxElementsPerBatch);
    
    if (textElements.length > maxElementsPerBatch) {
        log.debug(`Processing ${elementsToProcess.length} elements out of ${textElements.length} total (performance optimization)`);
    }

    // Set up intersection observer if not already set up
    if (!intersectionObserver) {
        setupIntersectionObserver();
    }

    // Process elements and observe them with a small delay to prevent blocking
    for (let i = 0; i < elementsToProcess.length; i++) {
        const element = elementsToProcess[i];
        if (element instanceof HTMLElement) {
            observedElements.add(element);
            intersectionObserver?.observe(element);
            
            // If element is already in viewport, process it immediately
            if (isElementInViewport(element)) {
                // Add a small delay between processing elements to prevent blocking
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                try {
                    await handleFoundElement(element);
                } catch (error) {
                    log.error("Error processing element:", error);
                    element.classList.remove('genshred-processing');
                }
            }
        }
    }
    
    isProcessing = false;
}


export { startObservingDOMChanges, stopObservingDOMChanges, setupIntersectionObserver, processParagraphs };