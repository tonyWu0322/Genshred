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
export {debounce, escapeRegExp, escapeHTML, calculateComplexityScore, selectSentences, sha256, handleIframes };

export function withTimeout(promise,ms){
    const timeout = new Promise((_, reject)=>{
        setTimeout(()=>reject(new Error('Request timed out')),ms);
    })
    return Promise.race([promise, timeout]);
}