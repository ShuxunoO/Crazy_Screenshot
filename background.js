/**
 * @file background.js
 * @description Crazy Screenshot 扩展的后台脚本，负责截图捕获和保存
 * @author Crazy Screenshot Team
 */

// ===== 全局变量 =====
let isRecording = false;          // 是否正在录制
let screenshotCount = 0;          // 截图计数
let userDownloadFolder = '';      // 用户设置的下载文件夹
let lastClickTime = 0;            // 上次点击时间
let isListenerSetup = false;      // 下载监听器是否已设置
const INJECTED_TABS = new Set();  // 已注入脚本的标签页集合
const MIN_INTERVAL = 500;         // 最小截图间隔（毫秒）

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
 * @details 从存储中恢复录制状态和下载文件夹设置，并设置下载监听器
 */
async function initializeState() {
  const result = await chrome.storage.local.get(['isRecording', 'downloadFolder']);
  isRecording = result.isRecording || false;
  userDownloadFolder = result.downloadFolder || '';
  screenshotCount = 0;
  
  console.log('初始化状态:', { isRecording, userDownloadFolder });
  
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
    const isScreenshot = downloadItem.filename.endsWith('.png') && 
                        (downloadItem.filename === pendingDownload.filename ||
                         downloadItem.filename.includes('screenshot_'));
    
    if (!isRecentDownload || !isScreenshot) {
      suggest();
      return false;
    }
    
    console.log('检测到截图下载，修改保存位置');
    
    // 处理保存路径
    let targetPath = pendingDownload.targetPath;
    
    // 处理Windows路径
    if (targetPath.match(/^[a-zA-Z]:/)) {
      const pathParts = targetPath.split('/');
      if (pathParts.length > 1) {
        pathParts.shift(); // 移除盘符部分
        targetPath = pathParts.join('/');
      }
    }
    
    // 确保路径末尾有斜杠
    if (!targetPath.endsWith('/')) {
      targetPath += '/';
    }
    
    // 构建完整路径并修改下载位置
    const fullPath = targetPath + downloadItem.filename;
    console.log(`将下载保存到: ${fullPath}`);
    suggest({ filename: fullPath });
    
    // 清除待处理下载
    chrome.storage.local.remove(['pendingDownload']);
    return true;
  });
  
  return true; // 异步处理
}

// ===== 内容脚本注入 =====

/**
 * @brief 检查URL是否是Google搜索页面
 * @param {string} url - 要检查的URL
 * @return {boolean} 是否是Google搜索页面
 */
function isGoogleSearchPage(url) {
  if (!url) return false;
  return url.includes('google.com/search') || 
         url.includes('www.google.com') || 
         url.includes('google.com');
}

/**
 * @brief 检查URL是否可以被注入脚本
 * @param {string} url - 要检查的URL
 * @return {boolean} 是否可以注入脚本
 */
function canInjectToUrl(url) {
  if (!url) return false;
  
  // 不能注入到chrome:// 和 chrome-extension:// 页面
  if (url.startsWith('chrome:') || url.startsWith('chrome-extension:')) {
    return false;
  }

  // 特别处理Google搜索页面
  if (isGoogleSearchPage(url)) {
    return true;
  }
  
  return true;
}

/**
 * @brief 标签页更新时注入内容脚本
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (isRecording && changeInfo.status === 'complete' && canInjectToUrl(tab.url)) {
      console.log(`标签页更新，注入脚本: ${tabId}, URL: ${tab.url}`);
      injectContentScriptToTab(tabId, tab.url);
    }
  } catch (error) {
    console.error(`标签页更新处理错误:`, error);
  }
});

/**
 * @brief 标签页激活时注入内容脚本
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    if (isRecording) {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (canInjectToUrl(tab.url)) {
        console.log(`标签页激活，注入脚本: ${activeInfo.tabId}`);
        injectContentScriptToTab(activeInfo.tabId, tab.url);
      }
    }
  } catch (error) {
    console.error(`标签页激活处理错误:`, error);
  }
});

/**
 * @brief 向所有可注入的标签页注入内容脚本
 */
