"""extract_cards 各解析器的单元测试（小文本 fixture，不跑真实 PDF/OCR）。"""
from __future__ import annotations

import extract_cards as ec


# ---------------------------------------------------------------- 内联答案型

INLINE_RMRB = """人民日报采编岗笔试试卷
一、行政职业能力测验（40题，每题1分，共40分）
（一）数量关系（10题）
1.12，16，20，24，28，（ ）
A. 30 B. 32 C. 34 D. 36
答案：B
解析：本题考查等差数列。后项-前项=4。
2.某团队完成报道，甲单独需12天，乙单独需18天，合作需（ ）天
A. 6.8 B. 7.2 C. 7.6 D. 8.2
答案：B
解析：本题考查工程问题。赋值总量36。
（二）判断推理（10题）
3.所有主流媒体都需坚守真实性，以下推理形式一致的是（ ）
A. 所有法律都有强制性
B. 有的作品是正能量的
C. 有的正能量作品受喜爱
D. 如果违规就会处罚
答案：A
解析：本题考查翻译推理。
二、公共基础知识（30题，每题1分，共30分）
（一）时政（10题）
4.2025年中央经济工作会议强调的主线是（ ）
A. 高速增长 B. 高质量发展 C. 规模扩张 D. 出口拉动
答案：B
解析：本题考查时政。
"""


def test_inline_rmrb_sections_and_kinds():
    res = ec.parse_inline(
        INLINE_RMRB, ec.RMRB1_INLINE_SECTIONS, ["新闻实务"],
        restart=False, sub_sections=ec.RMRB1_INLINE_SUBS,
    )
    assert len(res.cards) == 4
    c1 = res.cards[0]
    assert c1.kind == "single"
    assert c1.answer == "B"
    assert c1.options["D"] == "36"
    assert "等差数列" in c1.analysis
    assert c1.tags == ["行测-数量"]
    assert res.cards[2].tags == ["行测-判断"]
    assert res.cards[3].tags == ["时政"]
    assert "12，16，20" in c1.stem
    assert "1." not in c1.stem[:3]  # 题号已剥除


INLINE_DOCX = """一、单选题（每题 3 分，共 30 分）
1. 某台的核心价值观不包括以下哪一项？
A. 责任
B. 创新
C. 娱乐至上
D. 卓越
答案：C
解析：核心价值观是责任、创新、卓越。
二、多选题（每题 5 分）
1. 主要业务板块包括？
A. 节目制作播出
B. 新媒体业务
C. 影视制作
D. 广告经营
答案：ABCD
解析：四项都是主要业务板块。
三、判断题（每题 3 分）
1. 新闻的生命线是真实性。
答案：正确
解析：真实性是新闻生命线。
"""


def test_inline_docx_multi_and_judge():
    res = ec.parse_inline(INLINE_DOCX, ec.SYBIAN_SECTIONS, ["媒体常识", "总台"])
    assert [c.kind for c in res.cards] == ["single", "multi", "judge"]
    assert res.cards[0].answer == "C"
    assert res.cards[1].answer == "ABCD"
    assert len(res.cards[1].options) == 4
    assert res.cards[2].answer == "正确"
    assert not res.cards[2].options  # 判断题无选项


# ---------------------------------------------------------------- 新华社后置答案型

XHS_TEXT = """2023 年新华社招考应届毕业生笔试参考题库（共 500 题）答案详解版
第 1 卷
一.单选题(共300题)
1.下列金融机构中以存款作为主要资金来源的是_____
A: 中央银行
B: 证券公司
C: 信托公司
D: 商业银行
2.宪法监督的类型是_____。
A: 立法机关的监督
B: 司法机关的监督
C: 宪法委员会的监督
D: 三者结合监督
二.多选题(共100题)
1.根据我国宪法的规定，下列选项中哪些自然资源不能属于集体所有?
A: 森林
B: 矿产
C: 山岭
D: 水流
三.判断题(共70 题)
1.目前绝大多数国家和地区都采用委托国库制。_____
四.简答题(共10 题)
1.谈谈你对职业道德的理解。
第 1 卷参考答案
一.单选题
1.参考答案: D
本题解释:【答案】D。解析：商业银行以吸收存款作为主要资金来源。
本题所属考点-题库原题
2.参考答案: A
本题解释:
【答案】A。解析：我国实行由权力机关监督宪法实施的体制。
本题所属考点-题库原题
二.多选题
1.参考答案: BD
本题解释:B,D【解析】《宪法》第 9 条规定矿藏、水流属于国家所有。
本题所属考点-题库原题
三.判断题
1.参考答案: 正确
本题解释:【答案】Y。解析：国库管理体制主要分为三类。
本题所属考点-题库原题
四.简答题
1.参考答案: 职业道德是从业人员在职业活动中应遵循的行为准则。
本题所属考点-题库原题
"""


