#!/usr/bin/env python3
"""二级考点打标：DeepSeek 批量给 content/cards/ 全部卡片追加二级标签。

规则：
- tags[0] 一级标签不动；二级标签插到 tags[1]，原其余标签顺移；
- 二级标签只能从固定词表选（按一级标签分词表），词表外返回跳过；
- tags[1] 已是词表内标签的卡跳过（幂等）；
- 行测-言语/数量/判断/资料 的二级标签确定性映射，不调用 LLM；
- LLM 结果按批缓存到 pipeline/processed/tagcache/，重跑不再调用。

运行：
    cd bear-prep/pipeline
    set OPENAI_API_KEY=...  （环境变量提供，严禁写入文件）
    PYTHONIOENCODING=utf-8 .venv/Scripts/python tag_cards.py
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_media_cards import LLMClient  # noqa: E402  环境变量配置，与 process.py 一致

BASE_DIR = Path(__file__).resolve().parent.parent
CARDS_DIR = BASE_DIR / "content" / "cards"
CACHE_DIR = Path(__file__).resolve().parent / "processed" / "tagcache"

BATCH_SIZE = 40

# 一级标签 → 二级词表（固定，不许造词）
PRIMARY_VOCAB: dict[str, list[str]] = {
    "时政": ["会议与文件", "领导人活动", "科技成就", "经济金融",
             "民生政策", "外交国际", "文化体育", "生态与乡村"],
    "行测常识": ["政治理论", "法律", "经济", "历史人文", "科技常识", "地理国情",
                 "公文", "管理", "言语理解", "数量关系", "判断推理", "资料分析"],
    "媒体常识": ["机构历史", "机构业务与平台", "战略与政策", "行业规范", "企业文化"],
    "新闻实务": ["新闻理论", "采访写作", "编辑评论", "策划", "媒体融合", "广告经营"],
}

# 行测-* 细分一级标签：二级直接确定，不必问 LLM
DETERMINISTIC: dict[str, str] = {
    "行测-言语": "言语理解",
    "行测-数量": "数量关系",
    "行测-判断": "判断推理",
    "行测-资料": "资料分析",
}

VOCAB_UNION: set[str] = {w for words in PRIMARY_VOCAB.values() for w in words}


def primary_group(tag0: str) -> str | None:
    """tags[0] → 词表组名；不在四个一级标签体系内返回 None。"""
    if tag0 in PRIMARY_VOCAB:
        return tag0
    if tag0 == "行测常识" or tag0.startswith("行测-"):
        return "行测常识"
    return None


def needs_tag(card: dict) -> bool:
    """tags[1] 已是词表内二级标签 →  False（幂等跳过）。"""
    tags = card.get("tags") or []
    return not (len(tags) > 1 and tags[1] in VOCAB_UNION)


def apply_label(card: dict, label: str) -> None:
    """二级标签插到 tags[1]，tags[0] 不动，其余顺移。"""
    tags = list(card.get("tags") or [])
    tags.insert(1, label)
    card["tags"] = tags


# ---------------------------------------------------------------- 分批与 LLM

def batch_cards(cards: list[dict], size: int = BATCH_SIZE) -> list[list[dict]]:
    """稳定分批：调用方保证输入顺序稳定（按 文件名+id 排序）。"""
    return [cards[i:i + size] for i in range(0, len(cards), size)]


def _card_prompt_text(card: dict) -> str:
    """判断依据：stem + options + answer + analysis（折叠进两个字段发送）。"""
    stem = card.get("stem", "")
    options = card.get("options") or {}
    if options:
        stem += " 选项：" + "；".join(f"{k}.{v}" for k, v in sorted(options.items()))
    answer = card.get("answer", "")
    analysis = card.get("analysis") or ""
    if analysis:
        answer += " 解析：" + analysis[:120]
    return stem, answer


SYSTEM_PROMPT = "你是媒体机构招聘笔试的题库分类专家。你只输出 JSON，不输出任何其他文字。"


def build_tag_prompt(group: str, cards: list[dict]) -> str:
    vocab = " / ".join(PRIMARY_VOCAB[group])
    items = []
    for c in cards:
        stem, answer = _card_prompt_text(c)
        items.append({"id": c["id"], "primary": group, "stem": stem[:300],
                      "answer": answer[:200]})
    return f"""请给下列题目各选一个二级考点标签。

