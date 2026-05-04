# FC 红白机模拟器 — 模块化重构计划

> 状态：**已完成** ✅

## 用户需求

将 FC 红白机模拟器 `modules/fc-emulator/index.html` 中的 ~1390 行代码进行抽象化、类化、模块化重构，用现代 JavaScript 编程规范重新组织。

## 当前问题

1. **全局状态污染**：~20 个全局变量散落各处（activeCore, isRunning, currentScale, turboMode, frameCount, lastTime, lag, audioFifoHead 等）
2. **职责混杂**：UI 渲染、业务逻辑、输入处理、存储管理、音频处理全部混在一起
3. **重复代码**：`startGameWithROM` 和 `loadWithCore` 中大量重复的 UI 切换逻辑（约 20 行完全重复）
4. **HTML 内联事件**：按钮全部使用 `onclick="xxx()"` 内联调用全局函数
5. **DOM 查询无缓存**：频繁调用 `document.getElementById()` 且不缓存结果
6. **触摸事件逻辑分散**：摇杆和按钮的触摸处理散落在不同位置

## 项目约束

- GitHub Pages 静态站点，**无构建工具**（不能使用 webpack/vite/ESM bundler）
- `jsnes.min.js` 和 `jszip.min.js` 是 UMD 全局变量，只能通过 `<script>` 标签加载
- `nostalgist.js` 通过动态 `import()` 加载（ESM）
- 必须保持单文件或少量文件的最终产物（静态 HTML + 少量 JS 模块文件）

## 最终文件结构

```
modules/fc-emulator/
  index.html              # HTML 结构 + CSS 样式（无内联 JS/onclick）
  js/
    config.js             # [DONE] 常量、核心定义、按键映射、code-to-label
    audio.js              # [DONE] AudioFIFO 环形缓冲区类（私有字段）
    storage.js             # [DONE] StorageManager（localStorage 封装）
    rom-loader.js          # [DONE] ROMLoader（文件选择 + JSZip 解压）
    core-base.js           # [DONE] EmulatorCore 抽象基类
    jsnes-core.js          # [DONE] JsnesCore（jsnes.NES 封装 + turbo）
    retroarch-core.js      # [DONE] RetroArchCore（Nostalgist.js 适配器）
    core-manager.js        # [DONE] 核心生命周期、自动检测、切换
    input-handler.js       # [DONE] 键盘 + 虚拟摇杆 + 触摸按钮
    ui.js                  # [DONE] 所有 DOM 操作、overlay、面板
    app.js                 # [DONE] 主入口，连接所有模块
```

## 技术方案

### 模块化策略：纯 ES Module

由于项目运行在无构建工具的 GitHub Pages 上，所有模块文件使用 ES Module (`export class` / `import`)，通过 `<script type="module">` 加载。

基础库（`jsnes.min.js`、`jszip.min.js`）仍通过 `<script>` 标签加载为全局变量，ES Module 中通过 `window.jsnes` / `window.JSZip` 访问。

### 架构设计

```
index.html
  ├─ <script> lib/jszip.min.js      (全局变量)
  ├─ <script> lib/jsnes.min.js      (全局变量)
  ├─ <script type="module">
  │     ├─ import { Config } from './js/config.js'
  │     ├─ import { AudioFIFO } from './js/audio.js'
  │     ├─ import { StorageManager } from './js/storage.js'
  │     ├─ import { ROMLoader } from './js/rom-loader.js'
  │     ├─ import { EmulatorCore } from './js/core-base.js'
  │     ├─ import { JsnesCore } from './js/jsnes-core.js'
  │     ├─ import { RetroArchCore } from './js/retroarch-core.js'
  │     ├─ import { CoreManager } from './js/core-manager.js'
  │     ├─ import { InputHandler } from './js/input-handler.js'
  │     ├─ import { UI } from './js/ui.js'
  │     └─ import { App } from './js/app.js'   ← 入口
```

### 核心类设计

**1. Config — 配置常量**