def test_xinhua_backref():
    res = ec.parse_xinhua(XHS_TEXT, ["行测常识"])
    assert len(res.cards) == 5
    single = res.cards[0]
    assert single.kind == "single"
    assert single.answer == "D"
    assert single.options["A"] == "中央银行"
    assert "商业银行以吸收存款" in single.analysis
    assert "本题所属考点" not in single.analysis
    assert "本题解释" not in single.analysis
    multi = res.cards[2]
    assert multi.kind == "multi"
    assert multi.answer == "BD"
    assert "《宪法》第 9 条" in multi.analysis
    judge = res.cards[3]
    assert judge.kind == "judge"
    assert judge.answer == "正确"
    qa = res.cards[4]
    assert qa.kind == "qa"
    assert "行为准则" in qa.answer


# ---------------------------------------------------------------- 总台紧凑答案型

ZT_TEXT = """2023 年中央广播电视总台文科岗位
复试真题
一、单项选择题
1. 中央广播电视总台成立的时间是（ ）
A. 2016 年 B. 2017 年 C. 2018 年 D. 2019 年
2. 新闻工作的生命线是（ ）
A. 时效性 B. 真实性 C. 趣味性 D. 权威性
二、多项选择题
1. 新闻工作应遵循的基本原则包括（ ）
A. 党性原则 B. 真实性原则 C. 群众性原则 D. 创新性原则
三、判断题
1. 总台的“云听”平台是专注于音频内容的新媒体平台。（ ）
2. 李白被称为“诗圣”，杜甫被称为“诗仙”。（ ）
四、主观题
结合总台定位，谈谈文科岗位从业者应具备哪些核心素养？
参考答案
一、单项选择题
1. C 2. B
二、多项选择题
1. ABCD
三、判断题
1. √ 2. ×
四、主观题
参考答案要点：
1. 政治素养：坚定的政治立场。
2. 文化素养：深厚的文化底蕴。
"""


def test_zongtai_compact_answers():
    res = ec.parse_zongtai_backref(ZT_TEXT, ["媒体常识", "总台"])
    assert len(res.cards) == 6
    assert res.cards[0].answer == "C"
    assert res.cards[0].options["C"] == "2018 年"
    assert res.cards[2].kind == "multi"
    assert res.cards[2].answer == "ABCD"
    assert res.cards[3].kind == "judge"
    assert res.cards[3].answer == "正确"
    assert res.cards[4].answer == "错误"
    qa = res.cards[5]
    assert qa.kind == "qa"
    assert "政治素养" in qa.answer


def test_compact_answer_mislabel_gap_fill():
    # 折行处题号错位伪影：`2. C 12. D` 实为第 11 题
    text = "1. B 2. C 3. A 4. D 5. B 6. C 7. A 8. B 9. C 10. B\n2. C 12. D 13. A"
    out = ec.parse_compact_answers(text)
    assert out[2] == "C"  # 第 2 题不被伪影覆盖
    assert out[11] == "C"  # 错位答案补给期望题号
    assert out[12] == "D"
    assert out[13] == "A"


# ---------------------------------------------------------------- OCR 押题型

OCR_TEXT = """
=== 第1页 ===
1月份时政押题
1．（多选）12月31日，习近平发表新年贺词。下列表述正确的是（）。
A.2025年是“十四五”收官之年
Klao
B.2026年是“十五五”开局之年
C.我国经济总量达到130万亿元
D.绿水青山成为亮丽底色
答案：ABD
2．习近平提出全球治理倡议，四大倡议提出先后顺序正确的是（）
A.．全球发展倡议→全球安全倡议→全球文明倡议→全球治理倡议
B.．全球安全倡议→全球发展倡议→全球文明倡议→全球治理倡议
C.．全球治理倡议→全球发展倡议→全球安全倡议→全球文明倡议
D.．全球治理倡议→全球安全倡议→全球发展倡议→全球文明倡议
第1页，共40页
淘宝：公考老袁
=== 第2页 ===
答案：A
3．下列关于某工程的说法，组合正确的是（）。0④
A.①②
B.①③
C.②③
D.③④
答案：C　屈原为浪漫主义诗人
"""


def test_yati_ocr_parser():
    res = ec.parse_yati_ocr(OCR_TEXT, ["时政"])
    assert len(res.cards) == 3
    multi = res.cards[0]
    assert multi.kind == "multi"
    assert multi.answer == "ABD"
    assert len(multi.options) == 4
    assert "（多选）" not in multi.stem  # 题型标记已剥除
    assert "Klao" not in "".join(multi.options.values())  # 乱码行被剔除
    single = res.cards[1]
    assert single.kind == "single"
    assert single.answer == "A"
    assert "淘宝" not in single.stem
    q3 = res.cards[2]
    assert q3.kind == "single"
    assert q3.answer == "C"
    assert q3.analysis == "屈原为浪漫主义诗人"  # 答案后的附注进入解析
    assert "0④" not in q3.stem  # 圈号误识已清洗


