"""冷启动回填（构建框架 §8 扩展）：深挖各源历史分页 → LLM 加工 → 追加合并进归档层。

安全约束：
- 只追加、不覆盖：不写 content/daily/，不动 content/index.json；
- 案例/评论/时政均复用 build_content 的「读旧 → 合并去重 → 写回」逻辑；
- 文章指纹追加进 seen.json，避免日报管线重复加工。

用法：
  python backfill.py --dry-run              # 只翻列表页，打印候选量与日期分布
  python backfill.py --max-per-source 4     # 小步验证（每源最多 N 篇，走完整流程）
  python backfill.py                        # 全量回填
环境变量（仅命令行）：OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL，缺省走降级。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from urllib.parse import urljoin

import httpx

import build_content
import common
import fetch
import process

# ---------- 回填源（分页深挖；linkPattern 与 sources.yaml 同法） ----------
def _idx_pages(base: str, n: int) -> list[str]:
    """人民网列表分页：index.html, index2.html, ..., indexN.html。"""
    return [base] + [base.replace("index.html", f"index{i}.html") for i in range(2, n + 1)]


BACKFILL_SOURCES = [
    # 时政 · 中国政府网要闻列表 JSON（单页约 400 条，近 1 个月；带 DOCRELPUBTIME）
    {
        "name": "中国政府网要闻",
        "category": "时政",
        "kind": "gov-json",
        "pages": ["https://www.gov.cn/yaowen/liebiao/YAOWENLIEBIAO.json"],
    },
    # 时政 · 人民网时政频道（每页约 2 周，index7 左右到 2026-05 初）
    # 文章为根相对链接 /n1/2026/MMDD/c1024-NNN.html（c1024 即本频道，滤掉侧边栏他频道稿）
    {
        "name": "人民网时政",
        "category": "时政",
        "kind": "html",
        "pages": _idx_pages("http://politics.people.com.cn/GB/1024/index.html", 7),
        "linkPattern": r"/n1/\d{4}/\d{4}/c1024-\d+\.html",
    },
    # 时评 · 人民网观点三栏目：最新快评 / 人民锐评 / 壹时评
    {
        "name": "人民网快评",
        "category": "时评",
        "kind": "html",
        "pages": _idx_pages("http://opinion.people.com.cn/GB/159301/index.html", 12),
        "linkPattern": r"/n1/\d{4}/\d{4}/c\d+-\d+\.html",
    },
    {
        "name": "人民锐评",
        "category": "时评",
        "kind": "html",
        "pages": _idx_pages("http://opinion.people.com.cn/GB/436867/index.html", 8),
        "linkPattern": r"/n1/\d{4}/\d{4}/c\d+-\d+\.html",
    },
    {
        "name": "人民壹时评",
        "category": "时评",
        "kind": "html",
        "pages": _idx_pages("http://opinion.people.com.cn/GB/223228/index.html", 4),
        "linkPattern": r"/n1/\d{4}/\d{4}/c\d+-\d+\.html",
    },
    # 通稿 · 中新网滚动新闻 HTML 分页（约 10+ 页，仅覆盖近几日）
    {
        "name": "中新网滚动新闻",
        "category": "通稿",
        "kind": "html",
        "pages": [f"https://www.chinanews.com.cn/scroll-news/news{i}.html" for i in range(1, 13)],
        "linkPattern": r"(?://www\.chinanews\.com\.cn)?/[a-z]+/\d{4}/\d{2}-\d{2}/\d+\.shtml",
    },
    # 人物 · 求是网英模人物（单页约 36 篇，跨度一年余）
    {
        "name": "求是网英模人物",
        "category": "人物",
        "kind": "html",
        "pages": ["https://www.qstheory.cn/v9zhuanqu/zhuanqu/ymrw/index.htm"],
        "linkPattern": r"https://www\.qstheory\.cn/\d{8}/[0-9a-f]+/c\.html",
    },
    # 国际 · 新华网国际频道 + 即时新闻（不进归档目标，少量补充案例）
    {
        "name": "新华网国际",
        "category": "国际",
        "kind": "html",
        "pages": ["https://www.news.cn/world/", "https://www.news.cn/world/jsxw/index.html"],
        "linkPattern": r"https://www\.news\.cn/world/\d{8}/[0-9a-f]+/c\.html",
    },
]

# 各 (类别, 月份) 的加工配额：控制 LLM 调用量并保证月份覆盖
MONTH_QUOTA = {
    "时政": {"2026-05": 12, "2026-06": 12, "2026-07": 20, "2026-08": 4},
    "时评": {"2026-05": 12, "2026-06": 12, "2026-07": 16, "2026-08": 4},
}
TOTAL_QUOTA = {"通稿": 24, "人物": 14, "国际": 8}
# 人物专栏更新慢，窗口放宽到 2026-01
SINCE_OVERRIDE = {"人物": "2026-01-01"}


def warn(msg: str) -> None:
    print(f"[backfill][WARN] {msg}", file=sys.stderr)


# ---------- 日期提取 ----------
_DATE_RES = [
    re.compile(r"n1/(\d{4})/(\d{2})(\d{2})/c\d+"),          # 人民网 n1/2026/0723/cXXX-N.html
    re.compile(r"/(\d{4})(\d{2})(\d{2})/[0-9a-f]{16,}/c\.html"),  # news.cn / qstheory
    re.compile(r"/(\d{4})/(\d{2})-(\d{2})/\d+\.shtml"),     # 中新网 /2026/07-31/NNN.shtml
    re.compile(r"liebiao/(\d{4})(\d{2})/content_"),         # gov.cn（仅到月，日取 01）
]


def date_from_url(link: str) -> str | None:
    """从文章 URL 提取发布日期（YYYY-MM-DD）；识别不了返回 None。"""
    for rx in _DATE_RES:
        m = rx.search(link)
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3) if m.lastindex >= 3 else "01"
            return f"{y}-{mo}-{d}"
    return None


def _case_domain(item: dict) -> str:
    """按类别从加工结果取领域标签（统一过固定清单兜底）。"""
    r = item.get("result") or {}
    if item["category"] == "时政":
        ds = r.get("domains") or []
        return common.normalize_domain(ds[0] if ds else None)
    return common.normalize_domain(r.get("domain"))


def case_entry(item: dict) -> dict:
    """把加工产物组装成归档案例（build_case_archive 的 cases 元素结构）。

    text 选取：时评优先用三件套里的「文中事例」（更适合申论论证），其余用 200 字摘要。
    """
    r = item.get("result") or {}
    text = item.get("summary", "")
    if item["category"] == "时评":
        sl = r.get("shenlun") or {}
        text = sl.get("case") or text
    themes = r.get("themes") or r.get("domains") or []
    return {
        "title": item.get("title", ""),
        "summary": text,
        "themes": themes,
        "usage": r.get("usage", ""),
        "domain": _case_domain(item),
        "source": item.get("source", ""),
        "url": item.get("link", ""),
    }


# ---------- 列表页候选收集 ----------
def collect_candidates(source: dict, client: httpx.Client, since: str) -> list[dict]:
    """翻分页收集候选：[{link,title,date}]，去重保序，按日期窗口过滤。"""
    out: list[dict] = []
    seen_links: set[str] = set()
    for page in source["pages"]:
        try:
            resp = fetch._get(client, page)
            resp.raise_for_status()
        except Exception as e:  # noqa: BLE001  404/403/超时 → 该源分页到此为止
            warn(f"分页停止({source['name']} {page[-30:]}): {e}")
            break
        entries: list[tuple[str, str, str]] = []  # (link, title, date)
        if source["kind"] == "gov-json":
            try:
                data = json.loads(resp.text)
            except Exception:  # noqa: BLE001
                data = []
            for x in data:
                link = str(x.get("URL") or "")
                if "/yaowen/" not in link or not link.endswith(".htm"):
                    continue  # 排除 tv.cctv 视频与图表页
                entries.append((link, str(x.get("TITLE") or "").strip(),
                                str(x.get("DOCRELPUBTIME") or "")[:10]))
        else:
            for link, title in fetch._list_entries(source, resp.text, page):
                entries.append((link, title, date_from_url(link) or ""))
        for link, title, dt in entries:
            if not link or link in seen_links:
                continue
            seen_links.add(link)
            if dt and dt < since:
                continue
            out.append({"link": link, "title": title, "date": dt})
        time.sleep(1.0)  # 列表页之间也要礼貌
    return out


def pick_with_quota(candidates: list[dict], category: str, scale: int = 1) -> list[dict]:
    """按 (类别,月份) 配额挑选：候选按列表顺序（新→旧）遍历，月满即跳过。
    scale>1 时配额放宽（用作 seen 去重损耗的候补池）。"""
    picked: list[dict] = []
    month_count: dict[str, int] = defaultdict(int)
    total = 0
    for c in candidates:
        month = (c["date"] or "")[:7]
        if category in MONTH_QUOTA:
            cap = MONTH_QUOTA[category].get(month, 0) * scale
            if month_count[month] >= cap:
                continue
            month_count[month] += 1
        else:
            if total >= TOTAL_QUOTA.get(category, 10) * scale:
                break
            total += 1
        picked.append(c)
    return picked


# ---------- 归档合并（全部复用 build_content 的读旧→合并→写回） ----------
def merge_outputs(processed: list[dict]) -> None:
    # 案例归档：按文章日期分组，逐日伪 daily 调 build_case_archive
    by_date: dict[str, list[dict]] = defaultdict(list)
    for it in processed:
        d = (it.get("pubDate") or common.today_str())[:10]
        by_date[d].append(case_entry(it))
    for d, cases in sorted(by_date.items()):
        build_content.build_case_archive({"cases": cases}, d)

    # 评论：按月份分组复用 build_pinglun
    by_month: dict[str, list[dict]] = defaultdict(list)
    for it in processed:
        if it["category"] == "时评":
            by_month[(it.get("pubDate") or common.today_str())[:7]].append(it)
    for m, items in sorted(by_month.items()):
        build_content.build_pinglun(items, m)

    # 时政：按月份分组复用 build_shizheng_monthly 后写回
    by_month.clear()
    for it in processed:
        if it["category"] == "时政":
            by_month[(it.get("pubDate") or common.today_str())[:7]].append(it)
    for m, items in sorted(by_month.items()):
        data = build_content.build_shizheng_monthly(items, m)
        build_content._write_json(build_content.CONTENT / "shizheng" / f"{m}.json", data)


# ---------- 统计输出 ----------
def print_stats() -> None:
    content = build_content.CONTENT
    cases = json.loads((content / "archive" / "cases.json").read_text(encoding="utf-8"))
    by_domain: dict[str, int] = defaultdict(int)
    by_month: dict[str, int] = defaultdict(int)
    for c in cases:
        by_domain[c.get("domain", "其他")] += 1
        by_month[(c.get("date") or "")[:7]] += 1
    print(f"\n[stats] archive/cases.json 共 {len(cases)} 条")
    print(f"  领域分布: {dict(sorted(by_domain.items(), key=lambda x: -x[1]))}")
    print(f"  月份分布: {dict(sorted(by_month.items()))}")
    ge5 = [d for d, n in by_domain.items() if n >= 5]
    print(f"  ≥5 条的领域数: {len(ge5)} {ge5}")

    idx = json.loads((content / "pinglun" / "index.json").read_text(encoding="utf-8"))
    pm: dict[str, int] = defaultdict(int)
    for x in idx:
        pm[x.get("month", "?")] += 1
    print(f"[stats] pinglun/index.json 共 {len(idx)} 条，月份分布: {dict(sorted(pm.items()))}")

    for p in sorted((content / "shizheng").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        print(f"[stats] shizheng/{p.name} 共 {len(d.get('items', []))} 条")


# ---------- 主流程 ----------
def run() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只翻列表页，不抓正文不加工")
    ap.add_argument("--max-per-source", type=int, default=0, help="每源最多加工 N 篇（小步验证）")
    ap.add_argument("--since", default="2026-05-01", help="日期窗口起点（人物类放宽到 2026-01）")
    args = ap.parse_args()

    llm = None if args.dry_run else process.LLMClient()
    if llm is not None and not llm.enabled:
        warn("LLM 未启用，加工将走降级路径（领域多为「其他」，建议检查 OPENAI_* 环境变量）")

    seen = common.load_seen()
    new_fps: list[str] = []
    processed: list[dict] = []

    with fetch._client() as client:
        for src in BACKFILL_SOURCES:
            since = SINCE_OVERRIDE.get(src["category"], args.since)
            cands = collect_candidates(src, client, since)
            months: dict[str, int] = defaultdict(int)
            for c in cands:
                months[(c["date"] or "?")[:7]] += 1
            print(f"[backfill] {src['name']}({src['category']}): 候选 {len(cands)} 篇，月份分布 {dict(sorted(months.items()))}")
            if args.dry_run:
                continue

            target = len(pick_with_quota(cands, src["category"]))
            if args.max_per_source:
                target = min(target, args.max_per_source)
            # 3 倍候补池：被 seen 去重跳过（日报已加工过）的候选不占用配额
            pool = pick_with_quota(cands, src["category"], scale=3)
            print(f"[backfill] {src['name']}: 目标 {target} 篇，开始抓正文+加工")
            ok = 0
            ok_by_month: dict[str, int] = defaultdict(int)
            strict_caps = MONTH_QUOTA.get(src["category"], {})
            for c in pool:
                if ok >= target:
                    break
                # 严格月配额按成功数计：新→旧遍历时当月满额后继续往旧月份走，
                # 否则较新的 07 月会先吃满 target，05/06 永远轮不到（候选池按月份封顶只是个数上限）
                month = (c["date"] or "")[:7]
                if strict_caps and ok_by_month[month] >= strict_caps.get(month, 0):
                    continue
                fetch._polite_sleep()
                try:
                    r = fetch._get(client, c["link"])
                    r.raise_for_status()
                    body = fetch._article_body(r.text)
                    if len(body) < fetch._MIN_BODY:
                        continue
                except Exception as e:  # noqa: BLE001  单篇失败不阻塞
                    warn(f"抓取失败({c['link'][:60]}): {e}")
                    continue
                item = {
                    "title": c["title"] or fetch._article_title(r.text, src["name"]),
                    "link": c["link"],
                    "pubDate": c["date"] or common.today_str(),
                    "category": src["category"],
                    "source": src["name"],
                    "body": body,
                }
                fp = common.fingerprint(item["title"], item["link"])
                if fp in seen or fp in new_fps:
                    continue
                p = process.process_item(item, llm)
                p["pubDate"] = item["pubDate"]
                processed.append(p)
                new_fps.append(fp)
                ok += 1
                ok_by_month[month] += 1
                tag = "降级" if p.get("degraded") else "LLM"
                print(f"  [{tag}] {item['pubDate']} {item['title'][:30]}")
            print(f"[backfill] {src['name']}: 成功 {ok}/{target}")

    if args.dry_run:
        print("[backfill] dry-run 结束（未写任何文件）")
        return

    merge_outputs(processed)
    common.save_seen(seen.union(new_fps))
    print(f"[backfill] 加工完成 {len(processed)} 篇，归档已合并，seen +{len(new_fps)}")
    print_stats()


if __name__ == "__main__":
    run()
