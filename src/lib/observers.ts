// Observer-based DOM discovery and lazy processing.
//
// Pipeline:
//   1. `walkAndLabelElement` traverses the document body once and tags
//      paragraph-like elements with `data-genshred-paragraph`.
//   2. We collect the top-level paragraphs (including those inside open
//      shadow roots), apply Genshred's length / language filters, and queue
//      each candidate for the IntersectionObserver.
//   3. When a paragraph enters the viewport (within `rootMargin`), we
//      forward it to `processElement()` which handles sentence splitting and
//      AI rewriting. This is unchanged from the previous design and keeps
//      the rewrite UX intact.
//   4. A MutationObserver watches both structural (`childList`) and
//      visibility (`style`/`class`/`hidden`/`aria-hidden`) changes so SPA
//      route changes, accordions and lazy-loaded sections are picked up.
//
// The walk-and-label approach (vs. the previous `querySelectorAll('p, div,
// span, ...')`) is what gives us better adaptation to non-traditional sites
// like deepwiki, Discord, Reddit, and Immersive-Translation-style apps.

import { processElement } from './api-helpers';
import { STORAGE_KEYS, MAX_PARAGRAPH_LENGTH, MIN_PARAGRAPH_LENGTH, MIN_CHINESE_PARAGRAPH_LENGTH } from '~src/constants';
import { currentSettings } from './state-management';
import {
    debounce,
    isChineseText,
    isMeaningfulChineseText,
    shouldSkipChineseElement,
    getChineseTextRatio,
} from './utilities';
import {
    clearMainContentContainerCache,
    collectParagraphElementsDeep,
    filterTopLevelParagraphs,
    hasNoWalkAncestor,
    isDontWalkIntoAndDontTranslateAsChildElement,
    isDontWalkIntoButTranslateAsChildElement,
    isElementInViewport,
    isHTMLElement,
    isStructurallyVisible,
    walkAndLabelElement,
} from './dom-utilities';
import {
    PARAGRAPH_ATTRIBUTE,
    PROCESSED_CLASS,
    PROCESSING_CLASS,
    REWRITE_CONTAINER_CLASS,
    TOOLTIP_CONTAINER_CLASS,
    WALKED_ATTRIBUTE,
} from './dom-rules';
import * as log from './logger';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let intersectionObserver: IntersectionObserver | null = null;
let mutationObservers: MutationObserver[] = [];

const observedElements = new WeakSet<Element>();
const walkBlockedElements = new WeakSet<HTMLElement>();
let walkId: string = '';
let isProcessing = false;

// Sentinel that tells us whether the observers are currently armed. The
// previous implementation conflated "is the page being mutated by us" with
// "should we ignore mutations" -- here we use a single, clearer flag.
let internalMutationDepth = 0;

// Element queue for sequential processing. processElement is async-heavy
// (LLM round-trip) so we serialize it; the IntersectionObserver controls
// admission to the queue.
let elementQueue: HTMLElement[] = [];
let isProcessingQueue = false;

