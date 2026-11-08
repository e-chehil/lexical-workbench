import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react';
import {
  DataDiagnosticItem,
  DataDiagnosticsReport,
  DictionaryTemplate,
  LexiconWordItem,
} from '../data/types.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface SettingsAndDiagnosticsViewProps {
  diagnostics: DataDiagnosticsReport;
  dictionaries: DictionaryTemplate[];
  onChangeDictionaries: (next: DictionaryTemplate[]) => void;
  onResetDictionaries: () => void;
  onExportBackupJson: () => Promise<void>;
  onImportBackupJson: (
    jsonText: string,
    mode: 'merge' | 'overwrite'
  ) => Promise<{
    importedWords: number;
    importedLogs: number;
    importedCollections: number;
    importedCustomDatasets?: number;
  }>;
  onUploadCustomDataset: (
    type: 'cet2016' | 'bnc_coca' | 'coca2020',
    fileName: string,
    content: string
  ) => Promise<{
    wordsCount: number;
    familiesCount: number;
    cetLinesCount: number;
    cocaRecordsCount?: number;
  } | void>;
  onResetCustomDatasets: () => Promise<void>;
  hasCustomDataset: boolean;
  onSelectWordByString: (wordStr: string) => void;
  wordsMap: Map<string, LexiconWordItem>;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  compactDensity: boolean;
  onToggleCompactDensity: () => void;
}

const CATEGORY_LABELS: Record<DataDiagnosticItem['category'], string> = {
  coca_multi_pos: 'COCA 多词性词头',
  coca_special_orthography: 'COCA 特殊拼写与短语',
  coca_variant_alignment: 'COCA 变体映射对齐',
  slash_expansion: 'CET 斜杠并列拆解',
  paren_expansion: 'CET 括号可选拼写',
  homograph: 'CET 同形异义词上标',
  ambiguous_spelling: 'CET 复合缩写拆解',
  phrase_entry: 'CET 多词词组保留',
  case_sensitivity: 'BNC 大小写敏感词',
  sum_mismatch: 'BNC 词族频次校验差',
  zero_frequency: 'BNC 零频次衍生词',
  unmatched_cet: '考纲未进 BNC 25k',
  multi_family_member: 'BNC 跨词族多重归属',
};

const DIAG_PAGE_SIZE = 100;

