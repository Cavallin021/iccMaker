import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { generatePreviewPdf } from '../services/api';

interface PdfPreviewButtonProps {
  optionIds: string[];
  className: string;
  style?: CSSProperties;
}

export function PdfPreviewButton({ optionIds, className, style }: PdfPreviewButtonProps) {
  const selectionKey = JSON.stringify(optionIds);
  const request = useRef<AbortController | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => () => request.current?.abort(), [selectionKey]);
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const generate = async () => {
    if (optionIds.length === 0) return;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoadingKey(selectionKey);
    try {
      const pdf = await generatePreviewPdf(optionIds, controller.signal);
      if (!controller.signal.aborted) {
        setPreview({ key: selectionKey, url: URL.createObjectURL(pdf) });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        alert(error instanceof Error ? error.message : 'Não foi possível gerar a prévia em PDF.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoadingKey(null);
      }
    }
  };

  if (preview?.key === selectionKey) {
    return <a className={className} style={style} href={preview.url} target="_blank" rel="noopener noreferrer">Abrir PDF</a>;
  }

  const generating = loadingKey === selectionKey;
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={generate}
      disabled={optionIds.length === 0 || generating}
      aria-busy={generating}
    >
      {generating ? 'Gerando PDF…' : 'Gerar prévia em PDF'}
    </button>
  );
}
