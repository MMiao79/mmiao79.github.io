---
name: fix-fc-emulator-issues
overview: 修复 FC 模拟器的三个问题：favicon 404、JSNES 私有方法不可写错误、Nostalgist 画布警告
todos:
  - id: fix-jsnes-loop
    content: "修复 jsnes-core.js 私有方法绑定错误，将 #loop bind 改为 #loopFn 字段，同步清理所有调试日志"
    status: completed
  - id: fix-favicon
    content: 在 index.html 添加 SVG data URI favicon 消除 404
    status: completed
  - id: fix-retroarch-canvas
    content: 优化 retroarch-core.js canvas 创建逻辑并清理调试日志，最后统一 git commit + push
    status: completed
---

## 核心问题

修复 FC 模拟器控制台报出的所有错误：

1. **`Private method '#loop' is not writable`** (致命) - JSNES 核心在 ROM 加载验证成功后，调用 `start()` 时崩溃，游戏完全无法运行。根因：`jsnes-core.js` 第 112 行 `this.#loop = this.#loop.bind(this)`，JavaScript 私有方法不可写。
2. **`favicon.ico 404`** - 项目无 favicon 文件，浏览器默认请求 `/favicon.ico` 返回 404。
3. **Nostalgist 画布警告** - `Canvas size should be set using CSS properties` 和 `Setting real canvas size: 0 x 0`，Nostalgist 内部 WASM 输出的警告信息，部分核心受 canvas 可见性时序影响。

## 修复范围

- `jsnes-core.js`：修复私有方法绑定错误
- `index.html`：添加 favicon 声明
- `retroarch-core.js`：优化 canvas 创建时序，减少 Nostalgist 警告

## 技术方案

### Bug 1: Private method '#loop' is not writable (致命)

**根因**：`this.#loop = this.#loop.bind(this)` 在私有方法上不可行，JS 引擎会抛出 `TypeError`。

**修复方案**：将 `#loop` 私有方法改为普通方法 `#_loop`，使用私有字段 `#loopFn` 存储 bind 后的引用：

```javascript
// jsnes-core.js - start() 方法
start() {
    this.#resumeAudio();
    this.#running = true;
    this.#lastTime = 0;
    this.#lag = 0;
    this.#frameCount = 0;
    this.onRunningChange?.(true);
    this.#loopFn = this.#loop.bind(this);
    requestAnimationFrame(this.#loopFn);
}

// stop() 方法也需要更新
stop() {
    this.#running = false;
    this.onRunningChange?.(false);
    if (this.#animId) { cancelAnimationFrame(this.#animId); this.#animId = null; }
    this.#loopFn = null;
}

// #loop 内部引用改为 this.#loopFn
#loop(timestamp) {
    if (!this.#running) return;
    this.#animId = requestAnimationFrame(this.#loopFn);
    ...
}
```

### Bug 2: favicon.ico 404

**修复方案**：在 `index.html` 的 `<head>` 中添加 SVG data URI favicon，无需额外文件：

```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎮</text></svg>">
```

### Bug 3: Nostalgist 画布警告

**根因**：Nostalgist 内部在 `getElementSize()` 读取 `element.offsetWidth/offsetHeight`，若 canvas 容器不可见（`display: none`），尺寸为 0。

**修复方案**：在 `retroarch-core.js` 的 `loadROM` 中，创建 canvas 后添加明确的像素尺寸（而非仅依赖 CSS 百分比），确保 Nostalgist 能正确读取尺寸。

### 实施注意

- `#loopFn` 作为新的私有字段声明在类顶部
- favicon 使用 SVG data URI，兼容所有现代浏览器
- Nostalgist 的 WARN/INFO 级别日志是库内部行为，无法完全消除，但通过确保 canvas 可见性可减少 0x0 问题
- 修改完成后清理调试日志（`console.log`）

## 目录结构

```
modules/fc-emulator/
├── index.html                     # [MODIFY] 添加 favicon link 标签
├── js/
│   ├── jsnes-core.js              # [MODIFY] 修复 #loop 私有方法绑定，添加 #loopFn 字段，清理调试日志
│   └── retroarch-core.js          # [MODIFY] 优化 canvas 尺寸设置，清理调试日志
```