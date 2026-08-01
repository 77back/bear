import { describe, it, expect } from 'vitest'
import {
  filterMediaOrgs,
  filterMediaKnowledge,
  filterMediaPlans,
  filterMediaReports
} from '../library'
import type { MediaKnowledgeItem, MediaOrg, MediaPlan, MediaReport } from '@/stores/content'

const ORGS: MediaOrg[] = [
  { id: 'o1', org: '新华社', point: '前身红中社', detail: '1931年瑞金', tag: '常识' },
  { id: 'o2', org: '人民日报', point: '创刊时间', detail: '1948年平山', tag: '考过' },
  { id: 'o3', org: '中央广播电视总台', point: '媒体融合战略', detail: '5G+4K/8K+AI', tag: '考过' }
]
const KNOW: MediaKnowledgeItem[] = [
  { id: 'k1', question: '一带一路的带是什么', answer: '丝绸之路经济带', domain: '时政热点', tag: '考过' },
  { id: 'k2', question: '四全媒体', answer: '全程全息全员全效', domain: '媒体融合', tag: '常识' }
]
const PLANS: MediaPlan[] = [
  { id: 'p1', type: '采访策划', topic: '乡村振兴', title: '返乡青年', points: ['采访对象：农户'], note: '核实数据' },
  { id: 'p2', type: '报道策划', topic: '文旅融合', title: '跟着文物游中原', points: ['Vlog'], note: '三方联动' }
]
const REPORTS: MediaReport[] = [
  { id: 'r1', title: '县级融媒体调研报告', outline: ['标题', '调研背景'], tips: '数据先行' },
  { id: 'r2', title: '短视频传播效果调研', outline: ['样本'], tips: '指标统一' }
]

describe('媒体备考筛选', () => {
  it('filterMediaOrgs：空关键词+全部机构 → 全量返回', () => {
    expect(filterMediaOrgs(ORGS, {})).toHaveLength(3)
    expect(filterMediaOrgs(ORGS, { keyword: '', org: '全部' })).toHaveLength(3)
  })

  it('filterMediaOrgs：机构筛选 + 关键词交集', () => {
    expect(filterMediaOrgs(ORGS, { org: '新华社' })).toHaveLength(1)
    expect(filterMediaOrgs(ORGS, { org: '新华社', keyword: '人民日报' })).toHaveLength(0)
    // 关键词可命中 point/detail/tag
    expect(filterMediaOrgs(ORGS, { keyword: '红中社' })).toHaveLength(1)
    expect(filterMediaOrgs(ORGS, { keyword: '考过' })).toHaveLength(2)
  })

  it('filterMediaKnowledge：命中 question/answer/domain', () => {
    expect(filterMediaKnowledge(KNOW, '一带')).toHaveLength(1)
    expect(filterMediaKnowledge(KNOW, '丝绸之路')).toHaveLength(1)
    expect(filterMediaKnowledge(KNOW, '媒体融合')).toHaveLength(1)
    expect(filterMediaKnowledge(KNOW, '')).toHaveLength(2)
  })

  it('filterMediaPlans：类型筛选 + 关键词命中 points/note', () => {
    expect(filterMediaPlans(PLANS, { type: '采访策划' })).toHaveLength(1)
    expect(filterMediaPlans(PLANS, { type: '报道策划' })).toHaveLength(1)
    expect(filterMediaPlans(PLANS, { keyword: '农户' })).toHaveLength(1)
    expect(filterMediaPlans(PLANS, { keyword: '联动' })).toHaveLength(1)
    expect(filterMediaPlans(PLANS, { type: '采访策划', keyword: '文物' })).toHaveLength(0)
  })

  it('filterMediaReports：命中 title/outline/tips', () => {
    expect(filterMediaReports(REPORTS, '融媒体')).toHaveLength(1)
    expect(filterMediaReports(REPORTS, '数据先行')).toHaveLength(1)
    expect(filterMediaReports(REPORTS, '')).toHaveLength(2)
  })
})
