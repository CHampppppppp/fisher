# 潮生 · 第一人称海岛

`island-fishing-survival-12`：第一人称海岛、确定性钓鱼/逃生、尸体背包与饥饿生存、商店出售、武器购买、章鱼 Boss 两阶段战斗、通关、单槽安全存档、独立设置持久化与确定性输入回放。

## 启动

使用 Node.js 24、npm 11 和支持 WebGL2 / Pointer Lock 的桌面浏览器。

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5173/ 并点击「开始探索」。服务只监听 `127.0.0.1:5173`；端口占用直接失败，不切换端口。

```sh
npm run build
npm run preview
```

`build` 先做 TypeScript 检查，再生成 `dist/`。场景、材质、水面着色器和标识均由项目本地代码生成，无外部素材、字体、API 或密钥请求。

## 操作

下表为默认键位；设置页可重绑全部非鼠标动作，HUD 和菜单提示同步显示实际绑定。Esc 固定暂停。

| 操作 | 输入 |
| --- | --- |
| 观察 | 鼠标，点击开始/继续后锁定 |
| 移动 | W / A / S / D |
| 冲刺 | 按住 Shift |
| 跳跃 | Space |
| 暂停并释放鼠标 | Esc |
| 恢复 | 点击「继续探索」 |
| 切换钓鱼/战斗模式 | Q / HUD 模式按钮 |
| 武器攻击 | combat 模式单次点击左键；按住不自动连击 |
| 装备武器 | 1 / 2 / 3 / 4 对应拳头 / 木棍 / 鱼叉 / 重锤；快捷栏或背包装备按钮 |
| 蓄力抛竿 | 按住左键，松开抛竿；1 秒满蓄力 |
| 咬钩与收杆 | 咬钩时按左键；按住增加进度和张力，松开降低张力 |
| 取消钓鱼 | R / HUD「取消钓鱼」按钮 |
| 背包 | Tab / 背包按钮；冻结模拟，选择鱼后食用 |
| 关闭背包 | Tab / 关闭按钮；清除输入，点击场景重新锁定 |
| 拾取尸体 | 柜台范围外，无持鱼时 E，最近 2 米内可达尸体 |
| 商店 | 正面柜台 2 米内 E / 海风商店按钮；出售尸体或购买武器 |
| 关闭商店 | 关闭商店并继续 / Tab；清除输入，不补算 |
| 点击 HUD 按钮 | 关闭背包后鼠标保持自由，可操作 HUD |
| 放下持鱼 | E / HUD「放下活鱼」按钮；绿色预览圈表示合法落点 |
| 持鱼后重新开始 | 点击「重新开始」并确认 |

切出窗口、隐藏页面或意外失去鼠标锁定都会暂停。暂停保留钓鱼会话和所有计时、清除按住输入；点击继续后不补算暂停时间，需要重新按移动键或左键。暂停中的水面动画也冻结。

Tab 本轮改为背包：冻结移动、鱼、钓鱼、冷却和生存计时并释放鼠标，保留钓鱼会话，清除所有按住输入。关闭后从原 running 状态回 running，鼠标自由，可点击 HUD 或点击场景重新锁定；重锁不会误触抛竿或攻击。如果从暂停菜单打开，或背包期间失焦/隐藏，关闭后仍在暂停菜单，必须明确点击继续。暂停菜单也提供「打开背包」，菜单中只能提交菜单操作，不能移动、攻击、放鱼或拾取。

初始 HP 100、饥饿 100、金币 0，只解锁并装备拳头。默认 fishing 模式，combat 使用当前已解锁武器。持鱼不能再次抛竿，取消或切模式不会丢鱼；放下后可以继续钓鱼。饥饿衰减和低饥饿伤害持续生效，本轮增加完整存档与安全恢复，不添加表外武器或未公开后续功能。

| ID / 名称 | 出现概率 | 稀有度提示 | 挣扎额外张力/秒 | 满 HP | 外形 |
| --- | --- | --- | --- | --- | --- |
| sprat / 银鳍鱼 | 55% | 普通 | 8 | 20 | 细长银色身体、短三角尾 |
| bass / 岩鲈鱼 | 28% | 常见 | 12 | 45 | 厚身、背鳍棘与侧纹 |
| tuna / 蓝背鱼 | 14% | 稀有 | 16 | 90 | 蓝背长身、分叉尾与小鳍 |
| golden / 金鳞鱼 | 3% | 极稀有 | 20 | 150 | 金色圆身、扇尾与长鳍 |

名称、出现概率与挣扎强度在收杆和捕获后显示。金鳞鱼沿用相同捕获流程；仅真实成功收杆转为 carried 时累计一次，第三次成功捕获触发唯一北岸章鱼，保留手中金鳞鱼。断线、脱钩、初始鱼及后续放置/击杀/食用/出售/逃生不增加计数。

蓄力由真实固定 tick 计时，水平抛竿距离 `3 + 15 × clamp(t,0,1)` 米。落点使用玩家脚部 X/Z、yaw 与距离计算，Y=0；pitch 用于观察，不改变距离公式。目标必须在真实海水内，并且从玩家眼部至落点的鱼线不穿过商店或 Y=1 岸坡；无法通过测试动作指定合法落点。

活动钓鱼期间锁定移动与跳跃。有效抛竿后等待 120 tick（2 秒），进入 60 tick（1 秒）咬钩窗口；浮漂下沉，并在真实用户交互解锁声音后播放本地合成提示。错过窗口清理会话。观察围绕抛竿 yaw 左右 20°、朝向浮漂 pitch 上下 10°；短距离抛竿后视角会调整到浮漂可见范围。

