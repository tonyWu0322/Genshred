import { currentSettings } from "./state-management";
import { escapeHTML } from "./utilities";
import * as log from "./logger";
let tooltipElement:HTMLElement | null = null;
let isTooltipVisible= false;
let activeTooltipElement:HTMLElement|null=null;

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
function showTooltip(text: string, event: MouseEvent, sourceElement?: HTMLElement) {
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


// 1. 新增 createLoadingSpan 工具函数
function createLoadingSpan(sentence: string): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'genshred-original-text-wrapper loading';
    const textSpan = document.createElement('span');
    textSpan.className = 'original-text';
    textSpan.textContent = sentence;
    const spinner = document.createElement('span');
    spinner.className = 'genshred-loading-spinner';
    wrapper.appendChild(textSpan);
    wrapper.appendChild(spinner);
    return wrapper;
}


function createRewriteSpan(originalText: string, rewrittenText: string): HTMLSpanElement {
    const containerSpan = document.createElement('span');
    containerSpan.className = 'genshred-rewrite-container genshred-processed';
    containerSpan.setAttribute('data-original-text', escapeHTML(originalText));

    // ✅ 改写文本：默认显示
    const rewrittenSpan = document.createElement('span');
    rewrittenSpan.className = 'genshred-rewritten';
    // 创建后立即设置初始状态
    rewrittenSpan.classList.add('genshred-visible');     // ✅ 初始显示改写文本
    
    if (currentSettings.genShredDarkMode) {
        rewrittenSpan.classList.add('genshred-dark-mode');
    }
    rewrittenSpan.textContent = rewrittenText;

    // ✅ 原始文本：默认隐藏
    const originalHiddenSpan = document.createElement('span');
    originalHiddenSpan.className = 'genshred-original-hidden';
    originalHiddenSpan.textContent = originalText;
    originalHiddenSpan.classList.remove('genshred-visible'); // ✅ 确保原文隐藏

    containerSpan.appendChild(rewrittenSpan);
    containerSpan.appendChild(originalHiddenSpan);

    containerSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        log.debug("clicked! Toggling visibility via class...");
    
        // 检查当前是否显示改写文本
        const isShowingRewritten = !originalHiddenSpan.classList.contains('genshred-visible');
    
        if (isShowingRewritten) {
            // 当前显示改写 → 切换为显示原文
            rewrittenSpan.classList.remove('genshred-visible'); // 可选：如果它也有这个类
            originalHiddenSpan.classList.add('genshred-visible');
        } else {
            // 当前显示原文 → 切换为显示改写
            rewrittenSpan.classList.add('genshred-visible');
            originalHiddenSpan.classList.remove('genshred-visible');
        }
    
        log.debug("After toggle:", {
            rewrittenHasVisible: rewrittenSpan.classList.contains('genshred-visible'),
            originalHasVisible: originalHiddenSpan.classList.contains('genshred-visible')
        });
    });

    return containerSpan;
}

function restoreOriginalText() {
    log.debug("restoreOriginalText()");
    log.debug("Restoring original text...");
    const containers = document.querySelectorAll("span.genshred-rewrite-container[data-original-text]");
    log.debug("Found containers:", containers);

    containers.forEach((container) => {
        const originalText = container.getAttribute("data-original-text") || "";
        log.debug("Original text:", originalText);
        const textNode = document.createTextNode(originalText);
        container.parentNode?.replaceChild(textNode, container);
    });

    document.querySelectorAll('.genshred-processed').forEach(el => {
        el.classList.remove('genshred-processed');
    });

    log.debug("Original text restored");
}

// New function: applySingleRewriteToElement
function applySingleRewriteToElement(
    element: HTMLElement,
    originalText: string,
    rewrittenText: string,
    startIndex: number,
    textNodeMappings: Array<{ node: Text, start: number, end: number }>,
    loadingSpan?: HTMLElement // 新增参数
) {
    // Helper: Recursively search for the first text node containing the target text, skipping rewritten spans
    function findTextNodeWithSentence(node: Node, sentence: string): { textNode: Text, offset: number } | null {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue || '';
            const offset = text.indexOf(sentence);
            if (offset !== -1) {
                return { textNode: node as Text, offset };
            }
            return null;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            // Skip already rewritten containers
            if (el.classList.contains('genshred-rewrite-container')) return null;
            for (const child of Array.from(node.childNodes)) {
                const result = findTextNodeWithSentence(child, sentence);
                if (result) return result;
            }
        }
        return null;
    }

    // Find the first occurrence of the original sentence in a text node (not already rewritten)
    const found = findTextNodeWithSentence(element, originalText);
    if (!found) {
        // Already rewritten or not found
        return;
    }
    const { textNode, offset } = found;
    // Use a DOM Range to isolate the sentence
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + originalText.length);
    // Create the rewrite span
    let nodeToInsert;
    if (loadingSpan) {
        nodeToInsert = loadingSpan;
    } else {
        nodeToInsert = createRewriteSpan(originalText, rewrittenText);
    }
    // Replace the range with the rewrite span
    range.deleteContents();
    range.insertNode(nodeToInsert);
    // Clean up selection
    range.detach();
}
  
export { createTooltip, showTooltip, hideTooltip, createLoadingSpan, createRewriteSpan, restoreOriginalText,applySingleRewriteToElement};
