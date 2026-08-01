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


# ---------- 申论：领域标签 + 每日三件套 ----------
BODY2 = (
    "乡村振兴关键在人。返乡青年王磊带领村民种植猕猴桃，"
    "发展电商直播带货，人均年收入翻了一番。"
    "民生无小事，枝叶总关情。基层治理要把群众小事当成大事来办。"
)


def test_normalize_domain_fallback():
    assert common.normalize_domain("经济发展") == "经济发展"
    assert common.normalize_domain("月球探索") == "其他"  # 清单外 → 其他
    assert common.normalize_domain(None) == "其他"
    assert common.normalize_domain(["基层治理"]) == "其他"  # 非字符串 → 其他


def test_sanitize_domain_out_of_list_falls_back():
    data = {"structure": [], "methods": [], "quotes": [], "domain": "不存在的领域", "shenlun": {}}
    out = process.sanitize("时评", data, BODY2)
    assert out["domain"] == "其他"


def test_sanitize_shenlun_keeps_verified():
    data = {
        "structure": [], "methods": [], "quotes": [], "domain": "基层治理",
        "shenlun": {
            "sentence": "民生无小事，枝叶总关情",  # 原文逐字 → 保留
            "title": "把群众小事当成大事来办",
            "case": "王磊带领村民种植猕猴桃",  # 与原文重合 → 保留
        },
    }
    out = process.sanitize("时评", data, BODY2)
    assert out["shenlun"]["sentence"] == "民生无小事，枝叶总关情"
    assert out["shenlun"]["title"] == "把群众小事当成大事来办"
    assert "王磊" in out["shenlun"]["case"]


def test_sanitize_shenlun_drops_fabricated():
    data = {
        "shenlun": {
            "sentence": "这句话原文里压根没有出现过",  # 非原文 → 丢
            "title": "标题保留",
            "case": "纯属编造的事例",  # 与原文无重合 → 丢
        }
    }
    out = process.sanitize("时评", data, BODY2)
    assert "sentence" not in out["shenlun"]
    assert "case" not in out["shenlun"]
    assert out["shenlun"]["title"] == "标题保留"


class _FakeLLM:
    """mock LLM：不打真实 API，顺便断言领域清单写进了 prompt。"""

    enabled = True

    def __init__(self, payload):
        self.payload = payload

    def complete(self, system, user):
        assert "经济发展" in user and "其他" in user  # 领域清单写死在 prompt 里
        return json.dumps(self.payload, ensure_ascii=False)


def test_process_item_domain_normalized_via_llm():
    item = {"title": "评论", "link": "l", "source": "s", "category": "时评", "body": BODY2}
    llm = _FakeLLM({"structure": [], "methods": [], "quotes": [], "domain": "量子速读"})
    out = process.process_item(item, llm)
    assert out["degraded"] is False
    assert out["result"]["domain"] == "其他"  # 清单外归其他
    assert out["result"]["shenlun"] == {}  # 无三件套 → 空对象


def test_degrade_has_domain_but_no_shenlun():
    item = {"title": "评论", "link": "l", "source": "s", "category": "时评", "body": BODY2}
    out = process.degrade(item, "时评")
    assert out["result"]["domain"] == "其他"
    assert "shenlun" not in out["result"]


# ---------- 装配：三件套 + 领域 ----------
def test_build_daily_shenlun_and_domains():
    items = [
        _proc_item("人物", title="王磊", result={"themes": ["青年返乡"], "usage": "用法", "domain": "乡村振兴"}),
        _proc_item("时评", title="把小事办成大事", result={
            "structure": ["点题"], "quotes": ["民生无小事"], "domain": "基层治理",
            "shenlun": {"sentence": "民生无小事，枝叶总关情", "title": "把群众小事当大事", "case": "王磊带领村民种植猕猴桃"},
        }),
    ]
    daily = build_content.build_daily(items, "2026-07-29")
    assert daily["shenlun"] == {
        "sentence": "民生无小事，枝叶总关情",
        "title": "把群众小事当大事",
        "case": "王磊带领村民种植猕猴桃",
    }
    assert daily["cases"][0]["domain"] == "乡村振兴"
    assert daily["article"]["domain"] == "基层治理"


def test_build_daily_degraded_shenlun_empty_domain_fallback():
    items = [
        _proc_item("人物", title="某案例", result={"themes": [], "usage": ""}),  # 无 domain
        _proc_item("时评", title="某评论", result={"structure": [], "quotes": []}),  # 降级：无 shenlun
    ]
    daily = build_content.build_daily(items, "2026-07-29")
    assert daily["shenlun"] == {}
    assert daily["cases"][0]["domain"] == "其他"
    assert daily["article"]["domain"] == "其他"


# ---------- 案例归档：累积追加与去重 ----------
def test_archive_id_stable():
    a = build_content._archive_id({"url": "http://a", "title": "t"})
    b = build_content._archive_id({"url": "http://a", "title": "t"})
    c = build_content._archive_id({"url": "", "title": "t"})
    assert a == b and a != c and len(a) == 12