咬钩时按左键进入收杆，抽样鱼种，进度 0、张力 40。按住每秒进度 +20、张力 +30；松开进度不退、张力 -20。收杆第 120 tick 首次挣扎，此后每 120 tick 的前 30 tick 使用表中额外张力。张力限制在 0–100，连续满/零张力 30 tick 分别断线/脱钩；同一步先判失败，再判进度 100 成功。成功只生成一个对应鱼种的 carried 鱼和一次 landing 事件，然后回 idle。

鱼种使用独立 xorshift32 状态：每次进入 reeling 执行 `s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0`，`u=s/4294967296`。区间 `[0,.55)/[.55,.83)/[.83,.97)/[.97,1)` 依次映射四种鱼。失败或取消不回退抽样；装饰、渲染、移动、等待和错过咬钩不消耗序列。seed=0 规范化为 1，同 seed 和输入可复现。

取消、切换 combat、失败和 reset 清理会话；暂停/继续保留会话并释放输入。重复设置当前模式保持当前会话。持鱼可用 E 放到合法陆地，或通过确认重新开始/测试 reset 清除。重新开始恢复当前地图默认起点和初始数值，清空活跃鱼、终态和事件。

放鱼保持同一个实体 ID。落点是当前视线前方 2 米的水平投影（水平距离 `2*cos(pitch)`），检查 Y=1 沙地支撑；朝上或玩家腾空拒绝。海水、沿路径穿商店、商店占据、与玩家身体重叠也拒绝，持鱼保留。鱼水平碰撞半径为 0.2 米；落地后不会跟随玩家，活鱼不能拾取；击杀后可以拾取尸体。

| 鱼种 | 起跳间隔 | 每跳水平距离 |
| --- | --- | --- |
| sprat | 1.8 秒 | 0.9 米 |
| bass | 1.4 秒 | 1.2 米 |
| tuna | 1.2 秒 | 1.4 米 |
| golden | 0.9 秒 | 1.8 米 |

首次完整间隔后起跳，后续间隔按起跳至下次起跳计算，包含 0.4 秒腾空。每跳最高 0.4 米，起跳前 0.2 秒扭动并显示预兆圈；HUD 提示对应实体阶段。每跳重新选择最近海岸出口，正方形等距优先 +Z，圆形径向选择；碰商店停止水平位移，下一跳重新判断。普通岛屿岸边保留可通行路线，不添加迷宫寻路。

活鱼水平中心越出陆地立即 escaped，移除活跃实体并提示，只有一次 fish_escape；终态不再交互或奖励。持鱼及落地/跳跃鱼与模拟一起暂停冻结，继续不补算离线时间。

## 武器与死亡

combat 每次 primaryDown 用当前武器攻击一次；参数如下。挥空也消耗完整冷却，按住不会自动连击，primaryUp 不攻击；攻击与松开鼠标保留追击中的移动键。暂停冻结冷却、动作与鱼计时，继续后需重新输入。

| ID / 武器 | 价格 | 伤害 | 射程 | 冷却 | 水平击退 |
| --- | --- | --- | --- | --- | --- |
| fist / 拳头 | 初始 | 10 | 2 m | 27 tick / 0.45 s | 0.1 m |
| club / 木棍 | 30 | 25 | 2 m | 42 tick / 0.7 s | 0.5 m |
| spear / 鱼叉 | 120 | 40 | 3.2 m | 48 tick / 0.8 s | 0.25 m |
| hammer / 重锤 | 300 | 65 | 2 m | 66 tick / 1.1 s | 1.2 m |

购买需要已打开的真实商店；金币足额时扣费和解锁一次提交，金币不足、重复购买或非法输入不扣钱。购买只解锁，再按快捷键或背包装备。武器本局永久解锁，暂停、菜单、切模式和切武器均保留；reset/确认restart开始新局后仅拳头。单槽存档可恢复该局的解锁，确认重新开始仍回到仅拳头。极大金币无法精确扣费时拒绝，保持余额及解锁状态。

只有已解锁武器可equip。在running或背包/商店内可切换；普通暂停与dead/victory拒绝。equip不改变模式或钓鱼会话。发动攻击锁定该武器的冷却和attack.weaponId，切换不缩短冷却，当前动作和命中反馈仍显示发动时的武器。重锤发动后立即切拳头，也必须等满66步。

只选择 groundedAlive，要求水平面向 ±45°、双方碰撞体中心高度差 ≤1.5 米、玩家中心到鱼碰撞球体最近点不超过当前武器射程。玩家中心是脚部 Y+0.9；鱼球体半径 0.2，中心为鱼 position.y+0.2。眼部（脚部 Y+1.62）到鱼中心或上方/侧面可见采样点检查商店遮挡，中心被遮但表面可见仍可命中；多个合法目标选择最近一个。pitch 不改变水平面向筛选，攻击可命中正在跳跃的活鱼。所有武器共用此判定和同一个障碍扫掠击退路径。

真实命中发布 fish_damage。HP 归零后发布唯一 fish_death，原 ID 变为 groundedDead，立即落在沙地并停止跳跃，重复攻击不能再次伤害/死亡。输入攻击先提交，再由下一固定步处理鱼跳跃和逃生；存活鱼被击退到海水可以逃生，死亡鱼越岸则回到最近合法岸内（整个 0.2 米半径在陆地），尸体不会逃生。尸体保留可访问落点，本轮可以按 E 拾取。

