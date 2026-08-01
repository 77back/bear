"""汇总输出 content/*.json（构建框架 §8.4）。

读 processed/{date}.json → 产出：
- content/daily/{date}.json        每日包（案例/文章/实务/结构/国际）
- content/shizheng/{month}.json    月度时政统计（增量合并去重）
- content/pinglun/index.json       评论案例库索引（追加）
- content/pinglun/{month}/{id}.json 评论详情
- content/index.json               最新日期清单（供 App 离线回退定位）
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import common
from common import ensure_dir, first_chars, month_str, repo_root, today_str

CONTENT = repo_root() / "content"

# 固定结构库（静态策展，非生成，按日轮换）
STRUCTURES = [
    {
        "name": "五段三分式 · 策论文",
        "nodes": ["引论·点题", "分论点1·政策", "分论点2·执行", "分论点3·监督", "结尾·升华"],
        "fragment": "「治国之道，富民为始。推进乡村振兴，需以政策为纲、以执行为要、以监督为盾。」",
    },
    {
        "name": "递进式 · 是什么-为什么-怎么办",
        "nodes": ["提出问题", "分析原因", "论证危害", "提出对策", "总结升华"],
        "fragment": "「问题之所在，亦是改革之所向。唯有直面病灶，方能对症下药。」",
    },
    {
        "name": "并列式 · 三个维度",
        "nodes": ["总论点", "维度一·制度", "维度二·科技", "维度三·文化", "回扣总论"],
        "fragment": "「制度为基、科技为翼、文化为魂，三者并进，行稳致远。」",
    },
]


def _read_json(p: Path, default):
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def _write_json(p: Path, data) -> None:
    ensure_dir(p.parent)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _pid(title: str) -> str:
    return hashlib.sha1(title.encode("utf-8")).hexdigest()[:12]


# ---------- 每日包质量门槛 ----------
# CI 夜间抓取不稳定时会产出稀疏包（cases=0、guoji=0、article 空），
# 不得覆盖当日已有的丰富包（历史教训：10266B 好包被 5273B 瘦包覆盖）。

SPARSE_BYTE_RATIO = 0.7  # 新包字节数不足旧包 70% 视为明显更瘦


def _daily_richness(daily: dict) -> dict:
    """丰富度指标：非空板块数（案例/国际/文章/实务素材/结构）+ 包字节数。"""
    sections = sum(
        1
        for x in (
            daily.get("cases") or [],
            daily.get("guoji") or [],
            daily.get("article") or {},
            (daily.get("shiwu") or {}).get("material") or {},
            daily.get("structure") or {},
        )
        if x
    )
    size = len(json.dumps(daily, ensure_ascii=False).encode("utf-8"))
    return {"sections": sections, "bytes": size}


def should_write_daily(new: dict, old: dict | None) -> tuple[bool, str]:
    """质量门槛判定：新包明显更瘦时拒绝覆盖。返回 (是否写盘, 原因)。"""
    if old is None:
        return True, "无旧包，正常写入"
    n, o = _daily_richness(new), _daily_richness(old)
    if n["sections"] < o["sections"]:
        return False, f"非空板块数变少（{n['sections']} < 旧包 {o['sections']}）"
    if n["bytes"] < o["bytes"] * SPARSE_BYTE_RATIO:
        return False, f"包字节数不足旧包 {SPARSE_BYTE_RATIO:.0%}（{n['bytes']} < 旧包 {o['bytes']}）"
    return True, f"丰富度不劣于旧包（板块 {n['sections']}/{o['sections']}，字节 {n['bytes']}/{o['bytes']}）"


def build_daily(proc_items: list[dict], date_str: str) -> dict:
    by_cat: dict[str, list[dict]] = {}
    for it in proc_items:
        by_cat.setdefault(it["category"], []).append(it)

    # 案例 ← 人物
    cases = []
    for it in by_cat.get("人物", []):
        r = it.get("result", {})
        cases.append(
            {
                "title": it["title"],
                "summary": it.get("summary", ""),
                "themes": r.get("themes", []),
                "usage": r.get("usage", ""),
                "domain": common.normalize_domain(r.get("domain")),
                "source": it.get("source", ""),
                "url": it.get("link", ""),
            }
        )

    # 文章 ← 时评（取第 1 篇）；三件套来自同一篇申论文章
    article = {}
    shenlun: dict = {}
    if by_cat.get("时评"):
        it = by_cat["时评"][0]
        r = it.get("result", {})
        article = {
            "title": it["title"],
            "url": it.get("link", ""),
            "structure": r.get("structure", []),
            "quotes": r.get("quotes", []),
            "domain": common.normalize_domain(r.get("domain")),
            "source": it.get("source", ""),
        }
        shenlun = r.get("shenlun") or {}

    # 实务 ← 通稿（取第 1 篇）
    shiwu = {}
    if by_cat.get("通稿"):
        it = by_cat["通稿"][0]
        r = it.get("result", {})
        exercises = []
        if r.get("news"):
            exercises.append({"qtype": "消息", "prompt": r["news"].get("prompt", ""), "reference": r["news"].get("reference", "")})
        if r.get("title"):
            samples = r["title"].get("samples", [])
            exercises.append({"qtype": "标题", "prompt": r["title"].get("prompt", ""), "reference": "推荐标题：" + "；".join(samples) if samples else ""})
        if r.get("correct"):
            exercises.append({"qtype": "纠错", "prompt": r["correct"].get("prompt", ""), "reference": json.dumps(r["correct"].get("items", []), ensure_ascii=False)})
        shiwu = {
            "material": {"title": it["title"], "body": it.get("summary", ""), "source": it.get("source", ""), "url": it.get("link", "")},
            "exercises": exercises,
        }

    # 国际
    guoji = []
    for it in by_cat.get("国际", []):
        r = it.get("result", {})
        guoji.append(
            {
                "title": it["title"],
                "points": r.get("points", []),
                "reading": r.get("reading", ""),
                "source": it.get("source", ""),
                "url": it.get("link", ""),
            }
        )

    # 结构（按日轮换）
    struct = STRUCTURES[hash(date_str) % len(STRUCTURES)]

    return {
        "date": date_str,
        "cases": cases,
        "article": article,
        "shenlun": shenlun,
        "shiwu": shiwu,
        "structure": struct,
        "guoji": guoji,
    }


# ---------- 案例归档（累积，为冷启动回填与 App 案例库打底） ----------
def _archive_key(case: dict) -> str:
    """去重键：有 url 按 url，无 url 按 title。"""
    return (case.get("url") or "").strip() or f"title:{(case.get('title') or '').strip()}"


def _archive_id(case: dict) -> str:
    """稳定 id：sha1(url 或 title) 前 12 位。"""
    basis = (case.get("url") or "").strip() or (case.get("title") or "").strip()
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:12]


def build_case_archive(daily: dict, date_str: str) -> Path:
    """当日案例追加进 content/archive/cases.json（读旧→合并去重→写回）。
    累积合并、不覆盖；不受每日包质量门槛限制。"""
    path = CONTENT / "archive" / "cases.json"
    data = _read_json(path, [])
    if not isinstance(data, list):  # 旧文件损坏 → 重新累积
        data = []
    seen = {_archive_key(x) for x in data}
    added = 0
    for c in daily.get("cases") or []:
        key = _archive_key(c)
        if key == "title:" or key in seen:  # 无 url 且无标题 → 无法去重，跳过
            continue
        data.append(
            {
                "id": _archive_id(c),
                "date": date_str,
                "domain": c.get("domain", "其他"),
                "title": c.get("title", ""),
                "text": c.get("summary", ""),
                "source": c.get("source", ""),
                "url": c.get("url", ""),
            }
        )
        seen.add(key)
        added += 1
    _write_json(path, data)
    return path


def build_shizheng_monthly(proc_items: list[dict], month: str) -> dict:
    path = CONTENT / "shizheng" / f"{month}.json"
    data = _read_json(path, {"month": month, "items": []})
    by_title = {x["title"]: x for x in data["items"]}
    for it in proc_items:
        if it["category"] != "时政":
            continue
        r = it.get("result", {})
        old = by_title.get(it["title"])
        if old is not None:
            # 已存在：回填后加的字段（source/url），不重复追加
            old.setdefault("source", it.get("source", ""))
            if not old.get("url"):
                old["url"] = it.get("link", "")
            continue
        item = {
            "title": it["title"],
            "points": r.get("points", []),
            "domains": r.get("domains", []),
            "reading": r.get("reading", ""),
            "source": it.get("source", ""),
            "url": it.get("link", ""),
        }
        data["items"].append(item)
        by_title[it["title"]] = item
    return data


def build_pinglun(proc_items: list[dict], month: str) -> None:
    index_path = CONTENT / "pinglun" / "index.json"
    index = _read_json(index_path, [])
    by_id = {x["id"]: x for x in index}
    for it in proc_items:
        if it["category"] != "时评":
            continue
        pid = _pid(it["title"])
        r = it.get("result", {})
        domain = common.normalize_domain(r.get("domain"))
        if pid in by_id:
            # 已存在：回填后加的 source/domains 字段
            by_id[pid].setdefault("source", it.get("source", ""))
            if domain != "其他" and not by_id[pid].get("domains"):
                by_id[pid]["domains"] = [domain]
        else:
            entry = {
                "id": pid,
                "title": it["title"],
                "month": month,
                "domains": [domain] if domain != "其他" else [],
                "structure": "；".join(r.get("structure", [])[:2]),
                "examUse": r.get("examUse", ""),
                "source": it.get("source", ""),
            }
            index.append(entry)
            by_id[pid] = entry
        # 详情
        _write_json(
            CONTENT / "pinglun" / month / f"{pid}.json",
            {
                "id": pid,
                "title": it["title"],
                "url": it.get("link", ""),
                "structure": r.get("structure", []),
                "methods": r.get("methods", []),
                "quotes": r.get("quotes", []),
                "examUse": r.get("examUse", ""),
                "domain": domain,
                "source": it.get("source", ""),
            },
        )
    _write_json(index_path, index)


def update_latest_index(date_str: str) -> None:
    path = CONTENT / "index.json"
    data = _read_json(path, {"latest": date_str, "dates": []})
    dates = data.get("dates", [])
    if date_str not in dates:
        dates.insert(0, date_str)
    data["dates"] = dates[:90]
    data["latest"] = dates[0]
    _write_json(path, data)


def run(date_str: str | None = None) -> Path:
    date_str = date_str or today_str()
    month = date_str[:7]
    proc_path = common.ROOT / "processed" / f"{date_str}.json"
    if not proc_path.exists():
        raise SystemExit(f"找不到加工产物 {proc_path}，请先运行 process.py")
    proc = json.loads(proc_path.read_text(encoding="utf-8"))
    items = proc["items"]

    daily = build_daily(items, date_str)
    daily_path = CONTENT / "daily" / f"{date_str}.json"
    # 质量门槛：稀疏新包不得覆盖当日已有的丰富旧包
    old_daily = _read_json(daily_path, None)
    if not isinstance(old_daily, dict):  # 旧文件损坏/非对象 → 当作无历史
        old_daily = None
    ok, reason = should_write_daily(daily, old_daily)
    if ok:
        _write_json(daily_path, daily)
        print(f"[build] daily→{daily_path}（{reason}）")
    else:
        print(f"[build][WARN] 拒绝覆盖：{reason}；保留旧包 {daily_path}", file=sys.stderr)

    shizheng = build_shizheng_monthly(items, month)
    _write_json(CONTENT / "shizheng" / f"{month}.json", shizheng)

    # 案例归档：累积合并，不受每日包质量门槛限制（即使当日包被拒绝覆盖也照归档）
    archive_path = build_case_archive(daily, date_str)
    print(f"[build] 案例归档 → {archive_path}")

    build_pinglun(items, month)
    update_latest_index(date_str)

    print("[build] 时政月统计/评论库已更新")
    return daily_path


if __name__ == "__main__":
    run()
