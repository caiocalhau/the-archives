function words(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function matchesTitle(query: string, titles: string[]): boolean {
  const needle = words(query);
  if (needle.length === 0) return false;
  return titles.some((title) => {
    const haystack = words(title);
    for (let start = 0; start <= haystack.length - needle.length; start++) {
      if (needle.every((word, offset) => word === haystack[start + offset])) return true;
    }
    return false;
  });
}