# ---------------------------------------------------------------- 故正确答案为型（人日 2017-2019）

GU_TEXT = """2017年人民日报校招笔试题和参考答案
一、公共基础知识。根据题目要求，在四个选项中选出一个最恰当的答案。
1.第一届“一带一路”国际合作高峰论坛成果不包括：（    ）
A、成立论坛咨询委员会
B、发布《“一带一路”实现共赢》文件
C、签署政府间合作谅解备忘录
D、核准《“一带一路”融资指导原则》
2.世界四大洋中面积最小的是（  ）。
A、太平洋
B、印度
C、大西洋
D、北冰洋
二、综合应用能力
3.请概括给定资料中食品安全存在的问题。
参考答案
1.本题考查时事政治。
第一届高峰论坛闭幕，发表了成果清单。本题为选非题，故正确答案为B。
2.本题考查地理常识。
北冰洋面积最小。故正确答案为D。
3.食品安全问题主要包括添加剂滥用、监管缺位等。
"""


def test_rmrb_gu_parser():
    res = ec.parse_rmrb_gu(GU_TEXT, ["新闻实务"])
    assert len(res.cards) == 3
    assert res.cards[0].answer == "B"
    assert res.cards[0].kind == "single"
    assert res.cards[0].tags == ["行测-常识"]
    assert "故正确答案为" not in res.cards[0].analysis
    assert res.cards[1].answer == "D"
    qa = res.cards[2]
    assert qa.kind == "qa"
    assert qa.tags == ["新闻实务"]


# ---------------------------------------------------------------- 表格拍平型（人日次轮）

FLAT_TEXT = """二、真题内容汇总
（一）客观题部分
题目 选项/填空/判
断要求
答案 分值 来源
1. 人民日报社
的子刊《瞭望》创刊于哪
一年？
单选题：A.
1978 年 B.
1980 年 C.
1982 年 D.
1984 年
B 2 分 人人文库
《2025 年人
民日报次轮笔
试题目及答
案.doc》
2. 人民日报社英文全称
填空题 People's Daily 2 分 人人文库
《2025 年人民日报次轮笔试题目及答案.doc》
3. 判断：人民日报社子刊《瞭望》以深度时政报道为核心
判断题 正确 2 分 考生回忆（知乎/微博）
4. 下列哪项不是新闻采访的基本特点（ ）A. 时效性 B. 客观性 C. 主观性 D. 真实性
答案：C 来源：人民日报社采编岗备考资料
5. 消息改写题目：根据给定材料撰写一篇 600 字左右的消息，要求要素完整。
来源：考生回忆（知乎话题）
"""


def test_rmrb2_flat_parser():
    res = ec.parse_rmrb2_flat(FLAT_TEXT, ["新闻实务", "人民日报"])
    kinds = {c.stem[:6]: c for c in res.cards}
    assert len(res.cards) == 5
    c1 = res.cards[0]
    assert c1.kind == "single"
    assert c1.answer == "B"
    assert "1980 年" in c1.options["B"]
    assert "人人文库" not in c1.stem
    c2 = res.cards[1]
    assert c2.kind == "fill"
    assert c2.answer == "People's Daily"
    c3 = res.cards[2]
    assert c3.kind == "judge"
    assert c3.answer == "正确"
    assert "判断：" not in c3.stem[:3]
    c4 = res.cards[3]
    assert c4.kind == "single"
    assert c4.answer == "C"
    assert "来源" not in c4.stem
    c5 = res.cards[4]
    assert c5.kind == "qa"
    assert "600 字" in c5.stem
    assert "来源" not in c5.stem


# ---------------------------------------------------------------- 通用工具

def test_normalize_radicals_keeps_circles():
    # ⼈(U+2F08)→人 ⽇(U+2F47)→日；⺠(U+2EA0) 无 NFKC 分解，保持原样
    assert ec.normalize_radicals("⼈⽇报") == "人日报"
    assert ec.normalize_radicals("⺠") == "⺠"
    assert ec.normalize_radicals("①②③") == "①②③"  # 圈号不被 NFKC 拆掉


def test_extract_options_letters_in_order():
    stem, opts = ec.extract_options("题干什么（ ）\nA. 甲 B. 乙 C. 丙 D. 丁")
    assert stem.startswith("题干什么")
    assert list(opts) == ["A", "B", "C", "D"]
    # 正文中孤立的 A. 不应被当作选项起点后还能按序恢复
    stem2, opts2 = ec.extract_options("A.股上涨的新闻是（ ）\nA. 甲 B. 乙 C. 丙 D. 丁")
    assert len(opts2) == 4
