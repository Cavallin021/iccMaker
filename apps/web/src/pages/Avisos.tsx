import React, { useState, useEffect, useRef } from 'react';
import {
  getNotices,
  getNoticeImageUrl,
  createNotice,
  updateNotice,
  deleteNotice
} from '../services/api';
import type { Notice } from '../services/api';

export interface NoticeSlide {
  id: string;
  title: string;
  isActive: boolean;
  image: File | string;
  order: number;
}

interface AvisosManagerProps {
  duration: string;
  onDurationChange: (duration: string) => void;
  slides: NoticeSlide[];
  setSlides: React.Dispatch<React.SetStateAction<NoticeSlide[]>>;
  onReady: (ready: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}

const fromNotice = (notice: Notice): NoticeSlide => ({
  id: notice._id,
  title: notice.title,
  isActive: notice.isActive,
  image: getNoticeImageUrl(notice.filename),
  order: notice.order,
});

const SlideImage = ({ image, title }: Pick<NoticeSlide, 'image' | 'title'>) => {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (typeof image === 'string' || !ref.current) return;
    const url = URL.createObjectURL(image);
    ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return <img ref={ref} src={typeof image === 'string' ? image : undefined} alt={title || 'Aviso'} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '0.5rem', pointerEvents: 'none' }} />;
};