async function injectContentScript() {
  try {
    const allTabs = await chrome.tabs.query({});
    
    for (const tab of allTabs) {
      if (!canInjectToUrl(tab.url)) continue;
      
      if (INJECTED_TABS.has(tab.id)) {
        // 更新已注入标签页的录制状态
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'updateRecordingStatus',
            isRecording: isRecording
          });
        } catch (err) {
          // 如果更新失败，重新注入
          INJECTED_TABS.delete(tab.id);
          injectContentScriptToTab(tab.id, tab.url);
        }
      } else {
        // 注入新标签页
        injectContentScriptToTab(tab.id, tab.url);
      }
    }
  } catch (error) {
    console.error('注入内容脚本失败:', error);
  }
}

/**
 * @brief 向特定标签页注入内容脚本
 * @param {number} tabId - 标签页ID
 * @param {string} tabUrl - 标签页URL
 */
async function injectContentScriptToTab(tabId, tabUrl) {
  // 如果已经注入，跳过
  if (INJECTED_TABS.has(tabId)) return;

  try {
    // 如果没有提供tabUrl，获取标签页信息
    if (!tabUrl) {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = tab.url;
    }
    
    // 检查URL是否可以注入
    if (!canInjectToUrl(tabUrl)) return;

    // 特殊处理Google搜索页面
    if (isGoogleSearchPage(tabUrl)) {
      const success = await injectGoogleSearchScript(tabId);
      if (success) return;
    }
    
    // 检查脚本是否已注入
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => window._crazyScreenshotInjected || false
      });
      
      if (results && results[0] && results[0].result === true) {
        // 标记为已注入并更新状态
        INJECTED_TABS.add(tabId);
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (recording) => {
            if (window.updateCrazyScreenshotStatus) {
              window.updateCrazyScreenshotStatus(recording);
            }
          },
          args: [isRecording]
        });
        return;
      }
    } catch (e) {
      // 如果是权限错误且是Google搜索页面，尝试备用方法
      if (e.message && (e.message.includes('Cannot access contents') || 
          e.message.includes('permission')) && isGoogleSearchPage(tabUrl)) {
        await injectGoogleSearchScript(tabId);
        return;
      }
    }
    
    // 正常注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // 标记脚本已注入并更新状态
    INJECTED_TABS.add(tabId);
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (recording) => {
        if (window.updateCrazyScreenshotStatus) {
          window.updateCrazyScreenshotStatus(recording);
        }
      },
      args: [isRecording]
    });
  } catch (error) {
    console.error(`注入脚本到标签页 ${tabId} 失败:`, error);
  }
}

/**
 * @brief 为Google搜索页面使用特殊的注入方法
 * @param {number} tabId - 标签页ID
 * @return {boolean} 是否成功注入
 */
async function injectGoogleSearchScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['content.js']
    });
    
    INJECTED_TABS.add(tabId);
    return true;
  } catch (error) {
    console.error(`注入Google搜索页面失败:`, error);
    return false;
  }
}

// ===== 截图处理 =====

/**
 * @brief 生成时间戳格式的文件名
 * @param {string} prefix - 文件名前缀（通常是标签页标题）
 * @return {string} 格式化的文件名
 */
function generateTimestampFilename(prefix = '') {
  // 生成时间戳 YYYY-MM-DD_HH-MM-SS 格式
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  
  // 清理前缀，移除所有非法字符
  let safePrefix = '';
  if (prefix) {
    safePrefix = prefix
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_') // 替换Windows不允许的字符
      .replace(/\s+/g, '_')                    // 替换空格为下划线
      .replace(/[^a-zA-Z0-9_-]/g, '_')         // 替换所有其他非字母数字字符为下划线
      .replace(/_+/g, '_')                     // 将多个连续下划线替换为单个下划线
      .trim();                                 // 移除前后空格
    
    // 限制前缀长度
    safePrefix = safePrefix.substring(0, 30);
  }
  
  // 返回格式化的文件名
  return safePrefix ? `${safePrefix}_${timestamp}.png` : `${timestamp}.png`;
}

