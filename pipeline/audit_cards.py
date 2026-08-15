"""全库体检：探测各类坏题模式，输出分类清单（只读，不修改）。

用法：PYTHONIOENCODING=utf-8 .venv/Scripts/python audit_cards.py [cards目录]
默认扫 ../app/public/content/cards/cards-*.json

探测类别：
A 图片/表格依赖：题干或选项引用图、表（本库无图片资源，此类题无法呈现）
B 试卷名/页眉混入：题干或选项含"XX年XX招聘/笔试/试卷/模拟卷"等元信息
C 题干残缺：过短、以截断标志结尾、含 OCR 乱码特征
D 选项异常：空选项、重复选项、选项数与题型不符
E 重复题：归一化题干跨库重复
F meta 混入：题干是备考建议/说明而非设问
"""
import json
import glob
import re
import sys
import collections

CARDS_DIR = sys.argv[1] if len(sys.argv) > 1 else "../app/public/content/cards"

# A 图片/表格依赖（题面出现指代图表的词，且我们没有图片）
# 注意误报：「以下表述」含"下表"、「哲学上表达」含"上表"、「代表中华人民」含"表中"
RE_FIGURE = re.compile(r"如图|下图|上图|见图|图中|下图所示|如图所示|见图所示|如下图|（图|（见图|根据图|观察.{0,4}图|(?<!以)下表|(?<!学)(?<!者)(?<!会)上表|如下表|统计表|统计图|柱状图|折线图|饼图|扇形图|条形图|表[0-9一二三四五六]\s*[中如]")

# B 试卷名/页眉/广告水印混入（出现在题干/选项内部而非 source 字段）
# 「公开招聘」等单独出现多为题目正文（如事业单位招聘制度题），只保留"年份+招聘/试卷"组合；
# 「微信公众号」是媒体题常见正文，只抓"关注公众号"/"微信公众号："广告形态；
# 淘宝水印另有 OCR 罗马化残留：公考老袁 → gklaoyuan / a0yuan002
RE_PAPER = re.compile(
    r"(19|20)\d{2}\s*年.{0,12}(招聘|笔试|真题|试卷|试题|考试)|"
    r"(统一考试|模拟试卷|模拟卷|押题卷|密卷)|"
    r"第\s*\d+\s*页|共\s*\d+\s*页|淘宝|公考老袁|laoyuan|a0yuan|关注.{0,4}公众号|微信公众号[:：]"
)

# C 题干残缺
# 以冒号结尾绝大多数是正常设问（"正确的是：""最恰当的一项是："），不计截断
RE_TRUNC_TAIL = re.compile(r"[，,、；;（(—\-~…]\s*$")
# OCR 乱码：字母-数字-字母混杂串（a0yuan002）或水印罗马化（gklaoyuan）；
# 纯英文单词（Facebook/carbon/Intel）和 PowerPoint2010 这类软件名是正常内容
RE_OCR_GARBAGE = re.compile(r"[a-z]+\d+[a-z]\w*|laoyuan|a0yuan")

# F meta 混入（备考建议/使用说明，不是设问）
# 「体检」单出是数量关系题素材（体检项目容斥题）；「满分」会误中"小满分为三候"；
# 「注意事项」会误中公文写作题（"包含…注意事项等要素"），均需更精确形态
RE_META = re.compile(r"(备考建议|复习建议|答题技巧|注意事项[:：]|推荐使用|本套卷|本试卷共|考试时间[:：]|满分[:：]?[0-9０-９]|本卷满分|得分要求|允许携带|不得携带|词典|面试分为|面试流程|体检(标准|合格|医院|费用)|政审|录用流程)")

MIN_STEM_LEN = 8
MAX_STEM_LEN = 800


def norm_stem(s: str) -> str:
    return re.sub(r"[\s（）()。，,：:；;、.．?？!！\-—~…]", "", s)


def main() -> None:
    hits: dict[str, list] = collections.defaultdict(list)
    stems_seen: dict[str, str] = {}  # norm_stem → first card id（重复检测）
    total = 0
    for f in sorted(glob.glob(f"{CARDS_DIR}/cards-*.json")):
        for c in json.load(open(f, encoding="utf-8")):
            total += 1
            cid = c["id"]
            stem = c["stem"]
            opts = c.get("options") or {}
            opt_texts = list(opts.values())
            haystack = stem + " " + " ".join(opt_texts)

            if RE_FIGURE.search(haystack):
                hits["A_图片表格依赖"].append((cid, RE_FIGURE.search(haystack).group()))
            m = RE_PAPER.search(haystack)
            if m:
                hits["B_试卷名页眉混入"].append((cid, m.group()[:40]))
            if len(stem) < MIN_STEM_LEN and len(opts) < 3:
                hits["C_题干过短"].append((cid, stem[:40]))
            if len(stem) > MAX_STEM_LEN:
                hits["C_题干过长"].append((cid, f"{len(stem)}字"))
            if RE_TRUNC_TAIL.search(stem):
                hits["C_题干截断结尾"].append((cid, stem[-30:]))
            if RE_OCR_GARBAGE.search(stem):
                hits["C_题干乱码"].append((cid, RE_OCR_GARBAGE.search(stem).group()[:20]))
            if opts:
                if any(not str(v).strip() for v in opt_texts):
                    hits["D_空选项"].append((cid, ""))
                if len(set(str(v).strip() for v in opt_texts)) < len(opt_texts):
                    hits["D_重复选项"].append((cid, ""))
                if c["kind"] == "single" and len(opts) < 3:
                    hits["D_单选选项不足3"].append((cid, str(len(opts))))
            if RE_META.search(stem):
                hits["F_meta混入"].append((cid, RE_META.search(stem).group()))
            ns = norm_stem(stem)
            if len(ns) >= 15:
                if ns in stems_seen:
                    hits["E_重复题"].append((cid, f"同 {stems_seen[ns]}"))
                else:
                    stems_seen[ns] = cid

    print(f"总卡数 {total}\n")
    total_hits = 0
    for k in sorted(hits):
        ids = {h[0] for h in hits[k]}
        total_hits += len(ids)
        print(f"{k}: {len(ids)} 张")
        for h in hits[k][:12]:
            print(f"   {h[0]}  {h[1]}")
        if len(hits[k]) > 12:
            print(f"   … 还有 {len(hits[k]) - 12} 张")
        print()
    print(f"命中去重合计 {total_hits} 张（一卡可能中多类）")


if __name__ == "__main__":
    main()
