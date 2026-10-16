# 项目规则

## 范围
- 项目：island-fishing-survival，第 12 阶段，设置、输入重绑定与体验收尾；保留前序未被本轮替换的能力。
- 当前增加独立设置持久化、键位重绑定与生产确定性回放，保留全部已公开玩法。不新增鱼种/武器/Boss机制，不读取未公开要求。
- 技术栈：TypeScript、Three.js、Vite、npm；目标运行时 Node.js 24、npm 11。
- 资源全部随项目本地提供；本阶段优先使用程序化几何与材质，不依赖远程素材、付费服务或密钥。

## 结构与命名
- `src/game/`：固定步长模拟、状态、生产控制器、碰撞和场景定义。
- `src/game/fishing.ts`：抛竿距离、真实海水/遮挡判定及有限观察角度；不接收测试指定落点。
- `src/game/reeling.ts`：每步张力/进度/挣扎与失败优先判定，供生产模拟直接调用。
- `src/game/fish-species.ts`：唯一四种鱼配置和 xorshift32 鱼种抽样；不与装饰随机行为共享状态。
- `src/game/fish-life.ts`：真实视角放置校验、最近海岸方向、障碍停止与固定 tick 活鱼跳跃；不修改钓鱼 RNG。
- `src/game/shop.ts`：唯一售价表、与可见正面柜台同源的交互点及距离/遮挡校验；不接收指定价格/余额。
- `src/game/weapons.ts`：唯一武器ID、名称、价格及伤害/射程/冷却/击退配置；交易、模拟、UI、模型和声音共用配置。
- `src/game/boss.ts`：章鱼唯一配置、身体球体、固定tick攻击调度、预警锁定、墨汁扫掠碰撞；不接受测试指定命中或攻击列表。
- `src/game/settings.ts`：唯一默认设置、音量/灵敏度范围、键码映射和原子校验；独立localStorage持久化，不写游戏档案。
- `src/game/replay.ts`：固定步生产回放调度；对应tick开始提交输入，按30/60/120Hz调度渲染，不复制玩法。
- `src/game/save-format.ts`：版本化纯JSON快照、类型/数值/实体关联验证；与导入和真实持久化共用，不保存DOM/GPU/按住输入。
- `src/game/save-store.ts`：单槽真实IndexedDB事务，完成事务才报告成功，失败保留旧档。
- `src/game/persistence.ts`：串行保存/读取/导入、可读反馈、加载后暂停及场景同步。
- `src/game/survival.ts`：饥饿/伤害固定 tick 计数、恢复量和最近尸体筛选；只更新生产玩家状态，不建立测试副本。
- `src/game/combat.ts`：共用四武器的最近合法活鱼筛选、视点遮挡、击退与尸体岸边恢复；不接受测试指定伤害或目标。
- `src/render/`：Three.js 场景与摄像机，读取游戏状态，不独立修改模拟状态。
- `src/render/fishing-view.ts`：持竿、落点预览、唯一鱼线与浮漂；仅根据生产状态显示/隐藏，复用对象并在场景销毁时释放资源。
- `src/render/fish-model.ts`：按鱼种构建本地几何持鱼模型；外形和颜色同时区分，不创建游戏实体或奖励。
- `src/render/live-fish-view.ts`：按实体 ID 复用落地鱼模型，读取 jumpPhase 显示预兆/跳跃；逃生后移除并释放资源。
- `src/render/fist-view.ts`：读取生产攻击武器及时间/命中反馈，显示本地几何四武器动作，不独立模拟攻击。
- `src/render/boss-view.ts`：读取生产Boss、触手预警/生效与墨汁位置，复用本地几何；无独立攻击时钟或伤害，reset/dispose释放对象。
- `src/ui/`：开始/暂停菜单、HUD、操作说明和样式。
- `src/ui/fishing-audio.ts`：仅在真实用户交互后初始化本地 Web Audio，消费生产bite/punch/weapon_attack/fish_damage/boss_damage事件及锁定的weaponId，不独立计时。
- `src/testing/`：仅在 URL 的 `test=1` 时注册的观测适配器，复用生产控制器和模拟。
- `tests/`：当前轮行为与接口的自动验证。
- `playwright-1920.config.ts`：复用默认浏览器配置，只对真实键鼠完整闭环使用1920×1080；默认全量回归仍使用playwright.config.ts。
- `public/`：确实需要的本地静态素材；无素材时不创建空目录。
- `docs/`：实现说明与验证记录。
- 源码使用英文名称；文件用 kebab-case，类型/类用 PascalCase，变量/函数用 camelCase。
- 不创建无用途的目录。临时产物放在项目外；`dist/` 与 `node_modules/` 不纳入版本管理。
- 删除任何文件或目录必须先取得用户授权；不要自行清理现有文件。

