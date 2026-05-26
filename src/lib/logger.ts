/**
 * 日志策略：
 * - production（`plasmo build`）：不输出 debug / warn / net / prompt / messageIo；
 *   仅 `error()` 会写入控制台（真实异常）。
 * - development（`plasmo dev`）：启用上述调试输出；其中 `net`、`promptFull`、`messageIo`
 *   用于查看 HTTP 载荷与最终提示词、以及 content ↔ background 消息摘要。
 *
 * 判定：`process.env.NODE_ENV === "development"`（构建时注入）。
 */

declare const process: { env?: { NODE_ENV?: string } } | undefined;

export const IS_DEV =
  typeof process !== "undefined" &&
  process.env != null &&
  process.env.NODE_ENV === "development";

function logDev(level: "log" | "warn", ...args: unknown[]) {
  if (!IS_DEV) return;
  console[level]("[Genshred]", ...args);
}

/** 一般调试信息（仅 dev） */
export function debug(...args: unknown[]) {
  logDev("log", ...args);
}

/** 警告（仅 dev，避免污染终端） */
export function warn(...args: unknown[]) {
  logDev("warn", ...args);
}

/** 错误（始终输出） */
export function error(...args: unknown[]) {
  console.error("[Genshred]", ...args);
}

/** 发往 / 来自后端的 HTTP 或等价载荷摘要（仅 dev） */
export function net(
  direction: "out" | "in",
  label: string,
  payload: unknown
) {
  if (!IS_DEV) return;
  const tag = direction === "out" ? "→" : "←";
  console.log(`[Genshred net ${tag}]`, label, payload);
}

/** 最终送入模型的提示词全文（仅 dev） */
export function promptFull(text: string) {
  if (!IS_DEV) return;
  console.log("[Genshred prompt]", text);
}

/** content ↔ background 消息（仅 dev，避免记录过大 body 时可在外部截断） */
export function messageIo(
  direction: "out" | "in",
  type: string,
  summary?: unknown
) {
  if (!IS_DEV) return;
  const tag = direction === "out" ? "→" : "←";
  console.log(`[Genshred msg ${tag}]`, type, summary ?? "");
}
