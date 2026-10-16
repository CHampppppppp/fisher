# 第12阶段验证记录

日期：2026-10-01。环境：macOS、Node.js24.13.1、npm11.8.0、本机Google Chrome，由Playwright驱动真实浏览器API。沿用当前fisher项目第1–11轮成果，未恢复历史备份，未新建另一个第1轮项目。

## 实现与已执行的验证

- 独立设置页：打开冻结并释放输入，关闭返回暂停/原终态；0–100有限百分比（含小数）、0.25–3倍灵敏度、14项键位；Esc固定，重复键和默认别名冲突原子拒绝。
- localStorage `island-fishing-settings-v1`与version1游戏存档独立，写入成功再提交；刷新、实际读档、reset、restart保留设置。真实QuotaExceededError写入失败保留原值，显示原因。
- 可信交互后才创建Web Audio；测试实际AudioContext主GainNode为0，攻击确实创建振荡器而输出静音。原生鼠标20/-10像素在3倍灵敏度产生yaw/pitch 0.12/0.06弧度。交互重绑F后E不能拾取，F拾取同一尸体，提示同步。
- 原生Home/End、Tab、Enter和键码操作设置，有可见焦点。1280×720关闭按钮完整可见率为1；1920×1080设置、菜单、HUD控件检查和截图。
- 原生确认20次重新开始后，input监听注册数与初始相同，活跃requestAnimationFrame为1；一次左键只有一次10点伤害，W60真实模拟步为4米。未重建Controller/时钟/音频。
- settings、inventory、shop、pause、失焦、隐藏、dead/victory冻结继续规则沿用生产路径，全前序回归保留。
- public runReplay通过生产Controller与Game.step，30/60/120Hz虚拟渲染下真实成功收杆、pause/resume、移动获得完全相同快照；同实例连续回放ID基线一致。单步/7步/60步分批推进相同；真实GameClock的三种调度均60tick/秒。渲染不消耗随机数，不设实测FPS评分阈值。
- `npm run build`：类型检查与生产构建成功，退出码0。JS692.59kB/gzip182.16kB；Vite默认500kB包体积提示保留，未提高阈值隐藏。
- `npm run test:coverage`：110/110核心测试通过，0失败；src/game行97.78%、分支92.78%、函数93.30%。DOM、Three.js渲染不计入这个覆盖率；实际IndexedDB浏览器事务分支由集成测试验证。
- 最终干净目录 `/var/folders/18/ct_qq3d17rz5q2g0gkd4rq780000gn/T/island-step12-final-clean-l1fnfndh`：先复制AGENTS.md再复制源码，未复用node_modules；npm ci（0漏洞）、npm run build、npm test110项全部退出码0。
- 已占用5173时再次npm run dev：退出码1、明确`Port 5173 is already in use`，未改用其他端口。原服务仍正常。
- 项目没有lint脚本，也没有Git仓库；未宣称独立lint或git diff通过。已手工审查本轮文件，源码rg检查未发现远程资源/密钥/console.log依赖。

## 实际缺陷和修正

1. 原控制器任意keyup都会发送move，覆盖交互错误/结果；改为只在真正按住的移动键释放时提交移动。
2. 滑块通过鼠标打开并自动聚焦没有轮廓；增加真实focus样式，原生键盘操作复测。
3. dead/victory打开设置暂为paused，eat可能绕过终态限制；先复现失败测试，再在设置菜单拒绝所有非设置游戏动作（pause/resume生命周期除外）。
4. 720高度设置面板裁切关闭按钮；调整有限高度布局，新增完整可见率断言，未缩小字号。
5. 连续回放的新会话事件sequence从1开始，旧声音去重序列会跳过新声音；回放提交新会话时清空音频观察历史。
6. 音量额外整数约束不属于公开规则；修改为有限范围，增加50.5%核心案例与35.5%真实持久化案例。
7. 键位变化后空背包/商店和购买装备提示可能保留旧键；重建提示与对应列表，使用同一个真实绑定查询。

## 试玩尝试与证据边界

真实时钟路径是`?test=1&clock=real`。只在开始做一次公开reset：seed45734、shore、玩家(0,1,-5)、yaw PI。之后不调用dispatch/advanceTicks/第二次reset；全部游戏动作来自原生键鼠或可见UI按钮，getState只观察。没有注入鱼、金币、武器、稀有计数或Boss生命/伤害。