## 游戏约束
- 模拟步长固定为 1/60 秒，与渲染解耦；正式输入和测试 dispatch 必须进入同一生产控制器。
- position 是脚部坐标；Y 向上；yaw=0 朝 +Z，正 yaw 朝 +X；正 pitch 向上。
- 步行 4 m/s、冲刺 6 m/s，斜向归一化；重力 18 m/s²，起跳速度 5 m/s。
- 玩家碰撞体半径 0.3 m、高 1.8 m。禁止越过合法站立区与穿过商店实体。
- 初始 HP=100、饥饿=100、金币=0。饥饿每步 -1/120，严格低于20时 HP每步 -1/30；均钳制[0,100]。食用输入先立即生效，再由下一固定步更新饥饿、伤害；不恢复HP。
- Esc、失焦、隐藏均暂停并清除输入；明确点击继续恢复，不补算暂停时间。
- 测试快照为深拷贝；输入先整体校验，失败不部分修改游戏状态。
- 默认 fishing 模式；Q 和可点击按钮切换模式。combat 使用已解锁当前武器，初始拳头。
- 蓄力只由真实模拟 tick 累积，1 秒封顶，距离 `3 + 15 × clamp(t,0,1)` 米。落点由玩家位置、yaw、蓄力计算，水面 Y=0；使用生产陆地和商店几何判定遮挡。
- fishing.phase 扩展 idle/charging/waiting/bite/reeling/landed；活动钓鱼期间禁止移动和跳跃，只有一个会话/鱼线/浮漂。
- 抛竿后 120 步进入 bite，窗口 60 步；窗口内 primaryDown 开始收杆，并按住。primaryUp 松开；错过窗口失败清理，不生成鱼。
- 收杆从 progress=0、tension=40 开始；按住每秒 +20/+30，松开进度不退、张力 -20。收杆第 120 步开始首次挣扎，此后每 120 步的前 30 步额外张力按鱼种配置：sprat=8、bass=12、tuna=16、golden=20/秒。
- 四种鱼配置：sprat/银鳍鱼 55%、bass/岩鲈鱼 28%、tuna/蓝背鱼 14%、golden/金鳞鱼 3%。HUD 同时显示名称与概率/稀有度；形状及颜色同时区分。
- 鱼种随机状态独立，seed 为 uint32，0 规范化为 1。进入 reeling 才执行 xorshift32（左移13、无符号右移17、左移5、最终无符号化），u=state/4294967296；区间 [0,.55)/[.55,.83)/[.83,.97)/[.97,1) 映射四种鱼。失败/取消不回退；移动、装饰、等待、错过咬钩、暂停及无效动作不消耗。
- reset.initial 可设置非零 uint32 fishRngState；先整体校验再提交。getState 返回 fishRngState 深拷贝；确认 restart 恢复该轮 reset 的初始鱼种状态（未指定则使用规范化 seed）。
- 张力钳制 [0,100]；连续满/零张力 30 步失败。每步先失败判定、再成功判定。成功只生成一个唯一 ID、对应抽样鱼种的 carried 鱼，发布一次 landing；landed 是成功转换节点，完成同一步回 idle。第10轮golden成功转换增加稀有计数，首次到3触发唯一Boss并保留该carried鱼。
- 持鱼时不能抛竿，不能取消/切模式丢掉鱼；E/interact/可见按钮可以合法放下，或 confirm:true 的 restart/reset 重新开始。鱼世界位置与持鱼画面同源。
- 放置点为当前视线前方 2 米的水平投影，再检查 Y=1 沙地支撑；朝上/玩家腾空无合法放置，过近与玩家半径重叠拒绝。海水、商店占据或沿放置路径穿商店拒绝并保持 carried；不接受动作指定目标/成功。鱼水平碰撞半径 0.2 米。
- sprat/bass/tuna/golden 起跳间隔分别 1.8/1.4/1.2/0.9 秒，距离 0.9/1.2/1.4/1.8 米。首次完整间隔后起跳，此后间隔从起跳算起；起跳前 0.2 秒预兆，每跳 0.4 秒、最高 0.4 米。使用整数步计数，暂停冻结全部状态。
- 每跳重新计算最近海岸出口；正方形等距优先 +Z（随后 +X/-Z/-X），圆形沿最短径向出口，圆心朝 +Z。扫掠检测商店实体，阻塞后停止在合法位置，下一跳重新计算；不增加迷宫寻路。
- 活鱼水平中心超出陆地即 escaped，从活跃 fish 移除，terminalFish 留下去重终态；同一 ID 只发布一次 fish_escape，不可再次交互或奖励。
- fish-arena 使用 shore 的相同正方形沙地/海水/商店生产几何，默认玩家 (0,1,3.5)/yaw0/pitch-0.6，groundedAlive 银鳍鱼 fixture-fish-1 在 (0,1,5)。reset.initial.fish 可覆盖，严格校验唯一 ID、最多一条 carried、四种 species、合法位置和 [0,间隔] jumpTimer；先整体校验再提交。
- 鱼满 HP：sprat20/bass45/tuna90/golden150；initial.fish.hp 缺省满值，允许 groundedDead 且 HP0，其他状态必须 0<HP≤满值。尸体保持一个原 ID，不跳跃、不再次受伤/死亡/逃生。
- 拳头伤害10、射程2米、冷却27步（0.45秒）、水平击退0.1米；每次 primaryDown 尝试一次，不自动连击，挥空也冷却，暂停冻结冷却和动作。
- 只选择 groundedAlive：水平面向±45°，鱼/玩家碰撞体中心高度差≤1.5米，玩家中心到鱼球体最近点≤2米；鱼球体半径0.2米、中心为 position.y+0.2，玩家中心为脚部Y+0.9。从玩家眼部到鱼中心/表面可见部位检查商店遮挡，多个合法目标取最近一个。
- 攻击在输入提交时先处理，再由下一固定步处理鱼位移/逃生。伤害/死亡先于击退逃生；存活鱼被推入海可 escaped，死亡鱼立即落地并禁止逃生；死亡越岸时钳制到最近合法岸内并保留可拾取落点（本轮可拾取）。
- getState 暴露 attackCooldownRemaining 和 attack 动作/命中反馈；真实伤害发布 fish_damage，真实首次死亡发布 fish_death。不能直接指定目标ID/伤害，不攻击 carried/groundedDead/escaped/商店/未捕获海鱼。
- 活动会话观察限定为抛竿 yaw 左右 20°、朝向浮漂的 pitch 上下 10°，确保浮漂在视野内。
- 沿用第 3 轮对第 2 轮暂停即取消机制的替换：暂停/失焦/隐藏保留会话、冻结所有计时，清除按住输入；继续后需要重新按键/鼠标，不补算暂停时间。取消/切换 combat/失败清理会话，没有鱼或金币奖励。
- Tab/openInventory 打开冻结背包并释放鼠标，保留钓鱼会话。关闭清除输入；从 running 打开可关闭后回 running/鼠标自由，点击场景重新锁定；从 pause 打开或期间失焦/隐藏后关闭仍回 pause，必须点击继续。菜单只允许对应的打开/关闭/eat/sell/buy/equip/restart/pause动作，inventory/shop之间不能直接切换，不能移动/攻击/放鱼/拾取。
- events 保留最近至多 200 条，每条包含 tick/type/entityId；仅真实成功发布 landing。测试动作不能指定进度、张力、鱼或成功。