export const SettingsAndDiagnosticsView: React.FC<SettingsAndDiagnosticsViewProps> = ({
  diagnostics,
  dictionaries,
  onChangeDictionaries,
  onResetDictionaries,
  onExportBackupJson,
  onImportBackupJson,
  onUploadCustomDataset,
  onResetCustomDatasets,
  hasCustomDataset,
  onSelectWordByString,
  wordsMap,
  darkMode,
  onToggleDarkMode,
  compactDensity,
  onToggleCompactDensity,
}) => {
  const [rightTab, setRightTab] = useState<'registry' | 'diagnostics' | 'dictionaries'>(
    'registry'
  );
  const [mobilePane, setMobilePane] = useState<
    'backup' | 'registry' | 'diagnostics' | 'dictionaries'
  >('backup');
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingOverwritePayload, setPendingOverwritePayload] = useState<{
    fileName: string;
    jsonText: string;
  } | null>(null);
  const [datasetStatus, setDatasetStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [newDictName, setNewDictName] = useState('');
  const [newDictShort, setNewDictShort] = useState('');
  const [newDictUrl, setNewDictUrl] = useState('');

  const [diagSearch, setDiagSearch] = useState('');
  const [diagCategory, setDiagCategory] = useState<string>('all');
  const [diagPage, setDiagPage] = useState(0);

  const rightPaneRef = useRef<HTMLDivElement>(null);
  const [rightWidth, setRightWidth] = useState<number>(760);

  useEffect(() => {
    const el = rightPaneRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setRightWidth(el.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [mobilePane, rightTab]);

  const isCompactRight = rightWidth < 560;

  const executeBackupImport = async (jsonText: string, mode: 'merge' | 'overwrite') => {
    try {
      const res = await onImportBackupJson(jsonText, mode);
      setImportStatus({
        type: 'success',
        text: `恢复成功：导入 ${res.importedWords} 条词汇状态、${res.importedCollections} 个词集、${res.importedLogs} 条日志${
          res.importedCustomDatasets ? `、${res.importedCustomDatasets} 份自定义词表` : ''
        }`,
      });
      setPendingOverwritePayload(null);
    } catch (err) {
      setImportStatus({
        type: 'error',
        text: err instanceof Error ? `导入失败：${err.message}` : '导入失败',
      });
    }
  };

  const handleBackupFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        (!Array.isArray(parsed.userWords) &&
          !Array.isArray(parsed.collections) &&
          !Array.isArray(parsed.activityLogs))
      ) {
        throw new Error('备份文件缺少必要的词库表结构 (userWords / collections / activityLogs)');
      }

      if (importMode === 'overwrite') {
        setPendingOverwritePayload({ fileName: file.name, jsonText: text });
        setImportStatus(null);
      } else {
        await executeBackupImport(text, 'merge');
      }
    } catch (err) {
      setImportStatus({
        type: 'error',
        text: err instanceof Error ? `文件校验失败：${err.message}` : '备份文件格式错误',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleDatasetFileUpload = async (
    type: 'cet2016' | 'bnc_coca' | 'coca2020',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await onUploadCustomDataset(type, file.name, text);
      setDatasetStatus({
        type: 'success',
        text: res
          ? `已校验并载入 ${file.name}（合并词形 ${res.wordsCount.toLocaleString()} · 词族 ${res.familiesCount.toLocaleString()} · 大纲行 ${res.cetLinesCount.toLocaleString()}）`
          : `已载入自定义词表 ${file.name} 并完成实时解析`,
      });
    } catch (err) {
      setDatasetStatus({
        type: 'error',
        text:
          err instanceof Error
            ? `词表校验未通过：${err.message}（已保留当前可用词库）`
            : '加载词表失败（已保留当前可用词库）',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleAddDictionary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDictName.trim() || !newDictUrl.includes('{word}')) return;
    const next: DictionaryTemplate = {
      id: `custom_${Date.now()}`,
      name: newDictName.trim(),
      shortName: newDictShort.trim() || newDictName.trim().slice(0, 6),
      description: '自定义外部词典模板',
      urlTemplate: newDictUrl.trim(),
      enabled: true,
      isBuiltIn: false,
    };
    onChangeDictionaries([...dictionaries, next]);
    setNewDictName('');
    setNewDictShort('');
    setNewDictUrl('');
  };

  const filteredDiagnostics = useMemo(() => {
    const q = diagSearch.trim().toLowerCase();
    return diagnostics.items.filter((item) => {
      if (diagCategory !== 'all' && item.category !== diagCategory) return false;
      if (q) {
        return (
          item.rawText.toLowerCase().includes(q) ||
          item.parsedResult.some((r) => r.toLowerCase().includes(q)) ||
          item.explanation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [diagnostics.items, diagSearch, diagCategory]);

  const totalDiagPages = Math.max(1, Math.ceil(filteredDiagnostics.length / DIAG_PAGE_SIZE));
  const safeDiagPage = Math.min(diagPage, totalDiagPages - 1);
  const pagedDiagnostics = useMemo(() => {
    const start = safeDiagPage * DIAG_PAGE_SIZE;
    return filteredDiagnostics.slice(start, start + DIAG_PAGE_SIZE);
  }, [filteredDiagnostics, safeDiagPage]);

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-[var(--bg-surface)] overflow-hidden">
      {/* Mobile Sub-View Switcher (<1024px) */}
      <div className="lg:hidden min-h-[40px] py-1.5 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center gap-1.5 shrink-0">
        {[
          { id: 'backup', label: '备份与热更新' },
          { id: 'registry', label: '三源注册表' },
          { id: 'diagnostics', label: `对齐审计 (${diagnostics.items.length})` },
          { id: 'dictionaries', label: `词典 (${dictionaries.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMobilePane(t.id as typeof mobilePane);
              if (t.id !== 'backup') setRightTab(t.id as typeof rightTab);
            }}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
              mobilePane === t.id
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Left Pane: Backup, Display Preferences & 3-Source Hot-Swap */}
      <aside
        className={`w-full lg:w-[350px] xl:w-[390px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 lg:flex-initial h-full min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)] ${
          mobilePane === 'backup' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* 1. Local Data Backup & Restore */}
        <div className="p-4 space-y-3 bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]">
              本地数据备份与恢复 (IndexedDB)
            </h2>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              含分词性状态
            </span>
          </div>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            个人学习状态、COCA 分词性独立状态 (`posStatuses`)、标签、笔记、词集及变更日志全部保存在本地浏览器 IndexedDB 中。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportBackupJson}
              className="flex-1 py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              导出 JSON 备份
            </button>

            <label className="flex-1 py-2 px-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] rounded text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>导入 JSON 恢复</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-[var(--text-muted)]">导入冲突策略:</span>
            <div className="flex items-center gap-2.5">
              <label className="inline-flex items-center gap-1 cursor-pointer text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'merge'}
                  onChange={() => {
                    setImportMode('merge');
                    setPendingOverwritePayload(null);
                  }}
                />
                <span>按最新时间合并</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'overwrite'}
                  onChange={() => setImportMode('overwrite')}
                />
                <span>完全覆盖</span>
              </label>
            </div>
          </div>

          {pendingOverwritePayload && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  确认使用「{pendingOverwritePayload.fileName}」完全覆盖本地数据？
                </span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingOverwritePayload(null)}
                  className="px-2.5 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => executeBackupImport(pendingOverwritePayload.jsonText, 'overwrite')}
                  className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold cursor-pointer"
                >
                  确认覆盖
                </button>
              </div>
            </div>
          )}

          {importStatus && (
            <div
              className={`p-2.5 border rounded text-xs flex items-center gap-1.5 ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-700 dark:text-rose-300'
              }`}
            >
              {importStatus.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{importStatus.text}</span>
            </div>
          )}
        </div>

        {/* 2. Workspace Display Preferences */}
        <div className="p-4 space-y-3 shrink-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            工作台界面与显示偏好
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-left hover:border-[var(--border-strong)] cursor-pointer"
            >
              <div className="text-[11px] text-[var(--text-muted)]">色彩主题</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {darkMode ? '深色模式 (Carbon)' : '浅色模式 (Alabaster)'}
              </div>
            </button>

            <button
              type="button"
              onClick={onToggleCompactDensity}
              className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-left hover:border-[var(--border-strong)] cursor-pointer"
            >
              <div className="text-[11px] text-[var(--text-muted)]">词表行距密度</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {compactDensity ? '紧凑型 (38px)' : '标准型 (44px)'}
              </div>
            </button>
          </div>

          <div className="pt-1">
            <PWAInstallButton />
          </div>
        </div>

        {/* 3. Custom Dataset Hot-Swap (All 3 Sources) */}
        <div className="p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              三源词库文件热更新与校验
            </h3>
            {hasCustomDataset && (
              <button
                type="button"
                onClick={async () => {
                  await onResetCustomDatasets();
                  setDatasetStatus(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                恢复内置词表
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded text-xs cursor-pointer">
              <div className="font-semibold text-[var(--text-primary)]">coca_freq.json</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">COCA 2020</div>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => handleDatasetFileUpload('coca2020', e)}
                className="hidden"
              />
            </label>

            <label className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded text-xs cursor-pointer">
              <div className="font-semibold text-[var(--text-primary)]">BNC_COCA.txt</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">25k 词族表</div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => handleDatasetFileUpload('bnc_coca', e)}
                className="hidden"
              />
            </label>

            <label className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded text-xs cursor-pointer">
              <div className="font-semibold text-[var(--text-primary)]">CET2016.txt</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">四六级大纲</div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => handleDatasetFileUpload('cet2016', e)}
                className="hidden"
              />
            </label>
          </div>

          {datasetStatus && (
            <div
              role="status"
              className={`p-2.5 border rounded text-xs flex items-start gap-1.5 ${
                datasetStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-700 dark:text-rose-300'
              }`}
            >
              {datasetStatus.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{datasetStatus.text}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Right Pane: Source Registry, Alignment Audit & Dictionaries */}
      <div
        ref={rightPaneRef}
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobilePane !== 'backup' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="min-h-[44px] py-2 px-4 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRightTab('registry')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'registry'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>三源语料注册表与基准审计 (Source Registry)</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('diagnostics')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'diagnostics'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>词表解析与跨源对齐诊断</span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                ({diagnostics.items.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('dictionaries')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'dictionaries'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>外部权威词典配置</span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                ({dictionaries.length})
              </span>
            </button>
          </div>

          {rightTab === 'dictionaries' && (
            <button
              type="button"
              onClick={onResetDictionaries}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              恢复默认词典
            </button>
          )}

          {rightTab === 'diagnostics' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={diagSearch}
                  onChange={(e) => {
                    setDiagSearch(e.target.value);
                    setDiagPage(0);
                  }}
                  placeholder="检索词条或说明..."
                  className="w-44 pl-7 pr-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs"
                />
              </div>
              <select
                value={diagCategory}
                onChange={(e) => {
                  setDiagCategory(e.target.value);
                  setDiagPage(0);
                }}
                aria-label="诊断类别过滤"
                className="px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-secondary)]"
              >
                <option value="all">全部诊断类别 ({diagnostics.items.length})</option>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ================= TAB 1: SOURCE REGISTRY ================= */}
        {rightTab === 'registry' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
              {/* Source 1: COCA 2020 */}
              <div className="p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono-tabular text-xs font-bold">
                    COCA 2020
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    coca_freq.json
                  </span>
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  当代美国英语语料库词元+词性频次表
                </div>
                <div className="space-y-1.5 text-xs font-mono-tabular">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">词性区分记录 (Lexemes):</span>
                    <strong className="text-[var(--text-primary)]">
                      {diagnostics.cocaLexemeRecordCount?.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">去重词头 (Headwords):</span>
                    <strong className="text-[var(--text-primary)]">
                      {diagnostics.cocaHeadwordCount?.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">语料频次总和:</span>
                    <strong className="text-blue-600 dark:text-blue-400">
                      {diagnostics.cocaTotalTokenFrequency?.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">多词性词头 (≥2 PoS):</span>
                    <span>{diagnostics.cocaMultiPosHeadwordCount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">带连字符词头:</span>
                    <span>{diagnostics.cocaHyphenatedHeadwordCount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">保留大写 / 多词词头:</span>
                    <span>
                      {diagnostics.cocaCapitalizedHeadwordCount} / {diagnostics.cocaMultiWordHeadwordCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Source 2: Nation BNC/COCA 2.0 */}
              <div className="p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-mono-tabular text-xs font-bold">
                    BNC/COCA 2.0
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    BNC_COCA_lists.txt
                  </span>
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Paul Nation 1k–25k 词族与 BNC 词形实测频次
                </div>
                <div className="space-y-1.5 text-xs font-mono-tabular">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">词族总数 (1k–25k):</span>
                    <strong className="text-[var(--text-primary)]">
                      {diagnostics.bncFamilyCount.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">去重词形数 (Forms):</span>
                    <strong className="text-[var(--text-primary)]">
                      {(diagnostics.bncDistinctWordForms ?? diagnostics.bncTotalWordForms).toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">与 COCA 词头重合族数:</span>
                    <strong className="text-teal-600 dark:text-teal-400">
                      {(diagnostics.venn?.bncHeadwordsInCocaCount ?? 18774).toLocaleString()} 词族
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">与 COCA 词形直接交集:</span>
                    <span>{diagnostics.venn?.bncAndCocaIntersection?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">显式零频次词形:</span>
                    <span>{diagnostics.bncZeroFreqFormCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">跨词族多重归属词形:</span>
                    <span>1 (grannies)</span>
                  </div>
                </div>
              </div>

              {/* Source 3: CET2016 */}
              <div className="p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-mono-tabular text-xs font-bold">
                    CET2016
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    CET2016.txt
                  </span>
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  全国大学英语四、六级考试官方大纲词表
                </div>
                <div className="space-y-1.5 text-xs font-mono-tabular">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">官方大纲词目行:</span>
                    <strong className="text-[var(--text-primary)]">
                      {diagnostics.cetTotalLines.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">展开去重词形数:</span>
                    <strong className="text-[var(--text-primary)]">
                      {diagnostics.cetDistinctWordForms.toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">与 COCA 直接+变体交集:</span>
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {diagnostics.venn?.cetAndCocaIntersection?.toLocaleString()} +{' '}
                      {diagnostics.venn?.cetVariantLinkedToCocaCount ?? 73}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">与 BNC 直接+变体交集:</span>
                    <span>
                      {diagnostics.bothCetAndBncCount.toLocaleString()} +{' '}
                      {diagnostics.cetVariantLinkedCount ?? 17}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">斜杠 / 括号展开条目:</span>
                    <span>
                      {diagnostics.cetSlashCount} / {diagnostics.cetParenCount}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--text-muted)]">同形异义词上标条目:</span>
                    <span>{diagnostics.cetHomographCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Fusion Summary Banner */}
            <div className="p-4 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                三源融合统一词形索引总览 (Total Union Forms ={' '}
                {diagnostics.totalDistinctLexiconWords.toLocaleString()})
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                系统通过规范化表记对齐三份数据源（7 个互斥分区之和 = 94,954）：三源共有核心词形{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.allThreeCount?.toLocaleString()}
                </strong>{' '}
                个；(BNC ∩ COCA) \ CET 共有{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.bncAndCocaOnlyCount?.toLocaleString()}
                </strong>{' '}
                个；(CET ∩ COCA) \ BNC 共有{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.cetAndCocaOnlyCount?.toLocaleString()}
                </strong>{' '}
                个；(CET ∩ BNC) \ COCA 共有{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.cetAndBncOnlyCount?.toLocaleString()}
                </strong>{' '}
                个；COCA 独有词头{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.cocaOnlyExactCount?.toLocaleString()}
                </strong>{' '}
                个；BNC 独有屈折与派生词形{' '}
                <strong className="font-mono-tabular">
                  {(diagnostics.venn?.bncOnlyExactCount ?? 40889).toLocaleString()}
                </strong>{' '}
                个；CET 独有词条{' '}
                <strong className="font-mono-tabular">
                  {diagnostics.venn?.cetOnlyExactCount ?? 22}
                </strong>{' '}
                个。所有原始频次与排名均按各语料库原始统计单位独立存证。
              </p>
            </div>
          </div>
        )}

        {/* ================= TAB 2: DIAGNOSTICS TABLE ================= */}
        {rightTab === 'diagnostics' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {isCompactRight ? (
              <div className="flex items-center justify-between px-3.5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
                <span>诊断规则 · 源文件文本</span>
                <span>规范化拆解词形</span>
              </div>
            ) : (
              <div className="grid grid-cols-[120px_minmax(120px,1.1fr)_minmax(140px,1.3fr)_minmax(160px,1.4fr)] items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
                <div>诊断规则</div>
                <div>源文件词目文本</div>
                <div>规范化拆解词形 (点击检视)</div>
                <div>解析与对齐说明</div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {pagedDiagnostics.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-[120px_minmax(120px,1.1fr)_minmax(140px,1.3fr)_minmax(160px,1.4fr)] items-center px-4 py-2.5 text-xs hover:bg-[var(--bg-hover)] transition-colors gap-1.5"
                >
                  <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </div>
                  <div
                    translate="no"
                    className="font-mono-tabular text-[var(--text-primary)] truncate pr-2"
                  >
                    {item.rawText}
                  </div>
                  <div className="flex flex-wrap gap-1 pr-2">
                    {item.parsedResult.map((resWord, i) => {
                      const exists = wordsMap.has(resWord.toLowerCase());
                      return (
                        <button
                          key={i}
                          type="button"
                          translate="no"
                          disabled={!exists}
                          onClick={() => onSelectWordByString(resWord)}
                          className={`px-1.5 py-0.5 rounded font-serif-lexicon text-xs border transition-colors ${
                            exists
                              ? 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] cursor-pointer'
                              : 'border-transparent text-[var(--text-muted)]'
                          }`}
                        >
                          {resWord}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {item.explanation}
                  </div>
                </div>
              ))}
            </div>

            {totalDiagPages > 1 && (
              <div className="h-9 px-4 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between text-xs font-mono-tabular text-[var(--text-secondary)] shrink-0">
                <span>
                  显示 {safeDiagPage * DIAG_PAGE_SIZE + 1}–
                  {Math.min((safeDiagPage + 1) * DIAG_PAGE_SIZE, filteredDiagnostics.length)} / 共{' '}
                  {filteredDiagnostics.length.toLocaleString()} 条
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeDiagPage === 0}
                    onClick={() => setDiagPage((p) => Math.max(0, p - 1))}
                    className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    上一页
                  </button>
                  <span>
                    {safeDiagPage + 1} / {totalDiagPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeDiagPage >= totalDiagPages - 1}
                    onClick={() => setDiagPage((p) => Math.min(totalDiagPages - 1, p + 1))}
                    className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    下一页
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: DICTIONARIES ================= */}
        {rightTab === 'dictionaries' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="grid grid-cols-[44px_120px_1fr_44px] items-center px-4 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>启用</div>
              <div>词典名称</div>
              <div>跳转 URL 模板</div>
              <div className="text-right">操作</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {dictionaries.map((dict) => (
                <div
                  key={dict.id}
                  className="grid grid-cols-[44px_120px_1fr_44px] items-center px-4 py-3 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={dict.enabled}
                      onChange={() =>
                        onChangeDictionaries(
                          dictionaries.map((d) =>
                            d.id === dict.id ? { ...d, enabled: !d.enabled } : d
                          )
                        )
                      }
                      aria-label={`启用 ${dict.name}`}
                      className="rounded border-[var(--border-strong)]"
                    />
                  </div>
                  <div className="pr-3 min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">
                      {dict.shortName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">{dict.name}</div>
                  </div>
                  <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)] truncate pr-3">
                    {dict.urlTemplate}
                  </div>
                  <div className="text-right">
                    {!dict.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeDictionaries(dictionaries.filter((d) => d.id !== dict.id))
                        }
                        className="p-1 text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={handleAddDictionary}
              className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-1 sm:grid-cols-[120px_100px_1fr_auto] gap-2 items-center shrink-0"
            >
              <input
                type="text"
                required
                value={newDictName}
                onChange={(e) => setNewDictName(e.target.value)}
                placeholder="词典全称"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs"
              />
              <input
                type="text"
                value={newDictShort}
                onChange={(e) => setNewDictShort(e.target.value)}
                placeholder="简称"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs"
              />
              <input
                type="url"
                required
                value={newDictUrl}
                onChange={(e) => setNewDictUrl(e.target.value)}
                placeholder="https://dict.youdao.com/result?word={word}&lang=en"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--accent-primary)] text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                添加词典
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
