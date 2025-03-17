/**
 * @file background.js
 * @description Crazy Screenshot 扩展的后台脚本，负责截图捕获和保存
 * @author Crazy Screenshot Team
 */

// ===== 全局变量 =====
let isRecording = false;          // 是否正在录制
let screenshotCount = 0;          // 截图计数
let lastClickTime = 0;            // 上次点击时间
let isListenerSetup = false;      // 下载监听器是否已设置
const INJECTED_TABS = new Set();  // 已注入脚本的标签页集合
const MIN_INTERVAL = 500;         // 最小截图间隔（毫秒）

// 截图设置
let screenshotSettings = {
  delay: 0,                       // 延迟时间（秒）
  hotkey: '',                     // 热键组合
  doubleClick: false              // 是否双击触发
};

// 双击检测
let lastClickTimestamp = 0;
const DOUBLE_CLICK_THRESHOLD = 300; // 双击时间阈值（毫秒）

// ===== 初始化 =====

/**
 * @brief 扩展安装时的初始化
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('扩展已安装');
  initializeState();
});

/**
 * @brief 初始化扩展状态
 * @details 从存储中恢复录制状态和设置
 */
async function initializeState() {
  const result = await chrome.storage.local.get([
    'isRecording', 
    'delay', 
    'hotkey', 
    'doubleClick'
  ]);
  
  isRecording = result.isRecording || false;
  screenshotCount = 0;
  
  // 恢复设置
  screenshotSettings.delay = result.delay || 0;
  screenshotSettings.hotkey = result.hotkey || '';
  screenshotSettings.doubleClick = result.doubleClick || false;
  
  console.log('初始化状态:', { 
    isRecording, 
    settings: screenshotSettings 
  });
  
  // 确保下载监听器只设置一次
  if (!isListenerSetup) {
    setupDownloadListener();
  }
  
  if (isRecording) {
    console.log('初始化时发现录制状态为开启，准备注入内容脚本');
    injectContentScript();
  }
}

// ===== 下载处理 =====

/**
 * @brief 设置下载文件名确定事件监听器
 * @details 确保监听器只被设置一次，防止"Too many listeners"错误
 */
function setupDownloadListener() {
  if (isListenerSetup) {
    console.log('下载监听器已设置，跳过');
    return;
  }
  
  console.log('设置下载文件名确定事件监听器');
  
  // 尝试移除可能存在的旧监听器
  try {
    chrome.downloads.onDeterminingFilename.removeListener(handleDownloadFilename);
  } catch (error) {
    console.log('没有找到旧的下载监听器，或移除失败');
  }
  
  // 添加新监听器
  chrome.downloads.onDeterminingFilename.addListener(handleDownloadFilename);
  
  // 添加下载完成监听器
  try {
    chrome.downloads.onChanged.removeListener(handleDownloadChanged);
  } catch (error) {
    console.log('没有找到旧的下载变更监听器，或移除失败');
  }
  
  // 添加下载变更监听器
  chrome.downloads.onChanged.addListener(handleDownloadChanged);
  
  isListenerSetup = true;
}

/**
 * @brief 处理下载文件名确定事件的回调函数
 * @param {Object} downloadItem - 下载项信息
 * @param {Function} suggest - 用于建议文件名的回调函数
 * @return {boolean} 是否异步处理此事件
 */
function handleDownloadFilename(downloadItem, suggest) {
  chrome.storage.local.get(['pendingDownload'], (result) => {
    if (!result.pendingDownload) {
      suggest();
      return false;
    }
    
    const pendingDownload = result.pendingDownload;
    
    // 检查是否是我们的截图下载
    const isRecentDownload = Date.now() - pendingDownload.timestamp < 5000;
    const isScreenshot = downloadItem.filename.endsWith('.png');
    
    if (!isRecentDownload || !isScreenshot) {
      suggest();
      return false;
    }
    
    // 使用我们生成的文件名
    console.log('检测到截图下载，使用自定义文件名:', pendingDownload.filename);
    suggest({ filename: pendingDownload.filename });
    
    // 清除待处理下载
    chrome.storage.local.remove(['pendingDownload']);
    
    // 更新截图计数
    updateScreenshotCount(pendingDownload.filename);
    
    return true;
  });
  
  // 异步处理
  return true;
}