- 柜台合法范围外，E/interact优先保留原持鱼放置；无 carried 时拾取最近合法 groundedDead，脚部位置到尸体位置三维距离≤2米，检查商店遮挡，不要求面向。每条一格、容量10；满包保留地面尸体，不拾活鱼/escaped/重复ID。
- inventory 是生产实体列表，项含原 id/species/state:inventoryDead；groundedDead 从 fish 移除后进入 inventory。eat({fishId}) 只消费 inventoryDead，转入 consumedFish（state:consumed）一次记录；sprat/bass/tuna/golden 恢复12/20/30/40，满饥饿拒绝不消耗。
- reset.initial 允许 player.hp/hunger 有限[0,100]，inventory 为最多10项严格{id,species}，不与初始fish重复ID；整体校验后提交。reset/restart 清空消费记录；所有实体ID加入生产保留集合，避免后续真实捕获冲突。
- HP0立即进入dead、ui.menu=dead，清除输入/冻结全部模拟并发布唯一game_over；拒绝所有继续操作，只有确认restart、合法读取/导入或测试reset能恢复局面。restart恢复HP/饥饿100、金币0、空背包/鱼/消费和历史事件后发布一次restart、模式combat（拳头），鱼种RNG仍恢复本轮reset初始值。
- HUD显示实时生命/饥饿数值及比例，饥饿<20明确告警；背包按ID选择物品并显示鱼名与恢复量，按钮/快照与同一inventory数据同源。

