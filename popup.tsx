import React, { useState } from 'react';
import './popup.css'; // 创建一个基础的 CSS 文件用于样式

function Popup() {
  // On/Off 开关的状态
  const [isOn, setIsOn] = useState(true);

  // “重写句子数量”滑块的状态
  const [sentencesToRewrite, setSentencesToRewrite] = useState(5); // 默认值

  // 难度选择状态
  const [difficulty, setDifficulty] = useState('Normal');

  // YUANYOU 手动选择 --> 开发中阶段
  const [manualSelect, setManualSelect] = useState(false); // 手动选择模式的状态

  // 跳转到设置页的占位函数
  const goToSettings = () => {
    // 在真实 Plasmo 扩展中，可以这样打开选项页：
    chrome.runtime.openOptionsPage();
    // 现在作为原型阶段，仅打印提示信息
    console.log('Navigate to settings page');
  };

  // 开关切换处理函数
  const handleToggle = () => {
    setIsOn(!isOn);
    console.log('Plugin is now:', !isOn ? 'On' : 'Off');
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "TOGGLE_PLUGIN",
          enabled: !isOn
        });
      }
    });
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setSentencesToRewrite(value);
    console.log('Sentences to rewrite:', value);
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_REWRITE_COUNT",
          count: value
        });
      }
    });
  };

  // 难度选择变更处理函数
  const handleDifficultyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setDifficulty(value);
    console.log('Selected difficulty:', value);
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_DIFFICULTY",
          difficulty: value
        });
      }
    });
  };
  

  // 开发调试用的快速测试按钮
  const handleDevelopmentQuickTest = () => {
    // 用于快速测试插件功能 credit: Cheng
    // 向 content 脚本发送消息触发翻译操作
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TRANSLATE_TEXT" })
        console.log("原文：", tabs[0].id)
      }
    })}

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="header-icon" onClick={goToSettings}>
          {/* 菜单图标占位符 */}
          ☰
        </div>
        <div className="header-title">Genshred</div>
        <div className="header-icon" onClick={goToSettings}>
          {/* 用户图标占位符 */}
          👤
        </div>
      </header>

      <section className="popup-body">
        <div className="control-group">
          <label htmlFor="on-off-toggle">On/ Off</label>
          {/* 基础开关组件 - 可用 CSS 进一步美化 */}
          <input
            type="checkbox"
            id="on-off-toggle"
            checked={isOn}
            onChange={handleToggle}
            // 更美观的开关通常使用 CSS 和 label 实现
          />
        </div>

        {/* “重写句子数量”滑块 */}
        <div className="control-group">
          <label htmlFor="sentences-slider">No. of Sentences Rewritten</label>
          <input
            type="range"
            id="sentences-slider"
            min="1" // 最小值示例
            max="10" // 最大值示例 - 可根据需要调整
            value={sentencesToRewrite}
            onChange={handleSliderChange}
          />
          {/* 可选：显示当前滑块值 */}
          <span>{sentencesToRewrite}</span>
        </div>

        {/* 难度选择 */}
        <div className="control-group">
          <label htmlFor="difficulty-select">Choose Difficulty</label>
          {/* 使用标准下拉框组件，适合原型阶段 */}
          <select id="difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
            <option value="Easy">Easy</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
            <option value="Custom_1">Custom_1</option>
            {/* “添加自定义...” 通常是按钮或链接打开设置 */}
            {/* 这里是一个提示性选项 */}
            <option value="Add Custom...">Add Custom...</option> {/* 该选项通常不会被选择 */}
          </select>
          {/* 从 Figma 获取的搜索和清除图标需要更复杂的组件实现 */}
        </div>

        {/* 可在此添加未来新功能的控件分组 */}

      </section>
    </div>
  );
}

export default Popup;
