# 第 1 阶段验证记录

日期：2026-09-30。环境：Node.js 24.13.1、npm 11.8.0、macOS 本地桌面 Chrome（Playwright 自动化）。

## 已执行

- `npm install`：生成依赖锁文件，审计未发现已知漏洞。
- 独立干净目录 `/tmp/island-step01-validation.1Wsc5V`：复制规则与源码后，`npm ci`、`npm run build` 成功，退出码 0；没有复用原项目 node_modules。
- `npm run build`：TypeScript 检查与 Vite 生产构建成功，退出码 0。
- `npm test` / `npm run test:coverage`：12 项测试通过。覆盖模拟、碰撞、固定步长时钟；行覆盖率 99.20%、分支覆盖率 94.85%、函数覆盖率 100%。此数字不包含 DOM 控制器、渲染层和观测适配器，它们通过浏览器集成测试验证。
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`：6 项浏览器测试，包含以下验收内容。
  - 普通 URL 无观测入口，test=1 页有入口；reset 与画面/HUD 同源，快照修改不改变真实状态。
  - 步行 60 tick 为 4 米，冲刺 60 tick 为 6 米；跳跃腾空后落地。
  - 海岸限制脚部中心至 9.7 米，商店侧面停止在 X=-4.2；非法 reset 原子拒绝。
  - 正常页面点击开始成功获得 Pointer Lock；Esc、blur、隐藏后必须点击继续。
  - 真实键盘 W 移动、失焦暂停 300 tick 冻结、继续后不自动移动；模拟 OS 重复键事件也不会恢复已清除输入；reset 清空持有输入。
  - 1280×720、1920×1080 的开始菜单/HUD 截图及视口检查；关键按钮、HP/饥饿/金币与帮助可读，无横向溢出、无未捕获异常。
- 第二个 `npm run dev` 在测试服务器已占用 5173 时退出码 1，明确报 `Port 5173 is already in use`，没有改用其他端口。
- 静态检查确认本地程序化场景，无远程素材加载或 API/密钥依赖。

## 修复过的回归

- 测试入口的动态导入与页面加载事件存在时序竞争，导致加载完成后立即读取接口可能尚不存在。改为静态加载模块、仅按 test=1 条件注册。
- 失焦后仍按住 W，OS key-repeat 可能重新设置移动。增加复现用例并确认失败后，控制器改为忽略重复 keydown，随后复测通过。
- Three.js 新版不再支持 PCFSoftShadowMap，改为正式支持的 PCFShadowMap。

## 未执行与限制

- 未在 Windows/Linux、Safari/Firefox 或实体移动设备运行；源码与 npm 脚本使用跨平台实现，目标仍为桌面网页。
- 页面隐藏测试通过覆盖 document.hidden 并触发 visibilitychange；blur 通过浏览器事件触发，未测试操作系统窗口切换的所有组合。Pointer Lock 获得/释放及键盘输入使用真实浏览器 API。
- 未进行长时间性能/内存压力测试或真实显卡差异测试。
- 构建有约 578 kB 的 Three.js 入口包体积提示，gzip 约 149 kB；不影响构建退出码，未通过抬高阈值隐藏提示。
- 不包含后续轮钓鱼、经济、生存消耗、存档和战斗功能。