- 商店柜台在生产建筑正面（-Z侧）：交互落地锚点(-6,1,-1.55)、可视目标(-6,2.4,-1.55)，与正面标识同源。玩家脚部到锚点三维距离≤2米，眼部至目标的真实商店盒体射线无遮挡才可打开；墙角/背面不能隔墙交易。
- 合法柜台范围内E/interact优先openShop，保留carried/地面鱼；范围外沿用原放鱼/尸体拾取。openShop接口始终校验距离和遮挡，不接受位置或成功注入；失效不部分修改状态。
- shop与inventory使用相同暂停/清输入生命周期。关闭商店按钮明确继续；从running打开可关闭后回running/鼠标自由，从pause打开或期间失焦/隐藏后关闭仍回pause，必须点击继续。Tab在shop中关闭shop；resume不能绕过菜单。
- sell({fishId})只在合法已打开的shop中出售inventoryDead，sprat/bass/tuna/golden售价8/20/45/120；原id转terminalFish的sold记录（soldTick/price）。吃过不能卖、卖过不能吃，失败保留其他物品和金币。
- reset.initial.coins接受有限非负整数，先全量校验再提交；余额始终非负整数，出售如溢出或无法精确增加固定售价则拒绝且不消耗物品。restart金币归0。
- 售价、金币、列表与交易/失败反馈读取生产状态；events保留唯一sell，增加唯一buy。

## 第9轮武器规则
- fist初始解锁：伤害10/射程2米/冷却27步/击退0.1米；club价格30：25/2/42步/0.5米；spear价格120：40/3.2/48步/0.25米；hammer价格300：65/2/66步/1.2米。仅对鱼击退。
- unlockedWeapons/currentWeapon为生产状态。拳头始终解锁；reset.initial严格校验合法唯一ID与当前武器已解锁，先全量校验再提交；reset/restart默认仅拳头，本局解锁不因菜单、切模式、暂停或切武器丢失。不跨新局存档。
- buy({weaponId})必须经已打开的生产商店，足额扣费和解锁一次原子提交，不自动装备；不足、重复、非法或无法精确扣费均保留余额/解锁。禁止注入价格/成功/余额。
- equip({weaponId})仅装备已解锁武器，在running或背包/shop中可操作，普通暂停/dead拒绝；不切换钓鱼模式、不取消会话、不清除攻击冷却。UI提供快捷栏1–4和背包装备按钮，所有操作进入同一Controller。
- 攻击开始即记录attack.weaponId（动作时长由该武器配置读取），锁定配置冷却。切武器不改冷却、既有攻击参数或动作；挥空同样冷却，长按不连击。攻击目标、死亡/逃生优先级和障碍扫掠沿用combat.ts，不复制测试伤害路径。
- 四种本地几何模型、挥击/戳刺/重击动作与合成声音可辨识；HUD显示当前武器、伤害、射程和锁定剩余冷却，命中反馈读发动攻击的武器而非刚切换的武器。
- 本轮新增行为测试及正常UI捕获→放鱼→击杀→拾取→出售→购买→装备→击杀闭环；全部前序回归保留，仅更新被新需求明确替换的“无购买”描述。

