import { rejects } from "assert";
import { currentSettings } from "./state-management";
import { STORAGE_KEYS } from "~src/constants";

function debounce<F extends (...args: any[]) => any>(func: F, wait: number): (...args: Parameters<F>) => void {
    let timeout: number | undefined;
    
    return function(...args: Parameters<F>): void {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), wait);
    };
}


// Helper function to escape string for use in RegExp
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 表示整个匹配的字符串
}

// Helper function to escape HTML for attribute values and text content
function escapeHTML(string: string): string {
    return string
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper function to calculate complexity score
function calculateComplexityScore(sentence: string): number {
    const words = sentence.split(/\s+/).filter(word => word.length > 0);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length || 0;
    return words.length * 0.3 + avgWordLength * 0.7;
}



// Helper function to select sentences based on complexity
function selectSentences(
    sentencesWithScores: { sentence: string, index: number, complexity: number, startIndex: number }[],
    count: number
  ): { sentence: string, index: number, complexity: number, startIndex: number }[] {
      // Sort by complexity descending, select top N, then sort by original index
      const sorted = sentencesWithScores.slice().sort((a, b) => b.complexity - a.complexity);
      const selected = sorted.slice(0, count);
      return selected.sort((a, b) => a.index - b.index);
  }
  
  // Helper function to generate SHA256 hash
async function sha256(message: string): Promise<string> {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hexHash;
}

// 处理iframe内容
function handleIframes() {
    // 如果当前页面是iframe，则不需要处理其他iframe
    if (window.self !== window.top) {
        console.log("Running in iframe, skipping iframe handling");
        return;
    }
    
    // 查找所有iframe
    const processIframes = () => {
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    // 尝试访问iframe内容
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    
                    if (iframeDoc && currentSettings[STORAGE_KEYS.IS_ON]) {
                        // 在iframe内应用相同的处理逻辑
                        console.log("Processing iframe content");
                        
                        // 这里可以添加iframe内容处理逻辑
                        // 注意：由于同源策略限制，这只对同源iframe有效
                    }
                } catch (e) {
                    // 跨域iframe会抛出错误，这是正常的
                    console.log("Cannot access iframe content (likely cross-origin)");
                }
            });
        } catch (e) {
            console.error("Error processing iframes:", e);
        }
    };
    
    // 初始处理
    processIframes();
    
    // 设置定期检查新iframe
    setInterval(processIframes, 5000);
}
// from old crapmountain

// Chinese text processing utilities
export function isChineseText(text: string): boolean {
    const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalCharCount = text.length;
    return chineseCharCount > 0 && (chineseCharCount / totalCharCount) > 0.3;
}

export function getChineseTextRatio(text: string): number {
    const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalCharCount = text.length;
    return totalCharCount > 0 ? chineseCharCount / totalCharCount : 0;
}

export function isMeaningfulChineseText(text: string): boolean {
    if (!isChineseText(text)) return false;
    
    // Check for meaningful Chinese content patterns
    const meaningfulPatterns = [
        /[\u4e00-\u9fff]{3,}/, // At least 3 consecutive Chinese characters
        /[。！？；：，]/, // Contains Chinese punctuation
        /[的得地在着了过]/, // Contains common Chinese particles
    ];
    
    return meaningfulPatterns.some(pattern => pattern.test(text));
}

export function shouldSkipChineseElement(text: string): boolean {
    const chineseText = text.trim();
    
    // Skip patterns for Chinese text
    const skipPatterns = [
        /^[一二三四五六七八九十]+[、.]/, // Numbered lists like "一、" "二、"
        /^第[一二三四五六七八九十\d]+[章节篇]/, // Chapter headers like "第一章"
        /^[（(]\d+[）)]/, // Parenthetical numbers like "(1)" "（1）"
        /^[\u4e00-\u9fff]{1,2}[：:]\s*$/, // Short labels like "作者：" "标题："
        /^[年月日时分秒]/, // Date/time patterns
        /^[上下左右前后内外]/, // Directional words
        /^[大小长短高低]/, // Size/quality words
        /^[\d\s\p{P}]+$/u, // Only numbers, punctuation, or single characters
    ];
    
    return skipPatterns.some(pattern => pattern.test(chineseText));
}

// Page language detection utilities
let cachedPageLanguage: string | null = null;