/**
 * @brief 处理下载变更事件
 * @param {Object} downloadDelta - 下载变更信息
 */
function handleDownloadChanged(downloadDelta) {
  // 检查下载是否完成
  if (downloadDelta.state && downloadDelta.state.current === 'complete') {
    console.log('下载完成:', downloadDelta.id);
    
    // 获取下载项信息
    chrome.downloads.search({ id: downloadDelta.id }, (downloadItems) => {
      if (downloadItems && downloadItems.length > 0) {
        const downloadItem = downloadItems[0];
        
        // 检查是否是我们的截图下载
        chrome.storage.local.get(['pendingDownload'], (result) => {
          if (result.pendingDownload) {
            const pendingDownload = result.pendingDownload;
            const isRecentDownload = Date.now() - pendingDownload.timestamp < 5000;
            
            if (isRecentDownload && downloadItem.filename.includes(pendingDownload.filename)) {
              console.log('截图下载完成:', downloadItem.filename);
              
              // 更新截图计数
              updateScreenshotCount(downloadItem.filename);
              
              // 清除待处理下载
              chrome.storage.local.remove(['pendingDownload']);
            }
          }
        });
      }
    });
  }
}

// ===== 内容脚本注入 =====

/**
 * @brief 检查是否是Google搜索页面
 * @param {string} url - 页面URL
 * @return {boolean} 是否是Google搜索页面
 */
function isGoogleSearchPage(url) {
  return url.includes('google.') && url.includes('/search');
}

/**
 * @brief 检查是否可以注入到指定URL
 * @param {string} url - 页面URL
 * @return {boolean} 是否可以注入
 */
function canInjectToUrl(url) {
  // 跳过扩展页面、空页面和特殊页面
  if (!url || 
      url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('about:') || 
      url.startsWith('edge://') || 
      url.startsWith('brave://') ||
      url.startsWith('file://')) {
    return false;
  }
  
  return true;
}

/**
 * @brief 向所有标签页注入内容脚本
 */
async function injectContentScript() {
  try {
    // 获取所有标签页
    const tabs = await chrome.tabs.query({});
    console.log(`准备向${tabs.length}个标签页注入内容脚本`);
    
    // 向每个标签页注入脚本
    for (const tab of tabs) {
      if (canInjectToUrl(tab.url)) {
        injectContentScriptToTab(tab.id, tab.url);
      } else {
        console.log(`跳过标签页 ${tab.id}，URL不支持注入:`, tab.url);
      }
    }
    
    // 监听标签页更新事件
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
  } catch (error) {
    console.error('注入内容脚本失败:', error);
  }
}

/**
 * @brief 向指定标签页注入内容脚本
 * @param {number} tabId - 标签页ID
 * @param {string} tabUrl - 标签页URL
 */
async function injectContentScriptToTab(tabId, tabUrl) {
  try {
    // 检查是否已注入
    if (INJECTED_TABS.has(tabId)) {
      console.log(`标签页 ${tabId} 已注入脚本，跳过`);
      return;
    }
    
    // 检查URL是否可注入
    if (!canInjectToUrl(tabUrl)) {
      console.log(`标签页 ${tabId} URL不支持注入:`, tabUrl);
      return;
    }
    
    console.log(`向标签页 ${tabId} 注入内容脚本`);
    
    // 注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    // 标记为已注入
    INJECTED_TABS.add(tabId);
    console.log(`标签页 ${tabId} 脚本注入成功`);
    
    // 如果是Google搜索页面，注入额外脚本
    if (isGoogleSearchPage(tabUrl)) {
      injectGoogleSearchScript(tabId);
    }
  } catch (error) {
    console.error(`向标签页 ${tabId} 注入脚本失败:`, error);
  }
}

/**
 * @brief 处理标签页更新事件
 * @param {number} tabId - 标签页ID
 * @param {Object} changeInfo - 变更信息
 * @param {Object} tab - 标签页信息
 */
function handleTabUpdated(tabId, changeInfo, tab) {
  // 只在页面完成加载且URL可注入时注入脚本
  if (changeInfo.status === 'complete' && canInjectToUrl(tab.url)) {
    console.log(`标签页 ${tabId} 已完成加载，URL:`, tab.url);
    
    // 如果正在录制，注入内容脚本
    if (isRecording) {
      injectContentScriptToTab(tabId, tab.url);
    }
  }
}

