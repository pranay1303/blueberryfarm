import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Printer, Share2 } from 'lucide-react';
import { fetchBlob } from '../services/api';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../utils/format';
import { buildWhatsAppUrl, triggerBlobDownload, tryNativeSharePdf } from '../utils/share';
import { Modal } from './Modal';
import { LoadingSpinner } from './UiPrimitives';

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  pdfApiUrl: string;
  filename: string;
  customerPhone?: string | null;
  whatsappMessage: string;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  open,
  onClose,
  title,
  pdfApiUrl,
  filename,
  customerPhone,
  whatsappMessage,
}) => {
  const { showToast } = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    fetchBlob(pdfApiUrl)
      .then((b) => {
        if (!active) return;
        setBlob(b);
        objectUrl = URL.createObjectURL(b);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (!active) return;
        setError(extractErrorMessage(err, 'Failed to generate PDF preview.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl(null);
      setBlob(null);
    };
  }, [open, pdfApiUrl]);

  const handleDownload = () => {
    if (!blob) return;
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success');
  };

  const handlePrint = () => {
    if (!blobUrl) return;
    const win = window.open(blobUrl, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.print();
      });
    } else {
      handleDownload();
    }
  };

  const handleWhatsAppShare = async () => {
    if (!blob) return;
    const nativeResult = await tryNativeSharePdf(blob, filename, title, whatsappMessage);
    if (nativeResult === 'shared') {
      showToast('Share sheet opened with PDF attached.', 'info');
      return;
    }
    // Desktop / non-file-share fallback: download PDF + open prefilled WhatsApp window
    triggerBlobDownload(blob, filename);
    const waUrl = buildWhatsAppUrl(customerPhone, whatsappMessage);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    showToast(
      'PDF downloaded and WhatsApp window opened with prefilled summary. Please attach the downloaded PDF in WhatsApp.',
      'info'
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={filename} maxWidthClass="max-w-4xl">
      {loading && <LoadingSpinner label="Generating Blueberry branded PDF..." />}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}
      {!loading && !error && blobUrl && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0752A5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#236DC4]"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Share2 className="h-4 w-4" />
              Share via WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#172033] hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <a
              href={blobUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#172033] hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Open Fullscreen
            </a>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#E3E8F0] bg-slate-100">
            <iframe title={filename} src={blobUrl} className="h-[60vh] w-full bg-white" />
          </div>
        </div>
      )}
    </Modal>
  );
};