画面显示拳头、木棍横挥、三叉鱼叉戳刺和重锤慢速重击，以及命中闪光、血量、伤害/射程、锁定冷却、击杀提示和灰色尸体。首次真实交互后才启用本地合成声音：拳头短促、木棍较高的木质声、鱼叉尖锐短声、重锤较低且更长；声音读取攻击事件锁定的weaponId，切换不串音。动作计时来自生产模拟，暂停冻结，不独立伤害。

## 章鱼 Boss 与通关

累计成功捕获三条金鳞鱼后，北岸近海出现唯一章鱼。身体球体半径 2 米、HP 600；身体无接触伤害，也不会被武器击退。四武器沿用上表，射程按身体球体最近点判定，面向和商店遮挡沿用共用生产目标筛选。多个合法鱼/Boss 中攻击最近一个。

- HP > 300：第一阶段。每 4 秒在玩家当时脚部位置生成半径 2 米的触手预警圈，位置锁定；预警 1.2 秒后生效 0.3 秒，范围内最多一次 15 HP 伤害。看到地面预警后移出圈即可躲避。
- HP ≤ 300：第二阶段，保留触手。进入时首次墨汁倒计时完整 3 秒，以后每 3 秒预警一次；预警 0.8 秒，开始时锁定朝向玩家身体中心的方向。发射后速度 6 米/秒、寿命 5 秒；碰到玩家造成一次 10 HP 伤害并销毁，商店也能阻挡墨汁。
- HUD 显示累计金鳞、Boss HP、阶段和攻击预警。橙色地面圈显示实际锁定范围，亮紫线显示墨汁锁定方向。暂停、菜单、失焦和隐藏冻结全部攻击与寿命，不补算。

Boss 命中在下一真实固定步提交伤害，攻击输入立即锁定武器、冷却和命中动作。该步统一处理双方伤害与终态：玩家 HP0 优先 dead；否则 Boss HP0 进入 defeated/victory，显示通关统计、释放鼠标并冻结模拟。不能继续攻击、移动或交易。统计只记录本局真实捕获/击杀/出售/金币收入，不追加奖励；合法测试初值可带历史稀有计数，因此统计分开显示“本次捕获 / 累计金鳞”。确认重新开始清空 Boss、稀有计数及本局统计，恢复仅拳头。

## 背包与生存

柜台合法范围外，无 carried 鱼时，E/interact 拾取最近合法 groundedDead。玩家脚部到尸体位置三维距离不超过 2 米，且眼部到尸体不穿商店；不要求朝向。柜台范围外持鱼时 E 仍优先放下活鱼。每条尸体一格、不堆叠，容量 10；满包拒绝且保留地上实体，活鱼/escaped/重复实体不能入包。拾取只转移原 ID：groundedDead 从 fish 移除并进入 inventoryDead，画面列表与 getState.inventory 同源。

| 鱼种 | 恢复饥饿 |
| --- | --- |
| sprat / 银鳍鱼 | 12 |
| bass / 岩鲈鱼 | 20 |
| tuna / 蓝背鱼 | 30 |
| golden / 金鳞鱼 | 40 |

Tab 背包按 ID 选择物品，展示名称和恢复值，食用只恢复饥饿、不恢复 HP。饥饿封顶 100，已满时拒绝并保留物品；同一 ID 只能消费一次，inventory 移除后进入 consumedFish。暂停菜单食用立即生效，模拟仍冻结。

饥饿每真实 tick 减少 1/120（每秒 0.5），范围 [0,100]；更新后严格低于 20 才每 tick 扣 1/30 HP（每秒 2）。等于 20 不扣血；20 单步降到 19.991666… 后开始扣血。有效 eat 先立即生效，下一步才衰减饥饿并判断伤害。内部从最近初值/恢复值按整数 tick 计算，避免累计舍入使精确阈值漂移。食用不重置已有生命损失。

HP0 进入 dead，所有计时/输入冻结并释放鼠标，显示生命耗尽和「重新开始」。不能继续、移动、攻击、食用、购买或装备。确认重开后 HP/饥饿100、金币0、空背包/鱼/消费记录、combat 拳头就绪，保留当前地图并恢复 reset 的初始鱼种随机状态；武器解锁也回到仅拳头。reset 可用合法初始值建立新测试局，HP0 初始局也立即 dead。

HUD 数值和比例随生产状态更新，饥饿<20显示明确伤害提示；背包内也显示当前生命/饥饿，避免背景遮罩影响读数。

## 商店出售

商店正面位于建筑的 -Z 侧。柜台落地锚点 `(-6,1,-1.55)` 与可见正面标识同源，可视目标 `(-6,2.4,-1.55)`；玩家脚部到锚点三维距离≤2米，眼部到目标的商店盒体射线无遮挡才可打开。墙角/背面无法隔墙交易，不要求玩家面向。正常地图与fixture使用同一建筑、柜台和判定。

合法柜台范围内 E/interact 优先打开商店，保留持鱼/地面实体；外部沿用放鱼/拾尸流程。界面按背包原 ID 选择尸体、展示售价、金币和生命/饥饿。打开暂停所有模拟、释放鼠标与按住输入，退出不补算时间。点击「关闭商店并继续」或Tab明确关闭，从running打开则回running/鼠标自由；原本暂停或期间失焦/隐藏后仍回pause，需要点击继续。inventory和shop不能直接切换，resume不能绕过菜单。

| 鱼种 | 出售金币 |
| --- | --- |
| sprat / 银鳍鱼 | 8 |
| bass / 岩鲈鱼 | 20 |
| tuna / 蓝背鱼 | 45 |
| golden / 金鳞鱼 | 120 |

