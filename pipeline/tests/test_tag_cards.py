"""tag_cards 的单元测试：分批 / 词表校验 / 缓存命中 / 插入位置 / 幂等。假 LLM，不打真实 API。"""

import json

import tag_cards as tc


def _card(cid, tags, stem="某题题干内容？", answer="某答案", options=None):
    c = {"id": cid, "kind": "single", "stem": stem, "answer": answer,
         "analysis": "", "tags": list(tags)}
    if options:
        c["options"] = options
    return c


# ---------------------------------------------------------------- 分组与词表

def test_primary_group():
    assert tc.primary_group("时政") == "时政"
    assert tc.primary_group("行测常识") == "行测常识"
    assert tc.primary_group("行测-常识") == "行测常识"
    assert tc.primary_group("行测-言语") == "行测常识"
    assert tc.primary_group("媒体常识") == "媒体常识"
    assert tc.primary_group("新闻实务") == "新闻实务"
    assert tc.primary_group("未知标签") is None
    assert tc.primary_group("") is None


def test_needs_tag_and_apply_position():
    c = _card("x-001", ["媒体常识", "新华社"])
    assert tc.needs_tag(c)
    tc.apply_label(c, "机构历史")
    assert c["tags"] == ["媒体常识", "机构历史", "新华社"]  # tags[0] 不动，原标签顺移
    assert not tc.needs_tag(c)                              # 幂等：已打标跳过


# ---------------------------------------------------------------- 分批

def test_batch_cards():
    cards = [_card(f"x-{i:03d}", ["时政"]) for i in range(95)]
    batches = tc.batch_cards(cards, 40)
    assert [len(b) for b in batches] == [40, 40, 15]


# ---------------------------------------------------------------- 返回解析与词表校验

def test_parse_tag_json_markdown_and_chatter():
    raw = '结果如下：\n```json\n{"x-001": "法律", "x-002": "经济"}\n```\n完毕。'
    labels, invalid = tc.parse_tag_json(raw, {"x-001", "x-002"}, "行测常识")
    assert labels == {"x-001": "法律", "x-002": "经济"}
    assert invalid == 0


def test_parse_tag_json_vocab_enforced():
    raw = '{"x-001": "法律", "x-002": "编造的词", "x-999": "经济", "x-003": 123}'
    labels, invalid = tc.parse_tag_json(raw, {"x-001", "x-002", "x-003"}, "行测常识")
    assert labels == {"x-001": "法律"}   # 词表外/未知 id/非字符串全部剔除
    assert invalid == 1                  # 仅词表外返回记数


def test_parse_tag_json_broken():
    assert tc.parse_tag_json("没有 JSON", {"x"}, "时政") == ({}, 0)
    assert tc.parse_tag_json('{"x-001": "法律"', {"x-001"}, "行测常识") == ({}, 0)


# ---------------------------------------------------------------- 全流程（假 LLM）

class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.calls = 0
        self.prompts = []

    def complete(self, system, user):
        self.calls += 1
        self.prompts.append(user)
        return self.reply if callable(self.reply) is False else self.reply(user)


