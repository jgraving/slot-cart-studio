// Optional sidecars. Existing cartridge/label exports deliberately remain unchanged.
export const FIELDS = ['title', 'description', 'developer', 'publisher', 'year', 'genre', 'players', 'source'];
const limits = { description: 8192, source: 1024 };
export function normalizeDetails(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const result = { version: 1 };
  for (const field of FIELDS) {
    if (typeof input[field] !== 'string') continue;
    const value = input[field].replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limits[field] ?? 256);
    if (value) result[field] = value;
  }
  return result;
}
export function detailsPath(platform, stem, extension = 'json') {
  if (!['GBA', 'GB', 'GBC'].includes(platform) || !stem || stem === '.' || stem === '..' || /[/\\\u0000-\u001f]/.test(stem)) throw new Error('Invalid cartridge identity');
  return `${extension === 'png' ? 'Artwork' : 'Metadata'}/${platform}/${stem}.${extension}`;
}
export function detailsEntries(cart) {
  const details = normalizeDetails(cart.details);
  const box = cart.customBoxBytes ?? cart.boxBytes;
  if (Object.keys(details).length === 1 && !box) return [];
  if (!details.title) details.title = cart.game || cart.stem;
  if (box) details.box_art = detailsPath(cart.platform, cart.stem, 'png');
  const entries = [{ path: detailsPath(cart.platform, cart.stem), bytes: new TextEncoder().encode(JSON.stringify(details, null, 2) + '\n') }];
  if (box) entries.push({ path: details.box_art, bytes: box });
  return entries;
}
export async function pngBox(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose artwork smaller than 8 MB');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192) throw new Error('Artwork dimensions are too large');
    const ratio = Math.min(1, 720 / bitmap.width, 720 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not convert artwork');
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bitmap.close(); }
}

export async function readDetails(source, cart) {
  if (!source.readOptional) return;
  const file = await source.readOptional(detailsPath(cart.platform, cart.stem));
  if (file) {
    if (file.size > 65536) throw new Error('Metadata file is too large');
    const parsed = JSON.parse(await file.text());
    if (parsed.version !== 1) throw new Error('Unsupported metadata version');
    cart.details = normalizeDetails(parsed);
  }
  const image = await source.readOptional(detailsPath(cart.platform, cart.stem, 'png'));
  if (image && image.size <= 8 * 1024 * 1024) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) throw new Error('Invalid box image');
    cart.customBoxBytes = bytes;
  }
}