/**
 * @brief 捕获并保存截图
 * @param {Object} tab - 标签页对象
 */
async function captureAndSaveScreenshot(tab) {
  try {
    if (!tab || !tab.id) {
      console.error('无效的标签页，无法截图');
      return;
    }
    
    // 捕获截图
    const screenshotData = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });
    
    if (!screenshotData) {
      console.error('截图失败，没有返回数据');
      return;
    }
    
    // 生成文件名
    let filename;
    try {
      const tabTitle = tab.title;
      filename = tabTitle && tabTitle.length > 0 
        ? generateTimestampFilename(tabTitle) 
        : generateTimestampFilename();
    } catch (error) {
      console.warn('获取标签页名称失败，使用纯时间戳');
      filename = generateTimestampFilename();
    }
    
    // 保存截图
    saveScreenshot(screenshotData, filename);
  } catch (error) {
    console.error('捕获和保存截图失败:', error);
  }
}

/**
 * @brief 保存截图到指定位置
 * @param {string} dataUrl - 截图数据URL
 * @param {string} filename - 文件名
 */
function saveScreenshot(dataUrl, filename) {
  // 增加截图计数
  screenshotCount++;
  
  // 确保文件名有效
  if (!filename || typeof filename !== 'string') {
    filename = generateTimestampFilename();
  }
  
  console.log(`准备保存截图: ${filename}`);
  
  // 准备下载选项
  const options = {
    url: dataUrl,
    saveAs: false
  };
  
  // 处理保存路径
  if (userDownloadFolder) {
    try {
      // 清理和规范化路径
      const cleanPath = userDownloadFolder.replace(/["']/g, '').trim().replace(/\\/g, '/');
      
      // 设置文件名
      options.filename = filename;
      
      // 保存下载信息，供onDeterminingFilename事件使用
      chrome.storage.local.set({
        pendingDownload: {
          targetPath: cleanPath,
          filename: filename,
          timestamp: Date.now()
        }
      });
      
      console.log(`目标保存路径: ${cleanPath}/${filename}`);
    } catch (error) {
      console.error('处理保存路径出错:', error);
      options.filename = filename;
    }
  } else {
    options.filename = filename;
  }
  
  // 执行下载
  chrome.downloads.download(options, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('下载失败:', chrome.runtime.lastError.message);
      
      // 发送错误通知
      chrome.runtime.sendMessage({ 
        action: 'directoryError', 
        message: '❗ 保存失败: ' + chrome.runtime.lastError.message
      }).catch(() => {});
      
      // 尝试使用默认位置
      retryWithDefaultLocation(dataUrl);
    } else {
      console.log(`截图已保存，ID: ${downloadId}`);
      
      // 更新计数和通知
      updateScreenshotCount(filename);
      
      // 发送视觉反馈
      sendVisualFeedback();
    }
  });
}

/**
 * @brief 使用默认下载位置重试保存
 * @param {string} dataUrl - 截图数据URL
 */
function retryWithDefaultLocation(dataUrl) {
  // 生成简单文件名
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-')
    .replace('T', '_')
    .replace('Z', '');
  
  const simpleFilename = `screenshot_${timestamp}.png`;
  console.log(`尝试使用默认位置保存: ${simpleFilename}`);
  
  // 重新下载
  chrome.downloads.download({
    url: dataUrl,
    filename: simpleFilename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('使用默认位置保存失败:', chrome.runtime.lastError.message);
      
      // 最后尝试不指定文件名
      chrome.downloads.download({
        url: dataUrl,
        saveAs: false
      }, (finalDownloadId) => {
        if (!chrome.runtime.lastError) {
          updateScreenshotCount(simpleFilename);
        }
      });
    } else {
      updateScreenshotCount(simpleFilename);
    }
  });
}