sell只在已打开的商店接受inventoryDead。出售原 ID 从背包移除，进入terminalFish的sold记录并发布唯一sell；吃过不能卖、卖过不能吃。空/过期/活鱼/escaped/已消费选择与指定价格/余额注入拒绝，保留其他物品与金币；重复提交不复制奖励。金币必须有限非负整数，若金额溢出或不能精确增加固定售价，拒绝且不消耗物品。商店同时展示三种可购买武器的参数、价格、已解锁状态及交易反馈，金币与背包来自同一生产状态。

## 本地存档

按 Esc 打开暂停菜单，或在背包/商店内点击「保存进度」「读取存档」。一个本地 IndexedDB 存档槽，明确保存才覆盖。刷新后点击读取；游戏先暂停，点击「继续探索」才推进时间。重新开始与测试 reset 不删除或覆盖旧档，读档不会永久打开商店或背包。

只允许 fishing idle、攻击视觉动作已结束且没有待提交Boss命中时保存。持鱼、落地活鱼、尸体、背包、active Boss、正在跳跃的鱼、墨汁/触手和剩余冷却均可保存。蓄力/等待/咬钩/收杆明确拒绝，旧档保持不变。终态提交时结束攻击视觉动作，不额外推进tick；合法dead/victory记录可保存和读取，仍保持终态且不能继续领奖。

保存使用同一个逻辑tick的完整快照，包含鱼种RNG与新局初始RNG、玩家/速度/HP/饥饿、金币/武器、全部有效鱼/背包、已消费/已出售/逃生记录与ID预留、稀有计数、Boss及未结束攻击、冷却、生存基线、统计和生产分配计数。没有DOM/GPU引用、按住输入、菜单或活动钓鱼会话。鱼跳跃阶段与进度、Boss整数计时和生存计算基线整体恢复；离线不推进、不重抽鱼、不重计捕获或重新生成实体。

版本1格式为`{version:1,state:{...},runtime:{...}}`。state保存底层gamePhase和游戏数据；runtime保存垂直速度、RNG初值、实体分配/预留、事件序号、冷却整数步、生存基线/计数及Boss攻击整数步/ID分配。载入前严格验证全部字段、有限数值、合法状态、全局实体ID唯一、位置/HP/跳跃/计时和Boss关联，再一次提交。未知版本/截断/非法数据拒绝，现有有效游戏不部分改变。

IndexedDB数据库`island-fishing-survival`、版本1、对象仓库`saves`、槽键`current`；这是本地浏览器数据，不需要服务端或密钥。一个readwrite事务整体put，oncomplete才成功，request success不等于保存成功；事务失败/中止/存储不可用/超时明确提示并保留旧完整档。存储操作串行，读取期间冻结自动时钟和输入竞争，成功后清输入、释放鼠标、重置时钟；失败不替换当前局面。初始化/资源等待上限5秒，存储操作自身4.5秒超时并中止未完成写事务。

历史事件不重播，生产统计和消费去重记录保留。多次读取同一档恢复的是同一个局面，不叠加余额、Boss或尸体；同一加载局面内原ID只能消费/出售一次。导入备份只恢复当前游戏，不自动写槽，下一次明确保存才覆盖槽。

## 架构

- `src/game/game.ts`：唯一游戏状态、生产动作控制器及固定 1/60 秒模拟。
- `src/game/world.ts`：站立区域、商店定义与玩家圆柱碰撞。
- `src/game/fishing.ts`：真实距离、水面与鱼线遮挡判定、有限视角和持鱼位置。
- `src/game/reeling.ts`：生产模拟直接使用的固定 tick 张力/进度、挣扎和失败优先判定。
- `src/game/fish-species.ts`：唯一鱼种配置及独立 xorshift32 抽样。
- `src/game/fish-life.ts`：生产放置预览、障碍检查、海岸方向、跳跃和中心逃生。
- `src/game/combat.ts`：四武器共用鱼/Boss最近可见目标、鱼击退和尸体岸内恢复。
- `src/game/boss.ts`：唯一Boss参数、整数步攻击调度、锁定预警与墨汁扫掠碰撞。
- `src/game/weapons.ts`：唯一合法武器ID、名称、售价、攻击参数及动作时长。
- `src/game/survival.ts`：生存 tick 计数、唯一食物恢复表、真实尸体拾取范围与遮挡。
- `src/game/shop.ts`：唯一售价表、真实正面柜台距离/商店遮挡判定，UI与Game共用。
- `src/game/save-format.ts`：version1纯JSON格式、完整类型/数值/实体及计时关联校验。
- `src/game/save-store.ts`：真实IndexedDB单槽事务，事务完成才报告成功。
- `src/game/persistence.ts`：生产保存/读取/导入的串行调度、反馈和暂停恢复。
- `src/game/clock.ts`：自动帧与手动时钟独占，读档期间冻结及重置墙钟基线。
- `src/game/controller.ts`：键鼠、Pointer Lock、焦点/隐藏暂停。
- `src/render/scene.ts`：Three.js 场景，只读取模拟快照；重建场景释放旧几何、材质和纹理。
- `src/render/fishing-view.ts`：鱼竿、预览、唯一鱼线/浮漂及持鱼；持续复用对象，取消立即隐藏，销毁时释放资源。
- `src/render/fish-model.ts`：本地几何构建四种鱼轮廓，不抽样或创建奖励实体。
- `src/render/live-fish-view.ts`：按真实 ID 复用地面活鱼/尸体模型，预兆、受伤闪光与阴影读取模拟，reset/逃生释放对象。
- `src/render/fist-view.ts`：根据生产attack.weaponId与elapsed显示四武器动作，暂停不另走动画时间。
- `src/render/boss-view.ts`：读取真实身体/攻击状态，复用本地章鱼、触手圈与墨汁模型，reset/dispose释放攻击资源。
- `src/ui/`：开始/暂停/死亡/通关菜单、HUD、操作提示。
- `src/ui/fishing-audio.ts`：用户交互后启用 Web Audio，消费真实bite/punch/weapon_attack/fish_damage/boss_damage事件及锁定武器，不另建游戏计时。
- `src/testing/test-api.ts`：观测适配器，不另写模拟或绕过碰撞。

