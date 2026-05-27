// DOM utilities: querying, traversal, visibility, and rewrite injection.
//
// The discovery-side primitives (walkAndLabelElement, isHTMLElement, ...) are
// inspired by read-frog's `src/utils/host/dom/{filter,traversal,find}.ts` and
// reuse the same labelling philosophy (mark paragraph nodes with attributes
// during a single walk). The injection-side primitives keep Genshred's
// AI-rewrite behavior (per-sentence spans, original-text tooltip, etc.) so
// the rewriting UX is preserved while the discovery becomes much more
// adaptable across sites.

import { restoreOriginalText, createRewriteSpan, resolveEffectiveDarkMode } from './ui-components';
import { currentSettings } from './state-management';
import * as log from './logger';
import {
    BLOCK_ATTRIBUTE,
    DONT_WALK_AND_TRANSLATE_TAGS,
    DONT_WALK_BUT_TRANSLATE_TAGS,
    FORCE_BLOCK_TAGS,
    INLINE_ATTRIBUTE,
    MAIN_CONTENT_IGNORE_TAGS,
    NOTRANSLATE_CLASS,
    PARAGRAPH_ATTRIBUTE,
    PROCESSED_CLASS,
    PROCESSING_CLASS,
    REWRITE_CONTAINER_CLASS,
    TOOLTIP_CONTAINER_CLASS,
    VISUALLY_HIDDEN_CLASSES,
    WALKED_ATTRIBUTE,
    getDontWalkIntoSelector,
    getForceBlockSelector,
} from './dom-rules';

// ---------------------------------------------------------------------------
// Cross-context node type guards
// ---------------------------------------------------------------------------
// Browser extensions frequently encounter DOM nodes from different realms
// (iframes, shadow roots, jsdom, ...). `instanceof HTMLElement` fails in
// those cases. We check `nodeType` and the presence of the APIs we actually
// use, mirroring read-frog's approach.

export function isHTMLElement(node: Node | null | undefined): node is HTMLElement {
    return !!node
        && (node as Node).nodeType === Node.ELEMENT_NODE
        && (node as HTMLElement).nodeName !== undefined
        && 'tagName' in node
        && 'getAttribute' in node
        && 'setAttribute' in node;
}

export function isElement(node: Node | null | undefined): node is Element {
    return !!node && node.nodeType === Node.ELEMENT_NODE;
}

export function isTextNode(node: Node | null | undefined): node is Text {
    return !!node
        && node.nodeType === Node.TEXT_NODE
        && 'textContent' in node
        && 'data' in node;
}

// ---------------------------------------------------------------------------
// Visibility checks
// ---------------------------------------------------------------------------

// Lightweight visibility check. Used during walk to skip `display: none` etc.
// without paying the cost of layout reads.
export function isStyleHiddenElement(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return true;
    }
    return false;
}

// Structural visibility: the element is rendered somewhere in the DOM and is
// not display:none / visibility:hidden / aria-hidden / sr-only. We do NOT
// reject off-screen elements because we want IntersectionObserver to pick
// them up when they scroll into view (lazy translation).
export function isStructurallyVisible(element: HTMLElement): boolean {
    if (!element || !element.isConnected) return false;
    if (isStyleHiddenElement(element)) return false;
    if (element.hidden) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    for (const cls of VISUALLY_HIDDEN_CLASSES) {
        if (element.classList.contains(cls)) return false;
    }
    let parent: HTMLElement | null = element.parentElement;
    while (parent) {
        if (isStyleHiddenElement(parent)) return false;
        parent = parent.parentElement;
    }
    return true;
}

// Heavier visibility check (legacy API kept for backward compatibility).
// Performs additional rect / parent checks. Prefer the lighter check during
// hot-path walks.
function isElementVisible(element: Element): boolean {
    if (!element || !element.isConnected) {
        return false;
    }

    if (!isHTMLElement(element)) {
        // Treat non-HTML elements (e.g. SVG) as not visible for translation.
        return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none'
        || style.visibility === 'hidden'
        || style.opacity === '0') {
        return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    if (rect.right < 0 || rect.bottom < 0
        || rect.left > window.innerWidth
        || rect.top > window.innerHeight) {
        // Off-screen but may scroll into view. Only reject when also zero-sized.
        // (Existing behavior; keep for compatibility with current observers.)
        return false;
    }

    let parent: HTMLElement | null = element.parentElement;
    while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none'
            || parentStyle.visibility === 'hidden'
            || parentStyle.opacity === '0') {
            return false;
        }
        parent = parent.parentElement;
    }

    for (const className of VISUALLY_HIDDEN_CLASSES) {
        if (element.classList.contains(className)) {
            return false;
        }
    }
    if (element.hasAttribute('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;

    return true;
}

function isElementInViewport(el: HTMLElement, buffer: number = 300): boolean {
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    const isPartiallyVisible = (
        (rect.top < (windowHeight + buffer) && rect.bottom > -buffer)
        && (rect.left >= -buffer && rect.right <= (windowWidth + buffer))
    );

    const isTallElement = rect.height > windowHeight * 1.5;
    const isTallElementEnteringView = isTallElement && rect.top < (windowHeight / 2);

    return isPartiallyVisible || isTallElementEnteringView;
}

// ---------------------------------------------------------------------------
// Inline / block detection
// ---------------------------------------------------------------------------

function isInlineDisplay(display: string): boolean {
    const normalized = display.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'contents') return true;
    if (normalized.startsWith('inline')) return true;
    return [
        'ruby', 'ruby-base', 'ruby-text',
        'ruby-base-container', 'ruby-text-container',
    ].includes(normalized);
}

