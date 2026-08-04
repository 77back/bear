"""资料/ 备考 PDF、DOCX → 结构化题目卡片 JSON（content/cards/）。

用法：.venv/Scripts/python extract_cards.py
- PDF 用 pypdf 抽文本；扫描版（时政押题）用 rapidocr 逐页 OCR，
  结果缓存到 pipeline/processed/ocr/<文件名>.txt，存在即读缓存，可重复运行。
- 每个来源文件输出一个 content/cards/cards-<key>.json（卡片数组），
  另输出 content/cards/index.json 汇总。
- 每个来源打印卡片数、kind 分布、样例卡与无法解析的块数；数量异常会 WARN。
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ZILIAO = ROOT.parent.parent / "资料"
OUT_DIR = ROOT.parent / "content" / "cards"
OCR_DIR = ROOT / "processed" / "ocr"

Kind = str  # single | multi | fill | judge | correct | qa


# ---------------------------------------------------------------- 文本工具

def normalize_radicals(text: str) -> str:
    """康熙部首/CJK 部首补充区的兼容字形 → 统一表意文字（如 ⼈→人 ⽇→日）。

    只对 U+2E80..U+2FDF 区间做 NFKC，避免把 ①② 之类的圈号变成普通数字。
    """
    return "".join(
        unicodedata.normalize("NFKC", ch) if 0x2E80 <= ord(ch) <= 0x2FDF else ch
        for ch in text
    )


def pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return normalize_radicals("\n".join((p.extract_text() or "") for p in reader.pages))


def docx_text(path: Path) -> str:
    """标准库 zipfile 读 word/document.xml 去 XML 标签（项目既有用法）。"""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    lines = []
    for para in root.iter(w + "p"):
        lines.append("".join(t.text or "" for t in para.iter(w + "t")))
    return normalize_radicals("\n".join(lines))


def ocr_text(pdf_path: Path) -> str:
    """扫描版 PDF → 文本。优先读 processed/ocr/ 缓存；没有才跑 OCR（约 14s/页）。"""
    cache = OCR_DIR / (pdf_path.stem + ".txt")
    if cache.exists() and cache.stat().st_size > 0:
        return cache.read_text(encoding="utf-8")
    from pypdf import PdfReader
    from rapidocr_onnxruntime import RapidOCR

    OCR_DIR.mkdir(parents=True, exist_ok=True)
    ocr = RapidOCR()
    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    for i, page in enumerate(reader.pages):
        text = ""
        if page.images:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(page.images[0].data)
                tmp_path = tmp.name
            try:
                result, _ = ocr(tmp_path)
                if result:
                    text = "\n".join(line[1] for line in result)
            finally:
                Path(tmp_path).unlink(missing_ok=True)
        else:
            text = page.extract_text() or ""
        parts.append(f"\n=== 第{i + 1}页 ===\n{text}")
        print(f"  OCR {pdf_path.name} p{i + 1}/{len(reader.pages)}", flush=True)
    out = "\n".join(parts)
    cache.write_text(out, encoding="utf-8")
    return out


def is_cjk(ch: str) -> bool:
    return "一" <= ch <= "鿿"


def join_wrap(text: str) -> str:
    """把折行文本并回：CJK 之间直接拼，其他（英文/数字）之间补空格。"""
    lines = [ln.strip().lstrip("￮○●◦· ").strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines:
        return ""
    out = lines[0]
    for ln in lines[1:]:
        if out and is_cjk(out[-1]) and is_cjk(ln[0]):
            out += ln
        else:
            out += " " + ln
    return out.strip()


# C0/C1 控制字符（保留 \n \t）及 Unicode 私有区字符（PDF 文本层私有区残留，如 \x01）
_BAD_RANGES = [(0x00, 0x08), (0x0B, 0x1F), (0x7F, 0x9F),  # C0(保留换行/制表)/C1
               (0xE000, 0xF8FF), (0xF0000, 0xFFFFD), (0x100000, 0x10FFFD)]  # 私有区
BAD_CHARS = re.compile("[" + "".join(f"{chr(lo)}-{chr(hi)}" for lo, hi in _BAD_RANGES) + "]")


def tidy(s: str) -> str:
    s = BAD_CHARS.sub("", s)
    s = re.sub(r"[_＿]{2,}", "", s)  # 下划线填空占位
    s = re.sub(r"[ \t 　]+", " ", s)
    return s.strip()


# ---------------------------------------------------------------- 题块切分

QSTART = re.compile(r"^\s*(\d{1,3})\s*[.、．]{1,2}\s*")
OPT_MARKER = re.compile(r"([A-H])\s*[:：.、．]\s*")
ANSWER_MARK = re.compile(r"【答案】[:：]?|(?:参考)?答案(?:及评分标准[^：:\n]*)?[:：]")
# qa 节里引导“答案区”的行（评分标准/参考范文行可能因折行没有冒号，ANSWER_MARK 认不出）
QA_ANSWER_INTRO = re.compile(r"^(?:评分标准|参考范文|答案要点|答题要点)")
# qa 节标题的折行续行（如“对应位置作答，条理清晰…）”），不是题干
QA_HEADER_WRAP = re.compile(r"^(?:对应位置作答|卡对应位置作答|于\s*\d+\s*字）)")


def split_numbered(lines: list[str], sequential: bool = True, start: int = 1):
    """按 `N.`/`N、`/`N．` 行首切分题块。

    sequential=True 时要求题号严格递增（防把折行里的小数/年份当成新题）。
    返回 (blocks, dropped_lines)；block = (题号, [行])，题号已剥除。
    """
    blocks: list[tuple[int, list[str]]] = []
    dropped = 0
    expected = start
    for ln in lines:
        m = QSTART.match(ln)
        if m:
            n = int(m.group(1))
            if not sequential or n == expected:
                blocks.append((n, [ln[m.end():]]))
                expected = n + 1
                continue
        if blocks:
            blocks[-1][1].append(ln)
        elif ln.strip():
            dropped += 1
    return blocks, dropped


def extract_options(text: str):
    """从题块文本提取 A:/A./A、 选项。字母从 A 起严格递增（允许 OCR 缺项跳字母）。

    返回 (stem, options)；选项少于 2 个时视为无选项。
    """
    picked = []
    for m in OPT_MARKER.finditer(text):
        letter = m.group(1)
        if not picked and letter == "A":
            picked.append(m)
        elif picked and letter > picked[-1].group(1):
            picked.append(m)
    if len(picked) < 2:
        return _extract_inline_options(text)
    stem = tidy(join_wrap(text[: picked[0].start()]))
    options: dict[str, str] = {}
    for i, m in enumerate(picked):
        end = picked[i + 1].start() if i + 1 < len(picked) else len(text)
        options[m.group(1)] = tidy(join_wrap(text[m.end():end]))
    return stem, options


# 内联选项：字母两侧均非英数字（"A xxx B xxx" 或 "B《…》"），区别于 OPT_MARKER 无标点
INLINE_OPT = re.compile(r"(?<![A-Za-z0-9])([A-H])(?![A-Za-z0-9])")


def _extract_inline_options(text: str):
    """拆分空格/标点分隔的内联选项（A xxx B xxx C xxx D xxx）。

    保守策略：候选字母必须恰好按 A→D 连续出现，且 D 之后不再有候选字母
    （选项内容里的杂散字母会导致整个拆分放弃，保证不误拆主观题）。
    """
    picked = []
    want = "A"
    for m in INLINE_OPT.finditer(text):
        if len(picked) >= 4 or m.group(1) != want:
            return tidy(join_wrap(text)), {}
        picked.append(m)
        want = chr(ord(want) + 1)
    if len(picked) != 4:
        return tidy(join_wrap(text)), {}
    stem = tidy(join_wrap(text[: picked[0].start()]))
    options: dict[str, str] = {}
    for i, m in enumerate(picked):
        end = picked[i + 1].start() if i + 1 < len(picked) else len(text)
        options[m.group(1)] = tidy(join_wrap(text[m.end():end]))
    return stem, options


def norm_answer_letters(ans: str) -> str:
    """'A、B' / 'ABD。' → 'ABD'；含非字母内容则原样返回。"""
    letters = "".join(dict.fromkeys(re.findall(r"[A-H]", ans)))
    rest = re.sub(r"[A-H、，,\s.．]", "", ans)
    return letters if letters and not rest else ans.strip()


def norm_judge(ans: str) -> str:
    return {"√": "正确", "×": "错误", "对": "正确", "错": "错误"}.get(ans.strip(), ans.strip())


def infer_kind(answer: str, options: dict, hint: Kind | None) -> Kind:
    if hint:
        return hint
    if answer in ("正确", "错误", "√", "×", "对", "错"):
        return "judge"
    if options and re.fullmatch(r"[A-H]{2,}", answer):
        return "multi"
    if options:
        return "single"
    return "qa"


# ---------------------------------------------------------------- 解析结果

@dataclass
class RawCard:
    kind: Kind
    stem: str
    options: dict = field(default_factory=dict)
    answer: str = ""
    analysis: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass
class ParseResult:
    cards: list[RawCard] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)  # 无法解析块的说明
    missing_answer: int = 0

    def skip(self, reason: str, snippet: str = "") -> None:
        self.skipped.append(f"{reason}：{snippet[:40]}")


# ---------------------------------------------------------------- 解析器 1：内联答案型
# （人民日报一轮 2020-2025 / 总台 2025 管理 / 两个总台 DOCX）
# 块内格式：题干+选项（可折行）→ 答案：X / 【答案】：X / 参考答案：X → 解析：...

@dataclass
class SectionSpec:
    pattern: str          # 行首正则（匹配节标题）
    kind: Kind | None = None   # None=按答案/选项推断
    tags: tuple[str, ...] = () # 覆盖默认 tags
    skip: bool = False    # 该节不抽题（如性格测评）
    passage: bool = False # 节首有共用材料（英语阅读），并入各题题干


def _parse_inline_block(num: int, lines: list[str], kind_hint: Kind | None,
                        tags: list[str], res: ParseResult, prefix: str = "") -> None:
    text = "\n".join(lines)
    m = ANSWER_MARK.search(text)
    if not m and kind_hint == "qa":
        # 作文等：无“答案：”行，但有 评分标准/参考范文 引导的答案区
        mi = re.search(r"(?m)^(?:评分标准|参考范文|答案要点|答题要点)", text)
        if mi:
            stem = prefix + tidy(join_wrap(text[: mi.start()]))
            answer = tidy(join_wrap(text[mi.start():]))
            if len(stem) >= 10:
                res.cards.append(RawCard(kind="qa", stem=stem, answer=answer, tags=tags))
            else:
                res.skip("内联块无答案且过短", stem)
            return
    if not m:
        stem = prefix + tidy(join_wrap(text))
        if len(stem) >= 10:
            res.cards.append(RawCard(kind=kind_hint or "qa", stem=stem, tags=tags))
            res.missing_answer += 1
        else:
            res.skip("内联块无答案且过短", stem)
        return
    ans_raw = text[m.end():].split("\n", 1)[0].strip()
    rest = text[text.find("\n", m.start()) + 1:] if "\n" in text[m.start():] else ""
    # 【答案】：C解析… —— 答案与解析同行的情况
    inline_tail = ans_raw
    m_letters = re.match(r"^([A-H]{1,5})\s*(.*)$", ans_raw)
    if m_letters:
        ans_raw, inline_tail = m_letters.group(1), m_letters.group(2)
    body = text[: m.start()]
    stem, options = extract_options(body)
    stem = prefix + stem

    if kind_hint == "qa":
        answer = tidy(join_wrap(ans_raw + "\n" + inline_tail + "\n" + rest))
        answer = re.sub(r"^(解析|答题思路|参考答案)[:：]?", "", answer).strip()
        res.cards.append(RawCard(kind="qa", stem=stem, options=options, answer=answer, tags=tags))
        return

    man = re.search(r"(?:解析|答案解析|答题思路)[:：]?", inline_tail + "\n" + rest)
    analysis = ""
    if man and (man.group(0).strip("：:") or man.start() > 0):
        analysis = tidy(join_wrap((inline_tail + "\n" + rest)[man.end():]))
    else:
        # 无“解析”字样但答案后有说明文字（如模拟卷直接跟阐释）
        analysis = tidy(join_wrap(inline_tail + "\n" + rest))
    analysis = re.sub(r"^考点[:：\s].*$", "", analysis).strip()
    analysis = re.sub(r"\s*考点[:：\s][^\n]*$", "", analysis).strip()

    answer = norm_answer_letters(ans_raw)
    kind = infer_kind(answer, options, kind_hint)
    if kind == "judge":
        answer = norm_judge(ans_raw)
    if not stem:
        res.skip("内联块题干为空", ans_raw)
        return
    res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                             answer=answer, analysis=analysis, tags=tags))


def parse_inline(text: str, sections: list[SectionSpec], default_tags: list[str],
                 restart: bool = True,
                 sub_sections: list[tuple[str, tuple[str, ...]]] | None = None) -> ParseResult:
    """按节标题切分，节内按题号递增切块，块内找内联答案。

    restart=True 每节题号从 1 重排；False 全文连续编号（人民日报一轮）。
    sub_sections 为 (行首正则, tags)，命中行只切换当前 tags（如 （一）数量关系）。
    """
    res = ParseResult()
    compiled = [(re.compile(s.pattern), s) for s in sections]
    subs = [(re.compile(p), list(t)) for p, t in (sub_sections or [])]

    # 行级上下文：(行, 节id, kind, tags)
    items: list[tuple[str, int, Kind | None, list[str]]] = []
    passages: dict[int, str] = {}
    cur: SectionSpec | None = None
    cur_tags = list(default_tags)
    sec_id = -1
    preamble: list[str] = []
    seen_q = False

    def close_passage() -> None:
        nonlocal preamble
        if cur is not None and cur.passage and preamble:
            text_p = " ".join(
                ln.strip() for ln in preamble
                if ln.strip() and not ln.strip().lower().startswith("directions")
            )
            passages[sec_id] = tidy(text_p)
        preamble = []

    for ln in text.splitlines():
        hit = next((s for rx, s in compiled if rx.match(ln)), None)
        if hit is not None:
            close_passage()
            cur = hit
            sec_id += 1
            cur_tags = list(hit.tags) if hit.tags else list(default_tags)
            seen_q = False
            continue
        sub = next((t for rx, t in subs if rx.match(ln)), None)
        if sub is not None:
            cur_tags = sub
            continue
        if cur is None or cur.skip:
            continue
        if cur.passage and not seen_q and not QSTART.match(ln):
            preamble.append(ln)
            continue
        if cur.kind == "qa" and QA_HEADER_WRAP.match(ln.strip()):
            continue
        if QSTART.match(ln):
            seen_q = True
        items.append((ln, sec_id, cur.kind, list(cur_tags)))
    close_passage()

    # 按题号递增切块（跨节是否清零由 restart 决定）
    # qa 节（简答/作文）题干可能无编号，答案要点反而是 1. 2. 3. 编号：
    # 本节一旦见过答案引导行（参考答案/评分标准/参考范文），编号行一律视为答案要点
    # 不再切新块；除非当前块答案已完整（答案+解析齐全，如事业编简答逐题内联）。
    blocks: list[tuple[int, list[str], Kind | None, list[str]]] = []
    expected = 1
    last_sec = -1
    qa_answer_seen = False
    for ln, sid, kind, tags in items:
        if sid != last_sec:
            if restart:
                expected = 1
            last_sec = sid
            qa_answer_seen = False
        m = QSTART.match(ln)
        if kind == "qa":
            if ANSWER_MARK.search(ln) or QA_ANSWER_INTRO.match(ln.strip()):
                qa_answer_seen = True
            cur_block = blocks[-1] if blocks and blocks[-1][0] == sid else None
            if m and int(m.group(1)) == expected:
                complete = bool(cur_block) and any(
                    ANSWER_MARK.search(x) for x in cur_block[1]
                ) and any(x.strip().startswith("解析") for x in cur_block[1])
                if not qa_answer_seen or complete:
                    blocks.append((sid, [ln[m.end():]], kind, tags))
                    expected += 1
                elif blocks:
                    blocks[-1][1].append(ln)
            elif cur_block is None and ln.strip():
                # qa 节无编号题干：本节首个内容行直接开块（整节一题）
                blocks.append((sid, [ln], kind, tags))
            elif blocks:
                blocks[-1][1].append(ln)
            continue
        if m and int(m.group(1)) == expected:
            blocks.append((sid, [ln[m.end():]], kind, tags))
            expected += 1
        elif blocks:
            blocks[-1][1].append(ln)

    for sid, blines, kind, tags in blocks:
        passage = passages.get(sid, "")
        prefix = (passage + "。") if passage else ""
        _parse_inline_block(0, blines, kind, tags, res, prefix=prefix)
    return res


# ---------------------------------------------------------------- 解析器 2：新华社题库
# 题目在前（一.单选题(共300题)…六.公文写作），答案解析在最后（第 1 卷参考答案），
# 答案块格式：N.参考答案: X + 解析若干行 + 本题所属考点-题库原题。

XHS_SECTION = re.compile(r"^[一二三四五六][.、]\s*(单选题|多选题|填空题|判断题|简答题|公文写作)")
XHS_KIND: dict[str, Kind] = {
    "单选题": "single", "多选题": "multi", "填空题": "fill",
    "判断题": "judge", "简答题": "qa", "公文写作": "qa",
}
XHS_NOISE = re.compile(r"^题型\s+单选题.*统分人$|^得分$|^每套试卷共\s*500\s*题|^全文为\s*Word")


def _clean_xhs_analysis(text: str) -> str:
    """去掉 本题解释:/本题所属考点/重复的 N.参考答案 等噪声行与前缀。"""
    out_lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s:
            continue
        if re.match(r"^本题所属考点", s):
            continue
        s = re.sub(r"^本题解释[:：]?", "", s)
        s = re.sub(r"^\d{1,3}[.、]参考答案[:：]?\s*[A-H]{0,5}\s*$", "", s)
        s = re.sub(r"^【答案】[A-H]{1,5}。?\s*解析[:：]?", "", s)
        s = re.sub(r"^[A-H]{1,5}[，,、]【解析】", "", s)
        s = re.sub(r"^【解析】", "", s)
        s = re.sub(r"^答案解释[:：]?", "", s)
        s = re.sub(r"^答案[:：]\s*[A-H]{1,5}\s*$", "", s)
        s = re.sub(r"^解析[:：]\s*$", "", s)
        if s.strip():
            out_lines.append(s.strip())
    return tidy(join_wrap("\n".join(out_lines)))


def parse_xinhua(text: str, tags: list[str]) -> ParseResult:
    res = ParseResult()
    m = re.search(r"^第\s*\d+\s*卷参考答案\s*$", text, re.M)
    if not m:
        res.skip("未找到参考答案区", "")
        return res
    q_area, a_area = text[: m.start()], text[m.end():]

    # --- 题目区：按节切，节内按题号严格递增切块（键用节名，简答/公文写作同为 qa 不冲突） ---
    questions: dict[tuple[str, int], RawCard] = {}
    q_lines = [ln for ln in q_area.splitlines() if not XHS_NOISE.match(ln.strip())]
    cur_name: str | None = None
    cur_lines: list[str] = []
    sections: list[tuple[str, list[str]]] = []
    for ln in q_lines:
        hm = XHS_SECTION.match(ln)
        if hm:
            cur_name = hm.group(1)
            cur_lines = []
            sections.append((cur_name, cur_lines))
        elif cur_name is not None:
            cur_lines.append(ln)
    for sec_name, lines in sections:
        kind = XHS_KIND[sec_name]
        for num, blines in split_numbered(lines, sequential=True)[0]:
            body = "\n".join(blines)
            if kind in ("single", "multi"):
                stem, options = extract_options(body)
            else:
                stem, options = tidy(join_wrap(body)), {}
            if not stem:
                res.skip("题目区题干为空", f"{sec_name}#{num}")
                continue
            questions[(sec_name, num)] = RawCard(kind=kind, stem=stem, options=options, tags=list(tags))

    # --- 答案区：N.参考答案 块，同号重复块合并（解析里常嵌一行重复题号） ---
    answers: dict[tuple[str, int], tuple[str, str]] = {}  # (节名,num) -> (answer, analysis)
    cur_name = None
    cur_lines = []
    a_sections: list[tuple[str, list[str]]] = []
    for ln in a_area.splitlines():
        hm = XHS_SECTION.match(ln)
        if hm:
            cur_name = hm.group(1)
            cur_lines = []
            a_sections.append((cur_name, cur_lines))
        elif cur_name is not None:
            cur_lines.append(ln)
    for sec_name, lines in a_sections:
        kind = XHS_KIND[sec_name]
        blocks: list[tuple[int, list[str]]] = []
        for ln in lines:
            am = re.match(r"^\s*(\d{1,3})[.、]参考答案[:：]\s*(.*)$", ln)
            if am and (not blocks or int(am.group(1)) != blocks[-1][0]):
                blocks.append((int(am.group(1)), [am.group(2)]))
            elif blocks:
                blocks[-1][1].append(ln)
        for num, blines in blocks:
            first, rest = blines[0], "\n".join(blines[1:])
            answer = norm_answer_letters(first.strip())
            analysis = _clean_xhs_analysis(rest)
            if kind in ("judge",):
                answer = norm_judge(answer)
            elif kind in ("fill", "qa"):
                answer = tidy(join_wrap(first + "\n" + (rest if not analysis else "")))
                if kind == "qa":
                    answer = _clean_xhs_analysis(first + "\n" + rest)
                    analysis = ""
            answers[(sec_name, num)] = (answer, analysis)

    for (sec_name, num), card in questions.items():
        got = answers.get((sec_name, num))
        if got is None:
            res.missing_answer += 1
            res.skip("答案区缺该题答案", f"{sec_name}#{num}")
        else:
            card.answer, card.analysis = got
        res.cards.append(card)
    # 答案区有而题目区没有的题号
    orphan = set(answers) - set(questions)
    for k in sorted(orphan):
        res.skip("答案区多出题号", f"{k[0]}#{k[1]}")
    return res


# ---------------------------------------------------------------- 解析器 3：总台后置紧凑答案
# 题目分节（一、单项选择题 … 五、英语题），答案区同名单节，
# 单选/多选/判断答案是紧凑列表：1.B 2.C …（跨行折行、行首有错位题号伪影）。

ZT_SECTION = re.compile(r"^[一二三四五六七八]、\s*([\u4e00-\u9fff]{2,8})")
ZT_KIND: dict[str, Kind | None] = {
    "单项选择题": "single", "多项选择题": "multi", "判断题": "judge",
    "英语阅读": "single", "英语阅读题": "single", "简答题": "qa", "主观题": "qa", "作文题": "qa",
    "英语题": "qa", "论述题": "qa",
}
COMPACT_TOKEN = re.compile(r"(\d{1,3})\s*[.、]\s*([A-H]{1,6}|√|×|正确|错误)")


def parse_compact_answers(text: str) -> dict[int, str]:
    """紧凑答案列表 → {题号: 答案}。

    按期望序号走读：序号 == 期望 → 收录；序号 < 期望（折行处题号错位伪影，
    如 `2. C 12. D` 实为第 11 题）→ 把答案补给期望题号；序号 > 期望 → 跳号对齐。
    """
    tokens = COMPACT_TOKEN.findall(text)
    out: dict[int, str] = {}
    expected = 1
    for ns, ans in tokens:
        n = int(ns)
        if n == expected:
            out[n] = ans
            expected += 1
        elif n < expected:
            if expected not in out:
                out[expected] = ans  # 错位伪影：补给期望题号
                expected += 1
        else:
            expected = n  # 跳号（原卷缺题）
            out[n] = ans
            expected += 1
    return out


def parse_zongtai_backref(text: str, tags: list[str]) -> ParseResult:
    res = ParseResult()
    # 答案区起点：首个出现在“已有题目之后”的独占行“参考答案…”
    # （防止标题里的“参考答案”或主观题的“参考答案要点：”抢占切点）
    split_at = -1
    seen_q = False
    offset = 0
    for ln in text.splitlines(keepends=True):
        s = ln.strip()
        if QSTART.match(s):
            seen_q = True
        elif seen_q and re.match(r"^参考答案", s) and "要点" not in s and "评分" not in s:
            split_at = offset
            break
        offset += len(ln)
    if split_at < 0:
        res.skip("未找到参考答案区", "")
        return res
    q_area, a_area = text[:split_at], text[split_at:]

    def cut_sections(area: str):
        secs: list[tuple[str, list[str]]] = []
        cur: list[str] | None = None
        for ln in area.splitlines():
            hm = ZT_SECTION.match(ln)
            # 答案区节标题常带后缀：一、单项选择题答案 / 四、简答题答题思路
            name = re.sub(r"(?:答案解析|答题思路|参考答案|答案)$", "", hm.group(1)) if hm else ""
            if hm and name in ZT_KIND:
                cur = []
                secs.append((name, cur))
            elif cur is not None:
                cur.append(ln)
        return secs

    q_secs = cut_sections(q_area)
    a_secs = cut_sections(a_area)
    a_map: dict[str, list[str]] = {}
    for name, lines in a_secs:
        a_map.setdefault(name, []).extend(lines)

    for name, lines in q_secs:
        kind = ZT_KIND[name]
        a_lines = a_map.get(name, [])
        a_text = "\n".join(a_lines)
        if kind in ("single", "multi", "judge"):
            ans_map = parse_compact_answers(a_text)
        else:
            ans_map = {}
        # 英语阅读：节首短文并入题干
        prefix = ""
        if name in ("英语阅读", "英语阅读题"):
            first_q = next((i for i, ln in enumerate(lines) if QSTART.match(ln)), len(lines))
            preamble = [ln for ln in lines[:first_q]
                        if ln.strip() and not ln.strip().lower().startswith("directions")]
            prefix = tidy(join_wrap("\n".join(preamble)))
            if prefix:
                prefix += "。"
            lines = lines[first_q:]
        qblocks, _ = split_numbered(lines, sequential=True)
        if kind == "qa" and not qblocks:
            # 主观题节整节一题（无编号段落）
            stem = tidy(join_wrap("\n".join(lines)))
            if len(stem) >= 10:
                ans_text = re.sub(r"^参考答案(要点|及评分标准)?[^：:\n]*[:：]?\s*", "", a_text.strip())
                res.cards.append(RawCard(kind="qa", stem=prefix + stem,
                                         answer=tidy(join_wrap(ans_text)), tags=list(tags)))
            else:
                res.skip("主观题节无编号且过短", name)
            continue
        for num, blines in qblocks:
            body = "\n".join(blines)
            if kind == "qa":
                stem = tidy(join_wrap(body))
                # 主观题答案为整段答题思路；多题时按号切
                ans_text = re.sub(r"^参考答案(要点|及评分标准)?[^：:\n]*[:：]?\s*", "", a_text.strip())
                answer = tidy(join_wrap(ans_text)) if num == 1 or len(qblocks) == 1 else ""
                if len(qblocks) > 1:
                    sub = split_numbered(a_lines, sequential=True)[0]
                    for an, alines in sub:
                        if an == num:
                            answer = tidy(join_wrap("\n".join(alines)))
                            break
                if not stem:
                    res.skip("主观题题干为空", f"{name}#{num}")
                    continue
                res.cards.append(RawCard(kind="qa", stem=stem, answer=answer, tags=list(tags)))
                if not answer:
                    res.missing_answer += 1
                continue
            if kind == "judge":
                stem, options = prefix + tidy(join_wrap(body)), {}
            else:
                stem, options = extract_options(body)
                stem = prefix + stem
            if not stem or (kind != "judge" and len(options) < 2):
                res.skip("选择题题干/选项残缺", f"{name}#{num}")
                continue
            answer = ans_map.get(num, "")
            if kind == "judge":
                answer = norm_judge(answer)
            if not answer:
                res.missing_answer += 1
                res.skip("紧凑答案表缺该题", f"{name}#{num}")
            res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                                     answer=answer, tags=list(tags)))
    return res


# ---------------------------------------------------------------- 解析器 4：人民日报一轮 2017-2019
# 题目在前，答案区为 N.本题考查… 解析段，段尾「故正确答案为X」。

RMRB1_TAGS: list[tuple[str, tuple[str, ...], Kind | None]] = [
    ("数量关系", ("行测-数量",), "single"),
    ("判断推理", ("行测-判断",), "single"),
    ("言语理解", ("行测-言语",), "single"),
    ("资料分析", ("行测-资料",), "single"),
    ("公共基础知识|常识", ("行测-常识",), "single"),
    ("单项选择题", ("行测-常识",), "single"),
    ("时政", ("时政",), "single"),
    ("判断题", ("行测-常识",), "judge"),
    ("改错题", ("新闻实务",), "correct"),
    ("写作题|申论|综合应用能力|作答要求", ("新闻实务",), "qa"),
    ("新闻|专业", ("新闻实务",), None),
]

# 主观题指令词：题干含这些写作指令且无选项、无答案时归为 qa
# （如 2019 卷“第二部分 综合应用能力测试”不是 一、 式节标题，归不进写作节）
QA_INSTRUCTION = re.compile(r"拟写|撰写|缩写|写一篇|写一则|写一条")


def _rmrb1_section(text: str):
    """按 一、… 节标题切，返回 (tags, kind_hint, lines) 段列表。"""
    secs: list[tuple[list[str], Kind | None, list[str]]] = []
    cur: list[str] | None = None
    cur_tags: list[str] = ["新闻实务"]
    cur_kind: Kind | None = None
    for ln in text.splitlines():
        hm = re.match(r"^[一二三四五六七八九十]+、(.{2,30})", ln.strip())
        if hm:
            head = hm.group(1)
            for pat, tags, kind in RMRB1_TAGS:
                if re.search(pat, head):
                    cur_tags = list(tags)
                    cur_kind = kind
                    break
            cur = []
            secs.append((cur_tags, cur_kind, cur))
        elif cur is not None:
            cur.append(ln)
    return secs


def parse_rmrb_gu(text: str, default_tags: list[str]) -> ParseResult:
    res = ParseResult()
    # 答案区起点：首个出现在题目之后的独占行“参考答案”（标题里的同名行不算）
    split_at = -1
    seen_q = False
    offset = 0
    for ln in text.splitlines(keepends=True):
        s = ln.strip()
        if QSTART.match(s):
            seen_q = True
        elif seen_q and re.match(r"^参考答案\s*$", s):
            split_at = offset
            break
        offset += len(ln)
    if split_at < 0:
        res.skip("未找到参考答案区", "")
        return res
    q_area, a_area = text[:split_at], text[split_at:]

    # 答案区：N. 开头切块；答案取【答案】X 或段尾 故正确答案为X
    answers: dict[int, tuple[str, str]] = {}
    for num, blines in split_numbered(a_area.splitlines(), sequential=False)[0]:
        block = join_wrap("\n".join(blines))
        gm = re.search(r"故正确答案(?:为|选)\s*[:：]?\s*([A-H]{1,5})", block)
        km = re.search(r"【答案】\s*([A-H]{1,5})", block)
        mark = km or gm
        answer = mark.group(1) if mark else ""
        analysis = block[: gm.start()] if gm else block
        analysis = re.sub(r"【答案】\s*[A-H]{1,5}\s*", "", analysis)
        analysis = re.sub(r"^本题考查[^。]*。?", "", analysis.strip())
        analysis = re.sub(r"^【?解析】?[:：]?\s*", "", analysis.strip())
        answers[num] = (answer, tidy(analysis))

    for tags, kind_hint, lines in _rmrb1_section(q_area):
        for num, blines in split_numbered(lines, sequential=False)[0]:
            body = "\n".join(blines)
            if kind_hint in ("single", None):
                stem, options = extract_options(body)
            else:
                stem, options = tidy(join_wrap(body)), {}
            if not stem or len(stem) < 6:
                res.skip("题干过短", f"#{num}")
                continue
            answer, analysis = answers.get(num, ("", ""))
            kind = infer_kind(answer, options, kind_hint)
            if kind == "single" and not options and not answer and QA_INSTRUCTION.search(stem):
                kind = "qa"
            if kind == "judge":
                answer = norm_judge(answer)
            if kind == "correct":
                analysis = analysis or tidy(body)
                answer = answer or analysis[:60]
            if not answer:
                res.missing_answer += 1
            res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                                     answer=answer, analysis=analysis, tags=list(tags)))
    return res


# ---------------------------------------------------------------- 解析器 5：时政押题 OCR 文本
# 格式：N．题干（可折行、跨页）\nA.xxx…\n答案：D（或 ABD）
# 噪声：页眉页脚「第3页，共40页」「淘宝：公考老袁」、乱码短拉丁行、圈号误识。

OCR_NOISE_LINE = re.compile(
    r"^===\s*第\d+页\s*===$|^第\s*\d+\s*页[，,]\s*共\s*\d+\s*页$|^淘宝[:：]|^\s*$"
)
OCR_GIBBERISH = re.compile(r"^[A-Za-z][A-Za-z0-9]{1,7}$")
OCR_CIRCLE_FIX: list[tuple[str, str]] = [
    ("0②", "①②"), ("0③", "①③"), ("0④", "①④"), ("0⑤", "①⑤"),
    ("②3", "②③"), ("②4", "②④"), ("①3", "①③"), ("①4", "①④"),
    ("03", "①③"), ("04", "①④"),
]


def clean_ocr_circles(text: str) -> str:
    for old, new in OCR_CIRCLE_FIX:
        text = text.replace(old, new)
    return text


def parse_yati_ocr(text: str, tags: list[str]) -> ParseResult:
    res = ParseResult()
    lines = []
    gib = 0
    for ln in text.splitlines():
        s = ln.strip()
        if OCR_NOISE_LINE.match(s):
            continue
        if OCR_GIBBERISH.match(s):  # OCR 乱码短行（如 "Klao"）
            gib += 1
            continue
        lines.append(s)
    if gib:
        res.skip(f"OCR 乱码短行（共 {gib} 行）", "")

    # 切块：题号（1..250）行先粗切，无“答案：”的块并回上一块
    # （OCR 跳号/误识号/折行小数都会产出无答案假块；真题块必以答案结尾）
    raw: list[list[str]] = []
    orphan: list[str] = []
    for ln in lines:
        m = QSTART.match(ln)
        if m and 1 <= int(m.group(1)) <= 250:
            raw.append([ln[m.end():]])
        elif raw:
            raw[-1].append(ln)
        else:
            orphan.append(ln)
    blocks: list[list[str]] = []
    if orphan:
        if re.search(r"答案[:：]", "\n".join(orphan)):
            blocks.append(orphan)  # 首页第一题题号被 OCR 吃掉
        else:
            res.skip("题号缺失的首部残块", "\n".join(orphan))
    for blines in raw:
        if blocks and not re.search(r"答案[:：]", "\n".join(blines)):
            blocks[-1].extend(blines)
        else:
            blocks.append(blines)

    seen_stems: set[str] = set()
    for blines in blocks:
        body = clean_ocr_circles("\n".join(blines))
        m = re.search(r"答案[:：]\s*([A-H]{1,5})\s*([^\n]*)", body)
        if not m:
            res.skip("押题块无答案标记", body)
            continue
        answer = m.group(1)
        note = m.group(2).strip()
        stem, options = extract_options(body[: m.start()])
        multi = "（多选）" in stem or "(多选)" in stem or len(answer) > 1
        stem = re.sub(r"^[（(](多选|单选)[)）]\s*", "", stem)
        if not stem or len(options) < 2:
            res.skip("押题块题干/选项残缺", body[:40])
            continue
        sig = stem[:60] + "|" + answer
        if sig in seen_stems:  # OCR 页重复导致的重题
            res.skip("重复题（OCR 页重复）", stem)
            continue
        seen_stems.add(sig)
        res.cards.append(RawCard(
            kind="multi" if multi else "single",
            stem=stem, options=options, answer=answer,
            analysis=note, tags=list(tags),
        ))
    return res


# ---------------------------------------------------------------- 解析器 6：人民日报次轮（表格拍平）
# 块格式（以 ^\d+. 切分，小节内题号重排）：
#   题干（多行折行）\n单选题：A. xx B. xx（折行）\nB 2 分 人人文库《…》
#   …填空题 People's Daily 2 分 来源…  /  …判断题 正确 2 分…
# 或内联：题干（ ）A. xx B. xx 答案：C 来源：…
# 来源标注（人人文库/豆丁/道客巴巴/原创力等）剔除。

SOURCE_MARK = re.compile(
    r"来源[:：][^\n]*|人人文库|豆丁网?|道客巴巴|原创力(文档)?|考生回忆|考生社区|传媒人\s*APP|"
    r"粉笔职教|中公教育|知乎|微博|豆瓣|小红书|公众号|人民日报社官网|人民日报社官方发布|"
    r"《[^》]*(?:docx?|pdf|题集|手册|指南|纲要|大纲|试卷|考题|试题|真题|备考)[^》]*》"
)
FLAT_HEADER = re.compile(
    r"^题目\s*(选项|/填空|核心考点)|^题型\s*核心考点|^答案\s*(分值|\d|/解析)|^判断要求$|^选项/填空"
)


def strip_sources(text: str) -> str:
    lines = []
    for ln in text.splitlines():
        if FLAT_HEADER.match(ln.strip()):
            continue
        lines.append(SOURCE_MARK.sub("", ln))
    return "\n".join(lines)


def parse_rmrb2_flat(text: str, tags: list[str]) -> ParseResult:
    res = ParseResult()
    blocks, _ = split_numbered(text.splitlines(), sequential=False)
    for num, blines in blocks:
        raw = "\n".join(blines)
        first_line = blines[0].strip() if blines else ""
        # 小节伪标题块（如 "1. 简答题"），整块并入后续
        if len(first_line) <= 8 and re.search(r"题$", first_line) and len(blines) <= 2:
            continue
        body = strip_sources(raw)
        flat = join_wrap(body)
        if len(flat) < 8:
            res.skip("次轮块过短", flat)
            continue

        # 1) 表格拍平：单选题：/多选题：
        tm = re.search(r"(单选题|多选题)[:：]", body)
        if tm:
            kind: Kind = "multi" if tm.group(1) == "多选题" else "single"
            after = body[tm.end():]
            stem = tidy(join_wrap(body[: tm.start()]))
            # 选项区后独立字母行 = 答案（可带 分值）
            am = re.search(r"(?:^|\n)\s*([A-H]{1,5})\s+(?:\d+(?:\.\d+)?\s*分|\S)", after)
            tail = after[: am.start()] if am else after
            answer = am.group(1) if am else ""
            _, options = extract_options(tail)
            if len(options) < 2:
                res.skip("次轮选择题选项残缺", f"#{num}")
                continue
            res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                                     answer=answer, tags=list(tags)))
            if not answer:
                res.missing_answer += 1
            continue

        # 1.5) 无题型标记的拍平选择题：≥3 个有序选项 + 选项区后独立字母答案行
        oms = []
        for om in OPT_MARKER.finditer(body):
            if om.group(1) == chr(ord("A") + len(oms)):
                oms.append(om)
        if len(oms) >= 3:
            tail = body[oms[-1].end():]
            am = re.search(r"(?:^|\n)\s*([A-H]{1,5})\s+(?![.、．:：])", tail)
            if am:
                stem = tidy(join_wrap(body[: oms[0].start()]))
                options: dict[str, str] = {}
                for i, om in enumerate(oms):
                    end = oms[i + 1].start() if i + 1 < len(oms) else oms[-1].end() + am.start()
                    options[om.group(1)] = tidy(join_wrap(body[om.end():end]))
                answer = am.group(1)
                kind = "multi" if len(answer) > 1 else "single"
                if stem and all(options.values()):
                    res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                                             answer=answer, tags=list(tags)))
                    continue

        # 2) 填空题 / 判断题
        fm = re.search(r"填空题[:：]?\s*(.+?)(?:\s+\d+(?:\.\d+)?\s*分|$)", body, re.S)
        if fm:
            stem = tidy(join_wrap(body[: fm.start()]))
            answer = tidy(join_wrap(fm.group(1)))
            res.cards.append(RawCard(kind="fill", stem=stem, answer=answer, tags=list(tags)))
            continue
        jm = re.search(r"判断题[:：]?\s*(正确|错误)", body)
        if jm or re.match(r"^判断[:：]", body.strip()):
            stem = tidy(join_wrap(body[: jm.start()] if jm else body))
            stem = re.sub(r"^判断[:：]", "", stem).strip()
            answer = jm.group(1) if jm else ""
            res.cards.append(RawCard(kind="judge", stem=stem, answer=answer, tags=list(tags)))
            if not answer:
                res.missing_answer += 1
            continue

        # 3) 内联 答案：X / 参考译文：
        im = re.search(r"(?:参考)?答案[:：]\s*([A-H]{1,5})", body)
        if im:
            stem, options = extract_options(body[: im.start()])
            answer = im.group(1)
            tail = body[im.end():]
            pm = re.search(r"解析[:：]", tail)
            analysis = tidy(join_wrap(tail[pm.end():])) if pm else ""
            kind = infer_kind(answer, options, None)
            res.cards.append(RawCard(kind=kind, stem=stem, options=options,
                                     answer=answer, analysis=analysis, tags=list(tags)))
            continue
        tr = re.search(r"参考译文[:：]", body)
        if tr:
            stem = tidy(join_wrap(body[: tr.start()]))
            answer = tidy(join_wrap(body[tr.start():]))
            res.cards.append(RawCard(kind="qa", stem=stem, answer=answer, tags=list(tags)))
            continue

        # 4) 主观题（写作/简答/论述/策划/翻译等）
        if re.search(r"题目[:：]|写作|简述|论述|分析|策划|改写|评论|标题|翻译|撰写|修改", flat):
            stem = tidy(flat)
            stem = re.sub(r"^题目[:：]", "", stem).strip()
            if len(stem) >= 10:
                res.cards.append(RawCard(kind="qa", stem=stem, tags=list(tags)))
                res.missing_answer += 1
            else:
                res.skip("次轮主观题过短", stem)
            continue
        res.skip("次轮块无法判别题型", flat)
    return res


# ---------------------------------------------------------------- 来源注册表

@dataclass
class Source:
    key: str
    glob: str  # 相对 ZILIAO 的 glob
    institution: str
    year: int
    reliability: str
    kind: str  # pdf | docx | ocr
    parse: object  # Callable[[str], ParseResult]
    expect: tuple[int, int] | None = None  # 数量合理区间（WARN 用）


TAGS_XHS = ["行测常识"]
TAGS_ZT = ["媒体常识", "总台"]
TAGS_YATI = ["时政"]
TAGS_RMRB = ["新闻实务"]
TAGS_RMRB2 = ["新闻实务", "人民日报"]

# 人民日报一轮 2020-2025：内联答案 + 全文连续编号 + 子节定 tags
RMRB1_INLINE_SECTIONS = [
    SectionSpec(r"^一、行政职业能力测验", None, ("行测-常识",)),
    SectionSpec(r"^一、行测", None, ("行测-常识",)),
    SectionSpec(r"^二、公共基础知识", None, ("行测-常识",)),
    SectionSpec(r"^三、专业知识", None, ("新闻实务",)),
    SectionSpec(r"^四、性格测评", None, ("新闻实务",)),
]
RMRB1_INLINE_SUBS: list[tuple[str, tuple[str, ...]]] = [
    (r"^[（(][一二三四五六七八]+[)）]\s*数量关系", ("行测-数量",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*判断推理", ("行测-判断",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*言语理解", ("行测-言语",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*资料分析", ("行测-资料",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*时政", ("时政",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*法律", ("行测-常识",)),
    (r"^[（(][一二三四五六七八]+[)）]\s*行业政策", ("行测-常识",)),
]

# 总台 2025 管理：内联 参考答案：X + 解析：
ZT2025_SECTIONS = [
    SectionSpec(r"^一、单项选择题", "single"),
    SectionSpec(r"^二、多项选择题", "multi"),
    SectionSpec(r"^三、英语阅读", "single", passage=True),
    SectionSpec(r"^四、简答题", "qa"),
    SectionSpec(r"^五、作文题", "qa"),
]

# 总台事业编 DOCX：一、单选题 … 四、简答题
SYBIAN_SECTIONS = [
    SectionSpec(r"^一、单选题", "single"),
    SectionSpec(r"^二、多选题", "multi"),
    SectionSpec(r"^三、判断题", "judge"),
    SectionSpec(r"^四、简答题", "qa"),
]

# 总台模拟卷 DOCX：第一部分 单选题(50题)，行内 【答案】：X
MONI_SECTIONS = [SectionSpec(r"^第[一二三四五六]部分", "single")]


def _inline(sections, tags, restart=True, subs=None):
    return lambda text: parse_inline(text, sections, tags, restart=restart, sub_sections=subs)


def _zt_backref(text: str) -> ParseResult:
    return parse_zongtai_backref(text, TAGS_ZT)


def build_sources() -> list[Source]:
    srcs: list[Source] = []
    yati_dir = "2026年/2026年每月时政热点配套押题"
    for m in range(1, 6):
        srcs.append(Source(
            key=f"yati-{m:02d}", institution="时政押题", year=2026, reliability="押题",
            glob=f"{yati_dir}/{m}月押题/*带答案版*.pdf", kind="ocr",
            parse=lambda t: parse_yati_ocr(t, TAGS_YATI),
        ))
    srcs.append(Source(
        key="xhs-1", institution="新华社", year=2023, reliability="机构题库",
        glob="6-新华社历史笔试题库/*题库1（500题带答案详解）.pdf", kind="pdf",
        parse=lambda t: parse_xinhua(t, TAGS_XHS), expect=(450, 550),
    ))
    srcs.append(Source(
        key="xhs-2", institution="新华社", year=2023, reliability="机构题库",
        glob="6-新华社历史笔试题库/*题库 2（共500题）带答案详解.pdf", kind="pdf",
        parse=lambda t: parse_xinhua(t, TAGS_XHS), expect=(450, 550),
    ))
    for track, tkey in (("文科", "wen"), ("管理", "guan")):
        for year in (2023, 2024, 2025):
            # 总台 2025 管理卷为内联答案版式，其余为后置紧凑答案
            inline_2025 = track == "管理" and year == 2025
            parser = _inline(ZT2025_SECTIONS, TAGS_ZT) if inline_2025 else _zt_backref
            srcs.append(Source(
                key=f"zt-{tkey}-{year}", institution="总台", year=year, reliability="真题合集",
                glob=f"中央广播电视总台{track}岗位复试 题库2023-2025/{year}年*复试真题*.pdf",
                kind="pdf", parse=parser, expect=(30, 70),
            ))
    srcs.append(Source(
        key="zt-sybian", institution="总台", year=2023, reliability="真题合集",
        glob="中央广播电视台事业编考试真题（23 个题）.docx", kind="docx",
        parse=_inline(SYBIAN_SECTIONS, TAGS_ZT), expect=(20, 30),
    ))
    srcs.append(Source(
        key="zt-moni", institution="总台", year=2024, reliability="机构模拟",
        glob="中央广播电视台招聘30人笔试模拟试题及答案详解1套-.docx", kind="docx",
        parse=_inline(MONI_SECTIONS, TAGS_ZT), expect=(45, 55),
    ))
    rmrb1_dir = "人民日报社历年真题一轮 +次轮/人民日报社真题和模拟一轮"
    for year in (2017, 2018, 2019, 2020, 2021, 2022, 2024, 2025):
        gu = year in (2017, 2018, 2019)
        parser = (lambda t: parse_rmrb_gu(t, TAGS_RMRB)) if gu else _inline(
            RMRB1_INLINE_SECTIONS, TAGS_RMRB, restart=False, subs=RMRB1_INLINE_SUBS)
        srcs.append(Source(
            key=f"rmrb-{year}", institution="人民日报", year=year, reliability="真题合集",
            glob=f"{rmrb1_dir}/{year}年人民日报*笔试题和参考答案.pdf", kind="pdf",
            parse=parser, expect=(20, 90),
        ))
    rmrb2_dir = "人民日报社历年真题一轮 +次轮/人民日报社次轮"
    post_map = (("采编岗", "cb"), ("国际传播岗", "gj"), ("综合管理岗", "zh"))
    for year in (2023, 2024, 2025):
        for post, pkey in post_map:
            # 2023 综合岗文件名里没有“次轮”二字，统一放宽
            srcs.append(Source(
                key=f"rmrb2-{year}-{pkey}", institution="人民日报", year=year,
                reliability="回忆版",
                glob=f"{rmrb2_dir}/{year}年人民日报社*{post}*.pdf", kind="pdf",
                parse=lambda t: parse_rmrb2_flat(t, TAGS_RMRB2), expect=(15, 40),
            ))
    return srcs


# 明确跳过（叙述性考情 / 无答案 / 不成题）
SKIPPED_SOURCES = [
    ("资料/6-新华社历史笔试题库/新华社总社校招笔试题回忆.docx", "叙述性考情回忆，不成题"),
    ("资料/6-新华社历史笔试题库/新华社总社面试回忆.docx", "面试回忆，不成题"),
    ("资料/6-新华社历史笔试题库/新华社国际部笔试题目(可参考）.pdf", "叙述性考情，不成题"),
    ("资料/0-新华社企业文化及发展史/00、【重要内容】这个最紧急，先看完.pdf", "企业文化叙述材料，不成题"),
    ("资料/人民日报社历年真题一轮 +次轮/人民日报社真题和模拟一轮/人民日报社笔试/2023年事业单位青海日报社笔试真题！.pdf",
     "考生回忆版，全卷无任何答案，对刷题无价值"),
    ("资料/人民日报社历年真题一轮 +次轮/人民日报社真题和模拟一轮/人民日报社笔试/人民日报2024题型.pdf",
     "题型结构说明（考情），无具体题目"),
    ("资料/人民日报社历年真题一轮 +次轮/人民日报社真题和模拟一轮/人民日报社笔试/人民日报社2020校招笔试题.pdf",
     "题型结构说明（考情），无具体题目"),
]


# ---------------------------------------------------------------- 主流程

def read_source_text(src: Source, path: Path) -> str:
    if src.kind == "docx":
        return docx_text(path)
    if src.kind == "ocr":
        return ocr_text(path)
    return pdf_text(path)


def to_card(src: Source, doc: str, seq: int, raw: RawCard) -> dict:
    card = {
        "id": f"{src.key}-{seq:03d}",
        "kind": raw.kind,
        "stem": raw.stem,
        "answer": raw.answer,
        "analysis": raw.analysis,
        "tags": raw.tags,
        "source": {
            "institution": src.institution,
            "doc": doc,
            "year": src.year,
            "reliability": src.reliability,
        },
    }
    if raw.options:  # options 仅选择题有
        card["options"] = raw.options
    return card


REMOVED_PATH = ROOT / "removed_cards.json"


def load_removed_ids() -> set[str]:
    """过时时政题剔除清单（编号后按 id 过滤，幸存卡 id 保持稳定）。"""
    if not REMOVED_PATH.exists():
        return set()
    data = json.loads(REMOVED_PATH.read_text(encoding="utf-8"))
    return {e["id"] for e in data.get("removed", [])}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    removed_ids = load_removed_ids()
    index = []
    total_cards = 0
    failures = 0
    for src in build_sources():
        # 押题 glob 会同时命中“不带答案版”，过滤
        hits = [p for p in sorted(ZILIAO.glob(src.glob)) if "不带答案" not in p.name]
        if not hits:
            print(f"[{src.key}] !! 找不到文件：{src.glob}")
            failures += 1
            continue
        path = hits[0]
        doc = path.stem
        text = read_source_text(src, path)
        res: ParseResult = src.parse(text)  # type: ignore[operator]
        cards = [to_card(src, doc, i + 1, raw) for i, raw in enumerate(res.cards)]
        dropped = [c["id"] for c in cards if c["id"] in removed_ids]
        if dropped:
            cards = [c for c in cards if c["id"] not in removed_ids]
            print(f"\n[{src.key}] 剔除过时时政题 {len(dropped)} 张：{' '.join(dropped)}")
        total_cards += len(cards)

        kinds: dict[str, int] = {}
        tags: set[str] = set()
        for c in cards:
            kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
            tags.update(c["tags"])
        out = OUT_DIR / f"cards-{src.key}.json"
        out.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
        index.append({
            "key": src.key, "institution": src.institution, "doc": doc,
            "count": len(cards), "reliability": src.reliability, "tags": sorted(tags),
        })

        kind_str = " ".join(f"{k}:{v}" for k, v in sorted(kinds.items()))
        verdict = ""
        if src.expect and not (src.expect[0] <= len(cards) <= src.expect[1]):
            verdict = f"  << WARN 数量超出预期 {src.expect[0]}-{src.expect[1]}"
        print(f"\n[{src.key}] {doc} → {len(cards)} 张 ({kind_str}){verdict}")
        if res.missing_answer:
            print(f"  缺答案：{res.missing_answer} 张")
        if res.skipped:
            print(f"  跳过 {len(res.skipped)} 个无法解析的块：")
            for s in res.skipped[:5]:
                print(f"    - {s}")
            if len(res.skipped) > 5:
                print(f"    … 其余 {len(res.skipped) - 5} 条略")
        for c in cards[:2]:
            stem = c["stem"][:50].replace("\n", " ")
            print(f"  样例 {c['id']} [{c['kind']}] {stem}… 答案:{c['answer'][:20]}")

    # 保留非本脚本产出的 index 条目（如 extract_media_cards.py 的 mk-* 源）
    index_path = OUT_DIR / "index.json"
    own_keys = {e["key"] for e in index}
    if index_path.exists():
        try:
            old = json.loads(index_path.read_text(encoding="utf-8"))
            index.extend(e for e in old if e["key"] not in own_keys)
        except json.JSONDecodeError:
            pass
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n== 合计 {len(index)} 个来源、{total_cards} 张卡片 → {OUT_DIR}")
    if failures:
        print(f"!! {failures} 个来源文件未找到")
    print("\n== 跳过的来源（不成题/无答案） ==")
    for path, reason in SKIPPED_SOURCES:
        print(f"  - {Path(path).name}：{reason}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
