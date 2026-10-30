// Bounded card I/O. Each checksum is still calculated from every byte on the
// first read; only unchanged file metadata/header signatures can reuse it.
export function fingerprintKey(file, namespace = '', head = []) {
  return JSON.stringify([namespace, file.name, file.size, file.lastModified,
    Array.from(head, n => n.toString(16).padStart(2, '0')).join('')]);
}

export async function readFingerprint(file, makeHash, cache, key, progress = () => {}, active = () => true) {
  if (!active()) return null;
  const saved = await cache.get(key);
  if (!active()) return null;
  if (Number.isInteger(saved)) { progress(file.size); return { crc: saved, cached: true }; }
  const hash = makeHash();
  const reader = file.stream().getReader();
  let read = 0;
  let consumed = false;
  try {
    for (;;) {
      if (!active()) { await reader.cancel(); return null; }
      const { done, value } = await reader.read();
      if (done) {
        const crc = hash.finish();
        consumed = true;
        if (!active()) return null;
        await cache.set(key, crc);
        return { crc, cached: false };
      }
      hash.update(value); read += value.byteLength; progress(read);
    }
  } finally {
    reader.releaseLock();
    if (!consumed) hash.free?.();
  }
}

export async function scanLimited(items, count, job, active = () => true) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => {
    while (active() && next < items.length) { const index = next++; await job(items[index], index); }
  }));
}

// Best-effort browser-local cache; blocking/clearing site storage only causes
// another checksum read. No ROM bytes, artwork or file handles are stored.
export function fingerprintCache(indexedDB = globalThis.indexedDB) {
  const memory = new Map();
  const opened = new Promise(resolve => {
    if (!indexedDB) return resolve(null);
    try {
      const request = indexedDB.open('slot-studio-fingerprints', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('crc');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  const query = async (mode, run) => {
    try {
      const db = await opened;
      if (!db) return undefined;
      return await new Promise(resolve => {
        const tx = db.transaction('crc', mode);
        const request = run(tx.objectStore('crc'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = tx.onabort = () => resolve(undefined);
      });
    } catch { return undefined; }
  };
  return {
    async get(key) { return memory.has(key) ? memory.get(key) : query('readonly', s => s.get(key)); },
    async set(key, crc) {
      memory.set(key, crc);
      if (memory.size > 2048) memory.delete(memory.keys().next().value);
      await query('readwrite', s => s.put(crc, key));
    },
  };
}