## 第10轮Boss规则
- rareCaughtCount初始0，仅真实golden成功reeling→carried时+1。失败、初始鱼、放下/击杀/拾取/食用/出售/逃生不加；首次到3将locked→active并发布boss_spawn一次，后来捕获继续计数不重复生成。
- Boss球体半径2米、HP600、无接触伤害/击退；平方夹具身体中心(0,1,12)，普通岛中心(0,1,25)，均北岸近海。身体球体最近点用于武器射程，与鱼共用生产可见目标判定，多个鱼/Boss取最近合法目标。
- HP>300为phase1，HP≤300为phase2。触手每240步锁定玩家当时脚部X/Z，72步预警，18步生效；半径2米范围内仅一次15伤害，预警不跟随，判定玩家脚部水平距离。phase2保留触手，进入时墨汁首倒计时180步。
- 墨汁每180步预警48步，预警开始锁定由Boss到玩家身体中心的方向；预警结束发射，6米/秒、300步寿命、半径0.18米，与生产玩家圆柱做扫掠碰撞；一次10伤害后销毁，商店阻挡后销毁。不接受测试指定方向/伤害。
- 全部攻击、寿命、计数和生存使用真实1/60步，pause/菜单/失焦/隐藏完全冻结。生成当步不扣新Boss首次倒计时；新警告当步不偷走一帧预警。
- Boss命中在下一真实固定步提交（发动时锁冷却与武器，UI立即显示命中动作）；该步依次提交Boss伤害、移动/攻击与生存伤害，末尾统一解析终态，确保双方归零优先玩家dead。HP变化与boss_damage/victory事件同一步提交；不由dispatch补算游戏时间。
- victory/dead冻结所有模拟和输入，释放鼠标；除确认restart/reset及第11轮存档操作外拒绝继续和游戏动作。victory显示通关、计时/捕获/稀有/击杀/出售/金币统计，不增加奖励。重开Boss locked、rareCaughtCount0、仅拳头。
- reset接受boss-arena：同shore几何，玩家(0,1,8.5)/yaw0，HP/饥饿100，count3，Boss active/600HP，触手剩4秒。initial稀有计数为非负安全整数；boss严格四字段state/hp/tentacleRemaining/inkRemaining，有限计时范围[0,4]/[0,3]；count<3仅locked(HP0)，≥3仅active(0<HP≤600)或defeated(HP0)，先全部校验再提交。未提供boss则按计数推导，reset不发布boss_spawn作为真实触发证据。
- getState暴露rareCaughtCount与boss.state/hp/phase(1|2)/position/radius/tentacleRemaining/inkRemaining/attacks；events增加boss_spawn/boss_damage/victory，统计只记录真实生产事件。第三次触发必须用count2和下一抽golden的合法RNG状态完成真实收杆证明。

## 第11轮存档规则
- 单槽真实IndexedDB；save/load正常动作与保存/读取按钮共用生产持久化。exportSave/importSave同格式、同校验、同提交逻辑。reset/restart不删除或覆盖档案。
- 仅fishing idle且发动武器动画已结束、无待提交Boss命中时允许保存/导出；支持carried/grounded鱼、尸体、背包、冷却、active Boss及其未结束攻击。提交dead/victory时结束攻击视觉动作（不额外推进tick），可保存合法终态并明确显示，恢复终态不可继续奖励。
- 存档version1只含纯JSON值；保存同一tick状态及生产内部计数，含玩家/物品/消费和出售去重/鱼种RNG/初始RNG/实体分配/武器/稀有/Boss/鱼跳跃/冷却/生存基线/垂直速度/统计。菜单只保存底层gamePhase，不持久化shop/inventory/DOM/UI输入。
- 先完整校验版本、严格字段类型、有限数值、ID全局唯一及鱼/Boss/生命/终态关联；所有生产状态与计数一并构造成功后提交。非法导入/读档不部分修改有效游戏或旧档。
- importSave将合法档案恢复到当前游戏，不隐式写入槽；下一次明确save才覆盖旧槽。load读取真实IndexedDB并用相同验证/恢复。导出/返回快照均深拷贝，修改不能改游戏或槽。
- 写入采用一个readwrite事务整体put；oncomplete才成功，abort/error/存储不可用/超时明确失败，旧完整档仍保留。存储反馈为独立UI状态，不作为游戏奖励事件。
- 正常读取恢复为paused/pause、清除输入/释放鼠标/重置时钟，明确继续才运行；dead/victory保留终态菜单。不补算离线时间，不重抽RNG，不发布历史捕获/消费/Boss/胜利奖励或声音。保存的商店/背包不会再次打开。
- 存储操作串行，加载期间阻止输入/推进竞争，失败恢复原有效局面；waitUntilIdle等待初始化和当前存储操作，5秒明确超时，不推进游戏时钟。存储超时应abort未完成写事务。
- 新增真实IndexedDB浏览器验证，包括同tick完整快照、刷新读取、飞行/跳跃/警告/冷却、实际第三次金鳞、消费去重、错误导入、阻断写事务保旧档、新局不覆盖、正常保存/加载反馈；全量前序回归保留。

