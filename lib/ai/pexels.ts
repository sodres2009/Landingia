/**
 * Fotografia REAL via Pexels API (api.pexels.com).
 * Substitui o LoremFlickr, que era um pool aleatório do Flickr sem curadoria
 * — a foto de um gato numa página de jiu-jitsu veio daí.
 * Sem chave (PEXELS_API_KEY) ou sem rede, devolve lista vazia e o chamador
 * cai no catálogo curado. Este módulo só corre no servidor (a chave nunca
 * chega ao browser).
 */

export interface Photo {
  url: string;
  alt: string;
}

interface CacheEntry {
  at: number;
  photos: Photo[];
}
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000;

export function pexelsEnabled(): boolean {
  return Boolean((process.env.PEXELS_API_KEY ?? '').trim());
}

/** Pesquisa fotos por query (idealmente inglês, 2-4 palavras específicas). */
export async function pexelsSearch(query: string, count = 8): Promise<Photo[]> {
  const key = (process.env.PEXELS_API_KEY ?? '').trim();
  const q = query.trim();
  if (!key || !q) return [];
  const hit = CACHE.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < TTL_MS) return hit.photos;
  try {
    const params = new URLSearchParams({ query: q, per_page: String(Math.min(count, 15)), size: 'large', orientation: 'landscape' });
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { photos?: Array<{ alt?: string; src?: Record<string, string | undefined> }> };
    const photos = (data.photos ?? [])
      .map((p) => ({ url: p.src?.large2x ?? p.src?.large ?? '', alt: (p.alt ?? '').trim() || q }))
      .filter((p) => p.url.startsWith('http'));
    if (photos.length) CACHE.set(q.toLowerCase(), { at: Date.now(), photos });
    return photos;
  } catch {
    return [];
  }
}
