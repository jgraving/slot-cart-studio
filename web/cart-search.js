const normalized = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function cartMatches(cart, query) {
  const terms = normalized(query).split(' ').filter(Boolean);
  const text = normalized([cart.stem, cart.game, cart.suggestion, cart.platform].filter(Boolean).join(' '));
  return terms.every(term => text.includes(term));
}
