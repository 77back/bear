"""fetch.py 两级抓取（type: list）测试：链接提取、相对链接补全、
正文 <200 字丢弃、单篇失败不阻塞、RSS 作为列表源。"""
import httpx
import pytest

import fetch

LIST_URL = "https://example.com/news/list.html"

LIST_HTML = """
<html><body>
<a href="/art/1.html">文章一</a>
<a href="https://example.com/art/2.html">文章二</a>
<a href="https://example.com/art/1.html">重复链接</a>
<a href="https://example.com/about/">无关链接</a>
</body></html>
"""

LONG_BODY = "这是足够长的正文段落，用来超过两百字的最低门槛。" * 12  # >200 字
SHORT_BODY = "太短了。"


def article(title: str, body: str) -> str:
    return f"<html><head><title>{title}</title></head><body><p>{body}</p></body></html>"


def mock_client(pages: dict) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        body = pages.get(str(request.url))
        if body is None:
            return httpx.Response(404)
        if isinstance(body, Exception):
            raise body
        return httpx.Response(200, text=body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def src(**kw) -> dict:
    base = {
        "name": "测试源",
        "type": "list",
        "url": LIST_URL,
        "linkPattern": r'href="([^"]*art/\d+\.html)"',
        "category": "时政",
        "limit": 3,
    }
    base.update(kw)
    return base


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(fetch, "_polite_sleep", lambda: None)


def test_link_extract_urljoin_and_title():
    pages = {
        LIST_URL: LIST_HTML,
        "https://example.com/art/1.html": article("文章一标题-测试站点", LONG_BODY),
        "https://example.com/art/2.html": article("文章二标题", LONG_BODY),
    }
    items = fetch.fetch_list(src(limit=1), mock_client(pages))
    assert len(items) == 1
    # 相对链接用 urljoin 补全为绝对链接
    assert items[0]["link"] == "https://example.com/art/1.html"
    # 标题取文章页 <title> 并剥掉「-站点名」后缀
    assert items[0]["title"] == "文章一标题"
    assert len(items[0]["body"]) >= fetch._MIN_BODY


def test_short_body_dropped():
    pages = {
        LIST_URL: LIST_HTML,
        "https://example.com/art/1.html": article("短文", SHORT_BODY),
        "https://example.com/art/2.html": article("长文", LONG_BODY),
    }
    items = fetch.fetch_list(src(limit=1), mock_client(pages))
    # 第一篇 <200 字被丢弃，继续抓第二篇
    assert [it["link"] for it in items] == ["https://example.com/art/2.html"]


def test_single_article_failure_not_blocking():
    pages = {
        LIST_URL: LIST_HTML,
        "https://example.com/art/1.html": httpx.ConnectError("boom"),
        "https://example.com/art/2.html": article("文章二标题", LONG_BODY),
    }
    items = fetch.fetch_list(src(limit=1), mock_client(pages))
    assert [it["link"] for it in items] == ["https://example.com/art/2.html"]


def test_all_articles_failed_counts_as_source_failure():
    pages = {
        LIST_URL: LIST_HTML,
        "https://example.com/art/1.html": httpx.ConnectError("boom"),
        "https://example.com/art/2.html": httpx.ConnectError("boom"),
    }
    with pytest.raises(RuntimeError):
        fetch.fetch_list(src(), mock_client(pages))


RSS_XML = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>滚动</title>
<item><title>滚动新闻一</title><link>https://example.com/roll/1.html</link>
<description>只有约一百字的短摘要，不足门槛</description></item>
<item><title>滚动新闻二</title><link>https://example.com/roll/2.html</link>
<description>同样很短</description></item>
</channel></rss>
"""


def test_rss_as_list_source():
    pages = {
        LIST_URL: RSS_XML,
        "https://example.com/roll/1.html": article("滚动一-站点", LONG_BODY),
        "https://example.com/roll/2.html": article("滚动二-站点", LONG_BODY),
    }
    # RSS 列表无需 linkPattern；标题直接取 <item> 的 title
    items = fetch.fetch_list(src(linkPattern=None, limit=2), mock_client(pages))
    assert [it["title"] for it in items] == ["滚动新闻一", "滚动新闻二"]
    # 正文来自文章页 <p> 聚合，而非 RSS description
    assert all(len(it["body"]) >= fetch._MIN_BODY for it in items)


def _item(fp, cat="时政"):
    return {"fp": fp, "title": fp, "link": f"https://x/{fp}", "category": cat, "body": "x"}


def test_merge_same_day_keeps_previous_when_nothing_new():
    prev = [_item("a"), _item("b", "时评")]
    merged, counts = fetch.merge_same_day(prev, [], [])
    assert [i["fp"] for i in merged] == ["a", "b"]
    assert counts == {"时政": 1, "时评": 1}


def test_merge_same_day_dedup_and_recount():
    prev = [_item("a"), _item("b")]
    kept = [_item("b"), _item("c", "国际")]
    merged, counts = fetch.merge_same_day(prev, kept, ["b", "c"])
    assert sorted(i["fp"] for i in merged) == ["a", "b", "c"]
    assert counts == {"时政": 2, "国际": 1}


def test_merge_same_day_ignores_items_without_fp():
    merged, counts = fetch.merge_same_day([{"title": "无指纹"}], [_item("a")], ["a"])
    assert [i["fp"] for i in merged] == ["a"]
    assert counts == {"时政": 1}