/**
 * @brief 向Google搜索页面注入特殊处理脚本
 * @param {number} tabId - 标签页ID
 */
async function injectGoogleSearchScript(tabId) {
  try {
    console.log(`向Google搜索页面 ${tabId} 注入特殊处理脚本`);
    
    // 注入Google搜索页面特殊处理代码
    await chrome.scripting.executeScript({
      target: { tabId },
      func: function() {
        // 在页面中添加特殊处理代码
        console.log('Google搜索页面特殊处理已注入');
        
        // 监听搜索结果点击
        document.addEventListener('click', function(e) {
          // 检查是否点击了搜索结果链接
          if (e.target.tagName === 'A' || e.target.closest('a')) {
            console.log('检测到搜索结果点击');
            // 通知扩展进行截图
            window.postMessage({ type: 'CRAZY_SCREENSHOT_CLICK' }, '*');
          }
        }, true);
      }
    });
    
    console.log(`Google搜索页面 ${tabId} 特殊处理脚本注入成功`);
  } catch (error) {
    console.error(`向Google搜索页面 ${tabId} 注入特殊处理脚本失败:`, error);
  }
}

// ===== 截图处理 =====

/**
 * @brief 生成带时间戳的文件名
 * @param {string} prefix - 文件名前缀
 * @return {string} 生成的文件名
 */
function generateTimestampFilename(prefix = '') {
  // 获取当前日期时间
  const now = new Date();
  
  // 格式化日期时间
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // 清理前缀（移除不允许的字符）
  let cleanPrefix = prefix.replace(/[\\/:*?"<>|.]/g, '_'); // 添加点(.)到非法字符列表
  
  // 限制前缀长度为10个字符/汉字
  const maxLength = 10;
  // 将字符串拆分为Unicode字符数组
  const charArray = Array.from(cleanPrefix);
  if (charArray.length > maxLength) {
    cleanPrefix = charArray.slice(0, maxLength).join('');
  }
  
  // 移除前缀中所有的点字符
  cleanPrefix = cleanPrefix.replace(/\./g, '_');
  
  // 如果前缀为空，使用默认前缀
  if (!cleanPrefix || cleanPrefix.trim() === '') {
    cleanPrefix = 'screenshot';
  }
  
  // 生成文件名
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  const filename = `${cleanPrefix}_${timestamp}.png`;
  
  console.log("原始标题:", prefix, "格式化后:", cleanPrefix, "最终文件名:", filename);
  
  return filename;
}

/**
 * @brief 捕获并保存截图
 * @param {Object} tab - 标签页信息
 */
async function captureAndSaveScreenshot(tab) {
  try {
    console.log(`开始捕获标签页 ${tab.id} 的截图`);
    
    // 捕获可视区域截图
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    console.log('截图捕获成功');
    
    // 生成文件名（使用标签页标题作为前缀）
    const filename = generateTimestampFilename(tab.title);
    console.log('生成的文件名:', filename);
    
    // 保存截图
    await saveScreenshot(dataUrl, filename);
    
    // 发送视觉反馈
    sendVisualFeedback();
    
    return true;
  } catch (error) {
    console.error('捕获截图失败:', error);
    return false;
  }
}

/**
 * @brief 保存截图
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 */
function saveScreenshot(dataUrl, filename) {
  return new Promise((resolve, reject) => {
    console.log('准备保存截图:', filename);
    
    // 记录待处理下载
    chrome.storage.local.set({
      pendingDownload: {
        filename: filename,
        timestamp: Date.now()
      }
    });
    
    // 下载图片
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify' // 确保文件名冲突时不会被完全修改
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('下载失败:', chrome.runtime.lastError);
        
        // 尝试使用默认位置保存
        retryWithDefaultLocation(dataUrl)
          .then(resolve)
          .catch(reject);
      } else {
        console.log('下载已开始，ID:', downloadId);
        resolve(downloadId);
      }
    });
  });
}

/**
 * @brief 使用默认位置重试保存
 * @param {string} dataUrl - 图片数据URL
 */
