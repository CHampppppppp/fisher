# 换电脑接续：海岛钓鱼多轮题

这是评测工作检查点，不是新的正式题包或难度证明。用户授权推送到fisher仓库的独立handoff目录；游戏正常源码仍在仓库根部。

## 已完成的真实进度

- 指定模型qwen3.8-max-0902，百炼Anthropic兼容端点，Claude Code CLI bare工具壳（不是Claude模型），无fallback。
- R1：首次-1，外修1/2/3各-1，外修4为0。
- R2：首次-3，外修1为0。
- R3：首次0，无外修。最后源码commit b598befd093fe4b3cfc7b15d471ab04c1a9d1707。
- 已完成3/12轮、5次外部产品修复、累计实际扣分7。环境重试/评测工具修订不计产品fix。R4未发出。
- 用户要求在此暂停，当前模型已完成/无新调用，验收服务停止。state.json中的paused必须等用户在新电脑明确继续才恢复。
- 人工手感/物理声音/目标GUI/真实硬件帧率及完整12轮证明仍未完成。本次R3由主评测者检查，没有另独立agent聚合审查，不能改写成已做。

## 迁移内容及范围

分片归档包含新版v2题面/规则/参考证据/当前Qwen真实轨迹/API请求响应/首次及每次修复评分/源码tar/工具/规则、根目录原始采购文档与新难度标准、候选完整Git bundle和该Qwen会话JSONL。每个归档成员有SHA256，原始素材不改写。

不迁移旧版tasks/island-fishing-survival大体积历史、deliverables重复ZIP、GPT开发预跑目录、依赖/node_modules、系统缓存/登录配置/密钥。排除清单写入manifest。旧文件仍留原电脑；这是当前Qwen工作可接续备份，不是整个5GB工作区全备份。压缩分片为Git普通文件，无Git LFS依赖。

## 新电脑操作

1. 克隆或拉取本fisher仓库。使用Python3.12+，在本目录执行：

   python3 restore.py /absolute/new/path/island-evaluation-resume

   目标目录必须尚不存在；脚本先校验所有分片、总归档hash和全部成员hash，再安全解压，不修改已有路径，不运行模型或安装依赖。

2. 在解压目录中打开CONTINUE.md，把它作为新Codex任务的第一份恢复说明。assessment是出题/评测工作区；candidate-history.bundle是被测代码历史；continuation/session.jsonl仅该指定模型会话。不要把assessment/参考实现/未来题面放进被测模型可读取路径。
3. 如需恢复候选Git工作区：git clone /absolute/resume/candidate-history.bundle /absolute/new/qwen-workdir。核对HEAD等于b598befd093fe4b3cfc7b15d471ab04c1a9d1707。不要复制fisher参考游戏替代Qwen答案。
4. 在新机器独立配置现有百炼凭据；本包不带任何key/.env/登录配置。先适配机器路径、浏览器、Node24/npm11、CLI2.1.226及隔离，再验证同UUID会话能续接，之后才运行R4。不能只按旧硬编码绝对路径直接启动。

## 发给新电脑Codex的指令

打开解压后的CONTINUE.md，按真实state/progress恢复。保持暂停直到我说继续。不要重新跑R1，不重复派发R3。若我要求继续，先验证新的路径/凭据隔离/同一Qwen0902会话，再从冻结JSON的第4轮完整Prompt开始，按首次及最多5次修复分别保存真实轨迹、源码快照和独立评分。不要向被测模型泄露完整题面、参考实现或评分器。

具体SHA、排除项和分片尺寸见manifest.json；restore.py只负责校验/提取，跨机器CLI实际续接尚未在目标电脑验证，不能宣称已经恢复成功。

## 本机恢复核验

本批10个分片已实际重组并校验6781个成员，在新临时目录解包成功；候选Git bundle克隆及git fsck通过，26份源码与10份冻结材料hash一致。恢复后的题面结构校验通过（12轮/73项/36个规划参考视角）。详restoration-verification.json。以上不代表目标电脑的CLI/模型会话已经验证。
