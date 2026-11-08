/** External dictionary links (ported from the previous UI; pure URL templates, no network calls). */
export interface DictionaryTemplate {
  id: string;
  name: string;
  shortName: string;
  urlTemplate: string;
}

export const DEFAULT_DICTIONARIES: DictionaryTemplate[] = [
  {
    id: 'cambridge_zh',
    name: 'Cambridge Dictionary (英汉双解)',
    shortName: '剑桥双解',
    urlTemplate: 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{word}',
  },
  { id: 'ldoce', name: 'Longman Dictionary (朗文当代)', shortName: '朗文', urlTemplate: 'https://www.ldoceonline.com/dictionary/{word}' },
  {
    id: 'oald',
    name: 'Oxford Learner’s (牛津高阶)',
    shortName: '牛津',
    urlTemplate: 'https://www.oxfordlearnersdictionaries.com/definition/english/{word}',
  },
  {
    id: 'collins',
    name: 'Collins Dictionary (柯林斯)',
    shortName: '柯林斯',
    urlTemplate: 'https://www.collinsdictionary.com/dictionary/english/{word}',
  },
  {
    id: 'merriam_webster',
    name: 'Merriam-Webster (韦氏词典)',
    shortName: '韦氏',
    urlTemplate: 'https://www.merriam-webster.com/dictionary/{word}',
  },
  { id: 'youdao', name: 'Youdao Dictionary (有道词典)', shortName: '有道', urlTemplate: 'https://dict.youdao.com/result?word={word}&lang=en' },
];

/** Strips homograph superscripts and star markers before building a URL. */
export function buildDictionaryUrl(word: string, template: string): string {
  const cleaned = word.replace(/★/g, '').replace(/[¹²³⁴⁵]/g, '').trim();
  return template.replace('{word}', encodeURIComponent(cleaned));
}
