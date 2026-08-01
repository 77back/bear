"""每日包质量门槛测试：稀疏新包不得覆盖丰富旧包；fetch 重试。"""
import json

import httpx
import pytest

import build_content
import common
import fetch

DATE = "2026-07-29"


def _rich_items():
    """四类加工产物齐全 → 丰富包（5 个非空板块）。"""
    return [
        {"title": "案例A", "link": "l1", "source": "s", "category": "人物",
         "summary": "案例摘要" * 50, "result": {"themes": ["基层治理"], "usage": "用法"}},
        {"title": "时评A", "link": "l2", "source": "s", "category": "时评",
         "summary": "时评摘要" * 50, "result": {"structure": ["点题"], "quotes": ["民生连着民心"]}},
        {"title": "通稿A", "link": "l3", "source": "s", "category": "通稿",
         "summary": "通稿正文" * 200, "result": {"news": {"prompt": "写消息", "reference": "范文" * 100}}},
        {"title": "国际A", "link": "l4", "source": "s", "category": "国际",
         "summary": "国际摘要" * 50, "result": {"points": ["要点"], "reading": "解读" * 50}},
    ]


def _setup_run(tmp_path, monkeypatch, proc_items, old_daily=None):
    """把 processed/ 与 content/ 都指到 tmp_path，返回 daily 包路径。"""
    monkeypatch.setattr(common, "ROOT", tmp_path)
    content = tmp_path / "content"
    monkeypatch.setattr(build_content, "CONTENT", content)
    proc_dir = tmp_path / "processed"
    proc_dir.mkdir(parents=True)
    (proc_dir / f"{DATE}.json").write_text(
        json.dumps({"date": DATE, "items": proc_items}, ensure_ascii=False), encoding="utf-8"
    )
    daily_path = content / "daily" / f"{DATE}.json"
    if old_daily is not None:
        daily_path.parent.mkdir(parents=True)
        daily_path.write_text(json.dumps(old_daily, ensure_ascii=False), encoding="utf-8")
    return daily_path


# ---------- 判定函数（纯逻辑） ----------
def test_gate_writes_when_no_old():
    ok, _ = build_content.should_write_daily({"cases": []}, None)
    assert ok


def test_gate_rejects_fewer_sections():
    old = {"cases": [{"title": "a"}], "guoji": [{"title": "b"}], "article": {"title": "c"},
           "shiwu": {"material": {"title": "d"}}, "structure": {"name": "e"}}
    new = {"cases": [], "guoji": [], "article": {}, "shiwu": {}, "structure": {"name": "e"}}
    ok, reason = build_content.should_write_daily(new, old)
    assert not ok
    assert "板块" in reason


def test_gate_rejects_shrunken_bytes_same_sections():
    old = {"cases": [{"title": "a", "summary": "长" * 500}], "structure": {"name": "s", "fragment": "文" * 200}}
    new = {"cases": [{"title": "a", "summary": "短"}], "structure": {"name": "s"}}
    ok, reason = build_content.should_write_daily(new, old)
    assert not ok
    assert "字节" in reason


def test_gate_allows_richer_or_equal():
    old = {"cases": [{"title": "a"}], "structure": {"name": "s"}}
    new = {"cases": [{"title": "a"}, {"title": "b"}], "guoji": [{"title": "c"}], "structure": {"name": "s"}}
    ok, _ = build_content.should_write_daily(new, old)
    assert ok


# ---------- run() 集成（写盘路径） ----------
def test_run_sparse_new_keeps_rich_old(tmp_path, monkeypatch, capsys):
    rich_old = build_content.build_daily(_rich_items(), DATE)
    daily_path = _setup_run(tmp_path, monkeypatch, [], old_daily=rich_old)  # 空加工产物 → 稀疏新包
    build_content.run(DATE)
    after = json.loads(daily_path.read_text(encoding="utf-8"))
    assert len(after["cases"]) == 1  # 旧包未被覆盖
    assert after["article"]["title"] == "时评A"
    assert "拒绝覆盖" in capsys.readouterr().err


def test_run_rich_new_overwrites_sparse_old(tmp_path, monkeypatch):
    sparse_old = build_content.build_daily([], DATE)
    daily_path = _setup_run(tmp_path, monkeypatch, _rich_items(), old_daily=sparse_old)
    build_content.run(DATE)
    after = json.loads(daily_path.read_text(encoding="utf-8"))
    assert len(after["cases"]) == 1
    assert after["article"]["title"] == "时评A"
    assert len(after["guoji"]) == 1


def test_run_writes_when_no_old(tmp_path, monkeypatch):
    daily_path = _setup_run(tmp_path, monkeypatch, _rich_items())
    assert not daily_path.exists()
    build_content.run(DATE)
    after = json.loads(daily_path.read_text(encoding="utf-8"))
    assert after["date"] == DATE
    assert len(after["cases"]) == 1


# ---------- fetch 重试 ----------
def _mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_get_retries_on_transport_error(monkeypatch):
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("boom")
        return httpx.Response(200, text="ok")

    resp = fetch._get(_mock_client(handler), "https://example.com/x")
    assert resp.status_code == 200
    assert calls["n"] == 2  # 第一次失败重试后成功


def test_get_gives_up_after_retries(monkeypatch):
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)

    def handler(request):
        raise httpx.ConnectError("boom")

    with pytest.raises(httpx.TransportError):
        fetch._get(_mock_client(handler), "https://example.com/x")


def test_get_does_not_retry_http_error(monkeypatch):
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(500)

    resp = fetch._get(_mock_client(handler), "https://example.com/x")
    assert resp.status_code == 500
    assert calls["n"] == 1  # HTTP 状态码错误不重试（由 raise_for_status 处理）