export function detectPageLanguage(): string {
    // Return cached result if available
    if (cachedPageLanguage) {
        console.log(`Using cached page language: ${cachedPageLanguage}`);
        return cachedPageLanguage;
    }
    
    console.log("=== Starting page language detection ===");
    
    // Method 1: Analyze page content (NOW HIGHEST PRIORITY)
    // Try to get content from main content areas first
    let contentText = '';
    
    // Priority content selectors
    const contentSelectors = [
        'main',
        'article',
        '.content',
        '.main-content',
        '.post-content',
        '.entry-content',
        '#content',
        '#main',
        '.text-content',
        'p', // paragraphs
        'div' // general divs
    ];
    
    // Try to get content from main content areas
    for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            for (const element of elements) {
                const text = element.textContent || '';
                if (text.length > 100) { // Only consider substantial content
                    contentText += text + ' ';
                }
            }
        }
    }
    
    // If no substantial content found, fall back to body text
    if (contentText.length < 1000) {
        contentText = document.body.textContent || '';
    }
    
    const sampleSize = Math.min(contentText.length, 20000); // Increased sample size to 20k characters
    const sampleText = contentText.substring(0, sampleSize);
    
    console.log(`Analyzing page content (sample size: ${sampleSize} chars)`);
    console.log(`Sample text preview: "${sampleText.substring(0, 200)}..."`);
    
    // Count characters by language
    const chineseChars = (sampleText.match(/[\u4e00-\u9fff]/g) || []).length;
    const japaneseChars = (sampleText.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const koreanChars = (sampleText.match(/[\uac00-\ud7af]/g) || []).length;
    const arabicChars = (sampleText.match(/[\u0600-\u06ff]/g) || []).length;
    const cyrillicChars = (sampleText.match(/[\u0400-\u04ff]/g) || []).length;
    const latinChars = (sampleText.match(/[a-zA-Z]/g) || []).length;
    
    const totalChars = sampleText.length;
    
    console.log(`Character counts:`);
    console.log(`  Chinese: ${chineseChars}`);
    console.log(`  Japanese: ${japaneseChars}`);
    console.log(`  Korean: ${koreanChars}`);
    console.log(`  Arabic: ${arabicChars}`);
    console.log(`  Cyrillic: ${cyrillicChars}`);
    console.log(`  Latin: ${latinChars}`);
    console.log(`  Total: ${totalChars}`);
    
    // Calculate ratios
    const ratios = {
        zh: chineseChars / totalChars,
        ja: japaneseChars / totalChars,
        ko: koreanChars / totalChars,
        ar: arabicChars / totalChars,
        ru: cyrillicChars / totalChars,
        en: latinChars / totalChars
    };
    
    console.log(`Language ratios:`);
    Object.entries(ratios).forEach(([lang, ratio]) => {
        console.log(`  ${lang}: ${(ratio * 100).toFixed(2)}%`);
    });
    
    // Find the language with highest ratio
    const maxRatio = Math.max(...Object.values(ratios));
    const detectedLang = Object.keys(ratios).find(key => ratios[key as keyof typeof ratios] === maxRatio);
    
    console.log(`Highest ratio: ${(maxRatio * 100).toFixed(2)}% for language: ${detectedLang}`);
    
    // Lower threshold for content analysis since it's now the primary method
    if (maxRatio > 0.05 && detectedLang) { // Reduced threshold to 5% for better detection
        console.log(`✓ Page language detected from content analysis: ${detectedLang} (ratio: ${maxRatio.toFixed(3)})`);
        cachedPageLanguage = detectedLang;
        return detectedLang;
    } else {
        console.log(`✗ No language with sufficient ratio (>5%) found`);
    }
    
    // Method 2: Check HTML lang attribute (FALLBACK)
    const htmlLang = document.documentElement.lang;
    console.log(`HTML lang attribute: "${htmlLang}"`);
    if (htmlLang) {
        const langCode = htmlLang.toLowerCase().substring(0, 2);
        console.log(`Extracted lang code: "${langCode}"`);
        if (['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'pt', 'it', 'nl'].includes(langCode)) {
            console.log(`✓ Page language detected from HTML lang attribute: ${langCode}`);
            cachedPageLanguage = langCode;
            return langCode;
        } else {
            console.log(`✗ Lang code "${langCode}" not in supported list`);
        }
    } else {
        console.log("✗ No HTML lang attribute found");
    }
    
    // Method 3: Check meta tags (FALLBACK)
    const metaLang = document.querySelector('meta[http-equiv="content-language"]');
    console.log(`Meta content-language tag:`, metaLang);
    if (metaLang) {
        const langCode = metaLang.getAttribute('content')?.toLowerCase().substring(0, 2);
        console.log(`Meta lang code: "${langCode}"`);
        if (langCode && ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'pt', 'it', 'nl'].includes(langCode)) {
            console.log(`✓ Page language detected from meta tag: ${langCode}`);
            cachedPageLanguage = langCode;
            return langCode;
        } else {
            console.log(`✗ Meta lang code "${langCode}" not in supported list`);
        }
    } else {
        console.log("✗ No meta content-language tag found");
    }
    
    // Default to English if no clear language detected
    console.log('✗ Page language not detected, defaulting to English');
    cachedPageLanguage = 'en';
    return 'en';
}

export function clearPageLanguageCache(): void {
    cachedPageLanguage = null;
}

// Manual test function for debugging
export function testLanguageDetection(): void {
    console.log("=== Manual Language Detection Test ===");
    clearPageLanguageCache();
    const detectedLang = detectPageLanguage();
    console.log(`Final detected language: ${detectedLang}`);
    console.log("=== Test Complete ===");
}

// Test function for language-specific model selection
export function testLanguageModelSelection(): void {
    console.log("=== Language Model Selection Test ===");
    const languages = ['zh', 'en', 'ja', 'ko', 'ar', 'ru', 'fr', 'de', 'es'];
    languages.forEach(lang => {
        const model = getLanguageSpecificModel(lang);
        console.log(`Language: ${lang} -> Model: ${model}`);
    });
    console.log("=== Test Complete ===");
}

export function getLanguageSpecificModel(language: string): string {
    // Map language codes to spaCy model names
    const modelMap: { [key: string]: string } = {
        'zh': 'zh_core_web_sm',
        'en': 'en_core_web_sm',
        'ja': 'ja_core_news_sm',
        'ko': 'ko_core_news_sm', // Note: may need different model
        'fr': 'fr_core_news_sm',
        'de': 'de_core_news_sm',
        'es': 'es_core_news_sm',
        'ru': 'ru_core_news_sm',
        'ar': 'ar_core_news_sm',
        'pt': 'pt_core_news_sm',
        'it': 'it_core_news_sm',
        'nl': 'nl_core_news_sm'
    };
    
    return modelMap[language] || 'en_core_web_sm'; // Default to English
}

export {debounce, escapeRegExp, escapeHTML, calculateComplexityScore, selectSentences, sha256, handleIframes };

export function withTimeout(promise,ms){
    const timeout = new Promise((_, reject)=>{
        setTimeout(()=>reject(new Error('Request timed out')),ms);
    })
    return Promise.race([promise, timeout]);
}