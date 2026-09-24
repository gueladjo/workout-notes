/**
 * Getting a file out of the browser: the Web Share API (best on iOS/Android home-screen apps)
 * with a download-link fallback.
 */

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hand the file to the share sheet, or download it where sharing files is not supported.
 * `cancelled` means the user dismissed the share sheet: the file went nowhere.
 */
export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
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

/** The chosen file could not be read (a cloud file not downloaded yet, a provider gone away…). */
export class FileReadError extends Error {
  constructor(
    public readonly fileName: string,
    cause: unknown,
  ) {
    super(`Could not read "${fileName}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'FileReadError';
  }
}

/**
 * Open a file picker and resolve with the chosen file's bytes, `null` when the user picks nothing.
 * Rejects with `FileReadError` when the browser cannot read the chosen file.
 */
export function pickFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return resolve(null);
      file.arrayBuffer().then(
        (buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }),
        (err: unknown) => reject(new FileReadError(file.name, err)),
      );
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };
    input.click();
  });
}
