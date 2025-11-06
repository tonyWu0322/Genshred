// Imports what is needed for API calls
import { convert3To2 } from '~scripts/language_code_converter';
import { STORAGE_KEYS } from '../constants';
import type { ProcessResponse } from '../types';
import { currentSettings } from './state-management';
import { MIN_PARAGRAPH_LENGTH,MAX_PARAGRAPH_LENGTH, MIN_CHINESE_PARAGRAPH_LENGTH } from '../constants';
import { sha256,calculateComplexityScore, selectSentences, withTimeout, isChineseText, getChineseTextRatio, detectPageLanguage, getLanguageSpecificModel } from './utilities';
import { createLoadingSpan,createRewriteSpan,applySingleRewriteToElement } from './ui-components';
import { isElementVisible, getTextNodesWithOffsets,applyRewritesToElement } from './dom-utilities';
import {franc} from "franc-min";

export function detectLanguage(text){
    var detectedLanguage=franc(text);
    var convertedLanguage = convert3To2(detectedLanguage);
    
    // If franc couldn't detect the language, try to detect Chinese manually
    if (convertedLanguage === null || convertedLanguage === 'und') {
        const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const totalCharCount = text.length;
        
        // If more than 30% of characters are Chinese, assume it's Chinese
        if (chineseCharCount > 0 && (chineseCharCount / totalCharCount) > 0.3) {
            console.log("Manual Chinese detection: detected Chinese text");
            return 'zh';
        }
    }
    
    return convertedLanguage;
};

