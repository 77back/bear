"""backfill.py 纯逻辑测试：URL 日期提取、案例组装、配额挑选。"""
import backfill
import common


def test_date_from_url():
    assert backfill.date_from_url("http://opinion.people.com.cn/n1/2026/0723/c223228-40766737.html") == "2026-07-23"
    assert backfill.date_from_url("https://www.news.cn/world/20260729/2e6a267bd700405b9311725686495680/c.html") == "2026-07-29"
    assert backfill.date_from_url("https://www.qstheory.cn/20260530/abc9b1d972da4a10abf5c6713468c165/c.html") == "2026-05-30"
    assert backfill.date_from_url("https://www.chinanews.com.cn/sh/2026/07-30/10669431.shtml") == "2026-07-30"
    assert backfill.date_from_url("https://www.gov.cn/yaowen/liebiao/202607/content_7076976.htm") == "2026-07-01"
    assert backfill.date_from_url("https://example.com/about/") is None


def _item(cat, result, **kw):
    return {
        "title": kw.get("title", "标题"),
        "link": kw.get("link", "http://x"),
        "source": "测试源",
        "category": cat,
        "summary": "摘要" * 50,
        "result": result,
    }


def test_case_entry_domain_by_category():
    p = backfill.case_entry(_item("人物", {"domain": "基层治理", "themes": ["奉献"]}))
    assert p["domain"] == "基层治理" and p["themes"] == ["奉献"] and p["url"] == "http://x"
    s = backfill.case_entry(_item("时政", {"domains": ["科技创新", "经济发展"]}))
    assert s["domain"] == "科技创新"
    t = backfill.case_entry(_item("通稿", {"domain": "火星领域"}))  # 清单外 → 其他
    assert t["domain"] == "其他"


def test_case_entry_pinglun_prefers_shenlun_case():
    it = _item("时评", {"domain": "文化建设", "shenlun": {"case": "文中事例原文"}})
    e = backfill.case_entry(it)
    assert e["summary"] == "文中事例原文"
    # 无三件套 → 回退 200 字摘要
    it2 = _item("时评", {"domain": "文化建设", "shenlun": {}})
    assert backfill.case_entry(it2)["summary"] == it2["summary"]


def test_pick_with_quota_month_caps():
    cands = [{"link": f"http://x/{m}/{i}", "title": "t", "date": f"{m}-15"}
             for m in ("2026-07", "2026-06", "2026-05") for i in range(30)]
    picked = backfill.pick_with_quota(cands, "时政")
    by_month = {}
    for c in picked:
        by_month[c["date"][:7]] = by_month.get(c["date"][:7], 0) + 1
    assert by_month == {"2026-07": 20, "2026-06": 12, "2026-05": 12}
    # 通稿走总量配额
    assert len(backfill.pick_with_quota(cands, "通稿")) == backfill.TOTAL_QUOTA["通稿"]


def test_domains_whitelist_intact():
    assert len(common.DOMAINS) == 9 and common.normalize_domain("不存在") == "其他"
