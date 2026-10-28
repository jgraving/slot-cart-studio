import { commit } from './history.js';

// Only shell appearance changes. Labels, matches, outlines and source files are untouched.
export function applyBulkStyle(carts, style, resolve) {
  const colour = style.colour?.replace(/^#/, '').toLowerCase();
  if (colour && !/^[0-9a-f]{6}$/.test(colour)) throw new Error('Choose a valid shell color.');
  if (style.finish && !['solid', 'clear', 'glitter'].includes(style.finish)) {
    throw new Error('Choose a valid shell finish.');
  }
  if (!colour && !style.finish) return [];
  // Validate the whole selection before changing anything.
  if (carts.some((c) => c.looking || c.error)) throw new Error('Wait for the selected carts to finish loading, or deselect carts with errors.');
  const changes = carts.map((cart) => {
    const current = resolve(cart);
    return { cart, shell: `${current.outline} ${colour || current.colour} ${style.finish || current.finish}` };
  });
  return changes.filter(({ cart, shell }) => commit(cart, () => { cart.shell = shell; })).map(({ cart }) => cart);
}