async function processElement(element: HTMLElement) {
    console.log(element.classList.contains('genshred-processing')? "processing: TTT" : "-ing: FFF");
    console.log(element.classList.contains('genshred-processed')? "processed: TTT" : "-ed: FFF");
    if (element.classList.contains('genshred-processed') || element.classList.contains('genshred-processing')){
        console.log("Skipping element: Already processed or in-progress.");
        return;
    }
    element.classList.add('genshred-processing');
    console.log(element.classList.contains('genshred-processing')? "TTT" : "FFF");
    console.log("[New Attempt] Attempting to process element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
    console.log(element.classList);
    console.log(114514);
    try {
        if (!currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Skipping element: Plugin is OFF.");
            return;
        }
        // if (element.classList.contains('genshred-processed')) {
        //     console.log("Skipping element: Already processed.");
        //     return;
        // }
        // if (element.classList.contains('genshred-processing')) {
        //     console.log("Skipping element: Already processing.");
        //     return;
        // }
        if (element.closest('.genshred-rewrite-container')) {
            console.log("Skipping element: Part of a rewritten block.");
            return;
        }
        if (element.closest('.genshred-tooltip-container')) {
            console.log("Skipping element: Part of the tooltip.");
            return;
        }

        // Double-check visibility before processing
        if (!isElementVisible(element)) {
            console.log("Skipping element: Not visible.");
            element.classList.add('genshred-processed'); // Mark as processed to avoid re-checking
            return;
        }

        // Skip complex elements that are likely to cause issues
        if (element.tagName === 'TABLE' || 
            element.tagName === 'UL' || 
            element.tagName === 'OL' || 
            element.tagName === 'DL' ||
            element.closest('table') ||
            element.closest('ul') ||
            element.closest('ol') ||
            element.closest('dl')) {
            console.log("Skipping complex element (table/list):", element.tagName);
            return;
        }

        // Skip elements with too many child nodes (likely complex formatting)
        const childNodes = element.querySelectorAll('*');
        const maxChildNodes = 100; // Increased from 20 to 100 for better Chinese support
        if (childNodes.length > maxChildNodes) {
            console.log(`Skipping element with too many child nodes: ${childNodes.length} (max: ${maxChildNodes})`);
            return;
        }
        function sentenceSpansMultipleNodes(sentence: string, textNodeMappings: Array<{ node: Text, start: number, end: number }>): boolean {
            const sentenceStart = textBlock.indexOf(sentence);
            const sentenceEnd = sentenceStart + sentence.length;
            
            // Find all text nodes that overlap with this sentence
            const overlappingNodes = textNodeMappings.filter(mapping => 
                (mapping.start < sentenceEnd && mapping.end > sentenceStart)
            );
            
            // If more than one text node overlaps with the sentence, it spans multiple nodes
            return overlappingNodes.length > 1;
            }
        
        const { fullText: textBlock, mappings: textNodeMappings } = getTextNodesWithOffsets(element);
        console.log("Extracted text block from element:", textBlock.substring(0, 200) + "...");
        console.log("Text block length:", textBlock.length);

        // Check for minimum and maximum paragraph length early
        // Get minimum paragraph length from settings
        const minParagraphLength = currentSettings.genShredMinParagraphLength ?? MIN_PARAGRAPH_LENGTH;
        
        if (textBlock.length < minParagraphLength) {
            // Check if it's Chinese text and use Chinese-specific minimum
            if (isChineseText(textBlock) && textBlock.length >= MIN_CHINESE_PARAGRAPH_LENGTH) {
                // Chinese text with sufficient length, allow it
                const chineseRatio = getChineseTextRatio(textBlock);
                console.log(`Allowing Chinese text block with ${textBlock.length} chars (Chinese ratio: ${chineseRatio.toFixed(2)})`);
            } else {
                console.log(`Text block too short (${textBlock.length} chars), skipping. Min: ${minParagraphLength}`);
                return;
            }
        }
        if (textBlock.length > MAX_PARAGRAPH_LENGTH) {
            console.log(`Text block too long (${textBlock.length} chars), skipping. Max: ${MAX_PARAGRAPH_LENGTH}`);
            return;
        }
        
        console.log("Processing text block:", textBlock.substring(0, 50) + "...");

        // Mark as processing to prevent duplicate processing
        // element.classList.add('genshred-processing');
        let detectedlanguage = detectLanguage(textBlock)
        console.log("Detected language:", detectedlanguage);
        if (detectedlanguage === 'und' || detectedlanguage === null) {
            // Check if it's Chinese text manually
            const chineseCharCount = (textBlock.match(/[\u4e00-\u9fff]/g) || []).length;
            const totalCharCount = textBlock.length;
            const chineseRatio = chineseCharCount / totalCharCount;
            
            if (chineseRatio > 0.3) {
                console.log("Manual Chinese detection: detected Chinese text, using 'zh'");
                detectedlanguage = 'zh';
            } else {
                console.log("Undetected language, but continuing with default language (en)");
                detectedlanguage = 'en';
            }
        }
        const userLangPrefs = await chrome.storage.local.get('genshred_ignore_languages');
        const ignoreLangs: string[] = userLangPrefs['genshred_ignore_languages'] || [];
        if (ignoreLangs.includes(detectedlanguage)) {
            console.log(`Skipping element: Language ${detectedlanguage} is in user ignore list.`);
            element.classList.add('genshred-processed');
            return;
        }

        const selectedDifficulty = currentSettings[STORAGE_KEYS.DIFFICULTY_LEVEL] as string;
        // const effectivePromptInstruction = currentDifficultyMappings[selectedDifficulty] || "";
        const effectivePromptInstruction = await getPromptForDifficultyAndLanguage(selectedDifficulty, detectedlanguage);
        const effectiveCustomPromptTemplate = currentSettings[STORAGE_KEYS.CUSTOM_PROMPT];
        
        console.log("Using difficulty:", selectedDifficulty);
        console.log("Using prompt instruction:", effectivePromptInstruction);

        // Create a unique hash for the cache key to handle long text blocks
        const textHash = await sha256(textBlock);
        const cacheKey = `genshred_cache_${textHash}_${selectedDifficulty}_${effectiveCustomPromptTemplate || 'no_custom_prompt'}_${currentSettings[STORAGE_KEYS.SENTENCE_COUNT]}`;

        const cachedData = await chrome.storage.local.get(cacheKey);
        console.log("Checking cache for key:", cacheKey);
        console.log("Cached data retrieved:", cachedData);

        if (cachedData[cacheKey]) {
            console.log("Using cached response from chrome.storage.local for element:", textBlock.substring(0, 50) + "...");
            const { processedSentences, allOriginalSentences } = cachedData[cacheKey];
            applyRewritesToElement(element, processedSentences, allOriginalSentences, textNodeMappings);
            element.classList.add('genshred-processed');
            element.classList.remove('genshred-processing');
            return;
        }

        // Detect page language and get appropriate sentence splitting model
        const pageLanguage = detectPageLanguage();
        const sentenceModel = getLanguageSpecificModel(pageLanguage);
        console.log(`Page language detected: ${pageLanguage}, using model: ${sentenceModel}`);

        // Request sentence splitting from background script with language-specific model
        const splitResponse = await chrome.runtime.sendMessage({
            type: "SPLIT_SENTENCES",
            text: textBlock,
            language: pageLanguage,
            model: sentenceModel
        });

        if (splitResponse === undefined || splitResponse === null || splitResponse.error) {
            console.error("Error splitting sentences via background script:", splitResponse?.error || "No response or unknown error");
            return; // Stop processing if sentence splitting fails
        }
        const sentences = splitResponse.sentences;
        console.log(`Split text into ${sentences.length} sentences:`, sentences);

        // Replace the old mapping with runningOffset logic
        let runningOffset = 0;
        const sentencesWithOriginalData = sentences.map((sentence, index) => {
            const startIndex = textBlock.indexOf(sentence, runningOffset);
            runningOffset = startIndex + sentence.length;
            return {
                sentence,
                index,
                startIndex,
                complexity: calculateComplexityScore(sentence)
            };
        });

        // Filter out sentences that span multiple text nodes to avoid duplication issues
        const sentencesWithOriginalDataFiltered = sentencesWithOriginalData.filter(({ sentence }) => {
            const spansMultipleNodes = sentenceSpansMultipleNodes(sentence, textNodeMappings);
            if (spansMultipleNodes) {
                console.log(`Skipping sentence that spans multiple text nodes: "${sentence.substring(0, 50)}..."`);
            }
            return !spansMultipleNodes;
        });

        console.log(`Filtered ${sentencesWithOriginalData.length - sentencesWithOriginalDataFiltered.length} sentences that span multiple text nodes`);
        console.log("Remaining sentences with calculated complexity scores:", sentencesWithOriginalDataFiltered);

        // For Chinese text, process a reduced subset with extra filters and avoid long consecutive runs
        let sentencesToProcess;
        if (detectedlanguage === 'zh') {
            // 进一步过滤中文：去掉过短/无中文/全标点的句子
            const chineseCharRegex = /[\u4e00-\u9fff]/;
            const onlyPunctRegex = /^[\p{P}\p{Z}\p{S}]+$/u; // 仅标点/空白/符号
            const zhFiltered = sentencesWithOriginalDataFiltered.filter(({ sentence }) => {
                const trimmed = sentence.trim();
                if (trimmed.length < 6) return false; // 过短
                if (!chineseCharRegex.test(trimmed)) return false; // 不含中文
                if (onlyPunctRegex.test(trimmed)) return false; // 纯标点/空白
                return true;
            });

            // 目标数量：约 30%（向上取整），至少 1 个
            const targetCount = Math.max(1, Math.ceil(zhFiltered.length * 0.3));

            // 避免连续选择超过 2 个句子：线性扫描选择
            const selected: typeof zhFiltered = [];
            let runLength = 0;
            for (let i = 0; i < zhFiltered.length && selected.length < targetCount; i++) {
                const current = zhFiltered[i];
                // 如果上一条选择了，则 runLength+1，否则重置
                const prevSelected = selected.length > 0 ? selected[selected.length - 1] : null;
                const prevIndex = prevSelected ? prevSelected.index : -Infinity;
                if (prevIndex + 1 === current.index) {
                    // 与上一条相邻
                    if (runLength >= 2) {
                        // 已经连续两条，跳过本句，等待间隔
                        continue;
                    } else {
                        runLength += 1;
                        selected.push(current);
                    }
                } else {
                    // 打断了连续段，重置计数并选中
                    runLength = 1;
                    selected.push(current);
                }
            }

            sentencesToProcess = selected;
            console.log(`Chinese text detected: selecting ${sentencesToProcess.length}/${zhFiltered.length} (target ~${targetCount}) with no >2 consecutive.`);
        } else {
            // Non-Chinese text: use percentage-based selection
            const percentageToRewrite = Number(currentSettings[STORAGE_KEYS.SENTENCE_COUNT]); // This is now a percentage (0-100)
            const numSentencesToRewrite = Math.round(sentencesWithOriginalDataFiltered.length * (percentageToRewrite / 100));
            sentencesToProcess = selectSentences(sentencesWithOriginalDataFiltered, numSentencesToRewrite);
            console.log(`Non-Chinese text: selected ${sentencesToProcess.length} sentences for rewriting (${percentageToRewrite}%)`);
        }

        console.log(`Processing ${sentencesToProcess.length} sentences:`, sentencesToProcess);
        const rewritePromises = sentencesToProcess.map(async({sentence, index, startIndex})=>{
            const loadingSpan = createLoadingSpan(sentence);
            applySingleRewriteToElement(element, sentence, '', startIndex, textNodeMappings, loadingSpan);

            try {
                const result = await withTimeout(new Promise<ProcessResponse>((resolve) => {
                    let promptToUse = effectivePromptInstruction;
                    console.log("now processing:",sentence)
                    chrome.runtime.sendMessage({
                            type: "PROCESS_TEXT_BLOCK",
                            textBlock: sentence,
                            numSentences: 1,
                            promptInstruction: promptToUse,
                            customPromptTemplate: effectiveCustomPromptTemplate,
                            userLevel: selectedDifficulty,
                            originalIndex: index,
                            language: detectedlanguage // Add language information
                        },
                        (response) => resolve(response)
                        );
                    }),10000);
                if (result?.rewritten_sentences?.[0]) {
                    const rewriteSpan = createRewriteSpan(sentence, result.rewritten_sentences[0].rewritten_text);
                    if (loadingSpan.parentNode) {
                        loadingSpan.parentNode.replaceChild(rewriteSpan, loadingSpan);
                    }
                }
            } catch (error) {
                console.error("Error rewriting sentence:", error);
                // The loading spinner will remain, but the outer process can continue.
                // You could also replace the spinner with the original text here if desired.
                if (loadingSpan.parentNode) {
                    loadingSpan.parentNode.replaceChild(document.createTextNode(sentence), loadingSpan);
                }
            }
        });

            // Wait for ALL promises to complete (either resolved or rejected)
            await Promise.allSettled(rewritePromises);
        } catch (error) {
            console.error("Error in processElement:", error);
        } finally {
            // This block will ALWAYS run after the try or catch block finishes.
            // It ensures the element's state is reset, regardless of individual sentence failures.
            element.classList.remove('genshred-processing');
            console.log("process complete, add processed to:",element)
            element.classList.add('genshred-processed');
        }
    }

//         // Process each selected sentence separately and apply as soon as result is ready
//         let processedCount = 0;
//         for (const { sentence, index, startIndex } of selectedSentences) {
//             // 先插入 loading 效果
//             const loadingSpan = createLoadingSpan(sentence);
//             applySingleRewriteToElement(element, sentence, '', startIndex, textNodeMappings, loadingSpan);
//             (async () => {
//                 const result = await new Promise<ProcessResponse>((resolve) => {
//                     let promptToUse = effectivePromptInstruction;
//                     chrome.runtime.sendMessage(
//                         {
//                             type: "PROCESS_TEXT_BLOCK",
//                             textBlock: sentence,
//                             numSentences: 1,
//                             promptInstruction: promptToUse,
//                             customPromptTemplate: effectiveCustomPromptTemplate,
//                             userLevel: selectedDifficulty,
//                             originalIndex: index
//                         },
//                         (response) => resolve(response)
//                     );
//                 });
//                 if (result?.rewritten_sentences?.[0]) {
//                     // 替换 loading 效果为最终改写内容
//                     const rewriteSpan = createRewriteSpan(sentence, result.rewritten_sentences[0].rewritten_text);
//                     if (loadingSpan.parentNode) {
//                         loadingSpan.parentNode.replaceChild(rewriteSpan, loadingSpan);
//                     } else {
//                         // fallback: 直接用 applySingleRewriteToElement
//                     applySingleRewriteToElement(element, sentence, result.rewritten_sentences[0].rewritten_text, startIndex, textNodeMappings);
//                     }
//                 }
//                 processedCount++;
//                 if (processedCount === selectedSentences.length) {
//                     element.classList.add('genshred-processed');
//                     element.classList.remove('genshred-processing');
//                 }
//             })();
//         }
//     } catch (error) {
//         console.error("Error in processElement:", error);
//         element.classList.remove('genshred-processing');
//         element.classList.add('genshred-processed'); // 尝试应对重复改写
//     }
// }

async function getPromptForDifficultyAndLanguage(difficulty: string, language: string): Promise<string> {
    const { genshred_prompt_matrix } = await chrome.storage.local.get('genshred_prompt_matrix');
    const matrix = genshred_prompt_matrix || {};
    // Fallback order: specific language → default for difficulty → empty string
    return (
        matrix?.[difficulty]?.[language] ||
        matrix?.[difficulty]?.['default'] ||
        ''
    );
}

export {processElement,getPromptForDifficultyAndLanguage};