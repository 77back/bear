"""抓取与去重（构建框架 §8.2）。

源类型：
- rss  ：RSS 全文（content/summary 作正文），失败退化栏目页直抓；
- page ：栏目页单页直抓（整页当一条，best-effort）；
- list ：两级抓取——列表页（HTML 或 RSS/XML）提取文章链接，逐篇抓文章页用 <p> 聚合正文。
单源失败跳过并告警，不阻塞整体。输出 pipeline/raw/YYYY-MM-DD.json。
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
from typing import Iterable
from urllib.parse import urljoin

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


RETRY_TIMES = 2  # 网络层错误（超时/连接失败）最多重试 2 次


def _get(client: httpx.Client, url: str) -> httpx.Response:
    """带有限重试的 GET：仅对网络层错误（超时/连接失败）重试，HTTP 状态码错误不重试。"""
    last: httpx.TransportError | None = None
    for attempt in range(RETRY_TIMES + 1):
        try:
            return client.get(url)
        except httpx.TransportError as e:
            last = e
            if attempt < RETRY_TIMES:
                warn(f"请求失败，{attempt + 1}/{RETRY_TIMES} 次重试({url[:60]}): {e}")
                time.sleep(1 + attempt)
    raise last  # type: ignore[misc]


# ---------- RSS 抓取 ----------
def fetch_rss(source: dict, client: httpx.Client) -> list[dict]:
    url = source["url"]
    resp = _get(client, url)
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
    resp = _get(client, url)
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


# ---------- 两级抓取（type: list） ----------
_MIN_BODY = 200  # §8.2：正文 <200 字丢弃


def _polite_sleep() -> None:
    """礼貌抓取：文章请求间隔 0.5~1s。"""
    time.sleep(0.5 + random.random() * 0.5)


def _list_entries(source: dict, content: str, base_url: str) -> list[tuple[str, str]]:
    """从列表页提取 (link, title)，去重保序。

    列表页是 RSS/XML 时直接取 <item> 的 title+link（不再依赖 description 长度）；
    否则按 linkPattern 正则提取链接，相对链接用 urljoin 补全。
    """
    head = content.lstrip()[:300].lower()
    if head.startswith("<?xml") or head.startswith("<rss") or head.startswith("<feed"):
        parsed = feedparser.parse(content)
        entries = [
            ((e.get("link") or "").strip(), (e.get("title") or "").strip())
            for e in parsed.entries
            if e.get("link")
        ]
    else:
        pattern = source.get("linkPattern")
        if not pattern:
            raise ValueError(f"list 源缺少 linkPattern: {source['name']}")
        entries = []
        for m in re.finditer(pattern, content, re.I):
            link = urljoin(base_url, m.group(1) if m.groups() else m.group(0))
            entries.append((link, ""))  # 标题留空，抓文章页时从 <title> 取
    seen_links: set[str] = set()
    out: list[tuple[str, str]] = []
    for link, title in entries:
        if link and link not in seen_links:
            seen_links.add(link)
            out.append((link, title))
    return out


_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
# 站点 <title> 常见后缀分隔：「标题-网站名」「标题_栏目_网站名」
_TITLE_SEP_RE = re.compile(r"[-_—|]")


def _article_title(html: str, fallback: str) -> str:
    m = _TITLE_RE.search(html)
    raw = common.strip_html(m.group(1)) if m else ""
    head = _TITLE_SEP_RE.split(raw)[0].strip()
    return head or raw or fallback


def _article_body(html: str) -> str:
    """<p> 聚合正文（沿用 extract_text/strip_html 思路）。"""
    paras = [common.strip_html(x[1]) for x in _P_RE.findall(html)]
    return "\n".join(p for p in paras if p)


def fetch_list(source: dict, client: httpx.Client) -> list[dict]:
    """list 源：列表页提取链接 → 逐篇抓文章页补正文。

    单篇失败/正文不足跳过该篇并告警，不阻塞；一篇都抓不到才算该源失败。
    抓到 limit 篇即停，最多尝试 limit*3 个候选链接。
    """
    url = source["url"]
    resp = _get(client, url)
    resp.raise_for_status()
    candidates = _list_entries(source, resp.text, url)
    if not candidates:
        raise RuntimeError(f"列表页未提取到文章链接({source['name']})")

    limit = int(source.get("limit", 4))
    max_try = max(limit * 3, limit + 2)
    items: list[dict] = []
    for link, title in candidates[:max_try]:
        if len(items) >= limit:
            break
        _polite_sleep()
        try:
            r = _get(client, link)
            r.raise_for_status()
            body = _article_body(r.text)
            if len(body) < _MIN_BODY:
                warn(f"正文不足 {_MIN_BODY} 字跳过({link[:60]})")
                continue
            items.append(
                {
                    "title": title or _article_title(r.text, source["name"]),
                    "link": link,
                    "pubDate": today_str(),
                    "category": source["category"],
                    "source": source["name"],
                    "body": body,
                }
            )
        except Exception as e:  # noqa: BLE001  单篇失败不阻塞
            warn(f"文章抓取失败({link[:60]}): {e}")
    if not items:
        raise RuntimeError(f"所有文章抓取失败或正文不足({source['name']})")
    return items


def fetch_source(source: dict, client: httpx.Client) -> Iterable[dict]:
    """按 type 抓取；失败抛异常由调用方告警跳过。"""
    stype = source.get("type")
    if stype == "list":
        return fetch_list(source, client)
    if stype == "page":
        return fetch_page(source, client)
    # rss 失败时退化栏目页直抓
    try:
        return fetch_rss(source, client)
    except Exception as e:  # noqa: BLE001
        warn(f"RSS 失败({source['name']}): {e}; 尝试栏目页直抓")
        return fetch_page(source, client)


def merge_same_day(prev_items: list[dict], kept: list[dict], new_fps: list[str]) -> tuple[list[dict], dict]:
    """同日重跑幂等：把当日已抓到的旧条目并入本次结果（按 fp 去重）。

    防止"全部已见 → 本次 0 篇 → 空 raw 覆盖"把当日已有内容清掉。
    返回 (合并后 items, 重算的 category_counts)。
    """
    known = set(new_fps)
    merged = list(kept)
    for it in prev_items:
        fp = it.get("fp")
        if fp and fp not in known:
            merged.append(it)
            known.add(fp)
    counts: dict[str, int] = {}
    for it in merged:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    return merged, counts


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
                if len(it["body"]) < _MIN_BODY:
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
    # 同日重跑幂等：合并当日已有 raw，避免空包覆盖（§8.2 去重的副作用）
    if out_path.exists():
        try:
            prev_items = json.loads(out_path.read_text(encoding="utf-8")).get("items", [])
        except Exception:  # noqa: BLE001  旧文件损坏则当作无历史
            prev_items = []
        kept, category_counts = merge_same_day(prev_items, kept, new_fps)
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
        warn(f"未覆盖类别: {sorted(missing)}（建议检查 sources.yaml 中对应源是否失效）")
    return out_path


if __name__ == "__main__":
    run()
