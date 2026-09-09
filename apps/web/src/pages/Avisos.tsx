import React, { useState, useEffect } from 'react';
import {
  getNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  generateNoticeVideo
} from '../services/api';
import type { Notice } from '../services/api';

export const AvisosManager: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for new notice
  const [files, setFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [draggedNoticeIndex, setDraggedNoticeIndex] = useState<number | null>(null);
  const [dragOverNoticeIndex, setDragOverNoticeIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getNotices();
      // Ensure sorted by order
      data.sort((a, b) => a.order - b.order);
      setNotices(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      alert('Selecione ao menos uma imagem.');
      return;
    }

    try {
      setUploading(true);

      const uploadPromises = files.map(file => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('title', file.name || 'Aviso'); // backend requires title
        formData.append('isActive', 'true'); // Default active when uploading
        formData.append('duration', String(duration));
        return createNotice(formData);
      });

      await Promise.all(uploadPromises);

      // Reset form
      setFiles([]);
      setDuration(10);

      await fetchNotices();
    } catch (err: any) {
      alert('Erro ao enviar imagem: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja apagar este aviso?')) return;
    try {
      await deleteNotice(id);
      await fetchNotices();
    } catch (err: any) {
      alert('Erro ao apagar: ' + err.message);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateNotice(id, { isActive: !currentStatus });
      await fetchNotices();
    } catch (err: any) {
      alert('Erro ao atualizar: ' + err.message);
    }
  };

  const handleUpdateDuration = async (id: string, newDuration: number) => {
    try {
      await updateNotice(id, { duration: newDuration });
    } catch (err: any) {
      alert('Erro ao atualizar duração: ' + err.message);
    }
  };

  const handleReorder = async (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;

    const newNotices = [...notices];
    const [draggedItem] = newNotices.splice(sourceIndex, 1);
    newNotices.splice(targetIndex, 0, draggedItem);

    // Optimistic UI update
    setNotices(newNotices);

    try {
      const updatePromises = newNotices.map((notice, index) => {
        // Only update if index doesn't match its stored order
        if (notice.order !== index) {
          return updateNotice(notice._id, { order: index });
        }
        return Promise.resolve();
      });
      await Promise.all(updatePromises);
      await fetchNotices();
    } catch (err: any) {
      alert('Erro ao reordenar: ' + err.message);
      await fetchNotices();
    }
  };

  const handleGenerateVideo = async () => {
    try {
      setGenerating(true);
      const url = await generateNoticeVideo();

      // Criar link para download automático
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      // The videoUrl is relative like /avisos/avisos.mp4
      // We need to resolve it relative to the API host.
      const baseUrl = API_URL.replace('/api', '');
      const fullUrl = `${baseUrl}${url}?v=${Date.now()}`;

      const link = document.createElement('a');
      link.href = fullUrl;
      link.download = `Avisos-${new Date().toISOString().split('T')[0]}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();

    } catch (err: any) {
      alert('Erro ao gerar vídeo: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Gerador de Vídeo de Avisos</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">

        {/* Formulário de Upload */}
        <div className="md:col-span-1" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ position: 'relative', height: '100px' }}>
              <input
                type="file"
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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Duração (Segundos)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={duration === 0 ? '' : duration}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val === '') {
                    setDuration(0);
                  } else {
                    const num = parseInt(val, 10);
                    if (num <= 99) setDuration(num);
                  }
                }}
                onBlur={() => {
                  if (duration === 0) setDuration(1);
                }}
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.875rem' }}
            >
              {uploading ? 'Enviando...' : 'Adicionar Slide'}
            </button>
          </form>
        </div>

        {/* Lista e Geração */}
        <div className="col-span-1 md:col-span-2 space-y-6" style={{ minWidth: 0 }}>
          <div>


            {loading ? (
              <p className="text-gray-400 text-center py-8">Carregando slides...</p>
            ) : error ? (
              <p className="text-red-400 text-center py-8">{error}</p>
            ) : notices.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Nenhum slide cadastrado ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
                {notices.map((notice, index) => {
                  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                  const baseUrl = API_URL.replace('/api', '');
                  const imgUrl = `${baseUrl}/avisos/${notice.filename}`;

                  return (
                    <div
                      key={notice._id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedNoticeIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverNoticeIndex(index);
                      }}
                      onDragEnd={() => {
                        setDraggedNoticeIndex(null);
                        setDragOverNoticeIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedNoticeIndex !== null) {
                          handleReorder(draggedNoticeIndex, index);
                        }
                        setDraggedNoticeIndex(null);
                        setDragOverNoticeIndex(null);
                      }}
                      style={{
                        width: '240px', flex: '0 0 240px',
                        display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', borderRadius: '0.75rem',
                        background: notice.isActive ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                        border: dragOverNoticeIndex === index ? '2px solid var(--color-primary)' : (notice.isActive ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--color-border)'),
                        opacity: draggedNoticeIndex === index ? 0.5 : (notice.isActive ? 1 : 0.6),
                        position: 'relative',
                        cursor: 'grab'
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <img src={imgUrl} alt="Aviso" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '0.5rem', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', borderRadius: '0.25rem', padding: '0.25rem 0.5rem' }}>
                          <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 'bold' }}>#{index + 1}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Duração (s):</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={notice.duration === 0 ? '' : notice.duration}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            const newNotices = [...notices];
                            const idx = newNotices.findIndex(n => n._id === notice._id);
                            if (idx === -1) return;

                            if (val === '') {
                              newNotices[idx] = { ...notice, duration: 0 };
                              setNotices(newNotices);
                            } else {
                              const num = parseInt(val, 10);
                              if (num <= 99) {
                                newNotices[idx] = { ...notice, duration: num };
                                setNotices(newNotices);
                              }
                            }
                          }}
                          onBlur={() => {
                            const finalDuration = notice.duration === 0 ? 1 : notice.duration;
                            if (notice.duration === 0) {
                              const newNotices = [...notices];
                              const idx = newNotices.findIndex(n => n._id === notice._id);
                              if (idx !== -1) {
                                newNotices[idx] = { ...notice, duration: 1 };
                                setNotices(newNotices);
                              }
                            }
                            handleUpdateDuration(notice._id, finalDuration);
                          }}
                          style={{ width: '4rem', padding: '0.25rem', borderRadius: '0.25rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', outline: 'none', textAlign: 'center' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleToggleActive(notice._id, notice.isActive)}
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
                          onClick={() => handleDelete(notice._id)}
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
