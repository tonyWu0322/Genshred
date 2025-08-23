import { currentSettings } from "./state-management";
import { escapeHTML } from "./utilities";
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


/**
 * Helper function to create the rewrite container span with its children and event listeners.
 */
function createRewriteSpan(originalText: string, rewrittenText: string): HTMLSpanElement {
    const containerSpan = document.createElement('span');
    containerSpan.className = 'genshred-rewrite-container';
    containerSpan.setAttribute('data-original-text', escapeHTML(originalText));

    const rewrittenSpan = document.createElement('span');
    rewrittenSpan.className = 'genshred-rewritten';
    // Apply dark mode styling if enabled
    if (currentSettings.darkModeEnabled) {
        rewrittenSpan.classList.add('genshred-dark-mode');
    }
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
