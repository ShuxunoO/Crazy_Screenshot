document.addEventListener('DOMContentLoaded', function() {
  const directoryPathInput = document.getElementById('directory-path');
  const directoryBtn = document.getElementById('directory-btn');
  const recordBtn = document.getElementById('record-btn');
  const statusText = document.getElementById('status-text');
  const counterElement = document.getElementById('counter');
  const countElement = document.getElementById('count');
  const lastFilenameElement = document.getElementById('last-filename');

  // 从存储中获取保存路径
  chrome.storage.local.get(['downloadFolder', 'isRecording', 'screenshotCount', 'lastFilename'], function(result) {
    console.log("获取到的存储信息:", result);
    if (result.downloadFolder) {
      directoryPathInput.value = result.downloadFolder;
    }
    
    // 恢复录制状态
    if (result.isRecording) {
      startRecordingUI();
      countElement.textContent = result.screenshotCount || 0;
      if (result.lastFilename) {
        lastFilenameElement.textContent = result.lastFilename;
        lastFilenameElement.parentElement.classList.remove('hidden');
      }
    }
  });

  // 目录选择按钮点击事件
  directoryBtn.addEventListener('click', function() {
    // 获取当前保存的目录路径（如果有）
    chrome.storage.local.get(['downloadFolder'], function(result) {
      // 提示用户输入完整的文件夹路径
      const defaultPath = result.downloadFolder || "";
      
      const message = `请输入保存截图的完整文件夹路径：
      
- Windows系统示例: C:\\Users\\Username\\Pictures\\Screenshots
- Mac/Linux示例: /Users/username/Pictures/Screenshots

注意：
1. 请确保该目录已存在且有写入权限
2. 在Windows系统上，Chrome扩展可能无法直接访问绝对路径
3. 如果截图未保存到指定位置，请检查浏览器的默认下载文件夹`;
      
      const folderPath = prompt(message, defaultPath);
      
      if (folderPath && folderPath.trim() !== "") {
        const path = folderPath.trim();
        console.log("用户设置的保存路径:", path);
        
        // 检查是否是Windows路径
        const isWindowsPath = path.match(/^[a-zA-Z]:/);
        if (isWindowsPath) {
          showToast('⚠️ Windows系统如果截图未保存到指定位置，请检查浏览器默认下载文件夹');
        }
        
        // 保存用户输入的完整路径
        chrome.storage.local.set({ 
          downloadFolder: path,
          // 记住上次设置的时间
          lastDirectorySetTime: Date.now()
        }, function() {
          if (chrome.runtime.lastError) {
            console.error("保存路径失败:", chrome.runtime.lastError);
            showToast('❗ 保存目录设置失败');
          } else {
            console.log("保存路径成功:", path);
            // 更新UI
            directoryPathInput.value = path;
            statusText.textContent = "Ready";
            showToast('✅ 保存目录已设置');
            
            // 在后台记录目录设置
            chrome.runtime.sendMessage({ 
              action: 'directorySet', 
              path: path 
            }, function(response) {
              console.log("后台响应:", response);
            });
          }
        });
      } else {
        showToast('❗ 未设置保存目录');
      }
    });
  });

  // 录制按钮点击事件
  recordBtn.addEventListener('click', function() {
    chrome.storage.local.get(['isRecording', 'downloadFolder'], function(result) {
      const isRecording = result.isRecording || false;
      
      if (!isRecording) {
        // 检查是否已设置保存目录
        if (!result.downloadFolder) {
          showToast('❗ 请先设置保存目录');
          return;
        }
        
        // 开始录制
        chrome.storage.local.set({
          isRecording: true,
          screenshotCount: 0,
          lastFilename: ""
        });
        
        console.log("开始录制，目录:", result.downloadFolder);
        
        // 通知后台脚本开始录制
        chrome.runtime.sendMessage({ 
          action: 'startRecording',
          downloadFolder: result.downloadFolder
        });
        startRecordingUI();
      } else {
        // 停止录制
        chrome.storage.local.set({ isRecording: false });
        
        // 通知后台脚本停止录制
        chrome.runtime.sendMessage({ action: 'stopRecording' });
        stopRecordingUI();
      }
    });
  });

  // 监听截图计数更新
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'screenshotTaken') {
      countElement.textContent = request.count;
      
      if (request.filename) {
        lastFilenameElement.textContent = request.filename;
        lastFilenameElement.parentElement.classList.remove('hidden');
        chrome.storage.local.set({ lastFilename: request.filename });
      }
      
      sendResponse({ received: true });
    } else if (request.action === 'directoryError') {
      // 显示目录错误提示
      showToast(request.message || '❗ 保存截图失败');
      console.error('目录错误:', request.message);
      
      // 如果是Windows路径问题，显示额外提示
      if (directoryPathInput.value.match(/^[a-zA-Z]:/)) {
        setTimeout(() => {
          showToast('⚠️ Windows路径可能需要特殊权限，请检查浏览器默认下载文件夹');
        }, 3000);
      }
      
      sendResponse({ received: true });
    }
    return true;
  });

  // 开始录制UI更新
  function startRecordingUI() {
    recordBtn.textContent = 'Stop';
    recordBtn.classList.remove('start');
    recordBtn.classList.add('stop');
    statusText.textContent = 'Recording...';
    counterElement.classList.remove('hidden');
  }

  // 停止录制UI更新
  function stopRecordingUI() {
    recordBtn.textContent = 'Start';
    recordBtn.classList.remove('stop');
    recordBtn.classList.add('start');
    statusText.textContent = 'Ready';
    counterElement.classList.add('hidden');
  }

  // 显示toast提示
  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'absolute';
    toast.style.bottom = '10px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = 'rgba(0,0,0,0.7)';
    toast.style.color = '#fff';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '1000';
    toast.style.maxWidth = '90%';
    toast.style.textAlign = 'center';
    toast.style.wordBreak = 'break-word';
    toast.style.fontSize = '14px';
    toast.style.lineHeight = '1.4';
    
    document.body.appendChild(toast);
    
    // 根据消息长度决定显示时间
    const displayTime = Math.max(3000, message.length * 100);
    
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s ease';
      
      setTimeout(function() {
        document.body.removeChild(toast);
      }, 500);
    }, displayTime);
  }
});
