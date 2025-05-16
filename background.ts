chrome.runtime.onMessage.addListener(
  async (message, sender, sendResponse) => {
    if (message.type === "ADJUST_TEXT") {
      const { payload, level } = message

      try {
        // 将传来的 difficultyLevel 直接作为 prompt 的一部分
        const prompt = `请根据以下要求改写句子,结果必须是英文。\n\n难度要求（对比于原句）：${level}\n\n句子：${payload}\n\n改写后：`

        const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer sk-panaghczpcpdhwnmmslvelnvzfjhudrcxlkqjoihvfibsqqi" 
          },
          body: JSON.stringify({
            model: "Qwen2.5-7B-Instruct",
            messages: [
              { role: "system", content: "你是一个句子改写助手。" },
              { role: "user", content: prompt }
            ],
            temperature: 0.7
          })
        })

        const data = await response.json()

        const adjustedText =
          data?.choices?.[0]?.message?.content?.trim() || ""

        sendResponse({ adjustedText })
      } catch (err) {
        console.error("处理出错：", err)
        sendResponse({ adjustedText: null })
      }

      return true // 表示异步响应
    }
  }
)