一级标签「{group}」的二级词表（只能从中选，不许造词）：
{vocab}

题目列表（JSON）：
{json.dumps(items, ensure_ascii=False)}

返回 JSON 对象，键为题目 id，值为词表内的二级标签，如 {{"x-001": "标签"}}。每张题都必须给出标签。"""


def parse_tag_json(raw: str, valid_ids: set[str], group: str) -> tuple[dict[str, str], int]:
    """健壮解析 {id: 标签}：```json 块 / 首个 { 到末个 }。

    返回 (合法映射, 词表外返回数)；整体解析失败返回 ({}, 0)。
    """
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    candidate = m.group(1) if m else None
    if candidate is None:
        start, end = raw.find("{"), raw.rfind("}")
        if 0 <= start < end:
            candidate = raw[start:end + 1]
    if candidate is None:
        return {}, 0
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return {}, 0
    if not isinstance(data, dict):
        return {}, 0
    vocab = set(PRIMARY_VOCAB[group])
    out: dict[str, str] = {}
    invalid = 0
    for cid, label in data.items():
        if cid not in valid_ids or not isinstance(label, str):
            continue
        label = label.strip()
        if label in vocab:
            out[cid] = label
        else:
            invalid += 1
    return out, invalid


# ---------------------------------------------------------------- 批缓存

def cache_path(group: str, batch_no: int, cache_dir: Path = CACHE_DIR) -> Path:
    return cache_dir / f"{group}-{batch_no:03d}.json"


def load_cache(group: str, batch_no: int, cache_dir: Path = CACHE_DIR) -> dict[str, str] | None:
    path = cache_path(group, batch_no, cache_dir)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def save_cache(group: str, batch_no: int, labels: dict[str, str],
               cache_dir: Path = CACHE_DIR) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path(group, batch_no, cache_dir).write_text(
        json.dumps(labels, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- 主流程

@dataclass
class TagStats:
    tagged: dict[str, int] = field(default_factory=dict)       # 各组打标成功数（含确定性映射）
    already: int = 0          # 已有二级标签跳过
    no_group: dict[str, int] = field(default_factory=dict)     # 一级标签不在体系内
    invalid_label: int = 0    # 词表外返回
    batch_failed: int = 0     # 重试后仍失败的批
    llm_calls: int = 0
    cache_hits: int = 0
    warnings: list[str] = field(default_factory=list)

    def bump(self, group: str, n: int = 1) -> None:
        self.tagged[group] = self.tagged.get(group, 0) + n


def collect_cards(cards_dir: Path = CARDS_DIR) -> dict[str, list[dict]]:
    """{文件名: [卡]}，文件内保持原顺序。"""
    out: dict[str, list[dict]] = {}
    for f in sorted(cards_dir.glob("cards-*.json")):
        out[f.name] = json.loads(f.read_text(encoding="utf-8"))
    return out


def run(llm, cards_dir: Path = CARDS_DIR, cache_dir: Path = CACHE_DIR,
        batch_size: int = BATCH_SIZE, write: bool = True) -> TagStats:
    stats = TagStats()
    files = collect_cards(cards_dir)
    # 稳定顺序的 (文件名, 卡) 全量列表
    flat = [(fname, c) for fname, cards in files.items() for c in cards]
    flat.sort(key=lambda fc: (fc[0], fc[1]["id"]))

    samples_before: list[tuple[str, list[str]]] = []

    # 1) 确定性映射 + 分组收集（含已打标卡，保证批划分跨运行稳定）
    groups: dict[str, list[dict]] = {}
    for fname, card in flat:
        tags = card.get("tags") or []
        tag0 = tags[0] if tags else ""
        group = primary_group(tag0)
        if group is None:
            stats.no_group[tag0 or "<无>"] = stats.no_group.get(tag0 or "<无>", 0) + 1
            continue
        if tag0 in DETERMINISTIC:
            if not needs_tag(card):
                stats.already += 1
                continue
            if len(samples_before) < 5:
                samples_before.append((card["id"], list(card["tags"])))
            apply_label(card, DETERMINISTIC[tag0])
            stats.bump(group)
            continue
        groups.setdefault(group, []).append(card)
        if not needs_tag(card):
            stats.already += 1

    # 2) LLM 分批打标（对全量组内卡稳定分批 → 批号与缓存跨运行对齐；
    #    批内只对未打标卡发问/贴标）
    for group in sorted(groups):
        for bno, batch in enumerate(batch_cards(groups[group], batch_size)):
            pending = [c for c in batch if needs_tag(c)]
            if not pending:
                continue
            valid_ids = {c["id"] for c in pending}
            labels = load_cache(group, bno, cache_dir)
            if labels is not None:
                stats.cache_hits += 1
            elif llm is None:
                stats.batch_failed += 1
                stats.warnings.append(f"{group} 批{bno}：无缓存且 LLM 未启用，跳过")
                continue
            else:
                labels = {}
                for _ in range(3):  # 首次 + 重试 2 次
                    try:
                        raw = llm.complete(SYSTEM_PROMPT, build_tag_prompt(group, pending))
                        stats.llm_calls += 1
                    except Exception:  # noqa: BLE001
                        continue
                    labels, invalid = parse_tag_json(raw, valid_ids, group)
                    stats.invalid_label += invalid
                    if labels:
                        break
                if not labels:
                    stats.batch_failed += 1
                    continue
                save_cache(group, bno, labels, cache_dir)
            for card in pending:
                label = labels.get(card["id"])
                if label is None:
                    continue
                if len(samples_before) < 5:
                    samples_before.append((card["id"], list(card["tags"])))
                apply_label(card, label)
                stats.bump(group)

    if not write:
        return stats

    # 3) 写回 cards-*.json
    for fname, cards in files.items():
        (cards_dir / fname).write_text(
            json.dumps(cards, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # 4) index.json：每条 entry 的 tags → 该源二级标签去重并集（保持出现顺序）；
    #    卡文件存在但 index 缺条目时（如被 extract_cards.py 重写覆盖）按卡内 source 重建
    index_path = cards_dir / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    known = {e["key"] for e in index}
    for fname, cards in files.items():
        key = fname.removeprefix("cards-").removesuffix(".json")
        if key in known or not cards:
            continue
        src = cards[0].get("source") or {}
        index.append({
            "key": key,
            "institution": src.get("institution", ""),
            "doc": src.get("doc", ""),
            "count": len(cards),
            "reliability": src.get("reliability", ""),
            "tags": [],
        })
        known.add(key)
        print(f"  index 补建条目：{key}")
    for entry in index:
        cards = files.get(f"cards-{entry['key']}.json")
        if cards is None:
            continue
        union: list[str] = []
        for c in cards:
            tags = c.get("tags") or []
            if len(tags) > 1 and tags[1] in VOCAB_UNION and tags[1] not in union:
                union.append(tags[1])
        entry["tags"] = union
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")

    # 5) 报告
    print("== 二级考点打标完成 ==")
    for group in sorted(stats.tagged):
        print(f"  {group}：打标 {stats.tagged[group]}")
    print(f"  已有二级标签跳过：{stats.already}；词表外返回：{stats.invalid_label}；"
          f"批失败：{stats.batch_failed}")
    if stats.no_group:
        print(f"  一级标签不在体系内（整卡跳过）：{stats.no_group}")
    print(f"  LLM 调用 {stats.llm_calls} 次；缓存命中 {stats.cache_hits} 批")
    for w in stats.warnings:
        print(f"  警告：{w}")
    print("  样例（前 → 后）：")
    after = {c["id"]: c for cards in files.values() for c in cards}
    for cid, before in samples_before:
        print(f"    {cid}: {before} → {after[cid]['tags']}")
    return stats


def main() -> int:
    llm = LLMClient()
    if not llm.enabled:
        print("未配置 OPENAI_API_KEY：LLM 未启用，仅有缓存/确定性映射的分组会被打标，"
              "其余批跳过。", file=sys.stderr)
        run(None)
        return 0
    run(llm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
