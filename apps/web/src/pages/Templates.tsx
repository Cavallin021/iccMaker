import React, { useState, useEffect } from 'react';

interface Template {
  _id: string;
  position: number;
  imageUrl: string;
}

export const TemplatesManager: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingPos, setUploadingPos] = useState<number | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_URL}/templates`);
      if (!res.ok) throw new Error('Falha ao carregar templates');
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (position: number, file: File) => {
    try {
      setUploadingPos(position);
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const formData = new FormData();
      formData.append('image', file);
      formData.append('position', String(position));

      const res = await fetch(`${API_URL}/templates/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Erro ao fazer upload do template');
      await fetchTemplates();
    } catch (err) {
      const error = err as Error;
      alert(error.message);
    } finally {
      setUploadingPos(null);
    }
  };

  const positions = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Gerenciador de Templates (Státics)</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        Aqui você pode substituir as 7 imagens fixas do modelo da apresentação. Elas serão salvas na nuvem para não se perderem.
      </p>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      
      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {positions.map(pos => {
            const temp = templates.find(t => t.position === pos);
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
            const baseUrl = API_URL.replace('/api', '');
            const fallbackUrl = `${baseUrl}/template/static_${pos}.jpg`;

            return (
              <div key={pos} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Slide {pos}</h3>
                
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', marginBottom: '1rem', borderRadius: '0.5rem', overflow: 'hidden', background: '#000' }}>
                  <img 
                    src={temp ? temp.imageUrl : fallbackUrl} 
                    alt={`Template ${pos}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/1920x1080?text=Sem+Imagem';
                    }}
                  />
                  {uploadingPos === pos && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="text-white">Enviando...</span>
                    </div>
                  )}
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleUpload(pos, e.target.files[0]);
                      }
                    }}
                    style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 }}
                    disabled={uploadingPos === pos}
                  />
                  <button className="btn btn-primary" style={{ width: '100%', padding: '0.5rem' }} disabled={uploadingPos === pos}>
                    Substituir Imagem
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
