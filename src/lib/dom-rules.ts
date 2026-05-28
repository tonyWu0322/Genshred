// DOM walking rules and per-hostname overrides.
//
// Inspired by read-frog (`src/utils/constants/dom-rules.ts`,
// `src/utils/constants/dom-labels.ts`) but adapted to Genshred. The goal is
// to share read-frog's mature multi-site adaptation logic without giving up
// Genshred's sentence-level AI rewriting flow.
//
// Conventions:
// - Tag names are always upper-cased (matches `Element.tagName`).
// - "Don't walk into" rules stop the traversal from descending. The element
//   itself may still be translated as part of its parent paragraph.
// - "Don't walk and don't translate" rules drop the element entirely.

// ---------------------------------------------------------------------------
// Genshred-owned wrapper / state classes (kept stable for backward compat)
// ---------------------------------------------------------------------------
export const REWRITE_CONTAINER_CLASS = 'genshred-rewrite-container';
export const PROCESSED_CLASS = 'genshred-processed';
export const PROCESSING_CLASS = 'genshred-processing';
export const TOOLTIP_CONTAINER_CLASS = 'genshred-tooltip-container';
export const ORIGINAL_TEXT_WRAPPER_CLASS = 'genshred-original-text-wrapper';
export const REWRITE_BUTTON_CLASS = 'genshred-rewrite-button';

// Industry-standard "do not translate" marker. Honoured by Google Translate,
// Immersive Translation, etc. Useful when sites or other extensions want to
// opt-out a node.
export const NOTRANSLATE_CLASS = 'notranslate';

// ---------------------------------------------------------------------------
// Walk attributes (used by walkAndLabelElement to mark discovered nodes)
// ---------------------------------------------------------------------------
export const WALKED_ATTRIBUTE = 'data-genshred-walked';
export const PARAGRAPH_ATTRIBUTE = 'data-genshred-paragraph';
export const BLOCK_ATTRIBUTE = 'data-genshred-block-node';
export const INLINE_ATTRIBUTE = 'data-genshred-inline-node';

// ---------------------------------------------------------------------------
// Tag rules
// ---------------------------------------------------------------------------

// Tags that always behave as block-level for the purpose of paragraph
// detection, even if their CSS display says otherwise.
export const FORCE_BLOCK_TAGS = new Set<string>([
    'BODY',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'FORM', 'SELECT', 'BUTTON', 'LABEL',
    'UL', 'OL', 'LI',
    'BLOCKQUOTE', 'PRE',
    'ARTICLE', 'SECTION',
    'FIGURE', 'FIGCAPTION',
    'HEADER', 'FOOTER', 'MAIN', 'NAV',
]);

// MathML tags. We never recurse into them and never translate their text.
export const MATH_TAGS = new Set<string>([
    'math', 'maction', 'annotation', 'annotation-xml',
    'menclose', 'merror', 'mfenced', 'mfrac', 'mi',
    'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded',
    'mphantom', 'mprescripts', 'mroot', 'mrow', 'ms',
    'mspace', 'msqrt', 'mstyle', 'msub', 'msubsup',
    'msup', 'mtable', 'mtd', 'mtext', 'mtr',
    'munder', 'munderover', 'semantics',
]);

// Tags whose subtree should never be entered AND whose text should never be
// included in any paragraph. They are usually media or non-text content.
export const DONT_WALK_AND_TRANSLATE_TAGS = new Set<string>([
    'HEAD', 'TITLE', 'HR',
    'INPUT', 'TEXTAREA',
    'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'PICTURE',
    'SOURCE', 'TRACK', 'META',
    'SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK',
    'RT', 'RP',
    'IFRAME',
    'svg',
    ...MATH_TAGS,
]);

// Tags whose subtree should not be walked into, but whose plain text content
// should still be included in the parent paragraph. Typical examples are
// inline code blocks: we don't want to chop sentences inside `<code>`, but
// the surrounding sentence should still see them.
export const DONT_WALK_BUT_TRANSLATE_TAGS = new Set<string>([
    'CODE', 'TIME', 'KBD', 'SAMP', 'VAR',
]);

// When the page has identifiable main content (`<article>`, `<main>`,
// `[role="main"]`), we skip these wrappers to avoid rewriting navigation,
// site chrome, or footer noise. Aligned with Defuddle/Readability heuristics.
export const MAIN_CONTENT_IGNORE_TAGS = new Set<string>([
    'HEADER', 'FOOTER', 'NAV', 'NOSCRIPT', 'ASIDE',
]);