成功流程自然捕获蓝背/银鳍/三条金鳞；拳头击杀蓝背并卖出买木棍，银鳍食用，金鳞追击击杀出售后买重锤；第三条真实捕获触发Boss；实际保存→刷新→读取→明确继续→600HP两阶段Boss战→胜利。游戏统计断言caught5/killed5/sold4/coins75/bossDamage600，original IDs跨吃/卖/存档同源，胜利与模拟冻结。

保留失败证据，没有将尝试失败算通过：

- 初版驱动在收杆完成边界读取两次状态，第二次已完成却仍检查species；改为单次快照判断phase。
- 编辑生产文件后的Vite开发热更新曾使首次浏览器观测context被销毁，稳定源码后复测；这不当作功能通过。
- 首次中心位置追金鳞时真实逃生；后续改用商店墙边实际放置策略，仍使用生产碰撞、速度和输入，没有改变鱼/武器规则。
- 并行运行完整浏览器录像时，真实收杆出现时限/输入时序失败；最终流程串行，按实际holding状态控制、确认原生按下已生效，录像、输入日志和终态均保留。60秒是有界工作流超时，不是FPS评分，也不会推进模拟。

此前1280真实闭环已完整成功一次（2.6分钟，tick8947/HP85/金币75），证据在`test-results/run-1790856525326/playthrough-real-clock-nat-3b973-es-boss-storage-and-victory/`。最终结果见下节。

## 最终浏览器结果

最终命令：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e
```

54/54通过，0失败（5.8分钟），包含全部前序48项、本轮5项和真实时钟完整流程1项；没有跳过前序测试。最终完整流程2.7分钟，tick9117、HP70、金币75、5次捕获、5次击杀、4次出售，Boss600点伤害和唯一胜利，终态实际等待后冻结。实际音量、灵敏度、重绑、35.5%独立持久化、菜单冻结、20次原生确认重开、生产回放均通过。

最终1280流程证据目录：`test-results/run-1790857834664/playthrough-real-clock-nat-3b973-es-boss-storage-and-victory/`，包含实际场景截图、video.webm、actual-input-timeline.json（生产快照/最终状态/原生输入事件），未对玩法状态做成功注入。设置最终截图在`test-results/run-1790857652238/`。

全量回归后只调整了真实键鼠测试驱动（按视口计算鼠标中心、确认实际转向、近目标分段移动），生产游戏代码未再变更。串行补测结果：

| 起始视口 | 结果 | 最终tick / HP / 金币 | 证据目录 |
| --- | --- | --- | --- |
| 1280×720 | 1/1通过，2.7分钟 | 9120 / 85 / 75 | `test-results/run-1790858418321/playthrough-real-clock-nat-3b973-es-boss-storage-and-victory/` |
| 1920×1080 | 1/1通过，2.8分钟 | 9396 / 25 / 75 | `test-results/run-1920-1790858629880/playthrough-real-clock-nat-3b973-es-boss-storage-and-victory/` |

两次均实际捕获5、击杀5、出售4、食用银鳍一次、金鳞计数3、Boss伤害600、唯一victory、error数组为空；恢复后使用实际键鼠躲预警/攻击并通关。终态HP差异来自真实计时和命中，未与确定性虚拟回放混淆。每个目录保留actual-input-timeline.json、截图和video.webm。

1920初版驱动使用固定1280鼠标中心且连续移动到小目标时会过冲；真实输入日志显示锁定仍有效，改为按视口中心对齐、读取实际摄像机反馈和近目标分段原生移动后复测通过。此处只修改测试驱动，不修改生产位置或方向。

1920执行使用临时配置，内容等价于交付的`playwright-1920.config.ts`；交付配置已通过`--list`确认仅收集1项1920闭环。可直接复现：

```sh
npm run test:e2e -- --config playwright-1920.config.ts
```

已有Chrome时仍可用PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH；默认使用Playwright Chromium。实际配置只替换viewport/testMatch，复用同一服务和测试代码。

## 未执行与限制

- 代理原生键鼠、实际生产计时、录像/截图观察与自动状态断言分开记录。没有真人主观手感评估，不能以自动通过代替人工评价；桌面工具此前报告Mac锁定，未进行人工桌面接管。
- 未运行Windows/Linux、Safari/Firefox；未做长期显卡/内存压力或实际扬声器听感测试，不宣称跨设备已测或特定FPS表现。
- 失焦/隐藏回归包含浏览器事件触发；未穷举操作系统窗口切换组合。
- 本轮仅完成已公开第12阶段，不新增鱼种、武器或Boss机制；交付后停止，等待独立验收。