玩家 position 是脚部位置，Y 向上。yaw=0 朝 +Z，正 yaw 朝 +X；pitch 正值向上，范围 [-1.4,1.4]。摄像机在脚部上方 1.62 米；渲染层映射 Z 轴使 +X 对应 yaw=0 时的屏幕右侧，不改变模拟坐标。

步行 4 m/s、冲刺 6 m/s，斜向归一化；重力 18 m/s²、起跳速度 5 m/s。碰撞圆柱半径 0.3 米、高 1.8 米。正常岛屿半径 23 米，shore 为 X/Z [-10,10] 的正方形，表面 Y=1，海面 Y=0；海岸按整个玩家半径限制。

商店中心 (-6,1,0)，宽深各 3 米、高 3.8 米。实体占 X [-7.5,-4.5]、Z [-1.5,1.5]、Y [1,4.8]。使用圆柱与盒体碰撞、分轴滑动；跳跃也检查海岸与实体。棕榈、岩石和桶为本阶段的视觉装饰。

## 观测接口

仅 http://127.0.0.1:5173/?test=1 注册 `window.__islandTest`。普通页面不存在此属性。

```js
const api = window.__islandTest;
await api.waitUntilIdle();
await api.reset({ seed: 42, fixture: 'shore' });
await api.dispatch({ type: 'move', forward: 1, strafe: 0, sprint: false });
await api.advanceTicks(60);
console.log(await api.getState()); // position.z = 4
await api.dispatch({ type: 'move', forward: 0, strafe: 0, sprint: false });
await api.dispatch({ type: 'look', yaw: Math.PI / 2, pitch: 0.2 });
await api.dispatch({ type: 'jump' });
await api.dispatch({ type: 'pause' });
await api.dispatch({ type: 'resume' });
```

- `reset({seed,fixture,initial?})`：fixture 为 shore/fish-arena/boss-arena；seed 为 uint32，0 规范化为 1。initial 可设置 `player.position/yaw/pitch/hp/hunger`、非零 uint32 的 `fishRngState`、`fish`、`inventory`、非负整数 `coins`、`unlockedWeapons/currentWeapon`、`rareCaughtCount/boss`（下述严格校验）。武器数组必须为唯一合法ID，拳头始终保留（未提供会补入首项）；currentWeapon默认fist，指定值必须已经解锁，非法/重复/稀疏数组拒绝。hp/hunger 必须为有限 [0,100]；inventory 严格为 `{id,species}` 数组，最多10、四鱼种、ID非空且不与初始fish重复，不接受额外状态或数量注入。输入先整体校验，非法输入抛出异常且不改动当前状态或输入。玩家 position 必须为有限坐标，脚部 Y≥1，整个身体在岸内且不位于商店上方/内部；pitch 越界拒绝。成功后 running（HP0则dead，Boss初始defeated且玩家存活则victory）、tick=0、清空输入并重建场景；鱼种初始状态默认为规范化 seed。
- `getState()`：返回 JSON 深拷贝；包含 tick、phase、menu、玩家、金币、seed、fishRngState、fixture 与 lastAction。修改快照不影响游戏。
- `dispatch({type,...})`：新增save/load异步动作走真实IndexedDB，拒绝额外指定数据/成功字段；move 的 forward/strafe 各为 -1/0/1，sprint 为布尔值；look 为绝对角度、pitch 钳制；jump 为单次动作；pause/resume 清空输入。非法动作返回 `{accepted:false,reason}`，有效动作与正式键鼠共用 `Game.dispatch`。
- `advanceTicks(count)`：0–36000 的整数，否则抛异常。通过真实 step 推进；paused/dead/victory 时 tick/位置冻结。测试页面默认手动时钟，避免浏览器自动帧干扰；手动时钟与自动模拟不会双重推进，渲染帧照常更新。
- `waitUntilIdle()`：等待初始化/资源操作，5 秒明确超时；资源本地生成，同时等待当前存储队列，不推进模拟。

`getState().mode` 为 fishing/combat。`fishing.phase` 为 idle/charging/waiting/bite/reeling/landed；landed 是成功转换节点，同一步完成后回 idle。`chargeSeconds` 为实际蓄力，`preview` 包含计算落点/距离/valid/reason，`cast` 为唯一会话或 null（origin/position/distance/yaw/pitch/id）。

收杆观测包含 `progress/tension/species/biteRemaining/highTensionDuration/lowTensionDuration`；species 在收杆前为 null，收杆时为 sprat/bass/tuna/golden，所有 duration 和 remaining 单位为秒。另含 `holding/struggling/reelElapsed/result` 反馈。失败或成功结束后保留最后进度/张力用于显示原因，重新抛竿清空。`fish` 为 `{id,species,state,position,hp}` 数组，species 为同样四种 ID；`events` 最多保留最近 200 条 `{tick,type,entityId,sequence}`，landing 仅由真实成功产生，sequence 用于声音去重。全部随主状态深拷贝。

