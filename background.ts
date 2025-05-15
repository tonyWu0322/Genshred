// background.ts

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ADJUST_TEXT") {
    const originalText = message.payload
    const level = message.level // "simplify" or "complicate"

    const instruction =
      level === "simplify"
        ? "请将以下英文文本简化为更容易理解的英语，用更基础的词汇表达："
        : "请将以下英文文本复杂化，用更高级、正式的词汇重写："

    const options = {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-xxx', // 替换为你自己的 key
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [
          {
            role: "system",
            content: "你是一个英语文本重写助手，按照要求修改文本难度。"
          },
          {
            role: "user",
            content: `${instruction}\n\n${originalText}`
          }
        ],
        stream: false,
        max_tokens: 512,
        temperature: 0.7
      })
    }

    fetch("https://api.siliconflow.cn/v1/chat/completions", options)
      .then((res) => res.json())
      .then((data) => {
        const adjusted = data?.choices?.[0]?.message?.content
        console.log(`${level === "simplify" ? "简化" : "复杂化"}结果：`, adjusted)
        sendResponse({ adjustedText: adjusted })
      })
      .catch((err) => {
        console.error("分级处理失败：", err)
        sendResponse({ adjustedText: "" })
      })

    return true
  }
})
// background.ts

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ADJUST_TEXT") {
    const originalText = message.payload
    const level = message.level // "simplify" or "complicate"

    const instruction =
      level === "simplify"
        ? "请将以下英文文本简化为更容易理解的英语，用更基础的词汇表达："
        : "请将以下英文文本复杂化，用更高级、正式的词汇重写："

    const options = {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-xxx', // 替换为你自己的 key
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [
          {
            role: "system",
            content: "你是一个英语文本重写助手，按照要求修改文本难度。"
          },
          {
            role: "user",
            content: `${instruction}\n\n${originalText}`
          }
        ],
        stream: false,
        max_tokens: 512,
        temperature: 0.7
      })
    }

    fetch("https://api.siliconflow.cn/v1/chat/completions", options)
      .then((res) => res.json())
      .then((data) => {
        const adjusted = data?.choices?.[0]?.message?.content
        console.log(`${level === "simplify" ? "简化" : "复杂化"}结果：`, adjusted)
        sendResponse({ adjustedText: adjusted })
      })
      .catch((err) => {
        console.error("分级处理失败：", err)
        sendResponse({ adjustedText: "" })
      })

    return true
  }
})
