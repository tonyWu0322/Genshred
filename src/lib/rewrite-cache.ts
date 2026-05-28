// Per-sentence rewrite cache.
//
// Why this module exists:
//   The previous "cache" in api-helpers.ts only did a read; nothing ever
//   wrote results back, so every paragraph hit the LLM on every visit. It
//   was also keyed on the *whole paragraph* hash, which meant two pages
//   sharing the same sentence — or even the same paragraph with one extra
//   space — wasted a fresh round-trip.
//
//   This module replaces that path with a two-tier cache that stores
//   results per *sentence*:
//
//     1. An in-memory `Map` (cheap, no async, survives only the current
//        tab session) that absorbs the common case of the user scrolling
//        the same paragraph in and out of view.
//     2. A persistent layer in `chrome.storage.local` so rewrites are
//        re-used across page loads and even across tabs.
//
//   Both layers are keyed by a SHA-256 of
//   `sentence | userLevel | language | promptInstruction | customPromptTemplate`
//   so any change to difficulty mapping, language, or custom prompt
//   transparently invalidates the cache.
//
//   We also LRU-trim the persistent layer (chrome.storage.local has a hard
//   ~10 MB cap) and swallow quota errors so a full store can't break
//   rewriting on a page.

import { sha256 } from './utilities';
import * as log from './logger';

const CACHE_PREFIX = 'genshred_cache_';

// When the number of persisted entries climbs above this threshold we trim
// the cache down to TRIM_TARGET. The numbers are chosen so that even
// large pages (~few hundred sentences) don't trigger a trim per visit, and
// each entry stays well under a few hundred bytes so the storage footprint
// is bounded at ~1-2 MB.
const MAX_ENTRIES = 2000;
const TRIM_TARGET = 1500;
// We don't want to enumerate `chrome.storage.local` on every write — that
// would be O(n) for every cache write. Instead, run the bookkeeping at most
// once per N writes.
const TRIM_CHECK_INTERVAL = 200;

// Persistent entry shape. Keys are intentionally short to save bytes since
// chrome.storage.local serialises values as JSON.
interface CacheEntry {
    r: string; // rewritten text
    t: number; // last-used timestamp (ms epoch), used for LRU trimming
}

const memoryCache = new Map<string, string>();
let writesSinceLastTrim = 0;

interface CacheInputs {
    sentence: string;
    userLevel: string;
    language: string;
    promptInstruction: string;
    customPromptTemplate?: string;
}

async function buildCacheKey(inputs: CacheInputs): Promise<string> {
    // The separator `\u0001` is unlikely to ever appear in user text, prompt
    // text, or LLM output, so we don't need to worry about collisions
    // between e.g. ("ab", "c") and ("a", "bc").
    const composite = [
        inputs.sentence,
        inputs.userLevel,
        inputs.language,
        inputs.promptInstruction,
        inputs.customPromptTemplate ?? '',
    ].join('\u0001');
    const hash = await sha256(composite);
    return `${CACHE_PREFIX}${hash}`;
}

export async function getCachedRewrite(inputs: CacheInputs): Promise<string | null> {
    const key = await buildCacheKey(inputs);

    const memoryHit = memoryCache.get(key);
    if (memoryHit !== undefined) {
        log.debug('Rewrite cache: memory hit for sentence', inputs.sentence.slice(0, 60));
        return memoryHit;
    }

    try {
        const stored = await chrome.storage.local.get(key);
        const entry = stored[key] as CacheEntry | undefined;
        if (entry && typeof entry.r === 'string') {
            memoryCache.set(key, entry.r);
            // Bump LRU timestamp lazily — fire and forget. We don't await so
            // we don't add latency to cache hits. If the bump fails the next
            // write or trim will still surface storage problems.
            void chrome.storage.local.set({ [key]: { r: entry.r, t: Date.now() } })
                .catch((err: unknown) => log.debug('Cache LRU bump failed:', err));
            log.debug('Rewrite cache: storage hit for sentence', inputs.sentence.slice(0, 60));
            return entry.r;
        }
    } catch (err) {
        log.warn('Rewrite cache read failed:', err);
    }
    return null;
}

export async function setCachedRewrite(
    inputs: CacheInputs,
    rewritten: string,
): Promise<void> {
    if (!rewritten) return;
    const key = await buildCacheKey(inputs);
    memoryCache.set(key, rewritten);

    const entry: CacheEntry = { r: rewritten, t: Date.now() };
    try {
        await chrome.storage.local.set({ [key]: entry });
    } catch (err) {
        log.warn('Rewrite cache write failed, attempting trim + retry:', err);
        // Most likely cause is QUOTA_BYTES exceeded. Force a trim, then try
        // one more time. If the retry also fails we accept the loss; the
        // memory cache still holds the value for the rest of this session.
        await trimCacheIfNeeded({ force: true });
        try {
            await chrome.storage.local.set({ [key]: entry });
        } catch (retryErr) {
            log.warn('Rewrite cache write retry failed:', retryErr);
        }
    }

    writesSinceLastTrim += 1;
    if (writesSinceLastTrim >= TRIM_CHECK_INTERVAL) {
        void trimCacheIfNeeded({ force: false });
    }
}

interface TrimOptions {
    force: boolean;
}

async function trimCacheIfNeeded({ force }: TrimOptions): Promise<void> {
    writesSinceLastTrim = 0;
    try {
        const all = await chrome.storage.local.get(null);
        const cacheEntries: Array<[string, CacheEntry]> = [];
        for (const [k, v] of Object.entries(all)) {
            if (!k.startsWith(CACHE_PREFIX)) continue;
            if (v && typeof (v as CacheEntry).r === 'string') {
                cacheEntries.push([k, v as CacheEntry]);
            }
        }
        if (!force && cacheEntries.length <= MAX_ENTRIES) return;
        if (cacheEntries.length <= TRIM_TARGET) return;

        // Oldest first by timestamp; missing timestamps sort as "ancient".
        cacheEntries.sort(
            (a, b) => (a[1].t ?? 0) - (b[1].t ?? 0),
        );
        const keysToRemove = cacheEntries
            .slice(0, cacheEntries.length - TRIM_TARGET)
            .map(([k]) => k);
        if (keysToRemove.length === 0) return;
        await chrome.storage.local.remove(keysToRemove);
        for (const k of keysToRemove) memoryCache.delete(k);
        log.debug(
            `Rewrite cache trimmed: removed ${keysToRemove.length} oldest entries (kept ${TRIM_TARGET}).`,
        );
    } catch (err) {
        log.warn('Rewrite cache trim failed:', err);
    }
}

// Called by CLEAR_CACHE so the in-memory layer doesn't keep serving stale
// entries after the user manually wipes the storage layer.
export function clearMemoryCache(): void {
    memoryCache.clear();
    writesSinceLastTrim = 0;
}

// Lightweight stats hook, useful when debugging from the console (e.g.
// `window.genshredCacheStats()`). Counts only the in-memory layer to keep
// it synchronous; for a full count read chrome.storage.local directly.
export function getMemoryCacheStats(): { size: number } {
    return { size: memoryCache.size };
}

export const _CACHE_PREFIX_FOR_TESTING = CACHE_PREFIX;
