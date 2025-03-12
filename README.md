<div align="center">
  <h1>
    <img src="./access/icon128.png" alt="Crazy Screenshot logo" width="32" height="32" style="vertical-align: middle; margin-right: 10px;">
    Crazy Screenshot
  </h1>
  
  <p>
    <a href="#功能特点"><img src="https://img.shields.io/badge/版本-1.0.0-blue" alt="版本"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-MIT-green" alt="许可证"></a>
    <a href="#安装方法"><img src="https://img.shields.io/badge/平台-Chrome-yellow" alt="平台"></a>
  </p>
</div>

<div align="center">
  <h3>
    <a href="#功能特点">功能特点</a>
    <span> | </span>
    <a href="#安装方法">安装方法</a>
    <span> | </span>
    <a href="#使用说明">使用说明</a>
    <span> | </span>
    <a href="#项目结构">项目结构</a>
    <span> | </span>
    <a href="#常见问题">常见问题</a>
  </h3>
</div>

<div align="center">
  <h4>
    <a href="README.md">中文</a>
    <span> | </span>
    <a href="README_EN.md">English</a>
  </h4>
</div>

---

Crazy Screenshot是一个Google Chrome浏览器扩展程序，旨在为用户提供自动截图功能。当用户开启录制模式后，每次点击鼠标都会自动触发截屏，将当前浏览器窗口内容保存到用户指定的本地目录中。这个工具特别适合采集网页训练数据、需要记录操作流程、创建教程或进行用户体验测试的场景。

## 功能演示

<div align="center">
  <!-- 方法1: 使用video标签 (在GitHub上可能不起作用) -->
  <video width="600" controls>
    <source src="./access/crazy_screenshot_demo.mp4" type="video/mp4">
    您的浏览器不支持视频标签。
  </video>
  
</div>

## 开发状态

> 状态标记: ✅ 已完成 | 🔄 正在进行 | ⏳ 计划中

- **功能实现**
  - [x] 监听用户鼠标点击事件，自动触发截屏操作 ✅ 
  - [x] 提供开始/停止录制功能，用户可随时控制截图过程 ✅ 
  - [x] 显示当前会话已截取的图片数量 ✅ 
  - [ ] 截图时提供视觉反馈，让用户知道截图已完成 🔄
  - [ ] 支持快捷键控制录制开始/停止 ⏳
  - [ ] 支持截图区域选择 ⏳
  
- **问题修复**
  - [ ] Windows 系统不能将截图保存到指定目录 🔄
  - [ ] 在某些网站上截图失败 ⏳
  - [ ] 优化内存使用，减少长时间运行时的内存占用 ⏳

## 功能特点

1. **自动截屏**：监听用户鼠标点击事件，自动触发截屏操作
2. **自定义存储路径**：允许用户设置截图保存的本地目录
3. **智能命名**：截图自动以"当前标签页名称+时间戳"方式命名，便于整理和查找
4. **录制控制**：提供开始/停止录制功能，用户可随时控制截图过程
5. **视觉反馈**：截图时提供视觉反馈，让用户知道截图已完成
6. **计数统计**：显示当前会话已截取的图片数量
7. **Google搜索优化**：针对Google搜索页面进行了特殊优化处理
8. **防重复触发**：设置最小截图间隔，防止频繁点击导致的重复截图

## 安装方法

### 从Chrome网上应用店安装

1. 目前尚未上架Chrome网上应用店 😝

### 开发者模式安装

1. 点击右上角的 **Code** 按钮，选择 **Download ZIP** 下载源代码
2. 解压下载的ZIP文件到本地文件夹
3. 打开Chrome浏览器，在地址栏输入 `chrome://extensions/`
4. 在右上角启用"开发者模式"
5. 点击"加载已解压的扩展程序"按钮
6. 选择解压后的项目文件夹
7. 扩展程序将被添加到Chrome浏览器中


## 使用说明

### 基本使用流程

1. **设置保存目录**：
   - 点击Chrome工具栏中的Crazy Screenshot图标
   - 在弹出的窗口中点击"Set"按钮
   - 输入完整的文件夹路径（确保该目录已存在且有写入权限）
   - 确认设置

2. **开始录制**：
   - 点击"Start"按钮开始录制
   - 状态将变为"Recording..."
   - 此时每次点击鼠标都会自动截取当前页面

3. **停止录制**：
   - 再次点击"Stop"按钮停止录制
   - 状态将变为"Ready"

### 路径设置示例

- **Windows系统**：`C:\Users\Username\Pictures\Screenshots`
- **Mac系统**：`/Users/username/Pictures/Screenshots`
- **Linux系统**：`/home/username/Pictures/Screenshots`

### 注意事项

- 请确保设置的保存目录已存在且有写入权限
- 在Windows系统上，如果截图未保存到指定位置，请检查浏览器的默认下载文件夹
- 为避免过多截图，系统设置了最小截图间隔（500毫秒）
- 在隐私敏感页面（如银行网站）上，扩展可能无法正常工作
- 长时间运行可能会占用较多内存，建议定期重启浏览器

## 项目结构

