// Filename matches are suggestions only. Never silently choose between sequels.
export const titleWords = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').toLowerCase().match(/[a-z0-9]+/g) ?? [];
export function suggestName(filename, candidates) {
  const words = titleWords(filename), title = words.join(' ');
  if (!title) return null;
  const scored = [...new Set(candidates)].map(name => {
    const other = titleWords(name), normalized = other.join(' ');
    // Numbers distinguish sequels, even when almost every other word agrees.
    if (words.filter(w => /^\d+$/.test(w)).join() !== other.filter(w => /^\d+$/.test(w)).join()) return {name, score:0, title:normalized};
    const shared = words.filter(w => other.includes(w)).length;
    return { name, title:normalized, score: normalized === title ? 1 : 2 * shared / (words.length + other.length) };
  }).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name));
  const best = scored[0];
  if (!best || best.score < .85) return null;
  // Region variants of the same title are safe to offer, but still need approval.
  const rival = scored.find(c => c.title !== best.title);
  return rival && best.score-rival.score < .1 ? null : best.name;
}
export function reviewRank(c) {
  if (c.existingPng || c.hasMatchedLabel) return 2;
  return c.suggestion ? 1 : 0;
}