function retryWithDefaultLocation(dataUrl) {
  return new Promise((resolve, reject) => {
    console.log('尝试使用默认位置保存截图');
    
    // 生成默认文件名
    const filename = generateTimestampFilename('截图');
    
    // 记录待处理下载
    chrome.storage.local.set({
      pendingDownload: {
        filename: filename,
        timestamp: Date.now()
      }
    });
    
    // 使用生成的文件名，而不是让浏览器自动命名
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('使用默认位置保存也失败:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        console.log('使用默认位置保存成功，ID:', downloadId);
        resolve(downloadId);
      }
    });
  });
}

/**
 * @brief 更新截图计数
 * @param {string} filename - 文件名
 */
function updateScreenshotCount(filename) {
  // 增加计数
  screenshotCount++;
  console.log('截图计数更新:', screenshotCount);
  
  // 更新存储
  chrome.storage.local.set({ screenshotCount });
  
  // 通知弹出窗口更新计数
  chrome.runtime.sendMessage({
    action: 'screenshotTaken',
    count: screenshotCount
  }).catch(error => {
    // 如果弹出窗口未打开，将会收到"Receiving end does not exist"错误，这是正常的
    if (error.message.includes('Receiving end does not exist')) {
      console.log('弹出窗口未打开，无法更新计数显示');
    } else {
      console.error('发送截图计数更新消息失败:', error);
    }
  });
}

/**
 * @brief 发送视觉反馈
 */
function sendVisualFeedback() {
  // 向当前标签页发送消息，显示视觉反馈
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showFeedback' })
        .catch(error => console.log('发送视觉反馈失败:', error));
    }
  });
}

// ===== 消息处理 =====

/**
 * @brief 监听来自内容脚本和弹出窗口的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  // 根据消息类型处理
  switch (request.action) {
    case 'startRecording':
      handleStartRecording(request, sendResponse);
      break;
      
    case 'stopRecording':
      handleStopRecording(sendResponse);
      break;
      
    case 'clickDetected':
      if (sender.tab) {
        handleClickDetected(sender.tab, request, sendResponse);
      }
      break;
      
    case 'contentScriptReady':
      if (sender.tab) {
        handleContentScriptReady(sender.tab, sendResponse);
      }
      break;
      
    case 'updateSettings':
      handleUpdateSettings(request, sendResponse);
      break;
  }
  
  // 保持消息通道开放
  return true;
});

/**
 * @brief 处理开始录制消息
 * @param {Object} request - 请求消息
 * @param {Function} sendResponse - 响应回调
 */
function handleStartRecording(request, sendResponse) {
  console.log('开始录制');
  
  // 更新设置
  if (request.settings) {
    screenshotSettings.delay = request.settings.delay || 0;
    screenshotSettings.hotkey = request.settings.hotkey || '';
    screenshotSettings.doubleClick = request.settings.doubleClick || false;
    
    console.log('更新截图设置:', screenshotSettings);
  }
  
  // 设置录制状态
  isRecording = true;
  screenshotCount = 0;
  
  // 注入内容脚本
  injectContentScript();
  
  // 响应
  sendResponse({ success: true });
}

/**
 * @brief 处理停止录制消息
 * @param {Function} sendResponse - 响应回调
 */
function handleStopRecording(sendResponse) {
  console.log('停止录制');
  
  // 更新录制状态
  isRecording = false;
  
  // 移除标签页更新监听器
  chrome.tabs.onUpdated.removeListener(handleTabUpdated);
  
  // 清除已注入标签页记录
  INJECTED_TABS.clear();
  
  // 响应
  sendResponse({ success: true });
}

/**
 * @brief 处理点击检测消息
 * @param {Object} tab - 当前活动标签页信息
 * @param {Object} request - 请求消息
 * @param {Function} sendResponse - 发送响应的回调函数
 * @returns {Boolean} 是否成功处理
 */