// ---------------------------------------------------------------------------
// Walk ID generator
// ---------------------------------------------------------------------------
function newWalkId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for older browsers / iframes without crypto access.
    return `genshred-walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------
async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    try {
        while (elementQueue.length > 0) {
            const element = elementQueue.shift();
            if (!element || !element.isConnected) continue;
            if (element.classList.contains(PROCESSED_CLASS)) continue;
            try {
                await processElement(element);
            }
            catch (err) {
                log.error('Error processing element from queue:', err);
                element.classList.remove(PROCESSING_CLASS);
            }
        }
    }
    finally {
        isProcessingQueue = false;
    }
}

function handleFoundElement(element: HTMLElement) {
    if (!element.isConnected) return;
    if (element.classList.contains(PROCESSED_CLASS)) return;
    if (element.classList.contains(PROCESSING_CLASS)) return;
    if (elementQueue.includes(element)) return;
    elementQueue.push(element);
    void processQueue();
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
// The walk-and-label step decides whether a node is structurally a
// paragraph; this filter applies the AI-specific business rules (length,
// language, complexity heuristics, "interesting" content).
function isCandidateParagraph(element: HTMLElement): boolean {
    if (!element.isConnected) return false;
    // Structural visibility only: off-screen paragraphs are still valid
    // candidates so the IntersectionObserver can lazily translate them.
    if (!isStructurallyVisible(element)) return false;

    if (element.classList.contains(PROCESSED_CLASS)) return false;
    if (element.classList.contains(PROCESSING_CLASS)) return false;
    if (element.closest(`.${REWRITE_CONTAINER_CLASS}`)) return false;
    if (element.closest(`.${TOOLTIP_CONTAINER_CLASS}`)) return false;
    if (observedElements.has(element)) return false;

    const text = element.textContent ?? '';
    const trimmedLen = text.trim().length;

    const minLen = currentSettings.genShredMinParagraphLength ?? MIN_PARAGRAPH_LENGTH;
    if (trimmedLen < minLen) {
        if (isChineseText(text) && trimmedLen >= MIN_CHINESE_PARAGRAPH_LENGTH) {
            const ratio = getChineseTextRatio(text);
            log.debug(`Allowing Chinese paragraph (${trimmedLen} chars, ratio: ${ratio.toFixed(2)})`);
        }
        else {
            element.classList.add(PROCESSED_CLASS);
            return false;
        }
    }
    if (trimmedLen > MAX_PARAGRAPH_LENGTH) return false;

    // "Looks like content" heuristics. The walk already excludes inputs,
    // editable areas, scripts, etc. -- this is a final guardrail.
    if (element.closest('svg') || element.closest('canvas')) return false;

    const alphabeticCount = (text.match(/[a-zA-Z]/g) || []).length;
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;

    if (chineseCount > 0) {
        if (!isMeaningfulChineseText(text)) return false;
        if (shouldSkipChineseElement(text)) return false;
        if (chineseCount < 5) return false;
    }
    else if (alphabeticCount > 0) {
        if (text.length > 0 && text.length < 50) {
            if (alphabeticCount / text.length < 0.3) return false;
        }
    }
    else {
        // Numbers / symbols only.
        return false;
    }

    return true;
}

// ---------------------------------------------------------------------------
// IntersectionObserver
// ---------------------------------------------------------------------------
function setupIntersectionObserver() {
    if (intersectionObserver) return;

    intersectionObserver = new IntersectionObserver(
        async (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const element = entry.target;
                if (!isHTMLElement(element)) {
                    intersectionObserver?.unobserve(element);
                    continue;
                }
                if (!currentSettings[STORAGE_KEYS.IS_ON]
                    || element.classList.contains(PROCESSED_CLASS)
                    || element.classList.contains(PROCESSING_CLASS)) {
                    intersectionObserver?.unobserve(element);
                    continue;
                }
                handleFoundElement(element);
                intersectionObserver?.unobserve(element);
            }
        },
        {
            // 600px matches read-frog's default and is a good trade-off
            // between "translate before user notices" and "don't waste tokens
            // on content the user will never see".
            rootMargin: '600px 0px',
            threshold: 0.1,
        },
    );
}

function observeParagraph(element: HTMLElement) {
    setupIntersectionObserver();
    if (observedElements.has(element)) return;
    observedElements.add(element);
    intersectionObserver?.observe(element);

    // Already inside the viewport (with buffer)? Schedule immediately so we
    // don't wait for a scroll event.
    if (isElementInViewport(element)) {
        handleFoundElement(element);
    }
}

// ---------------------------------------------------------------------------
// Walk container (entry-point used by initial run + mutations)
// ---------------------------------------------------------------------------
function shouldSkipContainer(container: HTMLElement): boolean {
    // A container can be unwalkable for the same reasons individual elements
    // can: it's inside a "don't walk" subtree, it's hidden, it's editable, ...
    if (hasNoWalkAncestor(container)) return true;
    if (isDontWalkIntoButTranslateAsChildElement(container)) return true;
    if (isDontWalkIntoAndDontTranslateAsChildElement(container)) return true;
    return false;
}

function discoverAndObserveParagraphs(container: HTMLElement) {
    if (!walkId) walkId = newWalkId();
    if (shouldSkipContainer(container)) return;

    walkAndLabelElement(container, walkId);

    let paragraphs: HTMLElement[];
    if (container.hasAttribute(PARAGRAPH_ATTRIBUTE)
        && container.getAttribute(WALKED_ATTRIBUTE) === walkId) {
        paragraphs = [container];
    }
    else {
        const collected = collectParagraphElementsDeep(container, walkId);
        paragraphs = filterTopLevelParagraphs(container, collected);
    }

    for (const el of paragraphs) {
        if (!isCandidateParagraph(el)) continue;
        observeParagraph(el);
    }
}

// ---------------------------------------------------------------------------
// Walk-blocked element cache (accordion / hidden-then-shown handling)
// ---------------------------------------------------------------------------
function isWalkBlocked(element: HTMLElement): boolean {
    return isDontWalkIntoButTranslateAsChildElement(element)
        || isDontWalkIntoAndDontTranslateAsChildElement(element);
}

function recordBlockedDescendants(root: HTMLElement) {
    if (isWalkBlocked(root)) walkBlockedElements.add(root);
    const all = root.querySelectorAll<HTMLElement>('*');
    for (const el of Array.from(all)) {
        if (isWalkBlocked(el)) walkBlockedElements.add(el);
    }
}

function didTransitionToWalkable(element: HTMLElement): boolean {
    const wasBlocked = walkBlockedElements.has(element);
    const isBlockedNow = isWalkBlocked(element);
    if (isBlockedNow) walkBlockedElements.add(element);
    else walkBlockedElements.delete(element);
    return wasBlocked && !isBlockedNow;
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------
const debouncedFullScan = debounce(() => {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) return;
    void processParagraphs();
}, 300);

function isWalkabilityAttribute(attr: string | null): boolean {
    return attr === 'style' || attr === 'class' || attr === 'hidden' || attr === 'aria-hidden';
}

function isMutationFromOurInjection(target: Node): boolean {
    if (!isHTMLElement(target)) return false;
    if (target.classList.contains(REWRITE_CONTAINER_CLASS)) return true;
    if (target.classList.contains(PROCESSING_CLASS)) return true;
    if (target.closest(`.${REWRITE_CONTAINER_CLASS}`)) return true;
    if (target.closest(`.${PROCESSING_CLASS}`)) return true;
    if (target.closest(`.${TOOLTIP_CONTAINER_CLASS}`)) return true;
    return false;
}

function handleMutationRecords(records: MutationRecord[]) {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) return;
    if (internalMutationDepth > 0) return;

    let shouldFullScan = false;

    for (const rec of records) {
        if (rec.type === 'childList') {
            if (rec.addedNodes.length === 0) continue;
            for (const node of Array.from(rec.addedNodes)) {
                if (!isHTMLElement(node)) continue;
                if (isMutationFromOurInjection(node)) continue;

                recordBlockedDescendants(node);
                discoverAndObserveParagraphs(node);
                observeIsolatedDescendantsMutations(node);
            }
        }
        else if (rec.type === 'attributes' && isWalkabilityAttribute(rec.attributeName)) {
            const target = rec.target;
            if (!isHTMLElement(target)) continue;
            if (isMutationFromOurInjection(target)) continue;
            if (didTransitionToWalkable(target)) {
                discoverAndObserveParagraphs(target);
            }
        }
        else if (rec.type === 'characterData') {
            const target = rec.target.parentElement;
            if (!target || isMutationFromOurInjection(target)) continue;
            // Cheap guard: only schedule a (debounced) re-scan if the change
            // happens outside an already-rewritten container.
            shouldFullScan = true;
        }
    }

    if (shouldFullScan) debouncedFullScan();
}

function observeMutations(container: HTMLElement) {
    const observer = new MutationObserver(handleMutationRecords);
    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
        characterData: true,
    });
    mutationObservers.push(observer);
    observeIsolatedDescendantsMutations(container);
}

// Recursively attach a MutationObserver to every shadow root we can reach.
// Top-level observers won't fire for nodes inside an isolated shadow tree.
function observeIsolatedDescendantsMutations(element: HTMLElement) {
    if (element.shadowRoot) {
        for (const child of Array.from(element.shadowRoot.children)) {
            if (isHTMLElement(child)) observeMutations(child);
        }
    }
    for (const child of Array.from(element.children)) {
        if (isHTMLElement(child)) observeIsolatedDescendantsMutations(child);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function startObservingDOMChanges() {
    stopObservingDOMChanges();
    if (!document.body) return;
    observeMutations(document.body);
    log.debug('MutationObserver attached to document.body and reachable shadow roots');
}

function stopObservingDOMChanges() {
    for (const obs of mutationObservers) {
        try {
            obs.disconnect();
        }
        catch (err) {
            log.warn('Error disconnecting MutationObserver:', err);
        }
    }
    mutationObservers = [];
}

// Initial / re-scan entry point. Walks the body, observes paragraphs, and
// arms the MutationObserver. Safe to call multiple times.
async function processParagraphs() {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) {
        log.debug('Plugin off, skipping processParagraphs');
        return;
    }
    if (isProcessing) {
        log.debug('Already processing, skipping reentrant call');
        return;
    }
    if (!document.body) return;

    isProcessing = true;
    try {
        clearMainContentContainerCache();
        if (!walkId) walkId = newWalkId();

        recordBlockedDescendants(document.body);

        const start = performance.now();
        discoverAndObserveParagraphs(document.body);
        const elapsed = Math.round(performance.now() - start);
        log.debug(`Walk-and-label discovery completed in ${elapsed}ms`);

        if (mutationObservers.length === 0) {
            startObservingDOMChanges();
        }

        // Listen to scroll for very long pages. The IntersectionObserver
        // already does the heavy lifting, but this helps when virtual lists
        // change scroll containers without reporting structural mutations.
        ensureScrollListener();
    }
    finally {
        isProcessing = false;
    }
}

let scrollListenerAttached = false;
const onScroll = debounce(() => {
    if (!currentSettings[STORAGE_KEYS.IS_ON]) return;
    void processParagraphs();
}, 200);

function ensureScrollListener() {
    if (scrollListenerAttached) return;
    window.addEventListener('scroll', onScroll, { passive: true });
    scrollListenerAttached = true;
}

function setupIntersectionObserverPublic() {
    setupIntersectionObserver();
}

export {
    startObservingDOMChanges,
    stopObservingDOMChanges,
    setupIntersectionObserverPublic as setupIntersectionObserver,
    processParagraphs,
};
