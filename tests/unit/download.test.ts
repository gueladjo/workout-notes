import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrDownload } from '../../src/backup/download';

const blob = new Blob(['x'], { type: 'application/octet-stream' });

afterEach(() => vi.unstubAllGlobals());

describe('shareOrDownload', () => {
  it('reports a shared file', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await shareOrDownload(blob, 'a.fitnotes', 'Backup')).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('reports a dismissed share sheet as cancelled, not shared', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: async () => {
        throw new DOMException('The user cancelled', 'AbortError');
      },
    });
    expect(await shareOrDownload(blob, 'a.fitnotes', 'Backup')).toBe('cancelled');
  });
});
