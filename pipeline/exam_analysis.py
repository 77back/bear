#!/usr/bin/env python3
"""考情分析可视化数据：只分析真实考试的考情 → content/exam/analysis.json。

原则（用户明确）：分析"真正考试的考情"，不是"题库构成"。因此：
- 统计只基于 reliability ∈ {真题合集, 回忆版} 的卡；
- 机构汇编题库（新华社 993）、押题材料、机构资料提炼卡一律不计入；
- 新华社无真题卷，考情结构（分值/时长/岗位）来自一手考生回忆（STRUCTURE 人工整理）；
- 叙述与结构部分同 考情分析.md 同步维护。

运行：PYTHONIOENCODING=utf-8 .venv/Scripts/python exam_analysis.py
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CARDS_DIR = ROOT.parent / "content" / "cards"
OUT = ROOT.parent / "content" / "exam" / "analysis.json"

REAL_RELIABILITY = {"真题合集", "回忆版"}
KIND_LABEL = {"single": "单选", "multi": "多选", "judge": "判断",
              "fill": "填空", "correct": "改错", "qa": "问答"}

# 顶部对比表（人工整理，与 考情分析.md 同步）
COMPARISON = [
    {"name": "新华社", "structure": "行测/公基 + 时政 + 写作 + 心理测试",
     "duration": "笔试 150 分钟 + 心理测试 60 分钟",
     "feature": "时政填空是特色；不同部门题型差异大"},
    {"name": "人民日报", "structure": "一轮：行测 88% + 时政；次轮：分岗位实务",
     "duration": "以当年公告为准",
     "feature": "次轮考真功夫：写作/翻译/公文，无标准答案"},
    {"name": "总台", "structure": "媒体常识 100%，不考行测",
     "duration": "以当年公告为准",
     "feature": "行业规范、总局政策、总台战略与业务是核心"},
]

# 人工整理的真实考情结构（一手考生回忆；改这里要同 考情分析.md 同步）
STRUCTURE: dict[str, dict] = {
    "新华社": {
        # 总社校招笔试分值构成（满分 100）：填空 5×5=25，选择/判断/改错各 5×1，
        # 主观大题：短消息 10 + 短评 10 + 通讯改消息 10 + 800 字综述 30 = 60
        "scoreStructure": [
            {"label": "主观大题（消息/短评/综述）", "value": 60},
            {"label": "填空（社史+时政）", "value": 25},
            {"label": "选择", "value": 5},
            {"label": "判断", "value": 5},
            {"label": "改错", "value": 5},
        ],
        "timeStructure": [
            {"label": "笔试", "value": 150},
            {"label": "心理测试（225 道涂卡）", "value": 60},
        ],
    },
    "人民日报": {
        "round2Posts": [
            {"post": "采编岗", "items": [
                "消息改写 600 字（30 分）",
                "新闻评论 800 字（40 分）",
                "报道策划（30 分）",
                "另有：深度报道、新媒体文案、标题制作、评论修改、改错题",
            ]},
            {"post": "国际传播岗", "items": [
                "中译英 10 分 + 英译中 10 分",
                "国际传播论述（“破圈”、文化折扣）",
                "海外社媒策划",
                "面试含英文题（如“TikTok 海外传播限制”看法）",
            ]},
            {"post": "综合管理岗", "items": [
                "公文写作：通知 / 请示 / 会议纪要 / 商洽函",
                "材料分析 + 管理案例（跨部门协作、团队管理、数字化提效）",
            ]},
        ],
    },
}

# 考情要点叙述（一手考生回忆整理）
NARRATIVES = [
    {
        "institution": "新华社",
        "note": "无真题卷流入，考情全部来自考生一手回忆；题库中 993 道行测题为机构汇编，不反映真实考情",
        "sections": [
            {"title": "笔试结构", "items": [
                "笔试 150 分钟 + 心理测试 1 小时，全程约 3.5 小时（8:30-12:00）",
                "基础题型：填空 5 道×5 分、选择 5 道×1 分、判断 5 道×1 分、改错 5 道×1 分",
                "内容侧重：新华社历史 + 当年时事政治（如 90 周年全媒体机构、建党百年讲话、神舟十三号）",
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
        "note": "一轮分布基于历年真题统计；次轮为考生回忆，无标准答案",
        "sections": [
            {"title": "一轮笔试", "items": [
                "行测是绝对主体（约 88%）：常识 / 言语 / 判断 / 数量 / 资料五大板块",
                "时政聚焦新闻出版行业（《新闻从业人员职业行为管理办法》、全国新闻出版工作会议等）",
                "题型以单选为主",
            ]},
            {"title": "次轮说明", "items": [
                "分岗位：采编岗考写作，国际传播岗考双语，综合管理岗考公文与案例分析",
                "回忆版无标准答案——适合在刷题页用问答输入框写完后自评",
            ]},
        ],
    },
    {
        "institution": "总台",
        "note": "分布基于 2023-2025 真题统计",
        "sections": [
            {"title": "笔试结构", "items": [
                "全部媒体常识，不考行测：行业规范 / 战略与政策 / 机构业务与平台 / 企业文化 / 总台 / 机构历史",
                "单选为主，另有多选、问答、判断；管理岗与文科岗结构一致",
            ]},
            {"title": "政策考点", "items": [
                "重点仍在有效期内的政策与持久法规（《广播电视管理条例》等）",
                "年度性过期内容（2024 及以前的年度主题、数量类）已从题库清除",
            ]},
        ],
    },
]


def main() -> int:
    # 只统计真实考试的卡；人民日报按可靠性拆一轮（真题合集）/次轮（回忆版）
    boards: dict[str, Counter] = {}
    domains: dict[str, Counter] = {}
    kinds: dict[str, Counter] = {}
    rmrb_round2 = 0
    for path in sorted(CARDS_DIR.glob("cards-*.json")):
        if "index" in path.name:
            continue
        for c in json.loads(path.read_text(encoding="utf-8")):
            rel = c["source"].get("reliability")
            if rel not in REAL_RELIABILITY:
                continue
            inst = c["source"]["institution"]
            if inst == "人民日报" and rel == "回忆版":
                rmrb_round2 += 1
                continue  # 次轮为写作/面试题，不计入一轮分布
            boards.setdefault(inst, Counter())[c["tags"][0]] += 1
            kinds.setdefault(inst, Counter())[c["kind"]] += 1
            if len(c["tags"]) > 1:
                domains.setdefault(inst, Counter())[c["tags"][1]] += 1

    institutions = []
    for name in ["新华社", "人民日报", "总台"]:
        b = boards.get(name, Counter())
        k = kinds.get(name, Counter())
        entry: dict = {
            "name": name,
            "realQuestions": sum(b.values()),
            "boards": [{"label": l, "count": n} for l, n in b.most_common()],
            "kinds": [{"kind": kk, "label": KIND_LABEL.get(kk, kk), "count": n}
                      for kk, n in k.most_common()],
        }
        if name == "总台":
            entry["domains"] = [{"label": l, "count": n}
                                for l, n in domains.get(name, Counter()).most_common()]
        if name == "人民日报":
            entry["round2Count"] = rmrb_round2
        entry.update(STRUCTURE.get(name, {}))
        institutions.append(entry)

    data = {
        "note": "只分析真实考试的考情（真题合集 + 一手回忆），不含机构汇编题库、押题与资料提炼卡",
        "comparison": COMPARISON,
        "institutions": institutions,
        "narratives": NARRATIVES,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for e in institutions:
        print(f"  {e['name']}：真实考题 {e['realQuestions']} 张")
    print(f"== {OUT} ==")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
