#!/usr/bin/env python3
"""媒体机构常识问答卡抽取（第二批）：机构资料正文 → DeepSeek LLM → qa 卡。

来源为新华社/总台的企业文化、发展史、战略、政策等叙述性资料（不成题），
用 LLM 按"笔试考点导向"提炼问答卡，写入 content/cards/cards-<key>.json
并按 key 覆盖式合并进 index.json。

运行：
    cd bear-prep/pipeline
    set OPENAI_API_KEY=...  （环境变量提供，严禁写入文件）
    PYTHONIOENCODING=utf-8 .venv/Scripts/python extract_media_cards.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_cards as ec  # noqa: E402  复用 docx_text/pdf_text

BASE_DIR = Path(__file__).resolve().parent.parent          # bear-prep/
SRC_DIR = BASE_DIR.parent / "资料"                          # 熊/资料/
CARDS_DIR = BASE_DIR / "content" / "cards"

RELIABILITY = "机构资料"
CHUNK_SIZE = 6000
CHUNK_OVERLAP = 200
CARDS_PER_CHUNK = "8-15"
CAP_THRESHOLD = 80   # 超过此数量触发精选
CAP_KEEP = 50        # 精选后保留数量


@dataclass
class MediaSource:
    key: str
    institution: str
    doc: str
    relpath: str
    tags: list[str]
    year: int | None = None


SOURCES: list[MediaSource] = [
    MediaSource("mk-xhs-history", "新华社", "新华社发展史",
                "0-新华社企业文化及发展史/中国新华社发展史.docx", ["媒体常识", "新华社"]),
    MediaSource("mk-xhs-culture", "新华社", "新华社企业文化",
                "0-新华社企业文化及发展史/新华社企业文化.docx", ["媒体常识", "新华社"]),
    MediaSource("mk-xhs-intro", "新华社", "新华社简介",
                "0-新华社企业文化及发展史/新华社简介.docx", ["媒体常识", "新华社"]),
    MediaSource("mk-zt-strategy", "总台", "总台发展战略",
                "中央广播电视总台近期广播电视新政策/2025总台发展战略.pdf",
                ["媒体常识", "总台"], year=2025),
    MediaSource("mk-zt-culture", "总台", "总台企业文化",
                "中央广播电视总台近期广播电视新政策/中央广播电视总台（CMG）企业文化全景体系.pdf",
                ["媒体常识", "总台"]),
    MediaSource("mk-zt-policy", "总台", "广电政策变动2024",
                "中央广播电视总台近期广播电视新政策/2024年广播电视文化传媒相关政策变动.docx",
                ["媒体常识", "总台"], year=2024),
]


# ---------------------------------------------------------------- 文本读取/切块

def read_text(path: Path) -> str:
    return ec.docx_text(path) if path.suffix.lower() == ".docx" else ec.pdf_text(path)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """按 size 字切块、重叠 overlap 字；不足一块时原样返回。"""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


# ---------------------------------------------------------------- LLM 客户端

class LLMClient:
    """DeepSeek（OpenAI 兼容）客户端；配置全部来自环境变量。"""

    def __init__(self) -> None:
        self.enabled = False
        self.calls = 0
        key = os.environ.get("OPENAI_API_KEY")
        base = os.environ.get("OPENAI_BASE_URL")
        self.model = os.environ.get("OPENAI_MODEL", "deepseek-chat")
        if not key:
            return
        from openai import OpenAI

        self.client = OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)
        self.enabled = True

    def complete(self, system: str, user: str) -> str:
        last = None
        for _ in range(3):  # 首次 + 重试 2 次
            try:
                resp = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "system", "content": system},
                              {"role": "user", "content": user}],
                    temperature=0.2,
                )
                self.calls += 1
                return resp.choices[0].message.content or ""
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(1.0)
        raise RuntimeError(f"LLM 调用失败: {last}")


SYSTEM_PROMPT = (
    "你是媒体机构招聘笔试的命题专家，擅长从机构资料中提炼考点。"
    "你只输出 JSON，不输出任何其他文字。"
)


def build_user_prompt(doc: str, chunk: str, part: str) -> str:
    return f"""以下是《{doc}》的资料正文{part}。请站在"媒体机构笔试会问什么"的角度，从文中提炼 {CARDS_PER_CHUNK} 张问答卡。

要求：
- 优先具体事实：年份、数字、人物、专有提法、战略名称、组织架构、政策要点；
- 问题必须自足（不依赖"文中/该资料"等上下文指代），像真正的笔试题；
- 答案简明准确，直接取自原文，不要编造；
- 不要出"这篇文章讲了什么"之类的泛泛问题；
- 以 JSON 数组返回，格式：[{{"stem":"问题","answer":"答案","analysis":"补充背景（可空字符串）"}}]

