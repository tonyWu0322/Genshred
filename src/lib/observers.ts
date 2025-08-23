import { processElement } from './api-helpers';
import { applyRewritesToElement } from './dom-utilities';
import { STORAGE_KEYS, MAX_PARAGRAPH_LENGTH,MIN_PARAGRAPH_LENGTH } from '~src/constants';
import { currentSettings } from './state-management';
import { debounce } from './utilities';
import { isElementVisible,isElementInViewport } from './dom-utilities';
// 添加MutationObserver来监听DOM变化
let mutationObserver: MutationObserver | null = null;
// Define the variables here, scoped to this module
let intersectionObserver: IntersectionObserver | null = null;
const observedElements = new WeakSet<Element>();
let isProcessing = false;

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
        console.log("Plugin is turned off");
        return;
    }
    
    // Prevent overlapping processing calls
    if (isProcessing) {
        console.log("Already processing, skipping this call");
        return;
    }
    
    isProcessing = true;
    console.log("Processing paragraphs...");
    
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
            if (trimmedTextLength < MIN_PARAGRAPH_LENGTH) {
                console.log(`Filtering out element due to short text length (${trimmedTextLength} chars):`, element.nodeName);
                if (element instanceof HTMLElement) {
                    element.classList.add('genshred-processed');
                }
                return false;
            }
            if (trimmedTextLength > MAX_PARAGRAPH_LENGTH) {
                console.log(`Filtering out element due to long text length (${trimmedTextLength} chars):`, element.nodeName);
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
            const totalCharCount = element.textContent?.length || 0;
            // If it's a short string (e.g., < 20 chars) and less than 30% alphabetic, likely not natural language
            if (totalCharCount > 0 && totalCharCount < 50 && (alphabeticCharCount / totalCharCount < 0.3)) {
                return false;
            }

            return true;
        });

    console.log(`Found ${textElements.length} new elements to process after initial filtering.`);

    // Limit the number of elements processed at once to prevent performance issues
    const maxElementsPerBatch = 10; // reading mode deprecated
    const elementsToProcess = textElements.slice(0, maxElementsPerBatch);
    
    if (textElements.length > maxElementsPerBatch) {
        console.log(`Processing ${elementsToProcess.length} elements out of ${textElements.length} total (performance optimization)`);
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
                    await processElement(element);
                } catch (error) {
                    console.error("Error processing element:", error);
                    element.classList.remove('genshred-processing');
                }
            }
        }
    }
    
    isProcessing = false;
}


export { startObservingDOMChanges, stopObservingDOMChanges, setupIntersectionObserver, processParagraphs };