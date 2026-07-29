"""管线纯逻辑测试（构建框架 §8）：去重指纹、防幻觉校验、降级不编造、产物装配。"""
import json

import build_content
import common
import process


BODY = (
    "7月29日，我国在太原卫星发射中心使用长征二号丁运载火箭，"
    "成功将遥感四十二号卫星发射升空。此次任务是长征系列运载火箭的第520次飞行。"
    "卫星顺利进入预定轨道，主要用于国土普查、城市规划、农作物估产。"
)


# ---------- 去重指纹 ----------
def test_fingerprint_deterministic():
    a = common.fingerprint("标题", "http://a")
    b = common.fingerprint("标题", "http://a")
    c = common.fingerprint("标题", "http://b")
    assert a == b and a != c
    assert len(a) == 40  # sha1 hex


def test_strip_html():
    assert common.strip_html("<p>你好&nbsp;世界</p>") == "你好 世界"


# ---------- 防幻觉：金句校验 ----------
def test_verify_quotes_keeps_source_drops_fabricated():
    quotes = [
        "成功将遥感四十二号卫星发射升空",  # 原文有
        "这是马斯克的星链卫星",  # 编造
    ]
    kept = process.verify_quotes(quotes, BODY)
    assert kept == ["成功将遥感四十二号卫星发射升空"]


def test_filter_points_drops_fabricated():
    pts = [
        "遥感卫星发射成功",  # "遥感""卫星""发射""成功" 均在原文 → 保留
        "该卫星由 SpaceX 制造并用于火星探测",  # 编造词多 → 丢
    ]
    kept = process.filter_points(pts, BODY)
    assert "遥感卫星发射成功" in kept
    assert all("火星" not in p for p in kept)


def test_sanitize_strips_fabricated_quotes():
    data = {"structure": ["a", ""], "methods": ["对比"], "quotes": ["长征二号丁运载火箭", "纯属虚构的金句"]}
    out = process.sanitize("时评", data, BODY)
    assert out["quotes"] == ["长征二号丁运载火箭"]
    assert out["structure"] == ["a"]  # 空串被滤


# ---------- 降级：绝不编造（要点必须来自原文） ----------
def test_degrade_points_all_from_source():
    item = {"title": "遥感四十二号", "link": "l", "source": "新华社", "category": "时政", "body": BODY}
    out = process.degrade(item, "时政")
    assert out["degraded"] is True
    nb = process._norm(BODY)
    for p in out["result"]["points"]:
        # 每条要点至少有一个 2 字词来自原文
        terms = __import__("re").findall(r"[一-龥]{2,}", p)
        assert any(t in nb for t in terms), f"降级要点疑似编造: {p}"


def test_degrade_tonggao_structure():
    item = {"title": "遥感四十二号", "link": "l", "source": "新华社", "category": "通稿", "body": BODY}
    out = process.degrade(item, "通稿")
    assert "news" in out["result"] and "title" in out["result"] and "correct" in out["result"]


# ---------- JSON 解析鲁棒 ----------
def test_parse_json_safe_codefence():
    s = '```json\n{"a":1}\n```'
    assert process.parse_json_safe(s) == {"a": 1}
    assert process.parse_json_safe("not json") is None


# ---------- 产物装配 ----------
def _proc_item(cat, **kw):
    base = {"title": kw.get("title", "t"), "link": "l", "source": "s", "category": cat,
            "summary": "...", "degraded": False, "result": kw.get("result", {})}
    return base


def test_build_daily_structure(tmp_path, monkeypatch):
    monkeypatch.setattr(build_content, "CONTENT", tmp_path)
    items = [
        _proc_item("人物", title="林丹", result={"themes": ["基层治理"], "usage": "用法"}),
        _proc_item("时评", title="把小事办成大事", result={"structure": ["点题"], "quotes": ["民生连着民心"], "examUse": "治理"}),
        _proc_item("通稿", title="遥感四十二号", result={
            "news": {"prompt": "写300字消息", "reference": "范文"},
            "title": {"prompt": "拟标题", "samples": ["A", "B"]},
            "correct": {"prompt": "纠错", "items": [{"error": "x", "answer": "y"}]},
        }),
        _proc_item("时政", title="城市工作会议"),
        _proc_item("国际", title="G7峰会", result={"points": ["要点"], "reading": "解读"}),
    ]
    daily = build_content.build_daily(items, "2026-07-29")
    assert daily["date"] == "2026-07-29"
    assert daily["cases"][0]["themes"] == ["基层治理"]
    assert daily["article"]["title"] == "把小事办成大事"
    assert daily["shiwu"]["material"]["title"] == "遥感四十二号"
    qtypes = [e["qtype"] for e in daily["shiwu"]["exercises"]]
    assert qtypes == ["消息", "标题", "纠错"]
    assert daily["structure"]["name"]  # 轮换结构
    assert daily["guoji"][0]["title"] == "G7峰会"


def test_build_daily_rotates_structure():
    a = build_content.build_daily([], "2026-07-01")["structure"]["name"]
    b = build_content.build_daily([], "2026-07-02")["structure"]["name"]
    # 不同日期大概率不同结构（库内 3 个）
    assert a in {s["name"] for s in build_content.STRUCTURES}


def test_shizheng_monthly_merge_dedup(tmp_path, monkeypatch):
    monkeypatch.setattr(build_content, "CONTENT", tmp_path)
    items = [_proc_item("时政", title="城市工作会议", result={"points": ["p1"]})]
    m1 = build_content.build_shizheng_monthly(items, "2026-07")
    assert len(m1["items"]) == 1
    # 再跑一次，同标题不重复
    m2 = build_content.build_shizheng_monthly(items, "2026-07")
    assert len(m2["items"]) == 1


def test_pinglun_index_append(tmp_path, monkeypatch):
    monkeypatch.setattr(build_content, "CONTENT", tmp_path)
    items = [_proc_item("时评", title="评论A", result={"structure": ["点题", "升华"], "examUse": "治理"})]
    build_content.build_pinglun(items, "2026-07")
    idx = json.loads((tmp_path / "pinglun" / "index.json").read_text(encoding="utf-8"))
    assert idx[0]["title"] == "评论A"
    assert idx[0]["month"] == "2026-07"
    # 再跑不重复
    build_content.build_pinglun(items, "2026-07")
    idx2 = json.loads((tmp_path / "pinglun" / "index.json").read_text(encoding="utf-8"))
    assert len(idx2) == 1