// Common visually-hidden class names (a11y patterns).
export const VISUALLY_HIDDEN_CLASSES = [
    'sr-only',
    'visually-hidden',
    'screen-reader-only',
    'screen-reader-text',
];

// ---------------------------------------------------------------------------
// Per-hostname overrides
// ---------------------------------------------------------------------------
// Each entry is a list of CSS selectors. Any element matching one of them
// will be skipped during the walk. Selectors are joined with `,` so any
// invalid selector here will silently break adaptation for that host -- keep
// them simple and stable.
//
// The hostname key is matched against `window.location.hostname` directly,
// and a "*." wildcard (registrable-domain match) is also supported via
// `getHostnameRules` below.

export const CUSTOM_DONT_WALK_INTO_ELEMENT_SELECTOR_MAP: Record<string, string[]> = {
    // ChatGPT: don't rewrite inside the editable composer
    'chatgpt.com': ['.ProseMirror'],

    // arXiv: skip listings (line numbers, code) so equations stay intact
    'arxiv.org': ['.ltx_listing'],

    // Reddit (new front-end)
    'www.reddit.com': [
        'faceplate-screen-reader-content > *',
        'reddit-header-large *',
        'shreddit-comment-action-row > *',
        'shreddit-post-flair',
    ],

    // YouTube: ignore navigation chrome, channel metadata, native subtitles
    'www.youtube.com': [
        '#masthead-container *',
        '#guide-inner-content *',
        '#metadata *',
        '#channel-name',
        '.translate-button',
        '#top-row',
        '#header-author',
        '#reply-button-end',
        '#more-replies',
        '#info',
        '#badges *',
        'ytd-comments-header-renderer',
        '.yt-lockup-metadata-view-model__metadata',
        '.yt-spec-avatar-shape__badge-text',
    ],

    // Discord: usernames, timestamps, reply previews
    'discord.com': [
        '[id^="message-username"]',
        'span[class*="-timestamp"]',
        'div[class*="-repliedMessage"]',
        '[class*="-subtitleContainer"]',
    ],

    // GitHub: site chrome, file tree, repo header, diff tables
    'github.com': [
        '[aria-labelledby="folders-and-files"] *',
        'header *',
        '#repository-container-header *',
        'table.diff-table',
    ],

    // DeepWiki and similar wiki-style sites: keep nav/header out of scope
    'deepwiki.com': ['header *', 'nav *', 'aside *'],
    'www.deepwiki.com': ['header *', 'nav *', 'aside *'],

    // Twitter / X: skip side panels
    'twitter.com': ['nav[aria-label] *', '[data-testid="sidebarColumn"] *'],
    'x.com': ['nav[aria-label] *', '[data-testid="sidebarColumn"] *'],
};

// Selectors that must be treated as block-level paragraphs (overrides the
// inline display heuristic). Helpful for sites that style block-y content
// with `display: inline` (Reddit text bodies, GitHub task lists, etc.).
export const CUSTOM_FORCE_BLOCK_TRANSLATION_SELECTOR_MAP: Record<string, string[]> = {
    'github.com': ['task-lists'],
    'engoo.com': [
        '#windowexercise-2 > div > div > div.css-ep7xq6 > div > div > div.css-19m2fbm *',
    ],
    'www.reddit.com': ['shreddit-post-text-body'],
    'www.youtube.com': ['yt-attributed-string > span'],
};

/**
 * Resolve the rules that apply to the current document hostname. The lookup
 * tries exact match first, then falls back to the registrable domain
 * (e.g. `news.example.com` -> `example.com`).
 */
export function getHostnameRules<T>(map: Record<string, T[]>, hostname: string): T[] {
    if (!hostname) return [];
    const direct = map[hostname];
    if (direct && direct.length) return direct;

    const parts = hostname.split('.');
    while (parts.length > 2) {
        parts.shift();
        const candidate = parts.join('.');
        if (map[candidate] && map[candidate].length) {
            return map[candidate];
        }
    }
    return [];
}

/**
 * Convenience: combined CSS selector for the current host's "don't walk into"
 * rules. Returns an empty string if no rules apply, so callers can early-exit.
 */
export function getDontWalkIntoSelector(hostname: string = typeof window !== 'undefined' ? window.location.hostname : ''): string {
    return getHostnameRules(CUSTOM_DONT_WALK_INTO_ELEMENT_SELECTOR_MAP, hostname).join(',');
}

export function getForceBlockSelector(hostname: string = typeof window !== 'undefined' ? window.location.hostname : ''): string {
    return getHostnameRules(CUSTOM_FORCE_BLOCK_TRANSLATION_SELECTOR_MAP, hostname).join(',');
}
