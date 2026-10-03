import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOptions, getPendingSelections, generatePresentation, markSelectionProcessed, deleteSelection, getBirthdays, createOption, deleteOption, downloadPreviewPdf, type Option, type Selection, type BirthdayPerson } from '../services/api';
import { Login } from '../components/Login';
import { AvisosManager } from './Avisos';

const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : 'http://localhost:3001';

export function Studio() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!sessionStorage.getItem('studio_password'));
  const [options, setOptions] = useState<Option[]>([]);
  const [pendingSelections, setPendingSelections] = useState<Selection[]>([]);

  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);

  const [extraImages, setExtraImages] = useState<File[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);
  const [preachTheme, setPreachTheme] = useState(() => localStorage.getItem('last_preach_theme') || '');
  const [preachTitle, setPreachTitle] = useState('');
  const [birthdays, setBirthdays] = useState<{ membros: BirthdayPerson[], dependentes: BirthdayPerson[] } | null>(null);

  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [generationMessage, setGenerationMessage] = useState('');
  const [isDownloadingPreview, setIsDownloadingPreview] = useState(false);

  const [isNewSongModalOpen, setIsNewSongModalOpen] = useState(false);
  const [newSongNumber, setNewSongNumber] = useState('');
  const [newSongName, setNewSongName] = useState('');
  const [newSongCategory, setNewSongCategory] = useState('LOUVOR');
  const [newSongFiles, setNewSongFiles] = useState<File[]>([]);
  const [newSongDraggedIndex, setNewSongDraggedIndex] = useState<number | null>(null);
  const [newSongDragOverIndex, setNewSongDragOverIndex] = useState<number | null>(null);
  const [isSubmittingNewSong, setIsSubmittingNewSong] = useState(false);

  // Estados para Modal de Gerenciar Cânticos
  const [isManageSongsModalOpen, setIsManageSongsModalOpen] = useState(false);
  const [manageSongsSearch, setManageSongsSearch] = useState('');
  // Save extraImages to IndexedDB when it changes
  useEffect(() => {
    const request = indexedDB.open('MakerStudioDB', 1);
    request.onupgradeneeded = (e: Event) => (e.target as IDBOpenDBRequest).result.createObjectStore('extra_images_store');
    request.onsuccess = (e: Event) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('extra_images_store')) return; // handled by upgrade
      const tx = db.transaction('extra_images_store', 'readwrite');
      tx.objectStore('extra_images_store').put(extraImages, 'last_extra_images');
    };
  }, [extraImages]);

  // Load extraImages from IndexedDB on mount
  useEffect(() => {
    const request = indexedDB.open('MakerStudioDB', 1);
    request.onupgradeneeded = (e: Event) => (e.target as IDBOpenDBRequest).result.createObjectStore('extra_images_store');
    request.onsuccess = (e: Event) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('extra_images_store')) return;
      const tx = db.transaction('extra_images_store', 'readonly');
      const getReq = tx.objectStore('extra_images_store').get('last_extra_images');
      getReq.onsuccess = () => {
        if (getReq.result) setExtraImages(getReq.result);
      };
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      loadBirthdays();
    }
  }, [isAuthenticated]);

  const fetchData = async () => {
    try {
      const opts = await getOptions();
      setOptions(opts);
      const sel = await getPendingSelections();
      setPendingSelections(sel);
    } catch (error) {
      console.error(error);
      alert('Erro ao buscar dados do estúdio');
    }
  };

  const loadBirthdays = async () => {
    try {
      const data = await getBirthdays();
      setBirthdays(data);
    } catch (error) {
      console.error('Erro ao carregar aniversariantes', error);
    }
  };

  const handleDeleteSelection = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta seleção?')) {
      try {
        await deleteSelection(id);
        fetchData();
      } catch (e) {
    const error = e as Error;
        alert(error.message || 'Erro ao deletar seleção');
      }
    }
  };

  const handleGenerate = async () => {
    if (!activeSelection) return;

    try {
      setGenerationStatus('generating');
      setGenerationMessage('Montando slides e enviando e-mail... Por favor aguarde.');
      const { status } = await generatePresentation(activeSelection.songs, extraImages, preachTheme, preachTitle, false);

      // Marcar como processada na API
      await markSelectionProcessed(activeSelection._id);

      if (status === 'success' || status === 'disabled') {
        localStorage.setItem('last_preach_theme', preachTheme);
        setGenerationStatus('success');
        setGenerationMessage('Sucesso! A apresentação foi enviada para o e-mail da igreja.');
      } else {
        setGenerationStatus('error');
        setGenerationMessage('Atenção: A apresentação foi gerada, mas houve uma falha no envio automático do e-mail. Por favor, avise o administrador da equipe.');
      }
    } catch (e) {
    const error = e as Error;
      console.error(error);
      setGenerationStatus('error');
      setGenerationMessage(error.message || 'Erro crítico ao tentar gerar a apresentação.');
      if (error.message?.includes('Não autorizado') || error.message?.includes('Senha')) {
        sessionStorage.removeItem('studio_password');
        setIsAuthenticated(false);
      }
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('studio_password');
    setIsAuthenticated(false);
  };

  const handleDownloadPreview = async () => {
    if (!activeSelection) return;
    try {
      setIsDownloadingPreview(true);
      await downloadPreviewPdf(activeSelection.songs);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar o PDF de preview.');
    } finally {
      setIsDownloadingPreview(false);
    }
  };

  const handleNewSongSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSongFiles.length === 0 || !newSongName || !newSongCategory) {
      alert('Preencha os campos obrigatórios (Nome, Categoria e Arquivos)');
      return;
    }
    
    let formattedNumber = '+++';
    if (newSongNumber.trim() !== '') {
      const parsedNum = parseInt(newSongNumber.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedNum)) {
        formattedNumber = parsedNum.toString().padStart(3, '0');
      } else {
        formattedNumber = newSongNumber.trim();
      }
    }
    const finalTitle = `${formattedNumber} - ${newSongName.trim()}`;

    setIsSubmittingNewSong(true);
    try {
      const formData = new FormData();
      formData.append('title', finalTitle);
      formData.append('category', newSongCategory);
      // O backend já conta os slides com base na quantidade de imagens (files.length)
      newSongFiles.forEach(file => {
        formData.append('images', file);
      });

      await createOption(formData);
      alert('Cântico criado com sucesso!');
      setIsNewSongModalOpen(false);
      setNewSongNumber('');
      setNewSongName('');
      setNewSongCategory('LOUVOR');
      setNewSongFiles([]);
      fetchData();
    } catch (error) {
      console.error(error);
      alert('Erro ao criar cântico.');
    } finally {
      setIsSubmittingNewSong(false);
    }
  };

  const handleDeleteOption = async (id: string, title: string) => {
    if (confirm(`Tem certeza que deseja apagar permanentemente o cântico "${title}"?`)) {
      try {
        await deleteOption(id);
        fetchData(); // reload options
      } catch (error) {
        console.error(error);
        alert('Erro ao apagar cântico.');
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <Login
        role="admin"
        onLoginSuccess={(pwd) => {
          sessionStorage.setItem('studio_password', pwd);
          setIsAuthenticated(true);
        }}
        title="Acesso ao Estúdio"
        description="Conclua a apresentação do culto."
      >
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <Link to="/" className="btn" style={{
            display: 'block',
            width: '100%',
            padding: '0.875rem',
            borderRadius: '0.5rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
            transition: 'all 0.2s ease'
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
          >
            ← Voltar para Cânticos
          </Link>
        </div>
      </Login>
    );
  }

  // Lista as seleções caso nenhuma esteja ativa
  if (!activeSelection) {
    return (
      <div className="app-container">
        <header className="header">
          <div className="header-container">
            <div className="logo">
              <span className="logo-text">Estúdio Maker - ICC</span>
            </div>
            <div className="header-buttons" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm-text"
                onClick={() => setIsManageSongsModalOpen(true)}
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--color-border)', color: 'white' }}
              >
                Gerenciar Cânticos
              </button>
              <button
                className="btn btn-primary btn-sm-text"
                onClick={() => setIsNewSongModalOpen(true)}
              >
                + Novo Cântico
              </button>
              <button
                className="btn btn-secondary btn-sm-text"
                onClick={handleLogout}
                style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        <main className="main-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '2rem' }}>
          {pendingSelections.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Seleções Recebidas</h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '1.25rem' }}>Nenhuma seleção pendente no momento.</p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Seleções Recebidas</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {pendingSelections.map(sel => {
                  const getNextSunday = (dateString: string) => {
                    const d = new Date(dateString);
                    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
                    const day = String(d.getDate()).padStart(2, '0');
                    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                    const month = meses[d.getMonth()];
                    const year = d.getFullYear();
                    return `${day} de ${month} de ${year}`;
                  };

                  return (
                    <div key={sel._id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative' }}>
                      {sel.status === 'processed' && (
                        <div style={{ position: 'absolute', top: '-0.5rem', right: '-0.5rem', background: '#22c55e', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                          ✅ Já Enviado
                        </div>
                      )}
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>Domingo, {getNextSunday(sel.createdAt)}</h3>
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                        Criada em: {new Date(sel.createdAt).toLocaleDateString()} às {new Date(sel.createdAt).toLocaleTimeString()}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-primary" onClick={() => setActiveSelection(sel)} style={{ flex: 1, padding: '0.5rem' }}>
                          Abrir para Edição
                        </button>
                        <button onClick={() => handleDeleteSelection(sel._id)} style={{ padding: '0.5rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '0.5rem', cursor: 'pointer' }} title="Deletar Seleção">
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {/* Modal Novo Cântico */}
        {isNewSongModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '500px', border: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'white' }}>Adicionar Novo Cântico</h2>
              <form onSubmit={handleNewSongSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ width: '100px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Número</label>
                    <input
                      type="text"
                      value={newSongNumber}
                      onChange={(e) => setNewSongNumber(e.target.value)}
                      placeholder="Ex: 001"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Nome do Cântico</label>
                    <input
                      type="text"
                      value={newSongName}
                      onChange={(e) => setNewSongName(e.target.value)}
                      placeholder="Ex: O Grande Eu Sou"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Categoria</label>
                  <select
                    value={newSongCategory}
                    onChange={(e) => setNewSongCategory(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
                  >
                    <option value="LOUVOR" style={{ background: '#111' }}>LOUVOR</option>
                    <option value="ADORACAO" style={{ background: '#111' }}>ADORAÇÃO</option>
                    <option value="CEIA" style={{ background: '#111' }}>CEIA</option>
                    <option value="DIZIMO" style={{ background: '#111' }}>DÍZIMO</option>
                    <option value="INFANTIL" style={{ background: '#111' }}>INFANTIL</option>
                    <option value="CORAL" style={{ background: '#111' }}>CORAL</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Imagens (Slides)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        const files = Array.from(e.target.files);
                        setNewSongFiles(files);
                      }
                    }}
                    style={{ width: '100%', color: 'white', marginBottom: '1rem' }}
                    required={newSongFiles.length === 0}
                  />
                  
                  {newSongFiles.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#4ade80', fontWeight: 'bold' }}>✓ {newSongFiles.length} slide(s) selecionado(s)</span>
                        <button type="button" onClick={() => setNewSongFiles([])} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>Limpar</button>
                      </div>
                      
                      <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Arraste as imagens abaixo para reordenar os slides:</p>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem', maxHeight: '30vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        {newSongFiles.map((file, i) => (
                          <div
                            key={i}
                            draggable
                            onDragStart={(e) => {
                              setNewSongDraggedIndex(i);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setNewSongDragOverIndex(i);
                            }}
                            onDragEnd={() => {
                              setNewSongDraggedIndex(null);
                              setNewSongDragOverIndex(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (newSongDraggedIndex === null || newSongDraggedIndex === i) return;
                              const newImages = [...newSongFiles];
                              const draggedItem = newImages[newSongDraggedIndex];
                              newImages.splice(newSongDraggedIndex, 1);
                              newImages.splice(i, 0, draggedItem);
                              setNewSongFiles(newImages);
                              setNewSongDraggedIndex(null);
                              setNewSongDragOverIndex(null);
                            }}
                            style={{
                              background: '#000',
                              borderRadius: '0.5rem',
                              overflow: 'hidden',
                              border: newSongDragOverIndex === i ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                              opacity: newSongDraggedIndex === i ? 0.5 : 1,
                              cursor: 'grab',
                              position: 'relative'
                            }}
                          >
                            <img src={URL.createObjectURL(file)} alt="Slide" style={{ width: '100%', height: '70px', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', top: 0, left: 0, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.1rem 0.4rem', fontSize: '0.7rem', borderBottomRightRadius: '0.5rem' }}>{i + 1}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsNewSongModalOpen(false)} style={{ flex: 1 }}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmittingNewSong}>
                    {isSubmittingNewSong ? 'Salvando...' : 'Salvar Cântico'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Gerenciar Cânticos */}
        {isManageSongsModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(5px)' }}>
            <div className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '600px', maxHeight: '80vh', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'white' }}>Gerenciar Cânticos</h2>
              <input
                type="text"
                placeholder="Pesquisar cântico..."
                value={manageSongsSearch}
                onChange={(e) => setManageSongsSearch(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', marginBottom: '1rem' }}
              />
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
                {options
                  .filter(opt => !manageSongsSearch || (opt.title || '').toLowerCase().includes(manageSongsSearch.toLowerCase()))
                  .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                  .map(opt => (
                    <div key={opt._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
                      <span style={{ color: 'white' }}>{opt.title}</span>
                      <button
                        onClick={() => handleDeleteOption(opt._id, opt.title)}
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '0.5rem', cursor: 'pointer', padding: '0.25rem 0.5rem' }}
                        title="Apagar Cântico"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                {options.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Nenhum cântico encontrado.</p>}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary" onClick={() => setIsManageSongsModalOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Se tem uma seleção ativa, mostra o painel completo do admin
  const selectedOptionsData = activeSelection.songs.map(id => options.find(opt => opt._id === id)).filter(Boolean) as Option[];

  const formatTitle = (rawTitle: string) => {
    const match = rawTitle.match(/^([^-]+)-(.*)$/);
    if (match) {
      return { badge: match[1].trim(), name: match[2].trim() };
    }
    return { badge: 'Cânticos', name: rawTitle };
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-container">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => setActiveSelection(null)}>
            <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>←</span>
            <span className="logo-text">Voltar às seleções</span>
          </div>
          <div className="header-buttons" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="btn btn-secondary btn-sm-text"
              onClick={handleDownloadPreview}
              disabled={isDownloadingPreview}
              style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--color-border)', color: 'white' }}
            >
              {isDownloadingPreview ? 'Baixando...' : '⬇️ Baixar PDF da Preview'}
            </button>
            <button
              className="btn btn-primary btn-sm-text"
              disabled={generationStatus === 'generating'}
              onClick={handleGenerate}
            >
              {generationStatus === 'generating' ? 'Processando...' : 'Gerar Apresentação'}
            </button>
          </div>
        </div>
      </header>

      <div className="main-layout">
        <main className="animate-fade-in main-content">
          <div className="header-actions" style={{ marginBottom: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '2rem', margin: 0 }}>Finalize a Apresentação</h1>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
                Adicione avisos extras e o tema da pregação.
              </p>
            </div>
          </div>

          <div className="extra-images-container">
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Avisos Extras (Opcional)</h2>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: '1.4' }}>Arraste para o quadro ao lado ou clique para selecionar. Você pode arrastar as imagens abaixo para reordenar.</p>

              {extraImages.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', borderRadius: '0.5rem', marginBottom: '0.5rem', alignSelf: 'flex-start' }}>
                    <span style={{ fontSize: '0.875rem', color: '#4ade80', fontWeight: 'bold' }}>✓ {extraImages.length} aviso(s) carregado(s)</span>
                    <button onClick={() => setExtraImages([])} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>Limpar Todos</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                    {extraImages.map((file, i) => (
                      <div
                        key={i}
                        draggable
                        onDragStart={(e) => {
                          setDraggedImageIndex(i);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverImageIndex(i);
                        }}
                        onDragEnd={() => {
                          setDraggedImageIndex(null);
                          setDragOverImageIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedImageIndex === null || draggedImageIndex === i) return;

                          const newImages = [...extraImages];
                          const draggedItem = newImages[draggedImageIndex];
                          newImages.splice(draggedImageIndex, 1);
                          newImages.splice(i, 0, draggedItem);

                          setExtraImages(newImages);
                          setDraggedImageIndex(null);
                          setDragOverImageIndex(null);
                        }}
                        style={{
                          background: '#000',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          border: dragOverImageIndex === i ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          opacity: draggedImageIndex === i ? 0.5 : 1,
                          cursor: 'grab',
                          position: 'relative'
                        }}
                      >
                        <img src={URL.createObjectURL(file)} alt="Extra" style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', top: 0, left: 0, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.1rem 0.4rem', fontSize: '0.7rem', borderBottomRightRadius: '0.5rem' }}>{i + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="extra-images-dropzone">
              <input
                type="file" multiple accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    const newFiles = Array.from(e.target.files);
                    setExtraImages(prev => [...prev, ...newFiles]);
                  }
                }}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2, top: 0, left: 0 }}
              />
              <div style={{
                border: '2px dashed var(--color-primary)', borderRadius: '0.75rem', padding: '1.25rem 1rem', textAlign: 'center', background: 'rgba(126, 34, 206, 0.05)',
                transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', height: '100%'
              }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'white' }}>Upload de imagens</h3>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Mensagem / Pregação (Opcional)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Tema da Pregação</label>
                <input
                  type="text" value={preachTheme} onChange={(e) => setPreachTheme(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Título da Mensagem</label>
                <input
                  type="text" value={preachTitle} onChange={(e) => setPreachTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.05)', color: 'white', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Aniversariantes da Semana (Dom a Sáb)</h2>

            {birthdays ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Membros</h3>
                  {birthdays.membros.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {birthdays.membros.map((b, idx) => (
                        <li key={idx} style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                          <strong style={{ color: 'var(--color-text-muted)' }}>{b.date}</strong> - {b.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Nenhum membro aniversariante nesta semana.</p>
                  )}
                </div>

                <div>
                  <h3 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>Dependentes</h3>
                  {birthdays.dependentes.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {birthdays.dependentes.map((b, idx) => (
                        <li key={idx} style={{ marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                          <strong style={{ color: 'var(--color-text-muted)' }}>{b.date}</strong> - {b.name} <br />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>(Resp: {b.responsavel})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Nenhum dependente aniversariante nesta semana.</p>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Buscando aniversariantes da planilha...</p>
            )}
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <AvisosManager />
          </div>
        </main>

        <aside className="sidebar glass-panel sidebar-preview" style={{ borderRadius: 0, borderRight: 'none', borderBottom: 'none' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Preview Completo</h2>
          </div>
          <div className="sidebar-scroll">
            {/* Helpers omitted for brevity in preview, just basic structure here */}
            {(() => {
              const renderStatic = (num: number, label: string) => (
                <div style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--color-border)' }}>
                  <h4 style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{label}</h4>
                  <div style={{ background: '#000', borderRadius: '0.5rem', overflow: 'hidden', border: '1px dashed var(--color-border)' }}>
                    <img src={`${BASE_URL}/template/static_${num}.jpg`} alt={`Estático ${num}`} style={{ width: '100%', display: 'block', opacity: 0.7 }} />
                  </div>
                </div>
              );

              const renderBlock = (index: number) => {
                const opt = selectedOptionsData[index];
                if (!opt) return null;
                const { name } = formatTitle(opt.title || '');
                return (
                  <div style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--color-primary)' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>{index + 1}. {name}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {(opt.images || []).map((img, imgIndex) => {
                        const folderName = (opt.filePath || '').split('/').pop();
                        const imgUrl = img.startsWith('http') ? img : `${BASE_URL}/static/${folderName}/${img}`;
                        return (
                          <div key={imgIndex} style={{ background: '#000', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                            <img src={imgUrl} alt={`Capa`} style={{ width: '100%', display: 'block' }} loading="lazy" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
                  {renderStatic(1, "Aviso 1")}
                  {extraImages.length > 0 && (
                    <div style={{ paddingLeft: '1rem', borderLeft: '3px solid #952e47' }}>
                      <h4 style={{ fontSize: '0.875rem', color: '#952e47', marginBottom: '0.5rem' }}>Avisos Extras ({extraImages.length})</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {extraImages.map((file, i) => (
                          <div key={i} style={{ background: '#000', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                            <img src={URL.createObjectURL(file)} alt="Extra" style={{ width: '100%', display: 'block' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {renderStatic(2, "Aviso 2")}
                  {renderBlock(0)}
                  {renderBlock(1)}
                  {renderBlock(2)}
                  {renderStatic(3, "Transição")}
                  {renderBlock(3)}
                  {renderStatic(4, "Transição 2")}
                  {renderStatic(5, "Transição 3")}
                  {renderBlock(4)}
                  {renderBlock(5)}
                  <div style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--color-border)' }}>
                    <h4 style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Mensagem</h4>
                    <div style={{ background: '#000', borderRadius: '0.5rem', overflow: 'hidden', border: '1px dashed var(--color-border)', position: 'relative' }}>
                      <img src={`${BASE_URL}/template/static_6.jpg`} alt="Estático 6" style={{ width: '100%', display: 'block', opacity: 0.7 }} />
                      {(preachTheme || preachTitle) && (
                        <div style={{ position: 'absolute', top: '35%', left: '7.5%', width: '47.5%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: '#FFFF00', fontWeight: 'bold', fontSize: '0.4rem', lineHeight: '1.2' }}>{preachTheme}</span>
                          <span style={{ color: '#FFFF00', fontWeight: 'bold', fontSize: '0.4rem', lineHeight: '1.2' }}>{preachTitle}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {renderBlock(6)}
                  {renderStatic(7, "Encerramento")}
                </div>
              );
            })()}
          </div>
        </aside>
      </div>

      {generationStatus !== 'idle' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '500px', textAlign: 'center', border: generationStatus === 'success' ? '2px solid #22c55e' : (generationStatus === 'error' ? '2px solid #ef4444' : '2px solid var(--color-primary)') }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: generationStatus === 'success' ? '#22c55e' : (generationStatus === 'error' ? '#ef4444' : 'white') }}>
              {generationStatus === 'generating' && 'Aguarde um momento...'}
              {generationStatus === 'success' && 'Tudo Certo! 🎉'}
              {generationStatus === 'error' && 'Atenção! ⚠️'}
            </h2>
            <p style={{ marginBottom: '2rem', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>{generationMessage}</p>

            {generationStatus !== 'generating' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={() => {
                  setGenerationStatus('idle');
                  setActiveSelection(null);
                  fetchData(); // Reload selections
                }} style={{ width: '100%', padding: '0.875rem' }}>
                  Entendido, Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
