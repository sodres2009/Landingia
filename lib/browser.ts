'use client';

/** Utilitários de browser: leitura de ficheiros e extração de cores do logo. */

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function readImageFile(file: File, maxBytes = 5 * 1024 * 1024): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Escolha um ficheiro de imagem.'));
  if (file.size > maxBytes) return Promise.reject(new Error('A imagem deve ter no máximo 5 MB.'));
  return fileToDataUrl(file);
}

/** Extrai as cores dominantes de uma imagem (logo) em buckets de 32 níveis. */
export function extractColors(dataUrl: string, max = 4): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, 80, 80);
        const data = ctx.getImageData(0, 0, 80, 80).data;
        const buckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 16) {
          if (data[i + 3] < 120) continue;
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          if (r > 240 && g > 240 && b > 240) continue;
          const key = `${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const top = [...buckets.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, max)
          .map(([key]) => '#' + key.split(',').map((v) => Number(v).toString(16).padStart(2, '0')).join(''));
        resolve(top);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}