- 暂停菜单提供明确确认的新局按钮，使用既有restart生产动作；不覆盖存档，不创建新监听器。

## 第12轮设置与收尾规则
- 设置独立于游戏存档：volume为有限[0,100]百分比（含小数），0完全静音；sensitivity为有限[0.25,3]倍率，默认1，对真实鼠标增量使用0.002×倍率弧度/像素。UI明确范围，使用原生range和可见焦点。
- bindings映射forward/backward/left/right/sprint/jump/interact/inventory/toggleMode/cancelFishing/weapon1/weapon2/weapon3/weapon4到KeyboardEvent.code；默认W/S/A/D、ShiftLeft、Space、E、Tab、Q、R、Digit1–4。Esc永远暂停不可重绑；重复、保留键、未知动作/键码、非法类型原子拒绝并保留旧设置。部分更新合并后完整校验；冲刺右Shift和小键盘1–4只作为对应默认绑定的兼容别名，不绕过重绑定/冲突。
- openSettings冻结全部模拟、清输入、释放鼠标；closeSettings保持pause，明确继续才能运行。dead/victory可检查设置，关闭回原终态，不能绕过终态。其他菜单关闭后再开设置，不叠加菜单。失焦/隐藏不绕过恢复。
- updateSettings只在settings菜单提交；先校验并持久化，再更新生产设置；失败保留旧值并显示原因。localStorage独立键/version1，刷新初始化验证，坏值/不可用明确反馈；reset/restart/load/importSave保留设置，存档schema不包含settings。
- 设置按钮、范围和键位控件可键盘操作；提示/快捷栏/柜台/背包/暂停帮助从真实bindings生成。键位捕获期间不触发玩法，Tab在设置页正常导航，Esc保留暂停并取消键位捕获。
- 音量通过主gain作用于所有真实合成声音，0输出静音；首次可信用户交互才创建音频，设置不单独创建音频或计时器。菜单声音暂停仍沿用前序逻辑。
- runReplay先整体验证seed/fixture/initial/inputs/totalTicks/renderHz，使用生产Game/Controller dispatch与step，从tick0开始，inputs tick为0≤tick<totalTicks的整数，按对应tick开始提交，同tick保持输入顺序；totalTicks最多36000，renderHz仅30/60/120。公开动作仍进入生产控制器；异步save/load也按输入顺序等待真实操作。涉及外部存储时比较需相同存储初态。每次回放开启新模拟会话的分配基线，普通reset/restart仍保留原ID不复用规则。渲染不会消耗RNG或推进模拟。
- 回放使用当前生产实例、手动时钟；普通UI另用真实自动时钟检查。测试URL可用clock=real建立真实时钟键鼠试玩，默认仍手动；advanceTicks一经调用就切手动，不双重计时。runReplay的终态返回深拷贝，与单步/批量严格比较。
- 不在restart/reset重新创建Controller、监听器、时钟或音频；验证20次重开后单输入/单动作和监听数量无增长。保留全量前序验证，不设未经标定的FPS阈值。
- 完整闭环证据区分fixture/RNG准备、真实键鼠/生产计时与模拟回放。检查真实张力/鱼跳跃/命中/Boss预警帧，记录观察和缺陷；代理键鼠及截图不冒称真人主观手感或未运行平台验证。

## 验证与交付
- dev 必须绑定 `127.0.0.1:5173`，启用严格端口，端口占用时报错。
- 提供并维护 npm 锁文件、dev/build 脚本。
- 实现后执行 `npm run build` 与 `npm test`，并验证普通 URL 和 `?test=1` 的浏览器行为。
- 在 1280×720 和 1920×1080 检查开始菜单与 HUD。
- 交付记录实际执行命令及结果，未验证内容明确标注。

## 用户边界
- 大改动先提交方案，用户确认后实施。
- 删除文件/目录/git 历史，修改 .env/密钥/token/CI/CD，数据库 schema/迁移，git push/rebase/reset --hard/强推，安装全局依赖/修改系统配置，公开发布：均必须先询问用户。
