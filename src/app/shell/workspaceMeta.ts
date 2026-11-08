/**
 * Workspace navigation metadata. One table drives the desktop rail, the mobile bar and page
 * headers, so labels and descriptions cannot drift apart.
 */
import { BarChart3, Compass, Database, GraduationCap, Layers, LineChart, type LucideIcon } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';

export interface WorkspaceMeta {
  id: WorkspaceId;
  /** English name from the product spec (routes and headings). */
  name: string;
  /** Chinese label shown next to the name. */
  label: string;
  description: string;
  icon: LucideIcon;
  /** Two-digit index used by the rail. */
  index: string;
}

export const WORKSPACE_META: Record<WorkspaceId, WorkspaceMeta> = {
  explore: {
    id: 'explore',
    name: 'Explore',
    label: '检索',
    description: '在三个来源的统一词形枢纽上查询、对照与批量标注。',
    icon: Compass,
    index: '01',
  },
  corpus: {
    id: 'corpus',
    name: 'Corpus Lab',
    label: '语料',
    description: '官方排行、词性分布、频段交叉与三源集合比较。',
    icon: BarChart3,
    index: '02',
  },
  family: {
    id: 'family',
    name: 'Family Atlas',
    label: '词族',
    description: '按频段浏览 25,002 个词族，查看成员占比与掌握进度。',
    icon: Layers,
    index: '03',
  },
  study: {
    id: 'study',
    name: 'Study',
    label: '学习',
    description: '词集、学习队列与可解释的下一批词规划。',
    icon: GraduationCap,
    index: '04',
  },
  insights: {
    id: 'insights',
    name: 'Insights',
    label: '洞察',
    description: '覆盖率、频段进度与学习事件时间线。',
    icon: LineChart,
    index: '05',
  },
  data: {
    id: 'data',
    name: 'Data Studio',
    label: '数据',
    description: '来源完整性、诊断、对齐报告与本地数据备份。',
    icon: Database,
    index: '06',
  },
};

export const WORKSPACE_ORDER: readonly WorkspaceId[] = ['explore', 'corpus', 'family', 'study', 'insights', 'data'];

/** Mobile bottom bar: four slots, the fourth opens the rest. */
export const MOBILE_PRIMARY: readonly WorkspaceId[] = ['explore', 'family', 'study', 'insights'];
export const MOBILE_MORE: readonly WorkspaceId[] = ['corpus', 'data'];
