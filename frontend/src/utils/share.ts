export function buildWhatsAppUrl(phone: string | undefined | null, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const encoded = encodeURIComponent(message);
  if (normalized.length >= 10) {
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export async function tryNativeSharePdf(
  blob: Blob,
  filename: string,
  title: string,
  text: string
): Promise<'shared' | 'unsupported'> {
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({
        files: [file],
        title,
        text,
      });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return 'shared';
    }
  }
  return 'unsupported';
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