```js
await api.reset({
  seed: 42, fixture: 'shore',
  initial: { player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 } },
});
await api.dispatch({ type: 'setMode', mode: 'fishing' });
await api.dispatch({ type: 'primaryDown' });
await api.advanceTicks(30); // 0.5 秒
await api.dispatch({ type: 'primaryUp' });
console.log((await api.getState()).fishing); // waiting，distance=10.5，position.z=19.5
await api.dispatch({ type: 'cancelFishing' });
```

`setMode` 只接受 fishing/combat；`primaryDown/primaryUp/cancelFishing` 不接受额外落点或成功标记。陆地返回 land，遮挡返回 obstructed，菜单返回 paused；无效抛竿回 idle，cast=null，无鱼或奖励。

以下只使用真实抛竿和按住/松开控制，在张力 40/75 间调节，生成一条鱼；没有修改进度或直接指定成功：

```js
await api.reset({ seed: 1, fixture: 'shore', initial: {
  player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 },
} });
await api.dispatch({ type: 'primaryDown' });
await api.advanceTicks(30);
await api.dispatch({ type: 'primaryUp' });
await api.advanceTicks(120);
await api.dispatch({ type: 'primaryDown' });
for (let i = 0; i < 2000; i++) {
  const { fishing } = await api.getState();
  if (fishing.phase !== 'reeling') break;
  if (fishing.tension > 75) await api.dispatch({ type: 'primaryUp' });
  else if (fishing.tension < 40) await api.dispatch({ type: 'primaryDown' });
  await api.advanceTicks(6);
}
console.log((await api.getState()).fish); // 一个 sprat/carried
await api.dispatch({ type: 'restart', confirm: true });
```

restart 必须明确 `confirm:true`，否则拒绝；正式按钮使用确认对话框。reset 创建指定初始鱼/背包并清空事件/消费；restart 清空鱼、背包、消费和历史事件后只发布一次 restart，模式回 combat 拳头。自动分配的鱼 ID 在同一游戏实例中不复用。restart 恢复此次 reset 的初始随机状态：指定过 `initial.fishRngState` 就恢复该值，否则恢复规范化 seed。

fish-arena 与 shore 使用相同沙地、海水和商店。默认玩家 `(0,1,3.5)`、yaw=0、pitch=-0.6，一条 groundedAlive 银鳍鱼 `fixture-fish-1` 在 `(0,1,5)`，jumpTimer=0。initial.fish 覆盖默认数组，每项 `{id,species,state,position,jumpTimer,hp?}`，最多一条 carried、ID 唯一非空、state 接受 carried/groundedAlive/groundedDead，hp 缺省为鱼种满值，必须有限且不超过满值；carried/groundedAlive 要求 HP>0，groundedDead 要求显式 HP=0；jumpTimer 在 0–鱼种间隔之间。地上鱼必须 Y=1、中心在陆地且不碰商店；carried 输入位置校验有限后同步至生产持鱼位置。

`getState().fish` 增加秒数 `jumpTimer/jumpElapsed`、`jumpPhase`（idle/warning/jumping）、`jumpDirection/jumpBlocked`；jumpTimer 从起跳重置为 0，包含腾空。`terminalFish` 的 escaped 项保存 `{id,species,state:'escaped',position,escapedTick}`，活跃 fish 不保留 escaped。`interact` 不接受指定 ID/目标/成功字段，与 E 和按钮共用生产控制器；合法柜台范围内优先openShop，范围外没有持鱼时改为拾取尸体，范围内无合法尸体返回 no-corpse-in-range，满包返回 inventory-full。事件增加 fish_place/fish_escape，保留原有有界日志规则。

```js
await api.reset({ seed: 1, fixture: 'fish-arena' });
await api.advanceTicks(96); // 银鳍鱼起跳预兆
await api.advanceTicks(12); // 开始跳跃，jumpTimer=0
await api.advanceTicks(12); // 半程，y=1.4、z=5.45
await api.advanceTicks(12); // 落地，y=1、z=5.9
console.log((await api.getState()).fish);
```

`getState().attackCooldownRemaining` 为秒，`attack` 包含 sequence/elapsed/weaponId/targetKind/hitId/result；result 为 none/miss/hit/kill，elapsed 是暂停可冻结的发动武器动作时间。combat 的 primaryDown/primaryUp 不接受 targetId、damage 或 success，所有目标和伤害都由生产判定。事件为punch（拳头）/weapon_attack（购买武器）/fish_damage/fish_death，攻击/伤害事件含发动时weaponId，沿用有界日志和深拷贝。

```js
await api.reset({ seed: 1, fixture: 'fish-arena' });
await api.dispatch({ type: 'setMode', mode: 'combat' });
await api.dispatch({ type: 'primaryDown' }); // sprat HP20→10
await api.dispatch({ type: 'primaryUp' });
await api.advanceTicks(27);
await api.dispatch({ type: 'primaryDown' }); // 同 ID groundedDead，HP0
console.log((await api.getState()).fish);
```

生存观测：`gamePhase` 增加 dead，`ui.menu` 增加 inventory/dead；`inventory` 项为 `{id,species,state:'inventoryDead'}`，`consumedFish` 为 `{id,species,state:'consumed',consumedTick}`。`deathReason` 为 starvation/boss/null；Boss加入后终态还包括gamePhase/ui.menu的victory。所有列表为同源深拷贝。新动作 `openInventory/closeInventory/eat({fishId})`，事件 inventory/eat/player_damage/game_over/restart；player_damage/game_over/restart 的 entityId=player，沿用最近200条日志。冻结时 advanceTicks 不推进；eat 可在运行或暂停菜单立即生效，dead 拒绝。

