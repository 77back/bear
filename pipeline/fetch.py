"""抓取与去重（构建框架 §8.2）。

RSSHub 路由优先；失效退化栏目页直抓；两类都失败则跳过并告警，不阻塞整体。
输出 pipeline/raw/YYYY-MM-DD.json。
"""
from __future__ import annotations

import json
import re
import sys
import time
from typing import Iterable

import feedparser
import httpx

import common
from common import (
    ROOT,
    ensure_dir,
    extract_text,
    fingerprint,
    first_chars,
    load_seen,
    load_sources,
    save_seen,
    today_str,
)

UA = "bear-prep-pipeline/0.1 (+self-use)"
TIMEOUT = httpx.Timeout(20.0, connect=10.0)


def warn(msg: str) -> None:
    print(f"[fetch][WARN] {msg}", file=sys.stderr)


def _client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": UA}, timeout=TIMEOUT, follow_redirects=True)


# ---------- RSS 抓取 ----------
def fetch_rss(source: dict, client: httpx.Client) -> list[dict]:
    url = source["url"]
    resp = client.get(url)
    resp.raise_for_status()
    parsed = feedparser.parse(resp.content)
    items: list[dict] = []
    for e in parsed.entries:
        title = (e.get("title") or "").strip()
        link = (e.get("link") or "").strip()
        # 正文：content 优先，其次 summary
        body = ""
        if e.get("content"):
            body = extract_text(e.content[0].get("value", ""))
        if not body:
            body = extract_text(e.get("summary") or "")
        pub = ""
        try:
            pd = e.get("published_parsed") or e.get("updated_parsed")
            if pd:
                pub = time.strftime("%Y-%m-%d", pd)
            else:
                pub = (e.get("published") or e.get("updated") or "")[:16]
        except Exception:
            pub = ""
        items.append(
            {
                "title": title,
                "link": link,
                "pubDate": pub,
                "category": source["category"],
                "source": source["name"],
                "body": body,
            }
        )
    return items


# ---------- 栏目页直抓（退化方案，best-effort） ----------
_P_RE = re.compile(r"<(p|article)[^>]*>(.*?)</\1>", re.I | re.S)


def fetch_page(source: dict, client: httpx.Client) -> list[dict]:
    url = source["url"]
    resp = client.get(url)
    resp.raise_for_status()
    html = resp.text
    # 标题
    m_title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    title = common.strip_html(m_title.group(1)) if m_title else source["name"]
    # 段落聚合为正文
    paras = [common.strip_html(x[1]) for x in _P_RE.findall(html)]
    body = "\n".join(p for p in paras if p)
    # 栏目页通常一篇聚合，作为单条返回
    return [
        {
            "title": title,
            "link": url,
            "pubDate": today_str(),
            "category": source["category"],
            "source": source["name"],
            "body": body,
        }
    ]


def fetch_source(source: dict, client: httpx.Client) -> Iterable[dict]:
    """按 type 抓取；失败抛异常由调用方告警跳过。"""
    if source.get("type") == "page":
        return fetch_page(source, client)
    # rss 失败时退化栏目页直抓
    try:
        return fetch_rss(source, client)
    except Exception as e:  # noqa: BLE001
        warn(f"RSS 失败({source['name']}): {e}; 尝试栏目页直抓")
        return fetch_page(source, client)


def run(date_str: str | None = None) -> Path:
    date_str = date_str or today_str()
    sources = load_sources()
    seen = load_seen()

    kept: list[dict] = []
    new_fps: list[str] = []
    category_counts: dict[str, int] = {}

    with _client() as client:
        for src in sources:
            limit = int(src.get("limit", 4))
            try:
                items = list(fetch_source(src, client))
            except Exception as e:  # noqa: BLE001  两类都失败 → 跳过告警
                warn(f"源跳过({src['name']} / {src['category']}): {e}")
                continue
            picked = 0
            for it in items:
                if picked >= limit:
                    break
                # §8.2：正文 <200 字丢弃
                if len(it["body"]) < 200:
                    continue
                fp = fingerprint(it["title"], it["link"])
                if fp in seen or fp in new_fps:
                    continue
                it["fp"] = fp
                it["excerpt"] = first_chars(it["body"], 200)
                kept.append(it)
                new_fps.append(fp)
                picked += 1
            if picked:
                category_counts[src["category"]] = category_counts.get(src["category"], 0) + picked

    # 更新 seen
    save_seen(seen.union(new_fps))

    out_dir = ROOT / "raw"
    ensure_dir(out_dir)
    out_path = out_dir / f"{date_str}.json"
    out_path.write_text(
        json.dumps({"date": date_str, "count": len(kept), "byCategory": category_counts, "items": kept},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[fetch] 保留 {len(kept)} 篇，分类 {category_counts} → {out_path}")
    # 验收参考：五类覆盖
    cats = {"时政", "时评", "国际", "通稿", "人物"}
    missing = cats - set(category_counts)
    if missing:
        warn(f"未覆盖类别: {sorted(missing)}（建议检查 RSSHub 路由或补充源）")
    return out_path


if __name__ == "__main__":
    run()
