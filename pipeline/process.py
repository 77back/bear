"""大模型加工（构建框架 §8.3）。

铁律（§8.3 / §十.5）：所有事实必须来自传入原文，禁止凭记忆补全；
加工结果里事实字段必须能在原文中找到。本模块对"金句/要点"做原文校验。

API 失败重试 2 次，仍失败 → 该篇降级为「仅原文摘录」，不中断整批。
无 OPENAI_API_KEY 时整体走降级路径（仍产出合法 JSON，仅不够丰富）。
读 raw/{date}.json → 写 processed/{date}.json。
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import common
from common import ROOT, ensure_dir, first_chars, today_str

# ---------- 防幻觉铁律（强制注入每个 prompt） ----------
NO_HALLUC = (
    "【铁律】仅使用下面所给原文中的事实进行加工，严禁凭记忆或外部知识补全任何信息；"
    "凡原文未出现的事实、数据、人名、机构名一律不得编造。若原文不足以支撑某字段，"
    "该字段返回空或省略。金句必须是原文逐字摘录。"
)

# 每类的系统指令与输出结构描述
SCHEMAS = {
    "时政": {
        "desc": "输出 JSON：{points:[3~5条要点], domains:[领域标签], angles:[可考角度], reading:新传视角解读≤200字}",
    },
    "国际": {
        "desc": "输出 JSON：{points:[事件要点], reading:国际传播/跨文化传播视角解读≤200字}",
    },
    "时评": {
        "desc": "输出 JSON：{structure:[论点分步], methods:[论证手法], quotes:[金句，必须原文逐字摘录], examUse:适用考题方向, "
                "domain:领域标签（仅从给定清单选一个）, "
                "shenlun:{sentence:一个最适合申论摘抄的好句子（原文逐字摘录）, "
                "title:一个值得仿写的好标题, case:一个可用于申论论证的文中事例（≤100字）}}",
    },
    "通稿": {
        "desc": "输出 JSON：{news:{prompt:消息写作任务(材料+要求300字), reference:参考范文要点}, "
                "title:{prompt:拟标题任务, samples:[3个推荐标题]}, correct:{prompt:纠错任务, items:[{error,answer}]}, "
                "domain:领域标签（仅从给定清单选一个）}",
    },
    "人物": {
        "desc": "输出 JSON：{themes:[适用主题], deed:事迹摘要, usage:用法示范, domain:领域标签（仅从给定清单选一个）}",
    },
}


def warn(msg: str) -> None:
    print(f"[process][WARN] {msg}", file=sys.stderr)


# ---------- LLM 客户端（可选） ----------
class LLMClient:
    def __init__(self) -> None:
        self.enabled = False
        self.model = "gpt-4o-mini"
        try:
            import os

            key = os.environ.get("OPENAI_API_KEY")
            base = os.environ.get("OPENAI_BASE_URL")
            self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            if key:
                from openai import OpenAI

                self.client = OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)
                self.enabled = True
        except Exception as e:  # noqa: BLE001
            warn(f"LLM 未启用（{e}）；将走降级路径")

    def complete(self, system: str, user: str) -> str:
        last = None
        for _ in range(3):  # 首次 + 重试 2 次
            try:
                resp = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )
                return resp.choices[0].message.content or ""
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(1.0)
        raise RuntimeError(f"LLM 调用失败: {last}")


# ---------- 防幻觉校验 ----------
def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def verify_quotes(quotes: list[str], body: str) -> list[str]:
    """金句必须逐字出现在原文（去除空白后）。未命中的剔除。"""
    nb = _norm(body)
    return [q for q in quotes if q and _norm(q) and _norm(q) in nb]


def filter_points(points: list[str], body: str, min_hit_terms: int = 1) -> list[str]:
    """要点轻校验（防完全编造）：用 3-gram 滑窗，要求至少 min_hit_terms 个三字片段在原文出现。
    3-gram 比 2-gram 更不易被"卫星"等高频共用词误判。"""
    nb = _norm(body)
    kept = []
    for p in points:
        if not p:
            continue
        cjk = re.sub(r"[^一-龥]", "", p)
        if len(cjk) < 3:
            if cjk and cjk in nb:
                kept.append(p)
            continue
        trigrams = [cjk[i : i + 3] for i in range(len(cjk) - 2)]
        hits = sum(1 for g in trigrams if g in nb)
        if hits >= min_hit_terms:
            kept.append(p)
    return kept


def parse_json_safe(text: str) -> dict | None:
    text = (text or "").strip()
    # 去掉可能的 ```json 包裹
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    try:
        return json.loads(text)
    except Exception:
        return None


# ---------- 单篇加工 ----------
def process_item(item: dict, llm: LLMClient) -> dict:
    cat = item["category"]
    body = item["body"]
    base = {
        "title": item["title"],
        "link": item["link"],
        "source": item["source"],
        "category": cat,
        "summary": first_chars(body, 200),
        "degraded": False,
    }
    schema = SCHEMAS.get(cat)
    if not schema:
        base["degraded"] = True
        return base

    if not llm.enabled:
        return degrade(item, cat)

    system = f"你是新闻/申论教研助手。{NO_HALLUC}"
    user = f"原文：\n{body}\n\n按以下要求加工，{schema['desc']}。只输出 JSON。"
    if cat in ("时评", "人物", "通稿", "时政"):
        # 领域清单写死，防分类漂移
        user += f"\n领域标签只能从以下领域清单中选：{'、'.join(common.DOMAINS)}；拿不准就选「其他」。"
    try:
        raw = llm.complete(system, user)
        data = parse_json_safe(raw)
        if not data:
            return degrade(item, cat)
        data = sanitize(cat, data, body)
        base["result"] = data
        return base
    except Exception as e:  # noqa: BLE001
        warn(f"加工失败降级({item['title'][:20]}): {e}")
        return degrade(item, cat)


def sanitize(cat: str, data: dict, body: str) -> dict:
    """防幻觉：校验金句/要点；领域兜底；三件套校验。"""
    if cat in ("时政", "国际"):
        pts = data.get("points", [])
        data["points"] = filter_points(pts, body)
        if cat == "时政":
            # 领域标签兜底到固定清单，去重保序
            seen_d: set[str] = set()
            data["domains"] = [
                d for d in (common.normalize_domain(x) for x in data.get("domains", []))
                if not (d in seen_d or seen_d.add(d))
            ]
    if cat == "时评":
        data["quotes"] = verify_quotes(data.get("quotes", []), body)
        data["structure"] = [s for s in data.get("structure", []) if s]
        data["methods"] = [s for s in data.get("methods", []) if s]
        data["domain"] = common.normalize_domain(data.get("domain"))
        data["shenlun"] = _sanitize_shenlun(data.get("shenlun"), body)
    if cat == "通稿":
        data["domain"] = common.normalize_domain(data.get("domain"))
    if cat == "人物":
        # 事迹摘要至少与原文有重合，否则置空
        deed = data.get("deed", "")
        terms = re.findall(r"[一-龥]{2,}", deed)
        if not any(t in _norm(body) for t in terms):
            data["deed"] = ""
        data["domain"] = common.normalize_domain(data.get("domain"))
    return data


def _sanitize_shenlun(sl, body: str) -> dict:
    """每日三件套防幻觉：好句子必须原文逐字；案例需与原文有重合；只保留非空字段。"""
    if not isinstance(sl, dict):
        return {}
    nb = _norm(body)
    out: dict = {}
    sentence = str(sl.get("sentence") or "").strip()
    if sentence and _norm(sentence) in nb:
        out["sentence"] = sentence
    title = str(sl.get("title") or "").strip()
    if title:
        out["title"] = title
    case = str(sl.get("case") or "").strip()
    if case:
        terms = re.findall(r"[一-龥]{2,}", case)
        if any(t in nb for t in terms):
            out["case"] = case
    return out


def degrade(item: dict, cat: str) -> dict:
    """降级：仅原文摘录 + 启发式结构，绝不编造。"""
    body = item["body"]
    out = {
        "title": item["title"],
        "link": item["link"],
        "source": item["source"],
        "category": cat,
        "summary": first_chars(body, 200),
        "degraded": True,
    }
    # 启发式：按句切分取前几条要点（均来自原文，非生成）
    sents = re.split(r"(?<=[。！？])", body)
    sents = [s.strip() for s in sents if 6 <= len(s.strip()) <= 60][:5]
    if cat in ("时政", "国际"):
        out["result"] = {"points": sents, "domains": [], "angles": [], "reading": ""}
    elif cat == "时评":
        # 降级：无三件套（shenlun 省略 → 每日包为空对象），domain 归「其他」
        out["result"] = {"structure": sents[:3], "methods": [], "quotes": [], "examUse": "", "domain": "其他"}
    elif cat == "人物":
        out["result"] = {"themes": [], "deed": first_chars(body, 120), "usage": "", "domain": "其他"}
    elif cat == "通稿":
        out["result"] = {
            "news": {"prompt": f"依据素材写 300 字消息", "reference": first_chars(body, 160)},
            "title": {"prompt": "为素材拟标题", "samples": []},
            "correct": {"prompt": "基于原文找出 3 处可设的错误点", "items": []},
            "domain": "其他",
        }
    return out


# ---------- 批处理 ----------
def run(date_str: str | None = None) -> Path:
    date_str = date_str or today_str()
    raw_path = ROOT / "raw" / f"{date_str}.json"
    if not raw_path.exists():
        raise SystemExit(f"找不到抓取产物 {raw_path}，请先运行 fetch.py")
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    llm = LLMClient()
    if not llm.enabled:
        warn("未配置 OPENAI_API_KEY，全部走降级（仅原文摘录），不会编造内容。")

    processed = []
    degraded = 0
    for item in raw["items"]:
        p = process_item(item, llm)
        if p.get("degraded"):
            degraded += 1
        processed.append(p)

    out_dir = ROOT / "processed"
    ensure_dir(out_dir)
    out_path = out_dir / f"{date_str}.json"
    out_path.write_text(
        json.dumps(
            {"date": date_str, "count": len(processed), "degraded": degraded, "items": processed},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[process] 加工 {len(processed)} 篇，降级 {degraded} 篇 → {out_path}")
    return out_path


if __name__ == "__main__":
    run()
