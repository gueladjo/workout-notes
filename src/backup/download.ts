/**
 * Getting a file out of the browser: the Web Share API (best on iOS/Android home-screen apps)
 * with a download-link fallback.
 */

export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet: nothing else to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Open a file picker and resolve with the chosen file's bytes. */
export function pickFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.onchange = async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return resolve(null);
      resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };
    input.click();
  });
}
