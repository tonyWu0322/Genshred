// Imports what is needed for API calls
import { convert3To2 } from '~scripts/language_code_converter';
import { STORAGE_KEYS } from '../constants';
import type { ProcessResponse } from '../types';
import { currentSettings } from './state-management';
import { MIN_PARAGRAPH_LENGTH,MAX_PARAGRAPH_LENGTH } from '../constants';
import { sha256,calculateComplexityScore, selectSentences } from './utilities';
import { createLoadingSpan,createRewriteSpan,applySingleRewriteToElement } from './ui-components';
import { isElementVisible, getTextNodesWithOffsets,applyRewritesToElement } from './dom-utilities';
import {franc} from "franc-min";

export function detectLanguage(text){
    var detectedLanguage=franc(text);
    return convert3To2(detectedLanguage);
};

async function processElement(element: HTMLElement) {
    
    console.log("[New Attempt] Attempting to process element:", element.nodeName, element.textContent?.substring(0, 50) + "...");
    try {
        if (!currentSettings[STORAGE_KEYS.IS_ON]) {
            console.log("Skipping element: Plugin is OFF.");
            return;
        }
        if (element.classList.contains('genshred-processed')) {
            console.log("Skipping element: Already processed.");
            return;
        }
        if (element.classList.contains('genshred-processing')) {
            console.log("Skipping element: Already processing.");
            return;
        }
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
        const maxChildNodes = 20; // read mode deprecated
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
        if (textBlock.length < MIN_PARAGRAPH_LENGTH) {
            console.log(`Text block too short (${textBlock.length} chars), skipping. Min: ${MIN_PARAGRAPH_LENGTH}`);
            return;
        }
        if (textBlock.length > MAX_PARAGRAPH_LENGTH) {
            console.log(`Text block too long (${textBlock.length} chars), skipping. Max: ${MAX_PARAGRAPH_LENGTH}`);
            return;
        }
        
        console.log("Processing text block:", textBlock.substring(0, 50) + "...");

        // Mark as processing to prevent duplicate processing
        element.classList.add('genshred-processing');
        const detectedlanguage = detectLanguage(textBlock)
        console.log("Detected language:", detectedlanguage);
        if (detectedlanguage === 'und') {
            console.log("Undetected language, skipping.");
            return;
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

        // Request sentence splitting from background script
        const splitResponse = await chrome.runtime.sendMessage({
            type: "SPLIT_SENTENCES",
            text: textBlock,
            language: detectedlanguage
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

        // Calculate number of sentences to rewrite based on percentage
        const percentageToRewrite = Number(currentSettings[STORAGE_KEYS.SENTENCE_COUNT]); // This is now a percentage (0-100)
        const numSentencesToRewrite = Math.round(sentencesWithOriginalDataFiltered.length * (percentageToRewrite / 100));

        const selectedSentences = selectSentences(
            sentencesWithOriginalDataFiltered,
            numSentencesToRewrite
        );
        console.log(`Selected ${selectedSentences.length} sentences for rewriting:`, selectedSentences);

        // Process each selected sentence separately and apply as soon as result is ready
        let processedCount = 0;
        for (const { sentence, index, startIndex } of selectedSentences) {
            // 先插入 loading 效果
            const loadingSpan = createLoadingSpan(sentence);
            applySingleRewriteToElement(element, sentence, '', startIndex, textNodeMappings, loadingSpan);
            (async () => {
                const result = await new Promise<ProcessResponse>((resolve) => {
                    let promptToUse = effectivePromptInstruction;
                    chrome.runtime.sendMessage(
                        {
                            type: "PROCESS_TEXT_BLOCK",
                            textBlock: sentence,
                            numSentences: 1,
                            promptInstruction: promptToUse,
                            customPromptTemplate: effectiveCustomPromptTemplate,
                            userLevel: selectedDifficulty,
                            originalIndex: index
                        },
                        (response) => resolve(response)
                    );
                });
                if (result?.rewritten_sentences?.[0]) {
                    // 替换 loading 效果为最终改写内容
                    const rewriteSpan = createRewriteSpan(sentence, result.rewritten_sentences[0].rewritten_text);
                    if (loadingSpan.parentNode) {
                        loadingSpan.parentNode.replaceChild(rewriteSpan, loadingSpan);
                    } else {
                        // fallback: 直接用 applySingleRewriteToElement
                    applySingleRewriteToElement(element, sentence, result.rewritten_sentences[0].rewritten_text, startIndex, textNodeMappings);
                    }
                }
                processedCount++;
                if (processedCount === selectedSentences.length) {
                    element.classList.add('genshred-processed');
                    element.classList.remove('genshred-processing');
                }
            })();
        }
    } catch (error) {
        console.error("Error in processElement:", error);
        element.classList.remove('genshred-processing');
    }
}

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