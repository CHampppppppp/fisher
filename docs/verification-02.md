# 第 2 阶段验证记录

日期：2026-09-30。项目目录：`/Users/champ/Documents/fisher`。

运行环境：Node.js 24.13.1、npm 11.8.0、macOS 桌面 Chrome，通过 Playwright 自动化。没有更改会话模型配置；当前工具未返回可核验的运行时模型标识，因此不推测模型名称。

## 范围与实现

- 先更新 AGENTS.md 到第 2 阶段，保留第 1 轮约束。
- Game 中增加 fishing/combat、idle/charging/waiting；距离由固定 tick 的蓄力时间计算。
- 对生产海岸和商店进行真实水面/鱼线遮挡判定，落点由玩家/yaw/蓄力推导。
- 鼠标输入、Q/R、可点击按钮与测试 dispatch 共用 Controller.dispatch → Game.dispatch。
- fishing-view 预先创建并复用一条鱼线和一个浮漂；取消/暂停/reset 隐藏当前会话，场景销毁释放资源。
- 本轮 waiting 无自动咬钩；没有鱼、奖励、存档或战斗逻辑。

## 实际执行

1. `npm test`：18 项通过，包括原有 12 项与新增 6 项。
   - shore 步行/冲刺、斜向归一化、跳跃、海岸/商店碰撞；暂停 300 tick 冻结、清输入；快照保护、非法 reset 原子拒绝、固定时钟独占。
   - 蓄力 0/30/90 tick 的抛竿距离精确为 3/10.5/18 米；waiting 推进 600 tick 仍保持等待。
   - 陆地、商店遮挡、菜单、combat 拒绝抛竿；额外指定目标/valid/奖励字段被拒绝。
   - charging/waiting 禁止移动/跳跃；waiting look 限制到浮漂周围；取消后恢复移动。
   - 连续 20 次抛竿/取消、中间暂停恢复、切换 combat、reset，无残留会话与奖励。
   - 重复设置当前模式保留蓄力/会话，真正切换取消。
2. `npm run test:coverage`：通过阈值，模拟/碰撞/抛竿判定/时钟模块行覆盖率 99.76%、分支 95.67%、函数 100%。不包含 DOM 控制器、渲染层和观测适配器，这些通过浏览器集成测试覆盖。
3. `npm run build`：TypeScript 与 Vite 构建通过，退出码 0。
4. 干净目录 `/tmp/island-step02-validation.mRZGzO`：先复制规则，再复制锁文件与源码，执行 `npm ci`、build、test 全部通过；最终修复后再次同步源码并构建/测试。
5. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`：10 项浏览器测试通过，包含完整原有 6 项与新增 4 项。
   - 真正的鼠标按住/松开进入 waiting，Q 切换、Tab 释放鼠标后实际点击模式/取消按钮，再点击场景锁回，未误抛竿。
   - 蓄力时重复 setMode(fishing) 后真正 mouseup 仍成功抛竿；Q 在主动释放鼠标时也可切换。
   - 生产测试接口的 20 次循环、视角限制、移动锁定、暂停/取消清理与落点拒绝。
   - 1280×720、1920×1080 的开始/HUD/蓄力/waiting 截图、视口检查；未捕获异常为 0。
6. 5173 已占用时再次 `npm run dev` 退出码 1，报 `Port 5173 is already in use`，未换端口。
7. 查看实际截图：持竿清楚可辨，预览随蓄力变化，waiting 一条鱼线连接一个浮漂，取消入口与模式可见。

## 修复与证据

- 初始新增单元测试失败，完成生产状态机后通过；最初鼠标集成测试无法抛竿，接入同源控制器后通过。
- 蓄力时重复设置 fishing 模式曾吞掉实际 mouseup：新增浏览器复现确认 waiting 被卡在 charging，再修复幂等模式动作，完整回归通过。
- 主动释放鼠标时 Q 曾被 Pointer Lock 门槛挡住：新增实际键盘复现确认失败，调整仅模式/取消控制动作的门槛，菜单中仍拒绝。

## 未执行与限制

- 未在 Windows/Linux、Safari/Firefox、实体移动设备运行；未做长时间 GPU 性能/内存压力测试。
- blur/visibilitychange 通过浏览器事件驱动，未验证所有操作系统窗口切换组合；实际 Pointer Lock 与鼠标/键盘操作经过 Chrome 验证。
- 短距离抛竿后的视角会夹到浮漂可见范围；鱼竿蓄力/回位按模拟时间平滑，浮漂直接出现在计算落点。
- 水面/商店/岸坡属于生产判定；棕榈、岩石和桶沿用第 1 轮视觉装饰设定。
- Three.js 主包约 596 kB，gzip 约 153 kB，构建仍有体积提示，未隐藏提示。
- 独立验收结果尚待另一会话反馈；仅交付第 2 轮，不继续第 3 轮。