```js
await api.reset({ seed: 1, fixture: 'shore', initial: {
  player: { hp: 80, hunger: 90 }, inventory: [{ id: 'food', species: 'sprat' }],
} });
await api.dispatch({ type: 'openInventory' });
await api.advanceTicks(300); // tick、HP、饥饿与所有计时冻结
await api.dispatch({ type: 'eat', fishId: 'food' }); // 饥饿100，HP80，一次消费
await api.dispatch({ type: 'closeInventory' });
await api.advanceTicks(60); // 饥饿99.5，HP80
```

交易观测：`ui.menu` 增加shop；`terminalFish` 增加 `{id,species,state:'sold',soldTick,price}`，原escaped项保持原字段；消费的尸体仍用consumedFish区分。`openShop/closeShop`只接受type，`sell({fishId})`不接受价格或余额。openShop始终验证实际柜台距离/遮挡，sell需要shop已打开；失败以lastAction返回shop-too-far/shop-obstructed/shop-not-open/not-in-inventory/invalid-sell/coin-limit等原因。事件sell的entityId是出售的原鱼ID。

```js
await api.reset({ seed: 1, fixture: 'shore', initial: {
  player: { position: { x: -6, y: 1, z: -2 } }, coins: 20,
  inventory: [{ id: 'trade-1', species: 'bass' }],
} });
await api.dispatch({ type: 'openShop' });
await api.dispatch({ type: 'sell', fishId: 'trade-1' }); // 20→40
await api.dispatch({ type: 'sell', fishId: 'trade-1' }); // 拒绝，仍40
await api.advanceTicks(600); // 全部模拟冻结
await api.dispatch({ type: 'closeShop' });
```

武器观测：getState包含`unlockedWeapons`和`currentWeapon`（合法ID为fist/club/spear/hammer），两者与HUD/模型/攻击同源。`buy({weaponId})`只在shop执行，拒绝不足金币、重复解锁与价格/余额字段注入；真实购买只发布一次buy，entityId为武器ID。`equip({weaponId})`只装备已解锁武器，不改变已锁定冷却；错误包括invalid-buy/invalid-equip/insufficient-coins/already-unlocked/weapon-locked/shop-not-open/paused/coin-limit。所有失败只更新lastAction。

```js
await api.reset({ seed: 1, fixture: 'shore', initial: {
  player: { position: { x: -6, y: 1, z: -2 } }, coins: 20,
  inventory: [{ id: 'trade-1', species: 'bass' }],
} });
await api.dispatch({ type: 'openShop' });
await api.dispatch({ type: 'sell', fishId: 'trade-1' }); // 40金币
await api.dispatch({ type: 'buy', weaponId: 'club' }); // 解锁木棍，10金币，仍装备拳头
await api.dispatch({ type: 'buy', weaponId: 'club' }); // 拒绝，仍10金币
await api.dispatch({ type: 'buy', weaponId: 'spear' }); // 不足，仍10金币
await api.dispatch({ type: 'equip', weaponId: 'club' });
await api.dispatch({ type: 'closeShop' });
```

Boss观测：`getState()`包含`rareCaughtCount`、`boss`和`stats`。boss字段为`state/hp/phase/position/radius/tentacleRemaining/inkRemaining/attacks`，phase为1或2，所有remaining为秒；attacks按真实ID显示warning/active触手或warning/flying墨汁，含锁定位置/方向、实际剩余寿命。events增加boss_spawn/boss_damage/victory；仅真实第三次金鳞捕获发布boss_spawn，reset初始化不冒充生成事件。

`boss-arena`与shore共用正方形沙地/海水/商店，默认玩家`(0,1,8.5)`、yaw0/pitch0、HP/饥饿100，稀有计数3，Boss active/600HP，身体中心`(0,1,12)`、半径2，首次触手剩4秒。普通岛身体中心`(0,1,25)`。

`reset.initial.rareCaughtCount`接受非负安全整数。`initial.boss`严格为`{state,hp,tentacleRemaining,inkRemaining}`：state为locked/active/defeated，有限计时在[0,4]/[0,3]；计数<3只能locked且HP0，计数≥3只能active且0<HP≤600或defeated且HP0。未给boss时按计数推导，全部初值校验成功后才提交。攻击列表/方向/伤害/阶段不接受注入。初始HP≤300直接phase2；真实跨入第二阶段时首次墨汁倒计时完整3秒。

```js
await api.reset({ seed: 1, fixture: 'boss-arena' });
await api.dispatch({ type: 'setMode', mode: 'combat' });
await api.dispatch({ type: 'primaryDown' }); // 锁定拳头与冷却
await api.advanceTicks(1); // 真实生产步提交HP600→590
console.log((await api.getState()).boss);
```

第三次触发验证使用shore、`rareCaughtCount:2`和`fishRngState:1584200935`（下一抽golden），实际抛竿、咬钩、调节张力直到carried；不能用初始化count3代替真实触发证明。核心和浏览器测试均执行这一真实收杆流程。

存档观测：`exportSave():Promise<object>`导出当前合法保存时点的同格式深拷贝，非法时点明确拒绝；`importSave(value):Promise<{ok:boolean,error?:string}>`与真实load共用全量校验和生产提交，非法数据返回错误且保留当前局面/旧槽。导入合法备份不隐式写入槽。`dispatch({type:'save'})`/`dispatch({type:'load'})`与实际按钮共用生产Controller/Persistence，成功/失败可从返回值、lastAction和界面反馈观察。reset不操作存档，修改getState或exportSave返回对象不会修改游戏/槽。load不使用测试返回值冒充IndexedDB数据。

