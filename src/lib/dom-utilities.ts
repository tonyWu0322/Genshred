// This module should contain all the functions related to querying, manipulating, and checking elements in the Document Object Model (DOM).
import { restoreOriginalText,createRewriteSpan } from './ui-components';
import { currentSettings } from './state-management';

// Enhanced function to check if element is truly visible
function isElementVisible(element: Element): boolean {
    // Check if element exists
    if (!element || !element.isConnected) {
        return false;
    }

    // Get computed style
    const style = window.getComputedStyle(element);
    
    // Check basic visibility properties
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') {
        return false;
    }

    // Check if element has zero dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    // Check if element is positioned off-screen
    if (rect.right < 0 || rect.bottom < 0 || 
        rect.left > window.innerWidth || 
        rect.top > window.innerHeight) {
        return false;
    }

    // Check if any parent element is hidden
    let parent = element.parentElement;
    while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || 
            parentStyle.visibility === 'hidden' || 
            parentStyle.opacity === '0') {
            return false;
        }
        parent = parent.parentElement;
    }

    // Check for common hidden element patterns
    const hiddenClasses = ['hidden', 'invisible', 'sr-only', 'visually-hidden', 'screen-reader-only'];
    const hiddenAttributes = ['aria-hidden', 'hidden'];
    
    for (const className of hiddenClasses) {
        if (element.classList.contains(className)) {
            return false;
        }
    }
    
    for (const attr of hiddenAttributes) {
        if (element.hasAttribute(attr) && element.getAttribute(attr) !== 'false') {
            return false;
        }
    }

    return true;
}


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

// Helper function to check if a sentence spans multiple text nodes

function applyRewritesToElement(
    element: HTMLElement,
    rewrites: Array<{
        original_text: string;
        rewritten_text: string;
        original_index: number;
        start_position: number;
    }>,
    allOriginalSentences: string[],
    textNodeMappings: Array<{ node: Text, start: number, end: number }>
) {
    if (!rewrites || rewrites.length === 0) {
        element.classList.add('genshred-processed');
        element.classList.remove('genshred-processing');
        return;
    }

    // Get the full text of the element
    const fullText = textNodeMappings.length > 0
        ? textNodeMappings[0].node.parentElement?.textContent || ""
        : element.textContent || "";

    // Sort rewrites by start position (left to right)
    const sortedRewrites = rewrites.slice().sort((a, b) => a.start_position - b.start_position);

    // Build the new fragment
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const rewrite of sortedRewrites) {
        // Add text before the rewrite
        if (rewrite.start_position > cursor) {
            const beforeText = fullText.slice(cursor, rewrite.start_position);
            fragment.appendChild(document.createTextNode(beforeText));
        }

        // Add the rewritten span
        const rewriteSpan = createRewriteSpan(rewrite.original_text, rewrite.rewritten_text);
        fragment.appendChild(rewriteSpan);

        cursor = rewrite.start_position + rewrite.original_text.length;
    }

    // Add any remaining text after the last rewrite
    if (cursor < fullText.length) {
        fragment.appendChild(document.createTextNode(fullText.slice(cursor)));
    }

    // Replace all children of the element with the new fragment
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
    element.appendChild(fragment);

    element.classList.add('genshred-processed');
    element.classList.remove('genshred-processing');
}
// Restore original text logic (updated for data-original-text)

// NEW: Function to update dark mode styling for existing rewritten elements
function updateDarkModeStyling() {
    console.log("Updating dark mode styling...");
    const rewrittenSpans = document.querySelectorAll('.genshred-processed .genshred-rewritten');
    console.log("Found rewritten spans:", rewrittenSpans); // ← 检查数量
    rewrittenSpans.forEach((span) => {
        if (currentSettings.genShredDarkMode) {
            span.classList.add('genshred-dark-mode');
        } else {
            span.classList.remove('genshred-dark-mode');
        }
    });
}




export {isElementVisible, isElementInViewport, getTextNodesWithOffsets, applyRewritesToElement, restoreOriginalText, updateDarkModeStyling};