export interface ThemeDefinition {
  id: string;
  label: string;
  specificity: 'broad' | 'specific';
  aliases: readonly string[];
}

export interface NormalizedTheme {
  id: string;
  label: string;
  specificity: 'broad' | 'specific';
}

export const themeVocabulary: readonly ThemeDefinition[] = [
  { id: 'fiction', label: 'Fiction', specificity: 'broad', aliases: ['Fiction'] },
  { id: 'fantasy', label: 'Fantasy', specificity: 'broad', aliases: ['Fantasy', 'Fantasy fiction'] },
  { id: 'adventure', label: 'Adventure', specificity: 'broad', aliases: ['Adventure', 'Adventure fiction'] },
  { id: 'magic', label: 'Magic', specificity: 'specific', aliases: ['Magic'] },
  { id: 'dragons', label: 'Dragons', specificity: 'specific', aliases: ['Dragon', 'Dragons'] },
  { id: 'vampires', label: 'Vampires', specificity: 'specific', aliases: ['Vampire', 'Vampires'] },
  {
    id: 'coming-of-age', label: 'Coming of age', specificity: 'specific',
    aliases: ['Coming of age', 'Coming-of-age fiction'],
  },
  {
    id: 'political-intrigue', label: 'Political intrigue', specificity: 'specific',
    aliases: ['Political intrigue'],
  },
];

export function normalizeSubjectLabel(subject: string): string {
  return subject.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

const themesByAlias = new Map<string, ThemeDefinition>();
for (const theme of themeVocabulary) {
  for (const alias of theme.aliases) {
    themesByAlias.set(normalizeSubjectLabel(alias), theme);
  }
}

export function normalizeThemes(subjects: readonly string[]): NormalizedTheme[] {
  const themes = new Map<string, NormalizedTheme>();
  for (const subject of subjects) {
    const theme = themesByAlias.get(normalizeSubjectLabel(subject));
    if (theme) {
      themes.set(theme.id, { id: theme.id, label: theme.label, specificity: theme.specificity });
    }
  }
  return [...themes.values()].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