export const AvisosManager: React.FC<AvisosManagerProps> = ({
  duration, onDurationChange, slides, setSlides, onReady, onSavingChange
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [draggedSlide, setDraggedSlide] = useState<string | null>(null);
  const [dragOverSlide, setDragOverSlide] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getNotices().then(notices => {
      if (!mounted) return;
      const incoming = new Map(notices.map(notice => [notice._id, fromNotice(notice)]));
      setSlides(current => {
        const refreshed: NoticeSlide[] = [];
        const existingIds = new Set(current.map(slide => slide.id));
        for (const slide of current) {
          if (slide.image instanceof File) refreshed.push(slide);
          else {
            const updated = incoming.get(slide.id);
            if (updated) refreshed.push(updated);
          }
        }
        return [...refreshed, ...Array.from(incoming.values()).filter(slide => !existingIds.has(slide.id))];
      });
      onReady(true);
    }).catch(error => {
      if (mounted) setError((error as Error).message);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
      onReady(false);
    };
  }, [setSlides, onReady]);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const images = files.filter(file => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024);
    if (images.length !== files.length) alert('Use imagens de até 10 MB.');
    const added = images.map(image => ({
      id: crypto.randomUUID(),
      title: image.name,
      isActive: true,
      image,
      order: 0,
    }));
    setSlides(current => [...current, ...added]);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const replaceSlide = (id: string, replacement: NoticeSlide) => {
    setSlides(current => current.map(slide => slide.id === id ? replacement : slide));
  };

  const saveChange = async (action: () => Promise<void>) => {
    setSaving(true);
    onSavingChange(true);
    try {
      await action();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  const handlePersistenceChange = (notice: NoticeSlide, index: number) => saveChange(async () => {
    if (notice.image instanceof File) {
      const data = new FormData();
      data.append('image', notice.image);
      data.append('title', notice.title);
      data.append('isActive', String(notice.isActive));
      const previousShared = slides.slice(0, index).filter(slide => typeof slide.image === 'string').at(-1);
      const nextShared = slides.slice(index + 1).find(slide => typeof slide.image === 'string');
      const order = previousShared && nextShared
        ? (previousShared.order + nextShared.order) / 2
        : previousShared ? previousShared.order + 1 : (nextShared?.order ?? 1) - 1;
      data.append('order', String(order));
      const saved = await createNotice(data);
      replaceSlide(notice.id, fromNotice(saved));
      return;
    }

    const response = await fetch(notice.image);
    if (!response.ok) throw new Error('Não foi possível baixar a imagem para mantê-la neste vídeo.');
    const blob = await response.blob();
    const filename = decodeURIComponent(new URL(notice.image, window.location.href).pathname.split('/').pop() || 'aviso.png');
    const local = { ...notice, id: crypto.randomUUID(), image: new File([blob], filename, { type: blob.type }) };
    await deleteNotice(notice.id);
    replaceSlide(notice.id, local);
  });

  const handleDelete = (notice: NoticeSlide) => {
    if (!window.confirm('Tem certeza que deseja apagar este aviso?')) return;
    void saveChange(async () => {
      if (typeof notice.image === 'string') await deleteNotice(notice.id);
      setSlides(current => current.filter(slide => slide.id !== notice.id));
    });
  };

  const handleToggleActive = (notice: NoticeSlide) => saveChange(async () => {
    const isActive = !notice.isActive;
    if (typeof notice.image === 'string') await updateNotice(notice.id, { isActive });
    replaceSlide(notice.id, { ...notice, isActive });
  });

  const handleReorder = (sourceId: string, targetId: string) => {
    const from = slides.findIndex(slide => slide.id === sourceId);
    const to = slides.findIndex(slide => slide.id === targetId);
    if (from < 0 || to < 0 || from === to) return;

    const reordered = [...slides];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setSlides(reordered);
    const sharedBefore = slides.filter(slide => typeof slide.image === 'string');
    const sharedAfter = reordered.filter(slide => typeof slide.image === 'string');
    if (sharedBefore.every((slide, index) => slide.id === sharedAfter[index].id)) return;

    void saveChange(async () => {
      const updates = await Promise.allSettled(sharedAfter.map((slide, order) =>
        slide.order === order ? Promise.resolve() : updateNotice(slide.id, { order })
      ));
      if (updates.some(result => result.status === 'rejected')) {
        const actual = new Map((await getNotices()).map(notice => [notice._id, notice.order]));
        setSlides(reordered.map(slide => ({ ...slide, order: actual.get(slide.id) ?? slide.order })));
        throw new Error('Não foi possível salvar toda a ordem compartilhada. A ordem deste vídeo foi mantida.');
      }
      setSlides(reordered.map(slide => {
        const order = sharedAfter.findIndex(shared => shared.id === slide.id);
        return order < 0 ? slide : { ...slide, order };
      }));
    });
  };

  return (
    <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Gerenciador de Avisos</h2>

      <div className="notice-manager-grid">

        {/* Formulário de Upload */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (saving) return;
                const images = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
                setFiles(current => [...current, ...images]);
              }}
              style={{ position: 'relative', height: '100px' }}
            >
              <input
                ref={fileInput}
                type="file"
                aria-label="Imagens dos avisos"
                disabled={saving || loading}
                accept="image/*"
                multiple
                onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2, top: 0, left: 0 }}
              />
              <div style={{
                border: '2px dashed var(--color-primary)', borderRadius: '0.75rem', padding: '1.25rem 1rem', textAlign: 'center', background: 'rgba(126, 34, 206, 0.05)',
                transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '100%'
              }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0, color: files.length > 0 ? '#4ade80' : 'white' }}>
                  {files.length > 0 ? `✓ ${files.length} arquivo(s) selecionado(s)` : 'Clique ou arraste imagens aqui'}
                </h3>
              </div>
            </div>

            <div>
              <label htmlFor="notice-duration" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Duração de cada slide no vídeo (segundos)</label>
              <input
                id="notice-duration"
                type="number"
                min={1}
                max={99}
                value={duration}
                onChange={(event) => onDurationChange(event.target.value)}
                onBlur={() => onDurationChange(String(Math.min(99, Math.max(1, Math.round(Number(duration) || 1)))))}
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={saving || loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.875rem' }}
            >
              Adicionar Slide
            </button>
          </form>
        </div>

        {/* Lista e Geração */}
        <div style={{ minWidth: 0 }}>
          <div>


            {!loading && !error && <p style={{ marginBottom: '1rem' }}>Slides no vídeo: {slides.filter(notice => notice.isActive).length} de {slides.length}</p>}
            {loading ? (
              <p className="text-gray-400 text-center py-8">Carregando slides...</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : slides.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Nenhum slide cadastrado ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                {slides.map((notice, index) => {
                  const persistent = typeof notice.image === 'string';
                  const persistenceColor = persistent ? '#f87171' : '#4ade80';

                  return (
                    <div
                      key={notice.id}
                      draggable={!saving}
                      onDragStart={(event) => {
                        setDraggedSlide(notice.id);
                        event.dataTransfer.setData('text/plain', notice.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(event) => {
                        if (!draggedSlide) return;
                        event.preventDefault();
                        setDragOverSlide(notice.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSlide(null);
                        setDragOverSlide(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!saving && draggedSlide) handleReorder(draggedSlide, notice.id);
                        setDraggedSlide(null);
                        setDragOverSlide(null);
                      }}
                      style={{
                        width: '240px', flex: '0 0 240px',
                        display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', borderRadius: '0.75rem',
                        background: notice.isActive ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                        border: dragOverSlide === notice.id ? '2px solid var(--color-primary)' : (notice.isActive ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--color-border)'),
                        opacity: draggedSlide === notice.id ? 0.5 : (notice.isActive ? 1 : 0.6),
                        position: 'relative',
                        cursor: 'grab'
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <SlideImage image={notice.image} title={notice.title} />
                        <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', borderRadius: '0.25rem', padding: '0.25rem 0.5rem' }}>
                          <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold' }}>#{index + 1}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handlePersistenceChange(notice, index)}
                        className="btn"
                        style={{ padding: '0.5rem', fontSize: '0.8rem', border: `1px solid ${persistenceColor}`, color: persistenceColor, background: persistent ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)' }}
                      >
                        {persistent ? 'Remover persistência' : 'Persistente'}
                      </button>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleToggleActive(notice)}
                          style={{
                            padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'center',
                            background: notice.isActive ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                            border: notice.isActive ? '1px solid #22c55e' : '1px solid var(--color-border)',
                            color: notice.isActive ? '#4ade80' : 'var(--color-text-muted)'
                          }}
                        >
                          {notice.isActive ? 'Ativo' : 'Inativo'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleDelete(notice)}
                          style={{ padding: '0.5rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'center' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
