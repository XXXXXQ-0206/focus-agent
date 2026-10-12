# ARTEX-ymh

AI 自主渗透测试系统 · 二开版（Go 后端 + Next.js 前端 + PostgreSQL)

> 本项目是 [Autumn-27/ARTEX](https://github.com/Autumn-27/ARTEX) 的二次开发分支，基于上游 v0.3.10，持续吸收上游更新（已跟进至 v0.3.12 并选择性吸收 0.3.11/0.3.12 修复），遵循上游 **AGPL-3.0** 协议（见 `LICENSE`)。
> 二开方向：把上游「外网自动化探索平台」扩展为「**外网突破 → 立足点 → 内网纵深**」的全流程自主渗透平台，并补齐实战化安全与稳定性短板。

---

## 与上游的主要区别

| 子系统 | 内容 |
| --- | --- |
| **内网作战** | webshell 加密会话管理（PHP/JSP)、反弹 shell(penelope 受管）、立足点被动侦察（`session_recon`)、多层代理隧道（suo5/chisel 自动选型、任务级 MITM 热切换）、内网拓扑图（按任务过滤）、凭据库 |
| **阶段编排** | 待授权网段审批（侦察发现 scope 外网段 → 人工批准扩 scope)、外网→内网任务移交（handoff 模板建子任务）、内网 worker 提示词变体（有立足点自动切换） |
| **安全与反测绘** | 伪装门控（未过门控一律返回逐字节固定 nginx 欢迎页，随机入口路径）、一键放行（2/4/8h 时限审批豁免，deny 不豁免）、RoE 范围强制三态（off/warn/strict) |
| **蜜罐识别与反 AI 蜜罐防护** | 静态签名识别层（`honeydetect/`，内嵌签名库覆盖 Cowrie/OpenCanary/Kippo/Glastopf/HFish/Dionaea)、资产蜜罐评分与 UI 徽标、planner 处置纪律；针对"以 AI 攻击代理为猎物"的新型陷阱：worker 红线（永不自证）、出口敏感信息拦截、tarpit 抓取熔断、UA 池。设计见 `HONEYPOT-DETECTION-DESIGN.md` |
| **chains 场景化** | 九类反问思维链骨架按意图自动注入、按漏洞类别的反证判据（误报写 fact、真漏洞才落图）、类别化转向提示 |
| **武器库与部署链** | 17 项外部工具钉版清单（`packaging/tools-manifest.json`，启动自检 sha256)、`artex doctor` 部署预检、systemd unit |
| **稳定性** | 任务 deadline 冻结感知（宿主机睡眠不烧任务）、LLM 调用硬墙钟、会话探活与启动卫生 |

详细二开说明见 `README-FORK.md`；分布式演进评估见 `FUTURE.md`。

---

## 安装

> 依赖 **PostgreSQL**;探索需配置 **LLM**（兼容 OpenAI/Anthropic 协议，可在 UI 里配）。

### 方式一：一键安装脚本

```bash
git clone https://github.com/r0th-m/artex-ymh.git
cd artex-ymh
./install.sh
```

脚本会检测/自动安装 Docker，可选 **① 全部 Docker** 或 **② 本地编译运行**（生成 `config.json` 并编译内嵌单二进制）。装好后打开 `http://localhost:8787`。

### 方式二：从源码编译单二进制

