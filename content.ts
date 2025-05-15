let isEnabled = true
let sentenceCount = 5
let difficultyLevel = "simplify" // or "complicate"

function processText() {
  if (!isEnabled) return

  const paragraphs = Array.from(document.querySelectorAll("p"))
  const textContents = paragraphs.map((p) => p.innerText).filter(Boolean)

  const allSentences = textContents
    .flatMap((text) =>
      text.match(/[^.!?]+[.!?]+/g) || []
    )
    .filter((s) => s.trim().length > 10)

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
        console.log("收到后台响应：", response)
        const adjusted = response?.adjustedText
        if (adjusted) {
          console.log("原文:", sentence)
          console.log("替换后:", adjusted)
          replaceSentenceInDOM(sentence, adjusted)
        } else {
          console.log("后台返回的 adjustedText 为空或未定义")
        }
      }
    )
  })

  
}

// 替换句子的函数（添加 data-original）
function replaceSentenceInDOM(original: string, adjusted: string) {
  const xpath = `//text()[contains(., ${JSON.stringify(original.trim())})]`
  const results = document.evaluate(
    xpath,
    document.body,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  )

  for (let i = 0; i < results.snapshotLength; i++) {
    const textNode = results.snapshotItem(i)
    if (textNode?.nodeValue?.includes(original.trim())) {
      const span = document.createElement("span")
      span.textContent = textNode.nodeValue.replace(original.trim(), adjusted)
      span.setAttribute("data-original", original.trim())
      textNode.parentNode?.replaceChild(span, textNode)
      break
    }
  }
}

// 恢复原文
function restoreOriginalText() {
  const modifiedSpans = document.querySelectorAll("span[data-original]")
  modifiedSpans.forEach((span) => {
    const original = span.getAttribute("data-original")
    if (original) {
      const textNode = document.createTextNode(original)
      span.parentNode?.replaceChild(textNode, span)
    }
  })
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "TOGGLE_PLUGIN") {
    isEnabled = message.enabled
    console.log("插件启用状态：", isEnabled)
    if (isEnabled) {
      processText()
    } else {
      restoreOriginalText()
    }
  }

  if (message.type === "SET_REWRITE_COUNT") {
    sentenceCount = message.count
    console.log("句子数量：", sentenceCount)
    if (isEnabled) {
      restoreOriginalText()
      processText()
    }
  }

  if (message.type === "SET_DIFFICULTY") {
    difficultyLevel = message.difficulty
    console.log("难度：", difficultyLevel)
    if (isEnabled) {
      restoreOriginalText()
      processText()
    }
  }
})
