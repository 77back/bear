#!/usr/bin/env python3
"""一次性排查：扫描 content/cards/cards-*.json 中的疑似坏卡。

检测两类解析粘连：
1. 选项文本含「参考答案 / 本题解释 / 解析：」等答案区标记；
2. 选项包含题干前 20 字（整题重复粘进选项）。

只报告，不修改。运行：PYTHONIOENCODING=utf-8 .venv/Scripts/python probe_bad_options.py
"""
import glob
import json
import re
from pathlib import Path

CARDS_DIR = Path(__file__).resolve().parent.parent / "content" / "cards"

ANSWER_MARK = re.compile(r"参考答案|本题解释|解析[:：]")


def main() -> None:
    hits: list[tuple[str, str, str]] = []  # (card_id, 类别, 摘要)
    for path in sorted(glob.glob(str(CARDS_DIR / "cards-*.json"))):
        cards = json.loads(Path(path).read_text(encoding="utf-8"))
        for c in cards:
            options = c.get("options") or {}
            stem_prefix = re.sub(r"\s+", "", c.get("stem", ""))[:20]
            for letter, text in sorted(options.items()):
                if ANSWER_MARK.search(text):
                    hits.append((c["id"], "选项含答案区标记",
                                 f"{letter}: {text[:60]}"))
                elif stem_prefix and len(stem_prefix) >= 20 and \
                        stem_prefix in re.sub(r"\s+", "", text):
                    hits.append((c["id"], "选项重复题干",
                                 f"{letter}: {text[:60]}"))
    print(f"共命中 {len(hits)} 处：")
    for cid, kind, snippet in hits:
        print(f"  {cid} [{kind}] {snippet}")


if __name__ == "__main__":
    main()