// Treat large drop caps (common on news sites) as inline so the surrounding
// paragraph stays a single rewriteable unit.
function isLargeInitialFloatingLetter(element: HTMLElement): boolean {
    const computed = window.getComputedStyle(element);
    if (computed.float !== 'left') return false;
    const next = element.nextSibling;
    if (!next) return false;
    if (isTextNode(next) && (next.textContent ?? '').trim()) return true;
    if (isHTMLElement(next)) return isShallowInlineHTMLElement(next);
    return false;
}

export function isShallowInlineHTMLElement(element: HTMLElement): boolean {
    if (!element.textContent?.trim()) return false;
    if (FORCE_BLOCK_TAGS.has(element.tagName)) return false;
    if (isLargeInitialFloatingLetter(element)) return true;
    const computed = window.getComputedStyle(element);
    return isInlineDisplay(computed.display);
}

export function isShallowBlockHTMLElement(element: HTMLElement): boolean {
    if (FORCE_BLOCK_TAGS.has(element.tagName)) return true;
    if (isLargeInitialFloatingLetter(element)) return false;
    const computed = window.getComputedStyle(element);
    return !isInlineDisplay(computed.display);
}

// ---------------------------------------------------------------------------
// Skip rules
// ---------------------------------------------------------------------------

export function isEditable(element: HTMLElement): boolean {
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (element.isContentEditable) return true;
    return false;
}

function isCustomDontWalkIntoElement(element: HTMLElement): boolean {
    const selector = getDontWalkIntoSelector();
    if (!selector) return false;
    try {
        return element.matches(selector);
    }
    catch {
        // Bad selector for this host (typo, etc.) -- log once and ignore.
        log.warn('Invalid custom dont-walk selector for host', window.location.hostname);
        return false;
    }
}

export function isCustomForceBlockTranslation(element: HTMLElement): boolean {
    const selector = getForceBlockSelector();
    if (!selector) return false;
    try {
        return element.matches(selector);
    }
    catch {
        return false;
    }
}

// Element is a Genshred-injected wrapper / control. We never recurse into it.
function isGenshredOwnedElement(element: HTMLElement): boolean {
    if (element.classList.contains(REWRITE_CONTAINER_CLASS)) return true;
    if (element.classList.contains(TOOLTIP_CONTAINER_CLASS)) return true;
    return false;
}

// "Don't walk into, but still translate as part of parent". Mirrors
// read-frog's `isDontWalkIntoButTranslateAsChildElement`.
export function isDontWalkIntoButTranslateAsChildElement(element: HTMLElement): boolean {
    if (element.classList.contains(NOTRANSLATE_CLASS)) return true;
    if (DONT_WALK_BUT_TRANSLATE_TAGS.has(element.tagName)) return true;
    return false;
}

