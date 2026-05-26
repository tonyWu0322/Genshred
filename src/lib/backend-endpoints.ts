import { SERVER_URL } from "../config";
import { STORAGE_KEYS } from "../constants";

export type BackendEndpoints = {
  mode: "official" | "custom";
  splitUrl: string;
  processTextUrl: string;
  llmApiKey: string;
  customLlmModel: string;
  customLlmTemperature: number;
  customLlmTopP: number;
  customLlmMaxTokens: number;
  customLlmTimeoutMs: number;
};

function trimTrailingSlashes(u: string): string {
  return u.replace(/\/+$/, "");
}

/**
 * 解析分句与改写请求的目标 URL。
 * - official：使用构建期 SERVER_URL + /split_sentences、/process_text
 * - custom：使用用户填写的完整 URL；若某项为空则回退到官方路径
 */
export async function resolveBackendEndpoints(): Promise<BackendEndpoints> {
  const s = await chrome.storage.local.get([
    STORAGE_KEYS.BACKEND_MODE,
    STORAGE_KEYS.CUSTOM_SPLIT_URL,
    STORAGE_KEYS.CUSTOM_LLM_URL,
    STORAGE_KEYS.CUSTOM_LLM_API_KEY,
    STORAGE_KEYS.CUSTOM_LLM_MODEL,
    STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE,
    STORAGE_KEYS.CUSTOM_LLM_TOP_P,
    STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS,
    STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS,
  ]);
  const base = trimTrailingSlashes(SERVER_URL);
  const modeRaw = s[STORAGE_KEYS.BACKEND_MODE];
  const mode: "official" | "custom" = modeRaw === "custom" ? "custom" : "official";

  if (mode === "official") {
    return {
      mode: "official",
      splitUrl: `${base}/split_sentences`,
      processTextUrl: `${base}/process_text`,
      llmApiKey: "",
      customLlmModel: "",
      customLlmTemperature: 0.7,
      customLlmTopP: 0.7,
      customLlmMaxTokens: 512,
      customLlmTimeoutMs: 20000,
    };
  }

  const customSplit = String(s[STORAGE_KEYS.CUSTOM_SPLIT_URL] ?? "").trim();
  const customLlm = String(s[STORAGE_KEYS.CUSTOM_LLM_URL] ?? "").trim();
  const llmApiKey = String(s[STORAGE_KEYS.CUSTOM_LLM_API_KEY] ?? "").trim();
  const customLlmModel = String(s[STORAGE_KEYS.CUSTOM_LLM_MODEL] ?? "gpt-4o-mini").trim() || "gpt-4o-mini";
  const customLlmTemperature = Number(s[STORAGE_KEYS.CUSTOM_LLM_TEMPERATURE] ?? 0.7);
  const customLlmTopP = Number(s[STORAGE_KEYS.CUSTOM_LLM_TOP_P] ?? 0.7);
  const customLlmMaxTokens = Number(s[STORAGE_KEYS.CUSTOM_LLM_MAX_TOKENS] ?? 512);
  const customLlmTimeoutMs = Number(s[STORAGE_KEYS.CUSTOM_LLM_TIMEOUT_MS] ?? 20000);

  return {
    mode: "custom",
    splitUrl: customSplit || `${base}/split_sentences`,
    processTextUrl: customLlm || `${base}/process_text`,
    llmApiKey,
    customLlmModel,
    customLlmTemperature: Number.isFinite(customLlmTemperature) ? customLlmTemperature : 0.7,
    customLlmTopP: Number.isFinite(customLlmTopP) ? customLlmTopP : 0.7,
    customLlmMaxTokens: Number.isFinite(customLlmMaxTokens) ? customLlmMaxTokens : 512,
    customLlmTimeoutMs: Number.isFinite(customLlmTimeoutMs) ? customLlmTimeoutMs : 20000,
  };
}

/** 改写请求头：与 Parabasis 兼容的 JSON；自定义时可附加 Bearer API Key */
export function buildProcessTextHeaders(llmApiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (llmApiKey) {
    h["Authorization"] = `Bearer ${llmApiKey}`;
  }
  return h;
}
