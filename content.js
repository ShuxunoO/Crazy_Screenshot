// 检查脚本是否已经被注入，防止重复注入
if (window._crazyScreenshotInjected) {
  console.log('Crazy Screenshot 内容脚本已经加载，跳过重复注入');
  throw new Error('脚本已注入，防止重复执行');
}

// 标记脚本已注入
window._crazyScreenshotInjected = true;

// 全局变量
let isRecording = false;
let clickTimeout = null;
const MIN_CLICK_INTERVAL = 500; // 毫秒
let lastClickTime = 0;
const DOUBLE_CLICK_THRESHOLD = 300; // 毫秒

// 截图设置
let screenshotSettings = {
  delay: 0,
  doubleClick: false
};

// 初始化
(async function initialize() {
  try {
    // 通知后台脚本内容脚本已就绪
    const response = await chrome.runtime.sendMessage({ action: 'contentScriptReady' })
      .catch(error => {
        // 处理"Receiving end does not exist"错误
        if (error.message.includes('Receiving end does not exist')) {
          console.log('后台脚本未准备好接收消息，可能扩展刚刚加载或刷新');
          // 使用默认设置继续
          return { isRecording: false, settings: screenshotSettings };
        }
        // 其他错误则抛出
        throw error;
      });
    
    // 更新录制状态和设置
    if (response) {
      isRecording = response.isRecording || false;
      
      if (response.settings) {
        screenshotSettings = response.settings;
      }
      
      console.log('初始化完成，录制状态:', isRecording, '设置:', screenshotSettings);
    }
    
    // 设置事件监听器
    setupEventListeners();
  } catch (error) {
    console.error('初始化失败:', error);
    // 出错时仍然设置事件监听器，以便后续消息能正常工作
    setupEventListeners();
  }
})();

// 设置事件监听器
function setupEventListeners() {
  // 点击事件
  document.addEventListener('click', handleClick, true);
  
  // 监听来自页面内部的消息（用于Google搜索页面等特殊处理）
  window.addEventListener('message', handleWindowMessage, false);
}

// 处理窗口消息
function handleWindowMessage(event) {
  // 检查是否是我们的消息
  if (event.data && event.data.type === 'CRAZY_SCREENSHOT_CLICK') {
    console.log('收到页面内部点击消息');
    
    // 模拟点击事件
    const fakeEvent = { target: document.body };
    handleClick(fakeEvent);
  }
}

// 点击事件处理函数
async function handleClick(event) {
  // 检查是否正在录制
  if (!isRecording) return;
  
  console.log('检测到点击，正在录制中，双击模式:', screenshotSettings.doubleClick);
  
  try {
    // 当前时间
    const currentTime = new Date().getTime();
    
    // 检查是否需要双击
    if (screenshotSettings.doubleClick) {
      // 双击模式：如果两次点击间隔小于阈值，触发截图
      if (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
        console.log('检测到双击，触发截图');
        // 重设点击时间防止连续触发
        lastClickTime = 0;
        
        // 设置防抖动锁
        if (clickTimeout) {
          clearTimeout(clickTimeout);
        }
        clickTimeout = setTimeout(() => {
          clickTimeout = null;
        }, MIN_CLICK_INTERVAL);
        
        // 发送点击事件到后台
        const response = await chrome.runtime.sendMessage({
          action: 'clickDetected',
          isDoubleClick: true
        });
        
        console.log('点击事件响应:', response);
      } else {
        // 记录第一次点击时间
        lastClickTime = currentTime;
        console.log('记录第一次点击，等待双击');
      }
    } else {
      // 单击模式：直接触发
      console.log('单击模式，直接触发');
      
      // 防止频繁点击
      if (clickTimeout) {
        console.log('点击过于频繁，忽略');
        return;
      }
      
      // 设置防抖动锁
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
      }, MIN_CLICK_INTERVAL);
      
      // 发送点击事件到后台
      const response = await chrome.runtime.sendMessage({
        action: 'clickDetected'
      });
      
      console.log('点击事件响应:', response);
    }
  } catch (error) {
    console.error('处理点击事件失败:', error);
    
    // 清除超时
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
  }
}

// 显示视觉反馈
function showVisualFeedback() {
  try {
    // 创建反馈元素
    const feedback = document.createElement('div');
    feedback.style.position = 'fixed';
    feedback.style.top = '0';
    feedback.style.left = '0';
    feedback.style.width = '100%';
    feedback.style.height = '100%';
    feedback.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    feedback.style.zIndex = '2147483647'; // 最高层级
    feedback.style.pointerEvents = 'none'; // 不阻止点击
    feedback.style.transition = 'opacity 0.3s ease';
    
    // 添加到页面
    document.body.appendChild(feedback);
    
    // 闪烁效果
    setTimeout(() => {
      feedback.style.opacity = '0';
      
      // 移除元素
      setTimeout(() => {
        document.body.removeChild(feedback);
      }, 300);
    }, 100);
  } catch (error) {
    console.error('显示视觉反馈失败:', error);
  }
}

// 监听来自background脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('内容脚本收到消息:', message);
    
    if (message.action === 'updateRecordingStatus') {
      isRecording = message.isRecording;
      console.log('录制状态已更新:', isRecording);
      sendResponse({ success: true });
    } else if (message.action === 'showFeedback') {
      showVisualFeedback();
      sendResponse({ success: true });
    } else if (message.action === 'updateSettings') {
      screenshotSettings = message.settings || screenshotSettings;
      console.log('设置已更新:', screenshotSettings);
      // 如果更新了双击设置，重置上次点击时间
      if (message.settings && message.settings.doubleClick !== undefined) {
        lastClickTime = 0;
      }
      sendResponse({ success: true });
    }
    
    return true; // 保持消息通道开放
  } catch (error) {
    console.error('处理消息错误:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// 确保内容脚本被正确注入
console.log('Crazy Screenshot 内容脚本已加载在: ' + window.location.href);