资料正文：
{chunk}"""


# ---------------------------------------------------------------- 返回解析/去重/精选

def parse_cards_json(raw: str) -> list[dict]:
    """健壮解析 LLM 返回：```json 包裹 / 前后废话 / 首个 [ 到末个 ]。

    返回合法卡（含非空 stem/answer 的 dict）列表；整体解析失败返回 []。
    """
    m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", raw, re.S)
    candidate = m.group(1) if m else None
    if candidate is None:
        start, end = raw.find("["), raw.rfind("]")
        if 0 <= start < end:
            candidate = raw[start:end + 1]
    if candidate is None:
        return []
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        stem = str(item.get("stem") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if len(stem) < 6 or not answer:
            continue
        out.append({"stem": stem, "answer": answer,
                    "analysis": str(item.get("analysis") or "").strip()})
    return out


def _norm_stem(stem: str) -> str:
    return re.sub(r"[\s　，。、？?：:（）()\"“”'‘’]+", "", stem)


def dedupe_cards(cards: list[dict]) -> list[dict]:
    """按归一化 stem 去重，保留先出现者。"""
    seen: set[str] = set()
    out = []
    for c in cards:
        key = _norm_stem(c["stem"])
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _fact_density(card: dict) -> int:
    """事实密度：数字串个数 + 书名号/引号专有提法个数 + 有无补充背景。"""
    text = card["stem"] + card["answer"]
    score = len(re.findall(r"\d+", text))
    score += len(re.findall(r"[《“「]", text))
    score += 1 if card.get("analysis") else 0
    return score


def cap_cards(cards: list[dict], threshold: int = CAP_THRESHOLD,
              keep: int = CAP_KEEP) -> list[dict]:
    """超过 threshold 张时按事实密度精选 keep 张（保持原顺序输出）。"""
    if len(cards) <= threshold:
        return cards
    ranked = sorted(range(len(cards)), key=lambda i: _fact_density(cards[i]),
                    reverse=True)
    picked = sorted(ranked[:keep])
    return [cards[i] for i in picked]


# ---------------------------------------------------------------- 抽取主流程

@dataclass
class ExtractStats:
    chunks: int = 0
    parse_failed: int = 0
    dedup_dropped: int = 0
    capped: int = 0
    warnings: list[str] = field(default_factory=list)


def extract_source_cards(text: str, src: MediaSource, llm,
                         stats: ExtractStats) -> list[dict]:
    """单源：切块 → LLM → 解析 → 去重 → 精选。llm 为 complete(system, user) 可调用对象。"""
    chunks = chunk_text(text)
    stats.chunks += len(chunks)
    raw_cards: list[dict] = []
    for i, chunk in enumerate(chunks):
        part = f"（第 {i + 1}/{len(chunks)} 部分）" if len(chunks) > 1 else ""
        raw = llm.complete(SYSTEM_PROMPT, build_user_prompt(src.doc, chunk, part))
        cards = parse_cards_json(raw)
        if not cards:
            stats.parse_failed += 1
            stats.warnings.append(f"{src.key} 块{i + 1}：LLM 返回无法解析，已跳过")
        raw_cards.extend(cards)
    cards = dedupe_cards(raw_cards)
    stats.dedup_dropped += len(raw_cards) - len(cards)
    capped = cap_cards(cards)
    stats.capped += len(cards) - len(capped)
    return capped


def to_card(src: MediaSource, seq: int, item: dict) -> dict:
    return {
        "id": f"{src.key}-{seq:03d}",
        "kind": "qa",
        "stem": item["stem"],
        "answer": item["answer"],
        "analysis": item.get("analysis", ""),
        "tags": list(src.tags),
        "source": {
            "institution": src.institution,
            "doc": src.doc,
            "year": src.year,
            "reliability": RELIABILITY,
        },
    }


def merge_index(new_entries: list[dict]) -> None:
    """按 key 覆盖式合并进 index.json，不动其他条目。"""
    index_path = CARDS_DIR / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    new_keys = {e["key"] for e in new_entries}
    index = [e for e in index if e["key"] not in new_keys] + new_entries
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")


def main() -> int:
    llm = LLMClient()
    if not llm.enabled:
        print("未配置 OPENAI_API_KEY 环境变量，无法调用 LLM。", file=sys.stderr)
        print("请先 set OPENAI_API_KEY=... （及 OPENAI_BASE_URL / OPENAI_MODEL）后重试。",
              file=sys.stderr)
        return 1

    stats = ExtractStats()
    index_entries: list[dict] = []
    for src in SOURCES:
        path = SRC_DIR / src.relpath
        if not path.exists():
            stats.warnings.append(f"{src.key}：文件不存在 {path}")
            continue
        text = read_text(path)
        if len(text.strip()) < 100:
            stats.warnings.append(f"{src.key}：文本过短（{len(text)} 字），疑似扫描件或空文档，已跳过")
            continue
        items = extract_source_cards(text, src, llm, stats)
        cards = [to_card(src, i + 1, item) for i, item in enumerate(items)]
        (CARDS_DIR / f"cards-{src.key}.json").write_text(
            json.dumps(cards, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        index_entries.append({
            "key": src.key, "institution": src.institution, "doc": src.doc,
            "count": len(cards), "reliability": RELIABILITY, "tags": list(src.tags),
        })
        print(f"[{src.key}] {src.doc} → {len(cards)} 张")
        for c in cards[:2]:
            print(f"  样例 {c['id']} {c['stem'][:40]}… 答案:{c['answer'][:30]}")

    if index_entries:
        merge_index(index_entries)
    print(f"\n== LLM 调用 {llm.calls} 次；解析失败块 {stats.parse_failed}；"
          f"去重丢弃 {stats.dedup_dropped}；精选丢弃 {stats.capped}")
    for w in stats.warnings:
        print(f"  警告：{w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