// Walk the parent chain looking for `<article>`, `<main>` or `[role="main"]`.
// When the page has main-content scaffolding we keep navigation/footer/aside
// out of scope; otherwise we are more permissive.
function isInsideContentContainer(element: HTMLElement): boolean {
    let current: HTMLElement | null = element.parentElement;
    while (current) {
        if (current.tagName === 'ARTICLE' || current.tagName === 'MAIN') {
            return true;
        }
        if (current.getAttribute && current.getAttribute('role') === 'main') {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

let pageHasMainContentContainerCache: boolean | null = null;

export function pageHasMainContentContainer(): boolean {
    if (pageHasMainContentContainerCache !== null) {
        return pageHasMainContentContainerCache;
    }
    pageHasMainContentContainerCache = !!document.querySelector('article, main, [role="main"]');
    return pageHasMainContentContainerCache;
}

export function clearMainContentContainerCache(): void {
    pageHasMainContentContainerCache = null;
}

// Things we never walk into and never translate.
export function isDontWalkIntoAndDontTranslateAsChildElement(element: HTMLElement): boolean {
    if (DONT_WALK_AND_TRANSLATE_TAGS.has(element.tagName)) return true;
    if (isGenshredOwnedElement(element)) return true;
    if (isEditable(element)) return true;
    if (isCustomDontWalkIntoElement(element)) return true;
    if (isStyleHiddenElement(element)) return true;
    if (element.hidden) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    for (const cls of VISUALLY_HIDDEN_CLASSES) {
        if (element.classList.contains(cls)) return true;
    }
    if (pageHasMainContentContainer()
        && MAIN_CONTENT_IGNORE_TAGS.has(element.tagName)
        && !isInsideContentContainer(element)) {
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Walk and label
// ---------------------------------------------------------------------------
// `walkAndLabelElement` is the core discovery primitive. It traverses the
// subtree once and tags each node with `data-genshred-*` attributes:
//
//   data-genshred-walked      = walkId for this run
//   data-genshred-paragraph   = present on elements that contain inline text
//                                (these are the rewriteable units)
//   data-genshred-block-node  = element behaves as block (CSS / FORCE rule)
//   data-genshred-inline-node = element behaves as inline
//
// The discovery is cheap because it never calls `getComputedStyle` on text
// nodes, and it never recurses into ignored subtrees.

export function hasNoWalkAncestor(element: HTMLElement): boolean {
    let current: HTMLElement | null = element.parentElement;
    while (current) {
        if (isDontWalkIntoButTranslateAsChildElement(current)
            || isDontWalkIntoAndDontTranslateAsChildElement(current)) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

interface WalkResult {
    forceBlock: boolean;
    isInlineNode: boolean;
}

export function walkAndLabelElement(
    element: HTMLElement,
    walkId: string,
): WalkResult {
    if (isDontWalkIntoButTranslateAsChildElement(element)
        || isDontWalkIntoAndDontTranslateAsChildElement(element)) {
        return { forceBlock: false, isInlineNode: false };
    }

    element.setAttribute(WALKED_ATTRIBUTE, walkId);

    if (element.shadowRoot) {
        for (const child of Array.from(element.shadowRoot.children)) {
            if (isHTMLElement(child)) {
                walkAndLabelElement(child, walkId);
            }
        }
    }

    let hasInlineNodeChild = false;
    let forceBlock = false;

    for (const child of Array.from(element.childNodes)) {
        if (isTextNode(child)) {
            if (child.textContent?.trim()) {
                hasInlineNodeChild = true;
            }
            continue;
        }
        if (!isHTMLElement(child)) continue;
        if (isDontWalkIntoButTranslateAsChildElement(child)) {
            // Treat as inline content of parent. Don't recurse.
            if (child.textContent?.trim()) {
                hasInlineNodeChild = true;
            }
            continue;
        }
        if (isDontWalkIntoAndDontTranslateAsChildElement(child)) {
            continue;
        }

        const result = walkAndLabelElement(child, walkId);
        forceBlock = forceBlock || result.forceBlock;
        if (result.isInlineNode) {
            hasInlineNodeChild = true;
        }
    }

    if (hasInlineNodeChild) {
        element.setAttribute(PARAGRAPH_ATTRIBUTE, '');
    }

    forceBlock = forceBlock || FORCE_BLOCK_TAGS.has(element.tagName);

    if (element.textContent?.trim() === '' && !forceBlock) {
        return { forceBlock: false, isInlineNode: false };
    }

    const isInlineNode = isShallowInlineHTMLElement(element);

    if (isShallowBlockHTMLElement(element) || forceBlock || isCustomForceBlockTranslation(element)) {
        element.setAttribute(BLOCK_ATTRIBUTE, '');
    }
    else if (isInlineNode) {
        element.setAttribute(INLINE_ATTRIBUTE, '');
    }

    return { forceBlock, isInlineNode };
}

// ---------------------------------------------------------------------------
// Paragraph collection (with shadow DOM)
// ---------------------------------------------------------------------------

export function collectParagraphElementsDeep(
    container: HTMLElement,
    walkId: string,
): HTMLElement[] {
    const result: HTMLElement[] = [];
    const selector = `[${PARAGRAPH_ATTRIBUTE}][${WALKED_ATTRIBUTE}="${CSS.escape(walkId)}"]`;

    const collectFromRoot = (root: ParentNode) => {
        const matches = root.querySelectorAll<HTMLElement>(selector);
        for (const el of Array.from(matches)) {
            result.push(el);
        }
    };

    const traverseElement = (el: HTMLElement) => {
        if (el.shadowRoot) {
            collectFromRoot(el.shadowRoot);
            for (const child of Array.from(el.shadowRoot.children)) {
                if (isHTMLElement(child)) traverseElement(child);
            }
        }
        for (const child of Array.from(el.children)) {
            if (isHTMLElement(child)) traverseElement(child);
        }
    };

    if (container.matches(selector)) {
        result.push(container);
    }
    collectFromRoot(container);
    traverseElement(container);

    return result;
}

// Returns only the outermost paragraphs inside `container` -- skipping
// paragraphs that have another paragraph ancestor inside the same container.
// This is what we observe with the IntersectionObserver.
export function filterTopLevelParagraphs(
    container: HTMLElement,
    paragraphs: HTMLElement[],
): HTMLElement[] {
    return paragraphs.filter((el) => {
        const ancestor = el.parentElement?.closest(`[${PARAGRAPH_ATTRIBUTE}]`);
        return !ancestor || !container.contains(ancestor);
    });
}

// ---------------------------------------------------------------------------
// Existing helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

// Helper function to extract all text nodes and their offsets from an element
function getTextNodesWithOffsets(root: Node): { fullText: string, mappings: Array<{ node: Text, start: number, end: number }> } {
    let fullText = "";
    const mappings: Array<{ node: Text, start: number, end: number }> = [];
    let currentOffset = 0;

    function traverse(node: Node) {
        if (isTextNode(node)) {
            const text = node.nodeValue || "";
            if (text.trim().length > 0) {
                const start = currentOffset;
                fullText += text;
                currentOffset += text.length;
                mappings.push({ node, start, end: currentOffset });
            } else {
                currentOffset += text.length;
            }
            return;
        }

        if (!isHTMLElement(node)) return;

        // Stop entirely on "don't walk and don't translate" subtrees -- these
        // include scripts, styles, media, and our own wrappers.
        if (isDontWalkIntoAndDontTranslateAsChildElement(node)) {
            return;
        }
        // Don't recurse into "translate as child" tags but absorb their text
        // so the surrounding sentence stays intact.
        if (isDontWalkIntoButTranslateAsChildElement(node)) {
            const text = node.textContent || '';
            if (text) {
                const start = currentOffset;
                fullText += text;
                currentOffset += text.length;
                // We don't add a mapping because there's no single Text node
                // we own: this content is rendered through nested elements.
            }
            return;
        }

        for (const child of Array.from(node.childNodes)) {
            traverse(child);
        }
    }

    traverse(root);
    return { fullText, mappings };
}

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
        element.classList.add(PROCESSED_CLASS);
        element.classList.remove(PROCESSING_CLASS);
        return;
    }

    const fullText = textNodeMappings.length > 0
        ? textNodeMappings[0].node.parentElement?.textContent || ""
        : element.textContent || "";

    const sortedRewrites = rewrites.slice().sort((a, b) => a.start_position - b.start_position);

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const rewrite of sortedRewrites) {
        if (rewrite.start_position > cursor) {
            const beforeText = fullText.slice(cursor, rewrite.start_position);
            fragment.appendChild(document.createTextNode(beforeText));
        }

        const rewriteSpan = createRewriteSpan(rewrite.original_text, rewrite.rewritten_text);
        fragment.appendChild(rewriteSpan);

        cursor = rewrite.start_position + rewrite.original_text.length;
    }

    if (cursor < fullText.length) {
        fragment.appendChild(document.createTextNode(fullText.slice(cursor)));
    }

    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
    element.appendChild(fragment);

    element.classList.add(PROCESSED_CLASS);
    element.classList.remove(PROCESSING_CLASS);
}

// Refresh dark-mode styling on every existing rewrite span. The decision is
// made once per refresh — for 'auto' we re-sample the page background so the
// styling tracks live page-theme changes (e.g. when a site toggles its own
// dark mode after our spans were inserted).
function updateDarkModeStyling() {
    log.debug("Updating dark mode styling...");
    const isDark = resolveEffectiveDarkMode();
    const rewrittenSpans = document.querySelectorAll('.genshred-processed .genshred-rewritten');
    log.debug("Found rewritten spans:", rewrittenSpans.length, "isDark:", isDark);
    rewrittenSpans.forEach((span) => {
        if (isDark) {
            span.classList.add('genshred-dark-mode');
        } else {
            span.classList.remove('genshred-dark-mode');
        }
    });
}

export {
    isElementVisible,
    isElementInViewport,
    getTextNodesWithOffsets,
    applyRewritesToElement,
    restoreOriginalText,
    updateDarkModeStyling,
};