def _setup_dir(tmp_path):
    cards_dir = tmp_path / "cards"
    cards_dir.mkdir()
    files = {
        "cards-aa.json": [
            _card("aa-001", ["时政"], stem="党的二十届三中全会通过了什么决定？"),
            _card("aa-002", ["时政"], stem="2026年1月我国哪艘智能船舶投入商业运营？"),
        ],
        "cards-bb.json": [
            _card("bb-001", ["媒体常识", "新华社"], stem="新华社前身是什么？"),
            _card("bb-002", ["行测-言语"], stem="下列词语中没有错别字的一项是",
                  options={"A": "甲", "B": "乙"}),
            _card("bb-003", ["新闻实务", "人民日报"], stem="新闻采访的首要环节是什么？"),
            _card("bb-004", ["媒体常识", "机构历史", "新华社"], stem="已打标的卡？"),
        ],
    }
    for fname, cards in files.items():
        (cards_dir / fname).write_text(json.dumps(cards, ensure_ascii=False), encoding="utf-8")
    index = [
        {"key": "aa", "institution": "时政押题", "doc": "d1", "count": 2,
         "reliability": "押题", "tags": ["时政"]},
        {"key": "bb", "institution": "新华社", "doc": "d2", "count": 4,
         "reliability": "机构题库", "tags": ["新华社"]},
    ]
    (cards_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    return cards_dir


def _reply(user):
    # 从 prompt 中抽出题目列表，按该批一级标签回固定合法二级标签
    start = user.find('[{"id"')
    end = user.find("]", start) + 1
    items = json.loads(user[start:end])
    label = {"时政": "会议与文件", "媒体常识": "机构历史", "新闻实务": "新闻理论"}[items[0]["primary"]]
    return json.dumps({it["id"]: label for it in items}, ensure_ascii=False)


def test_run_end_to_end_and_idempotent(tmp_path):
    cards_dir = _setup_dir(tmp_path)
    cache_dir = tmp_path / "tagcache"
    llm = FakeLLM(_reply)

    stats = tc.run(llm, cards_dir=cards_dir, cache_dir=cache_dir)
    assert stats.llm_calls == 3               # 时政/媒体常识/新闻实务 各 1 批
    assert stats.tagged["时政"] == 2
    assert stats.tagged["媒体常识"] == 1      # bb-001；bb-004 已打标跳过
    assert stats.tagged["行测常识"] == 1      # bb-002 确定性映射，不调 LLM
    assert stats.tagged["新闻实务"] == 1
    assert stats.already == 1                 # bb-004

    bb = {c["id"]: c for c in json.loads((cards_dir / "cards-bb.json").read_text(encoding="utf-8"))}
    assert bb["bb-001"]["tags"] == ["媒体常识", "机构历史", "新华社"]
    assert bb["bb-002"]["tags"] == ["行测-言语", "言语理解"]
    assert bb["bb-003"]["tags"] == ["新闻实务", "新闻理论", "人民日报"]
    assert bb["bb-004"]["tags"] == ["媒体常识", "机构历史", "新华社"]  # 未重复插

    index = json.loads((cards_dir / "index.json").read_text(encoding="utf-8"))
    assert index[0]["tags"] == ["会议与文件"]
    assert index[1]["tags"] == ["机构历史", "言语理解", "新闻理论"]

    # 缓存产物已写盘
    assert len(list(cache_dir.glob("*.json"))) == 3

    # 幂等重跑：全部命中已打标/缓存，LLM 不再调用，tags 不变
    llm2 = FakeLLM(_reply)
    stats2 = tc.run(llm2, cards_dir=cards_dir, cache_dir=cache_dir)
    assert stats2.llm_calls == 0
    assert stats2.already == 6
    bb2 = {c["id"]: c for c in json.loads((cards_dir / "cards-bb.json").read_text(encoding="utf-8"))}
    assert bb2["bb-001"]["tags"] == ["媒体常识", "机构历史", "新华社"]


def test_run_cache_hit_skips_llm(tmp_path):
    cards_dir = _setup_dir(tmp_path)
    cache_dir = tmp_path / "tagcache"
    # 预置时政批缓存：重跑时该批不再调用 LLM
    tc.save_cache("时政", 0, {"aa-001": "会议与文件", "aa-002": "科技成就"}, cache_dir)
    llm = FakeLLM(_reply)
    stats = tc.run(llm, cards_dir=cards_dir, cache_dir=cache_dir)
    assert stats.cache_hits == 1
    assert stats.llm_calls == 2               # 只有媒体常识/新闻实务两批调 LLM
    aa = {c["id"]: c for c in json.loads((cards_dir / "cards-aa.json").read_text(encoding="utf-8"))}
    assert aa["aa-002"]["tags"] == ["时政", "科技成就"]


def test_run_invalid_label_skipped(tmp_path):
    cards_dir = _setup_dir(tmp_path)
    cache_dir = tmp_path / "tagcache"
    llm = FakeLLM(lambda user: '{"aa-001": "瞎编的", "aa-002": "会议与文件"}')
    stats = tc.run(llm, cards_dir=cards_dir, cache_dir=cache_dir)
    assert stats.invalid_label == 1
    aa = {c["id"]: c for c in json.loads((cards_dir / "cards-aa.json").read_text(encoding="utf-8"))}
    assert aa["aa-001"]["tags"] == ["时政"]           # 词表外不乱塞
    assert aa["aa-002"]["tags"] == ["时政", "会议与文件"]
