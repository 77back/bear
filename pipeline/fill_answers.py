#!/usr/bin/env python3
"""为主观题（kind=qa 且 answer 为空）生成参考答案草案，供人工审查后并入 card_patches.json。

用法：
    cd bear-prep/pipeline
    set OPENAI_API_KEY=... & set OPENAI_BASE_URL=... & set OPENAI_MODEL=...  （环境变量，严禁写入文件）
    PYTHONIOENCODING=utf-8 .venv/Scripts/python fill_answers.py

产物：processed/fill_answers_draft.json —— {id: {"answer": ..., "analysis": ...}}。
- 响应缓存在 processed/fillcache/{id}.txt，重跑不再调用 LLM；
- 生成规则：答案以「AI参考：」开头；拟标题题给 3 个不同风格示例标题；消息/导语题给
  示范导语+结构要点；采访/报道策划题给要点框架；评论题给论点提纲+关键论据方向；
  公文题给格式要点+示范正文；整体精炼（单要点条目 ≤200 字），供考生对照自评而非满分范文。
- 本脚本只产出草案，不改 cards，也不直接写 card_patches.json（人工审查后并入）。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_media_cards import LLMClient  # noqa: E402  环境变量配置

ROOT = Path(__file__).resolve().parent
CARDS_DIR = ROOT.parent / "content" / "cards"
CACHE_DIR = ROOT / "processed" / "fillcache"
DRAFT_PATH = ROOT / "processed" / "fill_answers_draft.json"

# 需要 AI 参考答案的 qa 卡（analysis 无可用内容、题干完整的回忆版主观题）
TARGETS = [
    "rmrb-2018-031",
    "rmrb-2019-091", "rmrb-2019-092", "rmrb-2019-093",
    *[f"rmrb2-2023-cb-{i:03d}" for i in (1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25)],
    "rmrb2-2023-zh-023", "rmrb2-2023-zh-024",
    *[f"rmrb2-2024-cb-{i:03d}" for i in range(1, 10)],
    *[f"rmrb2-2025-cb-{i:03d}" for i in (11, 12, 13, 14, 16, 18, 19)],
    *[f"rmrb2-2025-zh-{i:03d}" for i in (14, 15, 16, 17, 18, 19, 21, 22, 23, 24)],
    "xhs-2-494",
    "zt-guan-2023-062",
]

SYSTEM = "你是媒体机构（人民日报社、中央广播电视总台、新华社）招聘笔试的辅导老师，" \
         "擅长新闻实务与综合管理类主观题。你只输出题目要求的参考答案，不输出其他文字。"

RULES = """请为上面的主观题生成供考生写完对照自评的参考答案，要求：
1. 答案必须以「AI参考：」开头（标识为 AI 生成、非官方答案）；
2. 按题型给内容：拟标题题给 3 个不同风格示例标题；消息/短讯/导语题给示范导语或示范
   消息正文+结构要点；采访提纲/报道策划题给要点框架（报道主题/采访对象/核心问题/报道
   角度/形式）；评论/议论文题给论点提纲+关键论据方向+示例开头；简述/论述题给得分要点
   框架；公文题给格式要点+规范示范正文；翻译题给示范译文；
3. 精炼实用：单条要点不超过 200 字，整体一般不超过 600 字，多小题可按小题分点；
4. 政治导向正确，贴合人民日报风格与主流价值观；不编造具体数据、人名、出处；
5. 不要重复题干，不要解释你在做什么。

输出 JSON：{"answer": "AI参考：……", "analysis": "一句答题要点提示（可为空字符串）"}"""


def load_cards() -> dict[str, dict]:
    out = {}
    for f in sorted(CARDS_DIR.glob("cards-*.json")):
        for c in json.loads(f.read_text(encoding="utf-8")):
            out[c["id"]] = c
    return out


def gen_one(llm: LLMClient, card: dict) -> dict | None:
    cache = CACHE_DIR / f"{card['id']}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    raw = llm.complete(SYSTEM, f"题目：\n{card['stem']}\n\n{RULES}")
    # 健壮解析：```json 块或首个 { 到末个 }
    import re
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    cand = m.group(1) if m else None
    if cand is None:
        s, e = raw.find("{"), raw.rfind("}")
        cand = raw[s:e + 1] if 0 <= s < e else None
    if cand is None:
        return None
    try:
        data = json.loads(cand)
    except json.JSONDecodeError:
        return None
    ans = (data.get("answer") or "").strip()
    if not ans.startswith("AI参考："):
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def main() -> int:
    llm = LLMClient()
    if not llm.enabled:
        print("未配置 OPENAI_API_KEY，LLM 未启用。", file=sys.stderr)
        return 1
    cards = load_cards()
    draft: dict[str, dict] = {}
    if DRAFT_PATH.exists():
        draft = json.loads(DRAFT_PATH.read_text(encoding="utf-8"))
    ok = fail = 0
    for cid in TARGETS:
        if cid in draft:
            ok += 1
            continue
        card = cards.get(cid)
        if not card:
            print(f"!! {cid} 不存在")
            fail += 1
            continue
        data = gen_one(llm, card)
        if data is None:
            print(f"!! {cid} 生成/解析失败")
            fail += 1
            continue
        draft[cid] = {"answer": data["answer"], "analysis": data.get("analysis") or ""}
        ok += 1
        print(f"[{ok + fail}/{len(TARGETS)}] {cid} 答案 {len(data['answer'])} 字")
    DRAFT_PATH.write_text(json.dumps(draft, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"完成：成功 {ok}，失败 {fail}，LLM 调用 {llm.calls} 次 → {DRAFT_PATH}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
