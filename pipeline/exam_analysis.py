#!/usr/bin/env python3
"""考情分析可视化数据：content/cards/ → content/exam/analysis.json。

- 统计部分（机构/板块/题型/时政押题分布）由题库实时计算；
- 叙述部分（考情要点）为人工整理的一手考生回忆，见 NARRATIVES。
  考情内容不做成题卡（用户反馈：词典要求、面试流程等不适合做题），
  只在此以可读形式呈现。

运行：PYTHONIOENCODING=utf-8 .venv/Scripts/python exam_analysis.py
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CARDS_DIR = ROOT.parent / "content" / "cards"
OUT = ROOT.parent / "content" / "exam" / "analysis.json"

KIND_LABEL = {"single": "单选", "multi": "多选", "judge": "判断",
              "fill": "填空", "correct": "改错", "qa": "问答"}

# 考情要点（一手考生回忆整理，文字同 考情分析.md；改这里要两边同步）
NARRATIVES = [
    {
        "institution": "新华社",
        "note": "行测/公基 + 时政 + 写作 + 心理测试；一手考情来自考生回忆",
        "sections": [
            {"title": "笔试结构", "items": [
                "笔试 150 分钟 + 心理测试 1 小时（225 道涂卡选择题），全程约 3.5 小时（8:30-12:00）",
                "基础题型：填空 5 道×5 分、选择 5 道×1 分、判断 5 道×1 分、改错 5 道×1 分",
                "内容侧重：新华社历史 + 当年时事政治（如 90 周年全媒体机构、建党百年讲话、神舟十三号）",
                "主观大题：短消息改编 10 分、短评 10 分、通讯改消息 10 分、800 字综述 30 分",
            ]},
            {"title": "岗位差异", "items": [
                "国内部中文岗：填空（社史时政，每空 0.5 分）+ 800 字评论 30 分 + 策划 + 消息 + 拟标题",
                "国内部英文岗：选择填空 43 道 20 分 + 大题 80 分（古诗句排序、外国文学、互译、作文）",
                "国际部：英翻中 + 中翻英 + 作文，只允许携带纸质词典",
                "参编部：时政填空（外国人名要记准确）+ 编辑改错（含事实错误，最易忽视）+ 英翻中 + 编辑概括 + 800 字评论二选一",
                "对外新闻编辑部：改错 + 新闻人物身份 + 列举题（政治局常委、8 个民主党派、港台报纸、两岸三地电影奖）+ 专题策划 + 作文",
            ]},
            {"title": "面试", "items": [
                "流程：自我介绍 → 岗位理解 → 职业规划 → 抽取题目 → 现场提问",
                "常考：当年十大国内/国际新闻、对具体新闻的看法、记者素养、新华社各渠道（客户端/公众号/微博）区别与每日签发量",
            ]},
            {"title": "备考提示（考生原话）", "items": [
                "时政占比不小，可参考考研“新思想”内容",
                "选择题是大头，填空约 5 个且都是时政，背过新思想能填上几个",
            ]},
        ],
    },
    {
        "institution": "人民日报",
        "note": "一轮行测为主（88%）+ 时政；次轮分岗位考实务",
        "sections": [
            {"title": "一轮笔试", "items": [
                "行测占 88%：常识 / 言语 / 判断 / 数量 / 资料五大板块，以单选为主",
                "时政聚焦新闻出版行业（《新闻从业人员职业行为管理办法》、全国新闻出版工作会议等，均为 2025 年以来）",
            ]},
            {"title": "次轮 · 采编岗", "items": [
                "消息改写 600 字、新闻评论 800 字、报道策划、深度报道、新媒体文案、标题制作、评论修改、改错题",
            ]},
            {"title": "次轮 · 国际传播岗", "items": [
                "中英互译（中译英/英译中各 10 分）、国际传播论述（“破圈”、文化折扣）、海外社媒策划",
                "面试含英文题（如“TikTok 海外传播限制”看法）",
            ]},
            {"title": "次轮 · 综合管理岗", "items": [
                "公文写作：通知 / 请示 / 会议纪要 / 商洽函",
                "材料分析 + 管理案例（跨部门协作、团队管理、数字化提效）",
            ]},
            {"title": "注意", "items": [
                "次轮题目为考生回忆版，无标准答案——适合在刷题页用问答输入框写完后自评",
            ]},
        ],
    },
    {
        "institution": "总台",
        "note": "全部媒体常识，不考行测",
        "sections": [
            {"title": "笔试结构", "items": [
                "全部为媒体常识：行业规范 / 战略与政策 / 机构业务与平台 / 企业文化 / 总台 / 机构历史",
                "题型：单选为主，另有多选、问答、判断；管理岗与文科岗 2023-2025 结构一致",
            ]},
            {"title": "政策考点", "items": [
                "保留 2025 年以来政策与持久法规（《广播电视管理条例》等）",
                "2024 及以前的年度性政策题已清除（年度主题、数量类）",
            ]},
        ],
    },
    {
        "institution": "时政押题",
        "note": "2026 年 1-5 月按月更新，非真题",
        "sections": [
            {"title": "说明", "items": [
                "按月组织：1-5 月，6 月资料待补充后入库",
                "领域分布：科技成就 / 经济金融 / 文化体育 / 民生政策 / 生态与乡村 / 外交国际 / 会议与文件 / 领导人活动",
            ]},
        ],
    },
]


def main() -> int:
    boards: dict[str, Counter] = {}
    kinds: dict[str, Counter] = {}
    sz_month: Counter = Counter()
    sz_domain: Counter = Counter()
    month_re = re.compile(r"(\d+)\s*月份")

    for path in sorted(CARDS_DIR.glob("cards-*.json")):
        if "index" in path.name:
            continue
        for c in json.loads(path.read_text(encoding="utf-8")):
            inst = c["source"]["institution"]
            boards.setdefault(inst, Counter())[c["tags"][0]] += 1
            kinds.setdefault(inst, Counter())[c["kind"]] += 1
            if inst == "时政押题":
                m = month_re.search(c["source"]["doc"])
                sz_month[f"{m.group(1)}月" if m else c["source"]["doc"]] += 1
                if len(c["tags"]) > 1:
                    sz_domain[c["tags"][1]] += 1

    order = ["新华社", "人民日报", "总台", "时政押题"]
    institutions = []
    total = 0
    for name in order:
        b = boards.get(name, Counter())
        k = kinds.get(name, Counter())
        sub = sum(b.values())
        total += sub
        institutions.append({
            "name": name,
            "total": sub,
            "boards": [{"label": l, "count": n} for l, n in b.most_common()],
            "kinds": [{"kind": kk, "label": KIND_LABEL.get(kk, kk), "count": n}
                      for kk, n in k.most_common()],
        })

    data = {
        "total": total,
        "institutions": institutions,
        "shizheng": {
            "byMonth": [{"label": l, "count": n} for l, n in sorted(
                sz_month.items(), key=lambda x: int(x[0][:-1]))],
            "byDomain": [{"label": l, "count": n} for l, n in sz_domain.most_common()],
        },
        "narratives": NARRATIVES,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"== {OUT} ：{total} 张、{len(institutions)} 机构、"
          f"押题 {sum(sz_month.values())} 张 ==")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
