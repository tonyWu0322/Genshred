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

// Position the floating tooltip near the cursor without going off-screen.
// Extracted so both the cursor-driven path (showTooltip) and the new
// element-driven path (showTooltipForElement) share the same logic.
function positionTooltipAt(tooltip: HTMLElement, clientX: number, clientY: number) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Read once after we ensure the tooltip is visible.
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;

    // Vertical placement: flip above the cursor when there is not enough
    // room below.
    if (clientY + tooltipHeight + 16 > viewportHeight) {
        tooltip.style.bottom = 'auto';
        tooltip.style.top = `${Math.max(8, clientY - tooltipHeight - 12)}px`;
    } else {
        tooltip.style.top = `${clientY + 12}px`;
        tooltip.style.bottom = 'auto';
    }

    // Horizontal placement: clamp so the tooltip never spills past the
    // viewport edges. `transform: none` because we position the top-left
    // corner directly.
    const halfWidth = tooltipWidth / 2;
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, viewportWidth - tooltipWidth - 8);
    const left = Math.min(Math.max(clientX - halfWidth, minLeft), maxLeft);
    tooltip.style.left = `${left}px`;
    tooltip.style.transform = 'none';
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

    positionTooltipAt(tooltip, event.clientX, event.clientY);
    
    // 更新全局状态
    isTooltipVisible = true;
    activeTooltipElement = sourceElement || null;
}

// Show the tooltip relative to a DOM element when we don't have a mouse event
// to work with (e.g. when the rewrite span itself fires mouseenter and we
// want consistent placement even if the cursor enters from the very edge).
function showTooltipForElement(text: string, sourceElement: HTMLElement) {
    if (isTooltipVisible && activeTooltipElement === sourceElement) {
        return;
    }
    if (isTooltipVisible) {
        hideTooltip();
    }

    const tooltip = createTooltip();
    tooltip.textContent = `Original: ${text}`;
    tooltip.style.display = 'block';

    const rect = sourceElement.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.bottom;
    positionTooltipAt(tooltip, anchorX, anchorY);

    isTooltipVisible = true;
    activeTooltipElement = sourceElement;
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


// Resolve the user's preferred theme to a concrete dark/light decision. The
// stored value can be the new 'light' | 'dark' | 'auto' string or the legacy
// boolean, so this helper centralises the migration logic.
function resolveEffectiveDarkMode(): boolean {
    const raw = currentSettings.genShredDarkMode;
    if (raw === 'dark' || raw === true) return true;
    if (raw === 'light' || raw === false) return false;
    // 'auto' or unrecognised value: derive from the page.
    return isDarkPageBackground();
}

// Apply / clear the dark-mode class on a rewritten span based on the current
// effective theme. Used by both initial creation and the post-toggle refresh.
function applyDarkModeClass(span: HTMLElement, isDark: boolean) {
    if (isDark) {
        span.classList.add('genshred-dark-mode');
    } else {
        span.classList.remove('genshred-dark-mode');
    }
}

// Walk up from `el` looking at the nearest ancestor with an explicit
// background colour. Returns true when that colour is dark, falling back to
// the system color-scheme preference when the page background is transparent.
function isDarkPageBackground(el?: HTMLElement | null): boolean {
    try {
        let node: HTMLElement | null = el ?? document.body ?? document.documentElement;
        while (node) {
            const bg = window.getComputedStyle(node).backgroundColor;
            const luminance = extractRgbLuminance(bg);
            if (luminance !== null) {
                return luminance < 0.5;
            }
            node = node.parentElement;
        }
    } catch {
        // Computed style can throw on detached nodes; fall through to the
        // system preference below.
    }
    if (typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return true;
    }
    return false;
}

// Parse an `rgb(...)` / `rgba(...)` colour and return its perceived luminance
// in the 0..1 range. Returns null when the colour is fully transparent or
// unparseable, so callers can keep walking the ancestor chain.
function extractRgbLuminance(color: string | null | undefined): number | null {
    if (!color) return null;
    if (color === 'transparent') return null;
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(s => s.trim());
    if (parts.length < 3) return null;
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts.length >= 4 ? Number(parts[3]) : 1;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    if (a === 0) return null;
    // Rec. 601 luma — fast and good enough for "is this dark?".
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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

    applyDarkModeClass(rewrittenSpan, resolveEffectiveDarkMode());
    rewrittenSpan.textContent = rewrittenText;

    // ✅ 原始文本：默认隐藏
    const originalHiddenSpan = document.createElement('span');
    originalHiddenSpan.className = 'genshred-original-hidden';
    originalHiddenSpan.textContent = originalText;
    originalHiddenSpan.classList.remove('genshred-visible'); // ✅ 确保原文隐藏

    containerSpan.appendChild(rewrittenSpan);
    containerSpan.appendChild(originalHiddenSpan);

    // Show the original-sentence tooltip while the user hovers the rewrite.
    // Previously only a custom 'genshred-tooltip-show' DOM event triggered
    // the tooltip, but the spans created here never dispatched it — which
    // meant the tooltip silently never appeared. Wiring mouseenter/mousemove
    // directly fixes that regression and also keeps the tooltip following
    // the cursor while the user is reading.
    containerSpan.addEventListener('mouseenter', (e) => {
        showTooltip(originalText, e as MouseEvent, containerSpan);
    });
    containerSpan.addEventListener('mousemove', (e) => {
        if (isTooltipVisible && activeTooltipElement === containerSpan && tooltipElement) {
            positionTooltipAt(tooltipElement, e.clientX, e.clientY);
        }
    });
    containerSpan.addEventListener('mouseleave', () => {
        if (activeTooltipElement === containerSpan) {
            hideTooltip();
        }
    });

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
  
export {
    createTooltip,
    showTooltip,
    showTooltipForElement,
    hideTooltip,
    createLoadingSpan,
    createRewriteSpan,
    restoreOriginalText,
    applySingleRewriteToElement,
    resolveEffectiveDarkMode,
    isDarkPageBackground,
};
