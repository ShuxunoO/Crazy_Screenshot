// 检查脚本是否已经被注入，防止重复注入
if (window._crazyScreenshotInjected) {
  console.log('Crazy Screenshot 内容脚本已经加载，跳过重复注入');
  // 重新连接到背景脚本更新状态
  (async function() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'checkStatus',
        url: window.location.href
      });
      if (response && response.isRecording !== undefined) {
        window._crazyScreenshotRecording = response.isRecording;
      }
    } catch (error) {
      console.error('恢复连接失败:', error);
    }
  })();
  
  // 退出脚本执行
  throw new Error('脚本已注入，防止重复执行');
}

// 标记脚本已注入
window._crazyScreenshotInjected = true;

// 全局变量
window._crazyScreenshotRecording = false;
let clickTimeout = null;
let isGooglePage = false;
const MIN_CLICK_INTERVAL = 500; // 毫秒

// 获取录制状态的getter和setter
function isRecording() {
  return window._crazyScreenshotRecording;
}

function setRecording(value) {
  window._crazyScreenshotRecording = value;
}

// 在页面加载时检测是否是Google页面
(function detectGooglePage() {
  const url = window.location.href;
  isGooglePage = url.includes('google.com');
  if (isGooglePage) {
    console.log('检测到Google页面，启用特殊处理模式');
  }
})();

// 向后台脚本发送消息的包装函数，带有失败恢复
async function sendMessageToBackground(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.error('发送消息到背景脚本失败:', error);
    // 处理扩展上下文失效的情况
    if (error.message && (
        error.message.includes('Extension context invalidated') ||
        error.message.includes('The message port closed'))) {
      console.log('扩展上下文已失效，将重置录制状态');
      setRecording(false);
      // 不要抛出错误，允许代码继续执行
      return { isRecording: false, error: error.message };
    }
    throw error; // 对于其他类型的错误，继续抛出
  }
}

// 监听来自background脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('内容脚本收到消息:', message);
    
    if (message.action === 'updateRecordingStatus') {
      setRecording(message.isRecording);
      console.log('录制状态已更新:', isRecording());
      sendResponse({ success: true });
    } else if (message.action === 'screenshotTaken') {
      showVisualFeedback();
      sendResponse({ success: true });
    }
    return true; // 保持消息通道开放
  } catch (error) {
    console.error('处理消息错误:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// 点击事件监听函数
async function handleClick(event) {
  // 防止重复触发
  if (clickTimeout) return;
  
  // 如果正在录制，发送点击事件到后台
  if (isRecording()) {
    console.log('检测到点击，正在录制中');
    
    try {
      // 在Google页面上使用不同的处理方式
      if (isGooglePage) {
        console.log('在Google页面上检测到点击');
      }
      
      const response = await sendMessageToBackground({ 
        action: 'clickDetected',
        url: window.location.href
      });
      console.log('点击事件响应:', response);
    } catch (error) {
      console.error('发送点击事件失败:', error);
      // 错误处理 - 如果是上下文失效，重置状态
      if (error.message && error.message.includes('Extension context invalidated')) {
        setRecording(false);
      }
    }
    
    // 设置防抖动计时器
    clickTimeout = setTimeout(() => {
      clickTimeout = null;
    }, 250);
  }
}

// 显示视觉反馈
function showVisualFeedback() {
  try {
    // 为Google页面创建特殊的视觉反馈
    const isGoogle = isGooglePage;
    
    // 创建视觉反馈元素
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background-color: rgba(0, 175, 242, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    `;
    
    // 如果是Google页面，调整样式位置
    if (isGoogle) {
      feedback.style.top = '80px'; // 避开Google搜索栏
    }
    
    feedback.textContent = '截图已保存! 📸';
    
    // 添加到页面
    document.body.appendChild(feedback);
    
    // 淡出效果
    setTimeout(() => {
      feedback.style.transition = 'opacity 0.5s ease-out';
      feedback.style.opacity = '0';
      
      // 移除元素
      setTimeout(() => {
        if (feedback.parentNode) {
          document.body.removeChild(feedback);
        }
      }, 500);
    }, 2000);
  } catch (error) {
    console.error('显示视觉反馈失败:', error);
  }
}

// 安全地添加事件监听器
function safeAddEventListener() {
  try {
    // 移除之前可能存在的监听器以避免重复
    document.removeEventListener('click', handleClick, true);
    // 添加点击事件监听器
    document.addEventListener('click', handleClick, true);
    console.log('已安全添加点击事件监听器');
  } catch (error) {
    console.error('添加事件监听器失败:', error);
  }
}

// 安全地初始化脚本
function safeInitialize() {
  try {
    // 添加事件监听器
    safeAddEventListener();
    
    // 如果在Google页面上，可能需要特殊处理
    if (isGooglePage) {
      console.log('在Google页面上初始化内容脚本');
    }
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

// 设置状态恢复计数，用于控制重试次数
let statusCheckRetryCount = 0;
const MAX_STATUS_CHECK_RETRIES = 3;

// 初始化时通知后台我们的内容脚本已经准备好
(async function() {
  try {
    console.log('通知后台脚本内容脚本已准备就绪');
    const response = await sendMessageToBackground({ 
      action: 'contentScriptReady',
      url: window.location.href,
      isGooglePage: isGooglePage
    });
    console.log('内容脚本准备就绪响应:', response);
    
    if (response && response.isRecording !== undefined) {
      setRecording(response.isRecording);
      console.log('根据后台脚本响应设置录制状态:', isRecording());
    }
  } catch (error) {
    console.error('初始化通信失败:', error);
    // 初始化错误，默认不录制
    setRecording(false);
  }
  
  // 无论如何都尝试初始化
  safeInitialize();
})();

// 定期检查录制状态，确保状态同步
const statusCheckInterval = setInterval(async () => {
  try {
    // 限制重试次数，防止大量错误日志
    if (statusCheckRetryCount >= MAX_STATUS_CHECK_RETRIES) {
      console.log('状态检查达到最大重试次数，停止检查');
      clearInterval(statusCheckInterval);
      return;
    }
    
    const response = await sendMessageToBackground({ 
      action: 'checkStatus',
      url: window.location.href
    });
    
    // 重置重试计数器，因为请求成功了
    statusCheckRetryCount = 0;
    
    if (response && response.isRecording !== undefined && response.isRecording !== isRecording()) {
      console.log('同步录制状态，从', isRecording(), '到', response.isRecording);
      setRecording(response.isRecording);
    }
  } catch (error) {
    // 增加重试计数
    statusCheckRetryCount++;
    console.error('检查状态错误:', error);
    
    // 如果是扩展上下文失效，停止状态检查
    if (error.message && (
        error.message.includes('Extension context invalidated') ||
        error.message.includes('The message port closed'))) {
      console.log('扩展上下文已失效，停止状态检查');
      clearInterval(statusCheckInterval);
      setRecording(false);
    }
  }
}, 5000);

// 添加全局更新函数，供background.js调用
window.updateCrazyScreenshotStatus = function(newStatus) {
  console.log('通过全局函数更新录制状态:', newStatus);
  setRecording(newStatus);
};

// 确保内容脚本被正确注入
console.log('Crazy Screenshot 内容脚本已加载在: ' + window.location.href);