> 前置要求：Go ≥ 1.26、Node ≥ 20（前端构建内存建议 ≥ 4G)。
> **老发行版注意**:Node ≥ 18 官方构建要求 glibc ≥ 2.28,Ubuntu 18.04(glibc 2.27）无法运行——需用 [unofficial-builds 的 glibc-217 构建](https://unofficial-builds.nodejs.org/download/release/)或换更新的系统。
> **国内网络**：克隆 GitHub、npm、Go 模块可能需要代理/镜像，参考：`git config --global http.proxy socks5h://127.0.0.1:7890`、`npm config set registry https://registry.npmmirror.com`、`go env -w GOPROXY=https://goproxy.cn,direct`。

```bash
git clone https://github.com/r0th-m/artex-ymh.git
cd artex-ymh
# 1) 前端静态导出
cd web && npm ci && npm run build:static && cd ..
# 2) 拷进内嵌目录(全新克隆下若报目录不存在,先 mkdir -p server/webui/dist)
cp -r web/out server/webui/dist
# 3) 编译(-tags embedui 才内嵌前端)
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
# 4) 配置数据库连接(必须,否则起不来)
cp config.example.json config.json   # 编辑填好 database 段
./start.sh
```

### 方式三：systemd 托管（Linux 服务器推荐）

```bash
sudo install -m644 packaging/artex.service /etc/systemd/system/artex.service
# 编辑 unit:User= / WorkingDirectory= / ExecStart= 改成你的部署账号与安装目录
sudo systemctl daemon-reload && sudo systemctl enable --now artex
journalctl -u artex -f
```

可选环境变量（如 `ARTEX_CALLBACK_ADDR` 回连地址）写在 `/etc/artex.env`。

### 方式四：Docker

仓库的 `docker-compose.yml` 已配置为**从源码构建二开版镜像**(`Dockerfile.source`：前端构建 → Go 编译 → 工具运行时，全部在 Docker 内完成，宿主无需 Go/Node):

```bash
git clone https://github.com/r0th-m/artex-ymh.git
cd artex-ymh
cp .env.example .env   # 填 POSTGRES_PASSWORD(不要用 # 字符)
docker compose up -d --build
```

⚠️ 不要把这个 compose 的镜像改成 `autumn27/artex`——那是**上游原版**，不含二开代码（2026-09 实测踩坑：照抄上游 compose 部署会得到原版）。
⚠️ 构建需要访问 apt/npm/Go 模块源，国内机器请先给 Docker 配代理（`~/.docker/config.json` 的 proxies 段）或镜像站。

---

## 首次使用（重要）

二开版默认开启**反测绘伪装门控**：非 loopback 监听时，直接访问 `http://<IP>:8787` 看到的是 nginx 欢迎页（正常现象）。

1. 启动日志会打印入口路径，形如 `[gate] 伪装门控已启用,入口路径: /g-xxxxxxxx`（也写入 `data/gate.path`);
2. 浏览器访问 `http://<IP>:8787/g-xxxxxxxx`，输入门控口令（默认同入口路径随机串）;
3. 首次进入 `/setup` 设置管理员密码。

## 外部工具（军火库）与部署自检

渗透能力依赖一批外部工具，统一放 **`data/tools/`**:

| 工具 | 用途 |
| --- | --- |
| suo5 / chisel / ligolo | 隧道与多层代理（目标无出网/能出网/TUN 组网） |
| gogo / naabu / httpx / katana / fscan | 端口扫描、HTTP 探测、爬虫、内网综合扫描 |
| impacket / nxc / mimikatz / pypykatz / laZagne | Windows 协议利用与凭据收割 |
| peass / penelope | 提权枚举 / 反弹 shell handler |

- **钉版清单**:`packaging/tools-manifest.json` 记录版本/平台/sha256/相对路径，启动自检（不匹配只警告，留空=未钉）。
- **部署预检**：装完/升级后跑 `./artex doctor`——检查 PG、LLM profile、data 可写、隧道工具、军火库、门控、回连地址，FAIL 退出码 1。
- 工具在「工具」页注册为自定义工具（`kind=shell`）后 agent 才能调用。

## 升级

- **重启即迁移**:schema 每次启动幂等重跑，升级只换程序不动数据（备份 `./data` 与数据库仍是好习惯）。
- ⚠️ **不要用页面「一键更新」**：它指向**上游** release 源，会把二开版覆盖成上游原版。升级二开版请用 `git pull` + 重新编译（方式二）。

## 配置

**数据库**(`config.json`，或环境变量 `ARTEX_PG_DSN` 覆盖）:

```json
{
  "database": {
    "host": "127.0.0.1", "port": 5432,
    "user": "artex", "password": "yourpass",
    "dbname": "artex", "sslmode": "disable"
  }
}
```

**LLM**：界面「LLM 配置」页填写（推荐）；或 `export ANTHROPIC_API_KEY=sk-...` / `OPENAI_API_KEY`。
**常用参数**:`./start.sh -addr :8787 -proxy :8788`(`-addr` 前端+API,`-proxy` 流量录制代理，默认只绑回环）。
**并发**：每任务 work agent 数在「系统设置」里配置（默认 3)。

---

## 系统技术架构

ARTEX 是一套 **LLM 多 agent 驱动的自主渗透系统**:Go 单体后端（内嵌 Next.js 前端）+ PostgreSQL,agent 能力由 [`norma`](https://github.com/Autumn-27/norma) SDK 提供。核心是**双图架构**:

- **资产图（全局共享）**：跨任务的资产真值库，节点为 root_domain/subdomain/ip/service/app/endpoint，归属公司；域名→子域→服务→端点的父子关系由程序计算，agent 只提交原始信息。
- **探索图（每任务独立）**：一次任务的"思考与推进"过程，节点为 goal/intent/fact/finding/hint，靠 spawns/derived_from/yields/proves 边连成血缘链；经锚点（`exploration_anchors`）与资产图相连，支撑资产测试覆盖度。
- **引擎是事件驱动闭环**：图一变就唤醒 planner → planner 读态势派意图 → worker 领一条意图、用真实工具执行、把新资产/事实/漏洞写回两图 → 再唤醒。worker 间有过程级信息交换（`search_all_worker_traces`);planner 持跨唤醒共享 todolist 稳定多步攻击链。

二开在此基础上增加：会话/隧道/移交的内网作战层、待授权网段审批链、蜜罐置信度数据线（识别+防护）、chains 场景化激活。详见各设计文档。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| `README-FORK.md` | 二开完整说明（与上游关系、新增能力清单、验证情况） |
| `FUTURE.md` | 分布式改造全面评估（server 大脑 + 远程 node 执行） |
| `HONEYPOT-DETECTION-DESIGN.md` | 蜜罐识别模块调研与设计（含反 AI 代理蜜罐） |
| `INTRANET-PIVOT-DESIGN.md` | 内网作战子系统设计 |
| `CHAINS-INTEGRATION-DESIGN.md` | chains 场景化激活设计 |
| `POSTMORTEM-RED-SUN-3.md` / `AB-REPORT-RED-SUN-3.md` | 红日靶场 3 实战复盘 |

## 许可与免责声明

### 开源协议

本项目采用 **GNU Affero General Public License v3.0（AGPL-3.0）** 授权，完整条款见仓库根目录的 [LICENSE](LICENSE) 文件。

这意味着任何人都可以自由使用、修改和分发本项目，但**衍生作品必须同样以 AGPL-3.0 开源**；特别地，**若你修改本项目并通过网络（如部署为在线服务）向用户提供，也必须向这些用户公开对应的完整源码**（给出本仓库链接即可满足）。

> ⚠️ **重要提示**：开源协议本身不限制软件的使用用途。以下的「使用限制」与「免责声明」是对使用者的额外约定与郑重声明，请务必遵守。

**本项目仅供个人学习、代码研究与本地技术验证使用，不得用于对任何线上系统或网站发起实际测试。**

### 允许使用范围

- 仅可用于**阅读、学习与研究本项目源码**，以及在**本地隔离环境**（自建靶场、授权明确的实验环境）中进行技术原理验证；
- 适用于个人学习、学术研究、代码审阅等非攻击性用途。

### 禁止事项

- **严禁使用本工具对任何网站、线上服务或联网系统发起扫描、探测、利用或攻击**（无论是否获得授权、是否为自有资产）;
- 严禁将本工具用于任何实际的渗透测试、攻防对抗或生产环境；
- 严禁将本工具用于非法入侵、数据窃取、勒索、拒绝服务或任何破坏性、犯罪性活动；
- 严禁利用本工具从事违反所在国家/地区法律法规的行为。

### 合规责任

使用者须自行遵守所在国家/地区关于网络安全、数据保护与计算机犯罪的全部法律法规（在中国大陆包括但不限于《网络安全法》《数据安全法》《个人信息保护法》及相关司法解释）。**因使用本工具产生的一切法律责任与后果，均由使用者自行承担。**

### 免责声明

本项目按"现状"提供，不附带任何明示或默示的担保（包括但不限于适销性、特定用途适用性与不侵权的担保）。在任何情况下，原作者与二开维护者均不对因使用或无法使用本项目而产生的任何直接、间接、附带、特殊、惩罚性或后果性损害（包括但不限于数据丢失、业务中断、系统受损、名誉损失或任何法律责任）承担责任，即使已被告知此类损害的可能性。

**下载、安装、运行或使用本项目，即视为你已阅读、理解并同意上述全部条款。**