async function handleClickDetected(tab, request, sendResponse) {
  try {
    console.log('检测到点击', tab?.id, tab?.url);
    
    // 检查是否正在录制
    if (!isRecording) {
      console.log('未在录制状态，忽略点击');
      sendResponse({ success: true, ignored: true, reason: 'Not recording' });
      return true;
    }
    
    // 如果设置了双击模式
    if (screenshotSettings.doubleClick) {
      // 如果接收到的是双击事件，或者在后台检测到了双击
      const isDoubleClick = request.isDoubleClick || (Date.now() - lastClickTimestamp < DOUBLE_CLICK_THRESHOLD);
      lastClickTimestamp = Date.now();
      
      if (!isDoubleClick) {
        console.log('需要双击，但只检测到单击，忽略');
        sendResponse({ success: true, ignored: true, reason: 'Double click required' });
        return true;
      }
    }
    
    // 检查点击频率限制
    const now = Date.now();
    if (now - lastClickTime < MIN_INTERVAL) {
      console.log('点击过于频繁，忽略', now - lastClickTime);
      sendResponse({ success: true, ignored: true, reason: 'Too frequent' });
      return true;
    }
    lastClickTime = now;
    
    // 检查热键设置
    if (screenshotSettings.hotkey && !request.hotkeyPressed) {
      console.log('需要热键，但未按下，忽略');
      sendResponse({ success: true, ignored: true, reason: 'Hotkey not pressed' });
      return true;
    }
    
    // 找到当前活动标签页
    if (!tab) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = activeTab;
    }
    
    // 检查标签页是否有效
    if (!tab || !tab.id || tab.id === chrome.runtime.id) {
      console.log('无效的标签页', tab);
      sendResponse({ success: false, error: 'Invalid tab' });
      return true;
    }
    
    // 检查是否为扩展页面
    if (tab.url && tab.url.startsWith('chrome-extension://')) {
      console.log('忽略扩展页面的点击');
      sendResponse({ success: true, ignored: true, reason: 'Extension page' });
      return true;
    }
    
    console.log('处理延迟:', screenshotSettings.delay);
    
    // 应用延迟设置
    if (screenshotSettings.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, screenshotSettings.delay * 1000));
    }
    
    // 启动截图过程
    await captureAndSaveScreenshot(tab);
    
    // 更新截图计数
    updateScreenshotCount(tab.title || 'screenshot');
    
    sendResponse({ success: true });
    return true;
  } catch (error) {
    console.error('处理点击检测时出错:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
}

/**
 * @brief 处理内容脚本就绪消息
 * @param {Object} tab - 标签页信息
 * @param {Function} sendResponse - 响应回调
 */
function handleContentScriptReady(tab, sendResponse) {
  console.log(`标签页 ${tab.id} 内容脚本就绪`);
  
  // 发送当前录制状态
  sendResponse({
    isRecording,
    settings: screenshotSettings
  });
}

/**
 * @brief 处理更新设置消息
 * @param {Object} request - 请求消息
 * @param {Function} sendResponse - 响应回调
 */
function handleUpdateSettings(request, sendResponse) {
  console.log('更新设置:', request.settings);
  
  // 更新设置
  if (request.settings) {
    // 更新延迟设置
    if (request.settings.delay !== undefined) {
      screenshotSettings.delay = request.settings.delay;
    }
    
    // 更新热键设置
    if (request.settings.hotkey !== undefined) {
      screenshotSettings.hotkey = request.settings.hotkey;
    }
    
    // 更新双击设置
    if (request.settings.doubleClick !== undefined) {
      screenshotSettings.doubleClick = request.settings.doubleClick;
    }
    
    console.log('设置已更新:', screenshotSettings);
    
    // 通知所有注入的内容脚本更新设置
    updateAllContentScripts();
  }
  
  // 响应
  sendResponse({ success: true });
}

/**
 * @brief 向所有已注入内容脚本的标签页发送更新设置消息
 */
function updateAllContentScripts() {
  // 获取所有已注入的标签页
  const injectedTabs = Array.from(INJECTED_TABS);
  
  // 向每个标签页发送更新设置消息
  for (const tabId of injectedTabs) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.log('标签页不存在:', chrome.runtime.lastError);
        INJECTED_TABS.delete(tabId);
        return;
      }
      
      // 发送更新设置消息
      chrome.tabs.sendMessage(tabId, {
        action: 'updateSettings',
        settings: screenshotSettings
      }).catch(error => {
        console.log(`向标签页 ${tabId} 发送更新设置消息失败:`, error);
      });
    });
  }
}

/**
 * @brief 显示通知
 * @param {string} message - 通知消息
 */
function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Crazy Screenshot',
    message: message
  });
}

// 在扩展首次启动时执行初始化
initializeState();
