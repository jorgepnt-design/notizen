// Minimaler Leser für unkomprimierte tar-Archive (Joplins .jex-Format).

export interface TarEntry {
  name: string;
  data: Uint8Array;
}

const dec = new TextDecoder();

function cstr(u8: Uint8Array, start: number, len: number) {
  let end = start;
  while (end < start + len && u8[end] !== 0) end++;
  return dec.decode(u8.subarray(start, end));
}

export function looksLikeTar(u8: Uint8Array): boolean {
  if (u8.length < 512) return false;
  if (cstr(u8, 257, 5) === 'ustar') return true;
  // Altes tar-Format ohne „ustar“: Prüfsumme kontrollieren
  const stored = parseInt(cstr(u8, 148, 8).trim(), 8);
  if (isNaN(stored)) return false;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : u8[i];
  return sum === stored;
}

export function* readTar(u8: Uint8Array): Generator<TarEntry> {
  let off = 0;
  let longName: string | null = null;
  while (off + 512 <= u8.length) {
    const h = u8.subarray(off, off + 512);
    if (h.every(b => b === 0)) break;
    let name = cstr(h, 0, 100);
    const size = parseInt(cstr(h, 124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    if (cstr(h, 257, 5) === 'ustar') {
      const prefix = cstr(h, 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }
    const data = u8.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = cstr(data, 0, data.length);
      continue;
    }
    if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(dec.decode(data));
      if (m) longName = m[1];
      continue;
    }
    if (type !== '0' && type !== '\0') {
      longName = null;
      continue;
    }
    if (longName) {
      name = longName;
      longName = null;
    }
    yield { name, data };
  }
}
