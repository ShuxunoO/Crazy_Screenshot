document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const delayInput = document.getElementById('delay-input');
  const hotkeyInput = document.getElementById('hotkey-input');
  const doubleClickCheckbox = document.getElementById('double-click');
  const resetBtn = document.getElementById('reset-btn');
  const toggleBtn = document.getElementById('toggle-btn');
  const capturedContainer = document.getElementById('captured-container');
  const capturedCount = document.getElementById('captured-count');
  
  // 设置hotkeyInput为只读
  hotkeyInput.readOnly = true;
  
  // 获取当前的快捷键设置
  if (chrome.commands) {
    chrome.commands.getAll(function(commands) {
      // 查找take-screenshot命令
      const screenshotCommand = commands.find(command => command.name === 'take-screenshot');
      if (screenshotCommand && screenshotCommand.shortcut) {
        hotkeyInput.value = screenshotCommand.shortcut;
      } else {
        hotkeyInput.value = 'Ctrl+Shift+Q (默认)';
      }
    });
  } else {
    hotkeyInput.value = 'Ctrl+Shift+Q (默认)';
  }
  
  // 从存储中获取设置
  chrome.storage.local.get(['delay', 'doubleClick', 'isRecording', 'screenshotCount'], function(result) {
    // 设置延迟
    if (result.delay !== undefined) {
      delayInput.value = result.delay.toFixed(1) + 's';
    }
    
    // 设置双击
    if (result.doubleClick !== undefined) {
      doubleClickCheckbox.checked = result.doubleClick;
    }
    
    // 恢复录制状态
    if (result.isRecording) {
      startRecordingUI();
      
      // 显示已捕获数量
      if (result.screenshotCount !== undefined) {
        capturedCount.textContent = result.screenshotCount;
        capturedContainer.classList.remove('hidden');
      }
    }
  });
  
  // 延迟输入框事件
  delayInput.addEventListener('input', function() {
    // 移除非数字、非小数点内容，保留s
    let value = this.value.replace(/[^\d.s]/g, '');
    
    // 确保只有一个单位s
    if (value.indexOf('s') !== value.lastIndexOf('s')) {
      value = value.replace(/s/g, '') + 's';
    }
    
    // 如果末尾没有s，添加s
    if (!value.endsWith('s')) {
      value += 's';
    }
    
    // 移除s以处理数值逻辑
    let numValue = value.replace('s', '');
    
    // 限制只有一个小数点
    if (numValue.split('.').length > 2) {
      numValue = numValue.slice(0, numValue.lastIndexOf('.')) + numValue.slice(numValue.lastIndexOf('.') + 1);
    }
    
    // 限制小数点后只有一位
    const parts = numValue.split('.');
    if (parts.length > 1 && parts[1].length > 1) {
      numValue = parts[0] + '.' + parts[1].slice(0, 1);
    }
    
    // 更新输入框值
    this.value = numValue + 's';
    
    // 保存设置
    const delay = parseFloat(numValue) || 0;
    chrome.storage.local.set({ delay });
    
    // 如果正在录制，通知后台脚本更新设置
    chrome.storage.local.get(['isRecording'], function(result) {
      if (result.isRecording) {
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: {
            delay: delay
          }
        }).catch(error => {
          console.error('发送更新延迟设置消息失败:', error);
          // 此错误不影响用户体验，所以只记录不处理
        });
      }
    });
  });
  
  // 双击复选框事件
  doubleClickCheckbox.addEventListener('change', function() {
    const doubleClick = this.checked;
    
    // 更新UI提示
    const modeText = doubleClick ? '双击截屏' : '单击截屏';
    
    // 保存设置
    chrome.storage.local.set({ doubleClick });
    
    // 如果正在录制，通知后台脚本更新设置
    chrome.storage.local.get(['isRecording'], function(result) {
      if (result.isRecording) {
        chrome.runtime.sendMessage({
          action: 'updateSettings',
          settings: {
            doubleClick: doubleClick
          }
        }).catch(error => {
          console.error('发送更新双击设置消息失败:', error);
          // 此错误不影响用户体验，所以只记录而不处理
        });
        showToast(`已切换为${modeText}模式`);
      } else {
        showToast(`已设置为${modeText}模式`);
      }
    });
  });
  
  // 重置按钮事件
  resetBtn.addEventListener('click', function() {
    // 重置所有设置
    delayInput.value = '0.0s';
    hotkeyInput.value = '';
    doubleClickCheckbox.checked = false;
    
    // 保存重置后的设置
    chrome.storage.local.set({
      delay: 0.0,
      doubleClick: false
    });
    
    // 显示重置成功提示
    showToast('设置已重置');
  });
  
  // 开始/停止按钮事件
  toggleBtn.addEventListener('click', function() {
    chrome.storage.local.get(['isRecording'], function(result) {
      const isRecording = result.isRecording || false;
      
      if (!isRecording) {
        // 开始录制
        chrome.storage.local.set({
          isRecording: true,
          screenshotCount: 0
        });
        
        // 通知后台脚本开始录制
        chrome.runtime.sendMessage({
          action: 'startRecording',
          settings: {
            delay: parseFloat(delayInput.value.replace('s', '')) || 0,
            hotkey: hotkeyInput.value,
            doubleClick: doubleClickCheckbox.checked
          }
        }).catch(error => {
          console.error('发送开始录制消息失败:', error);
          // 如果是连接问题，尝试延迟后重新发送
          if (error.message.includes('Receiving end does not exist')) {
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'startRecording',
                settings: {
                  delay: parseFloat(delayInput.value.replace('s', '')) || 0,
                  hotkey: hotkeyInput.value,
                  doubleClick: doubleClickCheckbox.checked
                }
              }).catch(e => console.error('重试发送开始录制消息失败:', e));
            }, 500);
          }
        });
        
        startRecordingUI();
        capturedCount.textContent = '0'; // 重置计数
      } else {
        // 停止录制
        chrome.storage.local.set({ isRecording: false });
        
        // 通知后台脚本停止录制
        chrome.runtime.sendMessage({ action: 'stopRecording' })
          .catch(error => {
            console.error('发送停止录制消息失败:', error);
            // 这里不需要重试，因为即使消息发送失败，我们也已经在存储中设置了isRecording=false
            stopRecordingUI();
          });
        
        stopRecordingUI();
      }
    });
  });
  
  // 监听截图计数更新
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'screenshotTaken') {
      capturedCount.textContent = request.count;
      capturedContainer.classList.remove('hidden');
      
      sendResponse({ received: true });
    }
    return true;
  });
  
  // 开始录制UI更新
  function startRecordingUI() {
    toggleBtn.textContent = 'Stop';
    toggleBtn.classList.remove('start-btn');
    toggleBtn.classList.add('stop-btn');
    capturedContainer.classList.remove('hidden');
  }
  
  // 停止录制UI更新
  function stopRecordingUI() {
    toggleBtn.textContent = 'Start';
    toggleBtn.classList.remove('stop-btn');
    toggleBtn.classList.add('start-btn');
    capturedContainer.classList.add('hidden'); // 隐藏捕获计数行
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
    toast.style.fontSize = '14px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(function() {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(-5px)';
      
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(0px)';
        
        setTimeout(function() {
          document.body.removeChild(toast);
        }, 300);
      }, 2000);
    }, 10);
  }
});