- 所有魔法数字（屏幕尺寸、帧率、键位定义）集中管理
- `CORE_DEFINITIONS` 核心注册表
- `KEY_MAPS` / `BTN_MAP` 按键映射
- `CODE_TO_LABEL` 键码转标签

**2. AudioFIFO — 音频环形缓冲区**

- 将全局 `audioFifoL/R, audioFifoHead/Count` 封装为独立类
- 提供 `write(l, r)`, `read()` 方法，内部管理指针
- 使用私有字段 `#buffer`, `#head`, `#capacity`

**3. StorageManager — 持久化管理**

- 封装所有 localStorage 操作
- 管理 ROM 数据、游戏状态、核心偏好的存取
- 处理 QuotaExceededError

**4. ROMLoader — ROM 加载**

- 封装 ZIP 解压（JSZip）和文件选择（File System Access API）
- 支持 drag & drop、button click、zip auto-extract

**5. EmulatorCore — 核心基类**

- 抽象基类，定义统一接口：`loadROM`, `start`, `stop`, `buttonDown`, `buttonUp`, `saveState`, `loadState`, `getCanvas`, `destroy`
- 所有核心类继承此类

**6. JsnesCore — jsnes 封装**

- 封装 `new jsnes.NES()`, `loadROM()`, `frame()`, `buttonDown/Up()`, `saveState/loadState()`
- 管理自有 Canvas 渲染和 Web Audio 环形缓冲区
- 支持 turbo 模式（快速跳过无声帧）
- 提供 `runVerificationFrames(count)` 用于自动检测验证

**7. RetroArchCore — Nostalgist.js 适配器**

- 封装 `Nostalgist.launch()`, `pressDown/Up()`, `saveState/loadState()`, `getCanvas()`, `exit()`
- 动态 `import()` Nostalgist.js 和核心文件
- `destroy(removeCanvas)` 区分停止游戏和返回启动器

**8. CoreManager — 核心管理器**

- 封装 `createCoreInstance`, `tryAutoLoad`, `loadWithCore`, `startGameWithROM`
- 消除重复的 UI 切换逻辑（`#activateCore` 统一方法）
- 管理核心偏好和自动检测
- 按优先级依次尝试加载 ROM：`jsnes -> fceumm -> nestopia -> quicknes`

**9. InputHandler — 输入处理**

- 封装键盘事件监听（`keydown`/`keyup`，含连发键）
- 封装虚拟摇杆逻辑（拖拽角度映射）
- 封装触摸按钮逻辑（touch start/move/end）
- 统一的 `onButtonDown(btn)` / `onButtonUp(btn)` 回调接口

**10. UI — UI 管理**

- DOM 元素缓存（`#els` Map）
- Loading overlay 控制
- 缩放/全屏管理
- Canvas 显示切换
- 键盘映射面板、核心选择面板
- 启动器界面和游戏界面切换

**11. App — 主入口**

- 持有所有模块实例
- 初始化 CoreManager、UI、InputHandler
- 绑定所有 DOM 事件（无 onclick）
- 协调模块间通信

## 关键改进

| 问题 | 解决方案 |
|------|---------|
| ~20 个全局变量 | 类封装 + 私有字段（`#`） |
| 重复代码（~20行） | `CoreManager.#activateCore()` 统一 |
| onclick 内联事件 | `addEventListener` 统一绑定 |
| DOM 查询无缓存 | `UI.#els` Map 一次性缓存 |
| 职责混杂 | 按功能划分 10 个模块文件 |
| 触摸事件分散 | `InputHandler` 统一管理 |

## 实现注意事项

- `jsnes.NES` 和 `JSZip` 是全局变量，在 ES Module 中通过 `window.jsnes` / `window.JSZip` 访问
- `nostalgist.js` 保持动态 `import()` 加载方式不变
- CSS 保持内联在 index.html 的 `<style>` 中，不单独拆分（减少 HTTP 请求）
- DOM 元素引用在 UI 类初始化时一次性缓存，避免重复查询
- `EmulatorCore.destroy(removeCanvas)` 接受参数区分游戏停止和返回启动器场景