```
Crazy_Screenshot/
├── manifest.json        # 扩展程序配置文件，定义权限、脚本和资源
├── background.js        # 后台脚本，负责截图捕获和保存功能
├── content.js           # 内容脚本，注入网页监听点击事件
├── popup.html           # 弹出窗口HTML结构
├── popup.js             # 弹出窗口交互逻辑
├── popup.css            # 弹出窗口样式
├── styles.css           # 全局样式
├── images/              # 扩展图标资源
│   ├── icon16.png       # 16x16像素图标
│   ├── icon48.png       # 48x48像素图标
│   └── icon128.png      # 128x128像素图标
├── icons/               # 图标生成脚本
│   └── createIcons.js   # 用于生成不同尺寸图标的脚本
├── access/              # 设计资源和原始素材
│   ├── icon.psd         # 图标Photoshop源文件
│   ├── blueprint.pptx   # 扩展设计蓝图
│   ├── start.png        # 开始按钮图标源文件
│   ├── stop.png         # 停止按钮图标源文件
│   └── icon*.png        # 各尺寸图标备份
├── LICENSE              # MIT许可证文件
├── .gitignore           # Git忽略配置文件
└── README.md            # 项目说明文档
```

### 文件说明

1. **核心功能文件**
   - `manifest.json`: 扩展的配置文件，定义了扩展的名称、版本、权限和资源引用
   - `background.js`: 后台服务脚本，实现截图捕获、保存和管理录制状态的核心逻辑
   - `content.js`: 内容脚本，注入到网页中监听用户点击事件并与后台脚本通信
   - `popup.html`: 扩展弹出窗口的HTML结构，提供用户界面
   - `popup.js`: 弹出窗口的交互逻辑，处理用户输入和状态显示

2. **样式文件**
   - `popup.css`: 弹出窗口的样式定义，控制界面外观
   - `styles.css`: 全局样式定义，用于通用样式设置

3. **资源文件**
   - `images/`: 包含扩展在Chrome浏览器中显示的各种尺寸图标
   - `icons/createIcons.js`: 用于生成不同尺寸图标的脚本工具
   - `access/`: 包含设计资源和原始素材，如PSD源文件和设计蓝图

4. **项目文档**
   - `README.md`: 项目说明文档，提供安装和使用指南
   - `README_EN.md`: 英文版项目说明文档
   - `LICENSE`: MIT许可证文件，说明项目的开源许可条款

## 技术实现

Crazy Screenshot采用标准的Chrome扩展架构实现，主要包含以下组件：

### 核心组件

1. **后台脚本 (background.js)**：
   - 负责截图捕获和保存
   - 管理录制状态
   - 处理下载文件名和路径
   - 与内容脚本通信

2. **内容脚本 (content.js)**：
   - 注入到网页中监听用户点击事件
   - 发送点击事件到后台脚本
   - 提供视觉反馈
   - 处理Google页面的特殊情况

3. **弹出窗口 (popup.html/js)**：
   - 提供用户界面控制
   - 显示当前状态和统计信息
   - 设置保存目录
   - 开始/停止录制控制

### 权限说明

扩展需要以下权限才能正常工作：

- `activeTab`：访问当前活动标签页
- `downloads`：管理下载操作
- `storage`：存储用户设置和状态
- `tabs`：获取标签页信息
- `scripting`：注入和执行脚本
- `notifications`：显示通知
- `host_permissions`：访问所有网站

## 常见问题

1. **截图未保存到指定位置**
   - 检查指定目录是否存在且有写入权限
   - 查看浏览器的默认下载文件夹（通常在 `chrome://settings/downloads` 中设置）
   - 确认是否有其他程序阻止写入
   - Windows系统用户可能需要使用反斜杠（`\`）而非正斜杠（`/`）

2. **扩展无法正常工作**
   - 确保Chrome浏览器已更新到最新版本
   - 尝试重新安装扩展
   - 检查控制台是否有错误信息（右键点击扩展图标 > 检查 > 控制台）
   - 确认扩展是否有足够的权限（可能需要重新授权）

3. **截图质量问题**
   - 截图质量取决于当前显示器分辨率和浏览器窗口大小
   - 对于高分辨率显示器，可能需要调整浏览器缩放比例
   - 检查浏览器是否启用了硬件加速

4. **内存占用过高**
   - 长时间运行可能导致内存占用增加
   - 建议定期停止录制并重启扩展
   - 避免在多个标签页同时启用录制功能

## 隐私声明

Crazy Screenshot尊重用户隐私，不会收集或上传任何用户数据。所有截图都保存在用户指定的本地目录中，不会发送到任何远程服务器。扩展不会：

- 收集用户的浏览历史
- 读取或存储网页上的表单数据
- 跟踪用户的点击行为（除了用于触发截图）
- 将任何数据发送到第三方服务器

## 贡献指南

欢迎对Crazy Screenshot进行改进和贡献。如果您有任何建议或发现了bug，请在GitHub仓库中提交issue或pull request。

### 如何贡献

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

### 开发环境设置

1. 克隆仓库到本地
2. 在Chrome中加载解压的扩展
3. 修改代码后，在扩展页面点击"重新加载"按钮应用更改

## 许可证

本项目采用MIT许可证。详情请参阅[LICENSE](LICENSE)文件。
