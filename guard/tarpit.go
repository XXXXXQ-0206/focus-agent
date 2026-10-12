package guard

// 批 5 B3(设计文档 HONEYPOT-DETECTION-DESIGN.md 二-B「自身防护」第 5 条):tarpit 熔断。
// Nepenthes / Cloudflare AI Labyrinth 类反爬虫迷宫用无限假页面困死抓取方、烧光
// 任务预算。本文件按「每任务每 host」计数 WebFetch 抓取调用,超过预算触发一次
// 熔断:经 Hint 回调写 hint 节点进探索图(planner 每轮 graph overview 必读 hints,
// 参照停滞检测 hint 的既有通道),提示停派该方向;之后对该 host 的抓取仍 warn
// 放行——不硬 block,防误杀真实大站。
//
// 计数器在内存里(每任务一个 Guard,见 server taskFromPG),任务重启清零:重启后
// 重新爬一遍才会再触发,代价可接受,不落库。

import (
	"encoding/json"
	"log"
	"net/url"
	"strconv"

	"github.com/Autumn-27/norma/hook"
)

// defaultTarpitFetchBudget 是每 host 抓取调用的默认预算(settings 键
// tarpit_fetch_budget 可配,<=0 或非法值回落到它)。
const defaultTarpitFetchBudget = 40

// TarpitConfig 是 tarpit 熔断的装配:两个回调都由 server 注入(guard 不反向
// 依赖 db/server)。
type TarpitConfig struct {
	// Budget 返回当前预算(settings tarpit_fetch_budget)。nil 或返回 <=0 → 默认 40。
	Budget func() int
	// Hint 是熔断触发(每 host 只一次)时的回调,server 装配为写探索图 hint 节点。
	// nil = 只记 guard 审计/日志。
	Hint func(host string, count int)
}

// tarpitState 是每 Guard(=每任务)的 tarpit 计数状态;经 Guard.mu 串行化。
type tarpitState struct {
	cfg    TarpitConfig
	counts map[string]int
	fired  map[string]bool // 每 host 只熔断一次
}

// SetTarpit 装配 tarpit 熔断。零值/再传 nil 回调只是降级(不写 hint),不报错。
func (g *Guard) SetTarpit(cfg TarpitConfig) {
	g.mu.Lock()
	g.tarpit = &tarpitState{cfg: cfg, counts: map[string]int{}, fired: map[string]bool{}}
	g.mu.Unlock()
}

func (c TarpitConfig) budget() int {
	if c.Budget == nil {
		return defaultTarpitFetchBudget
	}
	if b := c.Budget(); b > 0 {
		return b
	}
	return defaultTarpitFetchBudget
}

// checkTarpit 统计 WebFetch 对同一 host 的抓取调用;超预算时熔断一次(写 hint),
// 之后对该 host 一律 warn 放行(只记审计,不 block)。非 WebFetch / 无法解析
// host 的调用直接放行。
func (g *Guard) checkTarpit(ev hook.Event) {
	if ev.ToolName != "WebFetch" {
		return
	}
	g.mu.Lock()
	st := g.tarpit
	g.mu.Unlock()
	if st == nil {
		return
	}
	var in struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(ev.Input, &in) != nil || in.URL == "" {
		return
	}
	u, err := url.Parse(in.URL)
	if err != nil || u.Hostname() == "" {
		return
	}
	host := u.Hostname()

	g.mu.Lock()
	st.counts[host]++
	count := st.counts[host]
	budget := st.cfg.budget()
	over := count > budget
	first := over && !st.fired[host]
	if first {
		st.fired[host] = true
	}
	g.mu.Unlock()

	if !over {
		return
	}
	if first {
		// 熔断:记审计 + 回调写 hint(host/次数),提示 planner 停派该方向。
		g.record(ev.ToolName, "allow", tarpitMessage(host, count, budget), "")
		log.Printf("[guard][tarpit] host %s 抓取调用 %d 次超过预算 %d,已熔断告警(warn 放行)", host, count, budget)
		if st.cfg.Hint != nil {
			st.cfg.Hint(host, count)
		}
		return
	}
	// 已熔断过的 host:warn 放行——不硬 block(防误杀真实大站),但每次留一条
	// 轻量审计,事后能还原「熔断后仍在抓」的行为。
	g.record(ev.ToolName, "allow", "tarpit 熔断后仍抓取 "+host, "")
}

// tarpitMessage 是熔断审计/hint 共用的文案:疑似 tarpit 迷宫(host,次数)。
func tarpitMessage(host string, count, budget int) string {
	return "疑似 tarpit 迷宫(" + host + ",抓取 " + strconv.Itoa(count) + " 次,预算 " + strconv.Itoa(budget) + ")"
}
