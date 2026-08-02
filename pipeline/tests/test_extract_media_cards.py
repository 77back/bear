"""extract_media_cards 的单元测试：JSON 健壮解析 / 去重 / 切块 / 假 LLM 全流程。

不打真实 API——LLMClient 与 extract_source_cards 的 llm 参数均可替换。
"""

import extract_media_cards as em


# ---------------------------------------------------------------- JSON 健壮解析

def test_parse_plain_array():
    raw = '[{"stem":"新华社前身是什么？","answer":"红色中华通讯社","analysis":"1931年成立"}]'
    cards = em.parse_cards_json(raw)
    assert len(cards) == 1
    assert cards[0]["stem"] == "新华社前身是什么？"
    assert cards[0]["analysis"] == "1931年成立"


def test_parse_markdown_wrapped():
    raw = '好的，以下是卡片：\n```json\n[{"stem":"总台成立于哪一年？","answer":"2018年","analysis":""}]\n```\n希望对你有帮助。'
    cards = em.parse_cards_json(raw)
    assert len(cards) == 1
    assert cards[0]["answer"] == "2018年"


def test_parse_chatter_around_array():
    raw = '以下是提炼结果：[{"stem":"「5G+4K/8K+AI」战略是谁提出的？","answer":"中央广播电视总台","analysis":""}] 以上。'
    cards = em.parse_cards_json(raw)
    assert len(cards) == 1


def test_parse_invalid_json_returns_empty():
    assert em.parse_cards_json("这不是 JSON") == []
    assert em.parse_cards_json('[{"stem":" broken, }]') == []
    assert em.parse_cards_json("") == []


def test_parse_filters_bad_items():
    raw = '''[
      {"stem":"新华社社长是谁？","answer":"傅华","analysis":""},
      {"stem":"短","answer":"x"},
      {"stem":"没有答案的问题？","answer":"","analysis":""},
      {"stem":123,"answer":null},
      "not-a-dict"
    ]'''
    cards = em.parse_cards_json(raw)
    assert len(cards) == 1
    assert cards[0]["answer"] == "傅华"


def test_parse_object_instead_of_array():
    assert em.parse_cards_json('{"stem":"x","answer":"y"}') == []


# ---------------------------------------------------------------- 去重

def test_dedupe_by_normalized_stem():
    cards = [
        {"stem": "新华社成立于哪一年？", "answer": "1931年"},
        {"stem": "新华社成立于哪一年?", "answer": "1931"},          # 标点差异
        {"stem": "新华社 成立于 哪一年？", "answer": "1931"},        # 空白差异
        {"stem": "总台成立于哪一年？", "answer": "2018年"},
    ]
    out = em.dedupe_cards(cards)
    assert len(out) == 2
    assert out[0]["answer"] == "1931年"  # 保留先出现者


# ---------------------------------------------------------------- 切块

def test_chunk_short_text_single():
    assert em.chunk_text("x" * 100) == ["x" * 100]
    assert em.chunk_text("") == []


def test_chunk_overlap_and_coverage():
    text = "".join(chr(0x4E00 + i % 1000) for i in range(13000))
    chunks = em.chunk_text(text, size=6000, overlap=200)
    assert len(chunks) == 3  # 6000 + 5800 + 1200
    assert chunks[0] == text[:6000]
    assert chunks[1] == text[5800:11800]
    assert chunks[2] == text[11600:]
    # 重叠区内容一致
    assert chunks[0][-200:] == chunks[1][:200]


# ---------------------------------------------------------------- 精选

def test_cap_cards_keeps_dense_ones():
    cards = [{"stem": f"问题{i}？", "answer": "答案", "analysis": ""} for i in range(90)]
    # 给前 60 张加数字提高事实密度
    for i in range(60):
        cards[i]["answer"] = f"193{i}年成立"
    out = em.cap_cards(cards, threshold=80, keep=50)
    assert len(out) == 50
    assert all("193" in c["answer"] for c in out)   # 高密度者留下
    nums = [int(c["stem"].removeprefix("问题").rstrip("？")) for c in out]
    assert nums == sorted(nums)  # 保持原顺序
    under = em.cap_cards(cards[:70], threshold=80, keep=50)
    assert len(under) == 70  # 未超阈值不动


# ---------------------------------------------------------------- 假 LLM 全流程

class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def complete(self, system, user):
        self.calls += 1
        return self.replies.pop(0)


def _src():
    return em.MediaSource("mk-test", "新华社", "测试资料", "x.docx", ["媒体常识", "新华社"])


def test_extract_source_cards_end_to_end():
    llm = FakeLLM([
        '[{"stem":"新华社前身是什么？","answer":"红色中华通讯社","analysis":"1931年"},'
        ' {"stem":"新华社成立于哪一年？","answer":"1931年11月7日","analysis":""}]',
        '[{"stem":"新华社成立于哪一年?","answer":"1931年","analysis":""}]',  # 与上块重复
    ])
    stats = em.ExtractStats()
    text = "甲" * 6100  # 触发切成 2 块
    cards = em.extract_source_cards(text, _src(), llm, stats)
    assert stats.chunks == 2
    assert llm.calls == 2
    assert len(cards) == 2            # 重复卡被去重
    assert stats.dedup_dropped == 1
    assert stats.parse_failed == 0


def test_extract_counts_unparseable_chunk():
    llm = FakeLLM(["抱歉，我无法理解这段文字。", '[{"stem":"总台成立于哪一年？","answer":"2018年","analysis":""}]'])
    stats = em.ExtractStats()
    cards = em.extract_source_cards("乙" * 6100, _src(), llm, stats)
    assert stats.parse_failed == 1
    assert len(cards) == 1
    assert any("无法解析" in w for w in stats.warnings)


def test_to_card_schema():
    src = em.MediaSource("mk-zt-strategy", "总台", "总台发展战略", "x.pdf",
                         ["媒体常识", "总台"], year=2025)
    card = em.to_card(src, 7, {"stem": "总台战略是什么？", "answer": "「5G+4K/8K+AI」战略", "analysis": ""})
    assert card["id"] == "mk-zt-strategy-007"
    assert card["kind"] == "qa"
    assert "options" not in card
    assert card["source"] == {"institution": "总台", "doc": "总台发展战略",
                              "year": 2025, "reliability": "机构资料"}
    assert card["tags"] == ["媒体常识", "总台"]


def test_llm_client_disabled_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = em.LLMClient()
    assert not client.enabled