def test_archive_append_dedup_accumulate(tmp_path, monkeypatch):
    monkeypatch.setattr(build_content, "CONTENT", tmp_path)
    daily1 = {
        "cases": [
            {"title": "案例A", "summary": "甲", "domain": "乡村振兴", "source": "新华社", "url": "http://a"},
            {"title": "案例B", "summary": "乙", "domain": "其他", "source": "人民日报", "url": ""},
        ]
    }
    build_content.build_case_archive(daily1, "2026-07-29")
    path = tmp_path / "archive" / "cases.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert len(data) == 2
    assert data[0]["id"] and data[0]["date"] == "2026-07-29"
    assert data[0]["domain"] == "乡村振兴"
    assert data[0]["text"] == "甲"
    assert data[1]["url"] == ""

    # 跨天累积：同 url 不重复、无 url 同 title 不重复、新案例追加
    daily2 = {
        "cases": [
            {"title": "案例A改了名", "summary": "甲2", "domain": "乡村振兴", "source": "新华社", "url": "http://a"},
            {"title": "案例B", "summary": "乙2", "domain": "其他", "source": "人民日报", "url": ""},
            {"title": "案例C", "summary": "丙", "domain": "科技创新", "source": "求是网", "url": "http://c"},
        ]
    }
    build_content.build_case_archive(daily2, "2026-07-30")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert [x["title"] for x in data] == ["案例A", "案例B", "案例C"]
    assert data[2]["date"] == "2026-07-30"
    assert data[2]["domain"] == "科技创新"


# ---------- 时评：逐段结构拆解 outline ----------
def test_sanitize_outline_keeps_valid():
    data = {
        "structure": [], "methods": [], "quotes": [],
        "outline": [
            {"role": "引论·现象切入", "gist": "返乡青年王磊带领村民种植猕猴桃，人均年收入翻了一番"},
            {"role": "结尾·升华", "gist": "基层治理要把群众小事当成大事来办"},
        ],
    }
    out = process.sanitize("时评", data, BODY2)
    assert [s["role"] for s in out["outline"]] == ["引论·现象切入", "结尾·升华"]
    assert out["outline"][0]["gist"].startswith("返乡青年王磊")


def test_sanitize_outline_drops_bad_items():
    data = {
        "outline": [
            {"role": "", "gist": "王磊返乡种猕猴桃"},  # role 空 → 丢
            {"role": "引论", "gist": ""},  # gist 空 → 丢
            {"role": "引论", "gist": "王磊返乡种猕猴桃，" + "乡亲" * 100},  # gist 超 120 字 → 丢
            {"role": "分论点", "gist": "马斯克宣布火星移民计划取得重大突破性进展"},  # 与原文零重合 → 丢
            {"role": "结尾", "gist": "民生无小事，枝叶总关情"},  # 合规 → 保留
            "不是对象",  # 非 dict → 丢
        ]
    }
    out = process.sanitize("时评", data, BODY2)
    assert out["outline"] == [{"role": "结尾", "gist": "民生无小事，枝叶总关情"}]


def test_sanitize_outline_all_bad_falls_back_empty():
    data = {"outline": [{"role": "引论", "gist": "纯属编造与原文毫无干系的段落大意"}]}
    out = process.sanitize("时评", data, BODY2)
    assert out["outline"] == []
    # 非列表输入同样降级为空数组，不崩溃
    assert process.sanitize("时评", {"outline": None}, BODY2)["outline"] == []
    assert process.sanitize("时评", {}, BODY2)["outline"] == []


def test_degrade_shiping_outline_empty():
    item = {"title": "评论", "link": "l", "source": "s", "category": "时评", "body": BODY2}
    out = process.degrade(item, "时评")
    assert out["result"]["outline"] == []


def test_process_item_outline_via_llm():
    item = {"title": "评论", "link": "l", "source": "s", "category": "时评", "body": BODY2}
    llm = _FakeLLM({
        "structure": [], "methods": [], "quotes": [], "domain": "乡村振兴",
        "outline": [
            {"role": "引论·现象切入", "gist": "王磊带领村民种植猕猴桃"},
            {"role": "分论点", "gist": "火星移民计划取得突破"},  # 编造 → sanitize 剔除
        ],
    })
    out = process.process_item(item, llm)
    assert out["degraded"] is False
    assert out["result"]["outline"] == [{"role": "引论·现象切入", "gist": "王磊带领村民种植猕猴桃"}]


# ---------- 装配：outline 进 article ----------
def test_build_daily_article_outline():
    items = [
        _proc_item("时评", title="把小事办成大事", result={
            "structure": ["点题"], "quotes": [], "domain": "基层治理",
            "outline": [{"role": "引论·现象切入", "gist": "王磊返乡种猕猴桃"}],
        }),
    ]
    daily = build_content.build_daily(items, "2026-07-29")
    assert daily["article"]["outline"] == [{"role": "引论·现象切入", "gist": "王磊返乡种猕猴桃"}]


def test_build_daily_article_outline_missing_defaults_empty():
    items = [
        _proc_item("时评", title="某评论", result={"structure": [], "quotes": []}),  # 旧加工产物无 outline
    ]
    daily = build_content.build_daily(items, "2026-07-29")
    assert daily["article"]["outline"] == []
    # 无时评时 article 为空对象
    assert build_content.build_daily([], "2026-07-29")["article"] == {}
