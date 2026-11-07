import React, { useState, useMemo } from 'react';
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
    type: 'cet2016' | 'bnc_coca',
    fileName: string,
    content: string
  ) => Promise<void>;
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
  slash_expansion: '斜杠并列拆解',
  paren_expansion: '括号可选拼写',
  homograph: '同形异义词上标',
  ambiguous_spelling: '复合缩写拆解',
  phrase_entry: '多词词组保留',
  case_sensitivity: '大小写敏感词',
  sum_mismatch: '词族频次校验差',
  zero_frequency: '零频次衍生词',
  unmatched_cet: '大纲未进25k词',
  multi_family_member: '跨词族多重归属',
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
  const [rightTab, setRightTab] = useState<'dictionaries' | 'diagnostics'>('dictionaries');
  const [mobilePane, setMobilePane] = useState<'backup' | 'dictionaries' | 'diagnostics'>(
    'backup'
  );
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingOverwritePayload, setPendingOverwritePayload] = useState<{
    fileName: string;
    jsonText: string;
  } | null>(null);
  const [datasetStatus, setDatasetStatus] = useState<string | null>(null);

  // Custom dictionary form
  const [newDictName, setNewDictName] = useState('');
  const [newDictShort, setNewDictShort] = useState('');
  const [newDictUrl, setNewDictUrl] = useState('');

  // Diagnostics filter
  const [diagSearch, setDiagSearch] = useState('');
  const [diagCategory, setDiagCategory] = useState<string>('all');
  const [diagPage, setDiagPage] = useState(0);

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
      // Pre-validate JSON before prompting or importing
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
    type: 'cet2016' | 'bnc_coca',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await onUploadCustomDataset(type, file.name, text);
      setDatasetStatus(`已载入自定义词表 ${file.name} 并完成实时解析`);
    } catch (err) {
      setDatasetStatus(err instanceof Error ? err.message : '加载词表失败');
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
        <button
          type="button"
          onClick={() => setMobilePane('backup')}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'backup'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          备份与偏好
        </button>
        <button
          type="button"
          onClick={() => {
            setMobilePane('dictionaries');
            setRightTab('dictionaries');
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'dictionaries'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          权威词典 ({dictionaries.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setMobilePane('diagnostics');
            setRightTab('diagnostics');
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
            mobilePane === 'diagnostics'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-semibold'
              : 'text-[var(--text-muted)]'
          }`}
        >
          解析诊断 ({diagnostics.items.length})
        </button>
      </div>

      {/* Zone 1: Left Pane - Backup, Dataset Hot-Swap & Display Preferences (340px-390px) */}
      <aside
        className={`w-full lg:w-[340px] xl:w-[390px] lg:border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex-col shrink-0 flex-1 lg:flex-initial h-full min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)] ${
          mobilePane === 'backup' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* 1. Local Data Backup & Restore */}
        <div className="p-3.5 sm:p-4 space-y-3 bg-[var(--bg-surface)] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]">
              本地数据备份与恢复 (IndexedDB)
            </h2>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] shrink-0">
              离线优先
            </span>
          </div>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            个人学习状态、标签、助记笔记、词集、变更历史及自定义词表全部保存在本地浏览器 IndexedDB 中。支持导出完整 JSON 备份并跨设备恢复。
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportBackupJson}
              className="flex-1 py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              导出 JSON 备份
            </button>

            <label className="flex-1 py-2 px-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] rounded text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer">
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
              <label
                className="inline-flex items-center gap-1 cursor-pointer text-[var(--text-secondary)]"
                title="按更新时间保留最新学习状态，并自动合并标签与笔记"
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={importMode === 'merge'}
                  onChange={() => {
                    setImportMode('merge');
                    setPendingOverwritePayload(null);
                  }}
                />
                <span>保守合并</span>
              </label>
              <label
                className="inline-flex items-center gap-1 cursor-pointer text-[var(--text-secondary)]"
                title="清空当前设备记录并用备份文件完全替换"
              >
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
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  确认使用「{pendingOverwritePayload.fileName}」完全覆盖本地数据？此操作将清空当前浏览器现有的全部学习记录。
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
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                >
                  确认清空并覆盖
                </button>
              </div>
            </div>
          )}

          {importStatus && (
            <div
              className={`p-2.5 border rounded text-xs flex items-center gap-1.5 ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
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
        <div className="p-3.5 sm:p-4 space-y-3 shrink-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            工作台界面与显示偏好
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            >
              <div className="text-[11px] text-[var(--text-muted)]">色彩主题</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                {darkMode ? '深色模式 (Carbon)' : '浅色模式 (Alabaster)'}
              </div>
            </button>

            <button
              type="button"
              onClick={onToggleCompactDensity}
              className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-left hover:border-[var(--border-strong)] transition-colors cursor-pointer"
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

        {/* 3. Custom Dataset Hot-Swap */}
        <div className="p-3.5 sm:p-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              词库源文件热更新
            </h3>
            {hasCustomDataset && (
              <button
                type="button"
                onClick={onResetCustomDatasets}
                className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                恢复内置词表
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded text-xs cursor-pointer transition-colors">
              <div className="font-semibold text-[var(--text-primary)]">替换 CET2016.txt</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                上传大纲词表源文件
              </div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => handleDatasetFileUpload('cet2016', e)}
                className="hidden"
              />
            </label>

            <label className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] rounded text-xs cursor-pointer transition-colors">
              <div className="font-semibold text-[var(--text-primary)]">
                替换 BNC_COCA.txt
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                上传 1k–25k 词族源文件
              </div>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => handleDatasetFileUpload('bnc_coca', e)}
                className="hidden"
              />
            </label>
          </div>

          {datasetStatus && (
            <div className="text-xs text-emerald-700 dark:text-emerald-400">{datasetStatus}</div>
          )}
        </div>

        {/* 4. Corpus Benchmark Figures */}
        <div className="p-3.5 sm:p-4 space-y-2 shrink-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            当前词库基准统计
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
              <div className="text-[10px] text-[var(--text-muted)]">合并去重总词形</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {diagnostics.totalDistinctLexiconWords.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
              <div className="text-[10px] text-[var(--text-muted)]">BNC/COCA 词族数</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {diagnostics.bncFamilyCount.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
              <div className="text-[10px] text-[var(--text-muted)]">四六级大纲词目行</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {diagnostics.cetTotalLines.toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
              <div className="text-[10px] text-[var(--text-muted)]">大纲与BNC直接匹配</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {diagnostics.bothCetAndBncCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Zone 2: Right Pane - External Dictionaries & Parser Diagnostics Table */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-full bg-[var(--bg-surface)] overflow-hidden ${
          mobilePane !== 'backup' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="min-h-[44px] py-2 px-4 sm:px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRightTab('dictionaries')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
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
            <button
              type="button"
              onClick={() => setRightTab('diagnostics')}
              className={`py-1 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                rightTab === 'diagnostics'
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>词表解析与跨库对齐诊断</span>
              <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                ({diagnostics.items.length})
              </span>
            </button>
          </div>

          {rightTab === 'dictionaries' ? (
            <button
              type="button"
              onClick={onResetDictionaries}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              恢复默认词典
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={diagSearch}
                  onChange={(e) => {
                    setDiagSearch(e.target.value);
                    setDiagPage(0);
                  }}
                  placeholder="检索原始词条或拆解结果..."
                  className="w-full sm:w-44 pl-7 pr-2.5 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <select
                value={diagCategory}
                onChange={(e) => {
                  setDiagCategory(e.target.value);
                  setDiagPage(0);
                }}
                aria-label="诊断类别过滤"
                className="px-2 py-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-secondary)] focus:outline-none shrink-0"
              >
                <option value="all">全部类别 ({diagnostics.items.length})</option>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {rightTab === 'dictionaries' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[44px_110px_1fr_44px] sm:grid-cols-[52px_140px_1fr_56px] items-center px-4 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>启用</div>
              <div>词典名称</div>
              <div>跳转 URL 模板</div>
              <div className="text-right">操作</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {dictionaries.map((dict) => (
                <div
                  key={dict.id}
                  className="grid grid-cols-[44px_110px_1fr_44px] sm:grid-cols-[52px_140px_1fr_56px] items-center px-4 sm:px-5 py-3 text-xs hover:bg-[var(--bg-hover)] transition-colors"
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
                        title="删除自定义词典"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Add Custom Dictionary Bar */}
            <form
              onSubmit={handleAddDictionary}
              className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-1 sm:grid-cols-[120px_100px_1fr_auto] gap-2 items-center shrink-0"
            >
              <input
                type="text"
                required
                value={newDictName}
                onChange={(e) => setNewDictName(e.target.value)}
                placeholder="词典全称 (如 Youdao)"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <input
                type="text"
                value={newDictShort}
                onChange={(e) => setNewDictShort(e.target.value)}
                placeholder="简称 (如有道)"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <input
                type="url"
                required
                value={newDictUrl}
                onChange={(e) => setNewDictUrl(e.target.value)}
                placeholder="https://dict.youdao.com/result?word={word}&lang=en"
                className="px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded text-xs font-mono-tabular text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--accent-primary)] text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                添加词典
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Diagnostics Table Header */}
            <div className="grid grid-cols-[88px_minmax(90px,1.1fr)_minmax(110px,1.3fr)] xl:grid-cols-[104px_minmax(120px,1.1fr)_minmax(140px,1.3fr)_minmax(160px,1.4fr)] items-center px-3.5 sm:px-5 h-8 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] shrink-0">
              <div>诊断规则</div>
              <div>源文件词目文本</div>
              <div>规范化拆解词形</div>
              <div className="hidden xl:block">解析说明</div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] min-h-0">
              {pagedDiagnostics.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[88px_minmax(90px,1.1fr)_minmax(110px,1.3fr)] xl:grid-cols-[104px_minmax(120px,1.1fr)_minmax(140px,1.3fr)_minmax(160px,1.4fr)] items-center px-3.5 sm:px-5 py-2.5 text-xs hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="font-mono-tabular text-[11px] text-[var(--text-secondary)] whitespace-nowrap pr-2">
                    {CATEGORY_LABELS[item.category]}
                  </div>

                  <div className="min-w-0 pr-3">
                    <div
                      translate="no"
                      className="font-mono-tabular text-[var(--text-primary)] truncate"
                    >
                      {item.rawText}
                    </div>
                    <div className="xl:hidden text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {item.explanation}
                    </div>
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

                  <div className="hidden xl:block text-[11px] text-[var(--text-muted)] truncate">
                    {item.explanation}
                  </div>
                </div>
              ))}
            </div>

            {totalDiagPages > 1 && (
              <div className="h-9 px-4 sm:px-5 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-between text-xs font-mono-tabular text-[var(--text-secondary)] shrink-0">
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
      </div>
    </div>
  );
};