/**
 * @brief 更新截图计数并发送通知
 * @param {string} filename - 文件名
 */
function updateScreenshotCount(filename) {
  // 更新存储
  chrome.storage.local.set({ 
    screenshotCount: screenshotCount,
    lastFilename: filename
  });
  
  // 发送消息到popup
  chrome.runtime.sendMessage({ 
    action: 'screenshotTaken', 
    count: screenshotCount,
    filename: filename
  }).catch(() => {});
}

/**
 * @brief 向当前标签页发送视觉反馈
 */
function sendVisualFeedback() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'screenshotTaken' })
          .catch(() => {});
      }
    });
  } catch (error) {
    console.error('发送视觉反馈失败:', error);
  }
}

// ===== 消息处理 =====

/**
 * @brief 处理来自popup和content的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    switch (request.action) {
      case 'startRecording':
        handleStartRecording(request, sendResponse);
        break;
      case 'stopRecording':
        handleStopRecording(sendResponse);
        break;
      case 'clickDetected':
        handleClickDetected(sender.tab, sendResponse);
        break;
      case 'checkStatus':
        sendResponse({ isRecording: isRecording });
        break;
      case 'contentScriptReady':
        handleContentScriptReady(sender.tab, sendResponse);
        break;
      case 'directorySet':
        handleDirectorySet(request.path, sendResponse);
        break;
      default:
        sendResponse({ success: false, error: '未知操作' });
    }
  } catch (error) {
    console.error('消息处理错误:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // 保持消息通道开放
});

/**
 * @brief 处理开始录制请求
 * @param {Object} request - 请求对象
 * @param {Function} sendResponse - 响应回调
 */
function handleStartRecording(request, sendResponse) {
  console.log('开始录制');
  isRecording = true;
  screenshotCount = 0;
  INJECTED_TABS.clear();
  
  if (request.downloadFolder) {
    userDownloadFolder = request.downloadFolder;
  }
  
  injectContentScript();
  sendResponse({ success: true });
}

/**
 * @brief 处理停止录制请求
 * @param {Function} sendResponse - 响应回调
 */
function handleStopRecording(sendResponse) {
  console.log('停止录制');
  isRecording = false;
  sendResponse({ success: true });
}

/**
 * @brief 处理点击检测请求
 * @param {Object} tab - 标签页对象
 * @param {Function} sendResponse - 响应回调
 */
function handleClickDetected(tab, sendResponse) {
  if (!isRecording) {
    sendResponse({ success: false });
    return;
  }
  
  const currentTime = Date.now();
  if (currentTime - lastClickTime >= MIN_INTERVAL) {
    lastClickTime = currentTime;
    captureAndSaveScreenshot(tab);
  }
  
  sendResponse({ success: true });
}

/**
 * @brief 处理内容脚本就绪通知
 * @param {Object} tab - 标签页对象
 * @param {Function} sendResponse - 响应回调
 */
function handleContentScriptReady(tab, sendResponse) {
  if (tab && tab.id) {
    INJECTED_TABS.add(tab.id);
  }
  sendResponse({ isRecording: isRecording });
}

/**
 * @brief 处理目录设置请求
 * @param {string} path - 目录路径
 * @param {Function} sendResponse - 响应回调
 */
function handleDirectorySet(path, sendResponse) {
  console.log('设置下载目录:', path);
  userDownloadFolder = path;
  sendResponse({ success: true, message: '目录已更新' });
}

/**
 * @brief 显示系统通知
 * @param {string} message - 通知消息
 */
function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title: 'Crazy Screenshot',
    message: message
  });
}

// 在扩展首次启动时执行初始化
initializeState();