```js
const backup = await api.exportSave(); // 仅合法idle/无攻击动画时点
await api.dispatch({ type: 'save' });  // 真实IndexedDB完整事务写入
await api.dispatch({ type: 'restart', confirm: true }); // 不覆盖档案
await api.dispatch({ type: 'load' });  // 实际读取槽，先paused
await api.dispatch({ type: 'resume' });
const result = await api.importSave(backup); // 同校验，恢复paused，不覆盖槽
console.log(result); // {ok:true}，非法数据为{ok:false,error:...}
```

## 验证

```sh
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

Playwright 自动启动/复用 5173 开发服务。已有 Chrome 时可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 环境变量指定可执行文件，默认使用 Playwright Chromium；无需全局依赖。

历轮记录见 [第 1 轮](docs/verification.md)、[第 2 轮](docs/verification-02.md)、[第 3 轮](docs/verification-03.md)、[第 4 轮](docs/verification-04.md)、[第 5 轮](docs/verification-05.md)、[第 6 轮](docs/verification-06.md)、[第 7 轮](docs/verification-07.md)、[第 8 轮](docs/verification-08.md)、[第 9 轮](docs/verification-09.md)、[第 10 轮](docs/verification-10.md)；[第 11 轮](docs/verification-11.md)；当前轮实际结果见 [docs/verification-12.md](docs/verification-12.md)。


## 第12轮设置与回放

开始、暂停、dead/victory 菜单均有「设置与键位」。设置打开冻结所有生产计时并清除按住输入；关闭返回暂停或原终态，必须点击继续才运行。设置中 Esc 取消按键捕获并保留暂停。滑块可用方向键/Home/End，Tab 切换控件，Enter/Space 激活绑定按钮后按新键；焦点有清晰轮廓。

音量范围 0–100%（有限数值，支持小数），0 将实际 Web Audio 总增益设为0；声音只在可信用户交互后创建。灵敏度范围0.25–3倍，默认1，鼠标每像素转向 `0.002 × sensitivity` 弧度。14项非鼠标动作可映射到字母、数字、方向、修饰键和界面列出的常用功能键码。Esc、非法码和重复绑定原子拒绝；默认 ShiftLeft 兼容 ShiftRight，武器默认 Digit1–4 兼容对应 Numpad1–4，别名也参与冲突检查。多个绑定可在一次公开更新中交换。

设置采用独立 localStorage 记录 `island-fishing-settings-v1`，格式 `{version:1, settings:{volume,sensitivity,bindings}}`；不进入 version1 游戏存档。先校验并写入成功后提交内存；写入失败保留全部旧值并显示原因。刷新、reset、载入和重新开始都保留设置。损坏/不可读记录使用默认值并显示错误，读取不会覆盖原记录。

仅 `?test=1` 公开以下新增入口，普通 URL 仍没有测试对象：

```js
const api = window.__islandTest;
await api.dispatch({type:'openSettings'});
await api.dispatch({type:'updateSettings',volume:0,sensitivity:1.5,bindings:{interact:'KeyF'}});
console.log((await api.getState()).settings);
await api.dispatch({type:'closeSettings'}); // paused，不能自动恢复
await api.dispatch({type:'resume'});

const snapshot = await api.runReplay({
  seed:42, fixture:'shore', totalTicks:120, renderHz:60,
  inputs:[
    {tick:0,action:{type:'move',forward:1,strafe:0,sprint:false}},
    {tick:60,action:{type:'move',forward:0,strafe:0,sprint:false}},
  ],
});
console.log(snapshot.player.position); // {x:0,y:1,z:4}
```

`runReplay` 先全量验证初始化与时间表，再从指定新会话重建当前生产场景。renderHz 仅30/60/120，totalTicks为0–36000整数；每项tick为 `[0,totalTicks)` 内整数，相同tick按提交顺序执行。tick表示回放时间表中的固定步槽位，pause仍占槽位而游戏simulationTick不增加，以便之后的resume能执行。每个槽位调用生产控制器和同一个 Game.step，不复制物理/钓鱼/伤害/RNG规则；指定频率只决定渲染时机。返回独立JSON快照，屏幕与生产状态一致，调用后自动模拟保持关闭。新会话分配从相同ID基线开始；普通reset/restart仍维持同实例ID不复用。

回放使用当前本地设置；涉及updateSettings/save/load的公开动作也进入同一生产路径，异步存储按顺序await。比对这些动作必须准备相同外部设置/存档初态。普通UI采用真实时钟；公开的 `?test=1&clock=real` 可进行真实键鼠计时试玩，默认测试页仍为手动时钟。任何advanceTicks调用都会切为独占手动计时；完整实际流程测试在一次seed/玩家位置准备后仅观察getState，全部游戏动作来自原生键鼠和可见按钮。

`tests/browser/playthrough.spec.ts` 记录真实时钟下的完整流程与截图/录像：公开seed45734依次自然抽中蓝背、银鳍、三条金鳞；不注入鱼、金币、武器、稀有计数或Boss伤害。先拳头击杀蓝背出售买木棍，银鳍食用，三条金鳞击杀出售买重锤，Boss真实触发后保存/刷新/读取，继续战斗并通关。这是代理键鼠运行的功能与视觉证据；真人主观手感评估另行记录，不能由自动测试代替。

1920×1080 的完整真实键鼠流程单独复现：`npm run test:e2e -- --config playwright-1920.config.ts`。默认全量回归保持54项；两视口实际执行结果及失败尝试见第12轮验证记录。
