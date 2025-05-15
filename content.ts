// content.ts
let isEnabled = true
let sentenceCount = 5
let difficultyLevel = "simplify" // "simplify" or "complicate"

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_PLUGIN") {
    isEnabled = message.enabled
    console.log("分级阅读插件启用状态：", isEnabled)
  }

  if (message.type === "SET_REWRITE_COUNT") {
    sentenceCount = message.count
    console.log("需要重写的句子数：", sentenceCount)
  }

  if (message.type === "SET_DIFFICULTY") {
    difficultyLevel = message.difficulty === "Easy" ? "simplify" : "complicate"
    console.log("分级难度设置为：", difficultyLevel)
  }

  if (message.type === "TRANSLATE_TEXT" && isEnabled) {
    const paragraphs = Array.from(document.querySelectorAll("p"))
    const textContents = paragraphs.map((p) => p.innerText).filter(Boolean)

    // 简单句子切分逻辑：拆成单句，过滤掉太短的句子
    const allSentences = textContents.flatMap((text) =>
      text.match(/[^.!?]+[.!?]+/g) || []
    ).filter((s) => s.trim().length > 10)

    // 随机选择 sentenceCount 个句子
    const selectedSentences = allSentences
      .sort(() => Math.random() - 0.5)
      .slice(0, sentenceCount)

    selectedSentences.forEach((sentence) => {
      chrome.runtime.sendMessage(
        {
          type: "ADJUST_TEXT",
          payload: sentence,
          level: difficultyLevel
        },
        (response) => {
          const adjusted = response?.adjustedText
          if (adjusted) {
            replaceSentenceInDOM(sentence, adjusted)
          }
        }
      )
    })
  }

  return true
})

// DOM 替换逻辑（简单版本）
function replaceSentenceInDOM(original: string, updated: string) {
  const paragraphs = document.querySelectorAll("p")
  paragraphs.forEach((p) => {
    if (p.innerText.includes(original)) {
      p.innerHTML = p.innerHTML.replace(original, `<mark>${updated}</mark>`)
    }
  })
}
