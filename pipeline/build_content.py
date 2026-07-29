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
                "source": it.get("source", ""),
            }
        )

    # 文章 ← 时评（取第 1 篇）
    article = {}
    if by_cat.get("时评"):
        it = by_cat["时评"][0]
        r = it.get("result", {})
        article = {
            "title": it["title"],
            "url": it.get("link", ""),
            "structure": r.get("structure", []),
            "quotes": r.get("quotes", []),
            "source": it.get("source", ""),
        }

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
            "material": {"title": it["title"], "body": it.get("summary", ""), "source": it.get("source", "")},
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
            }
        )

    # 结构（按日轮换）
    struct = STRUCTURES[hash(date_str) % len(STRUCTURES)]

    return {
        "date": date_str,
        "cases": cases,
        "article": article,
        "shiwu": shiwu,
        "structure": struct,
        "guoji": guoji,
    }


def build_shizheng_monthly(proc_items: list[dict], month: str) -> dict:
    path = CONTENT / "shizheng" / f"{month}.json"
    data = _read_json(path, {"month": month, "items": []})
    seen_titles = {x["title"] for x in data["items"]}
    for it in proc_items:
        if it["category"] != "时政":
            continue
        if it["title"] in seen_titles:
            continue
        r = it.get("result", {})
        data["items"].append(
            {
                "title": it["title"],
                "points": r.get("points", []),
                "domains": r.get("domains", []),
                "reading": r.get("reading", ""),
                "source": it.get("source", ""),
            }
        )
        seen_titles.add(it["title"])
    return data


def build_pinglun(proc_items: list[dict], month: str) -> None:
    index_path = CONTENT / "pinglun" / "index.json"
    index = _read_json(index_path, [])
    existing = {x["id"] for x in index}
    for it in proc_items:
        if it["category"] != "时评":
            continue
        pid = _pid(it["title"])
        r = it.get("result", {})
        if pid not in existing:
            index.append(
                {
                    "id": pid,
                    "title": it["title"],
                    "month": month,
                    "domains": [],
                    "structure": "；".join(r.get("structure", [])[:2]),
                    "examUse": r.get("examUse", ""),
                }
            )
            existing.add(pid)
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
    _write_json(daily_path, daily)

    shizheng = build_shizheng_monthly(items, month)
    _write_json(CONTENT / "shizheng" / f"{month}.json", shizheng)

    build_pinglun(items, month)
    update_latest_index(date_str)

    print(f"[build] daily→{daily_path}；时政月统计/评论库已更新")
    return daily_path


if __name__ == "__main__":
    run()
