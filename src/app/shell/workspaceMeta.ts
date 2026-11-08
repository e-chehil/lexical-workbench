/**
 * Workspace navigation metadata (PRODUCT_SPEC §2). One table, used by the desktop rail, the
 * mobile tab bar and the placeholder pages, so labels and descriptions cannot drift apart.
 */
import { BarChart3, BookOpen, Compass, Database, GraduationCap, Layers, type LucideIcon } from 'lucide-react';
import type { WorkspaceId } from '../routing/codec.ts';

export interface WorkspaceMeta {
  id: WorkspaceId;
  /** English name from the product spec (used in routes and headings). */
  name: string;
  /** Chinese label shown next to the name. */
  label: string;
  description: string;
  icon: LucideIcon;
  /** Task that fills this workspace; the placeholder names it. */
  plannedIn: string;
}

export const WORKSPACE_META: Record<WorkspaceId, WorkspaceMeta> = {
  explore: {
    id: 'explore',
    name: 'Explore',
    label: '检索',
    description: '按类别筛选、排序并批量管理词条与词族。',
    icon: Compass,
    plannedIn: 'V2-T05',
  },
  corpus: {
    id: 'corpus',
    name: 'Corpus Lab',
    label: '语料对照',
    description: '三源重合、频段分布与集合比较。',
    icon: BarChart3,
    plannedIn: 'V2-T10',
  },
  family: {
    id: 'family',
    name: 'Family Atlas',
    label: '词族图谱',
    description: '词族浏览、成员占比与掌握进度。',
    icon: Layers,
    plannedIn: 'V2-T07',
  },
  study: {
    id: 'study',
    name: 'Study',
    label: '学习',
    description: '学习集、学习队列与导出。',
    icon: GraduationCap,
    plannedIn: 'V2-T11',
  },
  insights: {
    id: 'insights',
    name: 'Insights',
    label: '统计',
    description: '覆盖率、频段进度与事件时间线。',
    icon: BookOpen,
    plannedIn: 'V2-T12',
  },
  data: {
    id: 'data',
    name: 'Data Studio',
    label: '数据',
    description: '数据源状态、诊断、对齐报告与备份。',
    icon: Database,
    plannedIn: 'V2-T13',
  },
};

export const WORKSPACE_ORDER: readonly WorkspaceId[] = ['explore', 'corpus', 'family', 'study', 'insights', 'data'];

/** Mobile bottom bar: four slots, the fourth opens the rest (PRODUCT_SPEC §2). */
export const MOBILE_PRIMARY: readonly WorkspaceId[] = ['explore', 'study', 'insights'];
export const MOBILE_MORE: readonly WorkspaceId[] = ['corpus', 'family', 'data'];
