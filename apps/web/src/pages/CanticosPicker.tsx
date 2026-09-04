import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOptions, createSelection, type Option } from '../services/api';
import { Login } from '../components/Login';

const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api$/, '') : 'http://localhost:3001';

export function CanticosPicker() {
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [isAuthenticated, setIsAuthenticated] = useState(!!sessionStorage.getItem('canticos_password'));
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      const data = await getOptions();
      setOptions(data);
    } catch (error) {
      console.error(error);
      alert('Erro ao buscar opções');
    }
  };

  const formatTitle = (rawTitle: string) => {
    const match = rawTitle.match(/^(\d+)-(.*)$/);
    if (match) {
      return { badge: match[1], name: match[2].trim() };
    }
    return { badge: 'Cânticos', name: rawTitle };
  };

  const toggleOption = (id: string) => {
    setSelectedOptions(prev => {
      if (prev.includes(id)) {
        return prev.filter(opt => opt !== id);
      } else {
        if (prev.length >= 7) {
          alert('Você já selecionou 7 cânticos.');
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  const handleSend = async () => {
    if (selectedOptions.length !== 7) return;
    try {
      setIsSending(true);
      await createSelection(selectedOptions);
      alert('Cânticos enviados para o estúdio com sucesso!');
      setSelectedOptions([]);
      sessionStorage.removeItem('canticos_password');
      setIsAuthenticated(false);
    } catch (error: any) {
      alert(error.message || 'Erro ao enviar cânticos.');
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('canticos_password');
    setIsAuthenticated(false);
    setSelectedOptions([]);
  };

  if (!isAuthenticated) {
    return (
      <Login
        role="canticos"
        onLoginSuccess={(pwd) => {
          sessionStorage.setItem('canticos_password', pwd);
          setIsAuthenticated(true);
        }}
        title="Acesso de Cânticos"
        description="Selecione os hinos para o próximo culto."
      >
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/studio" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ir para studio -&gt;
          </Link>
        </div>
      </Login>
    );
  }

  const selectedOptionsData = selectedOptions.map(id => options.find(opt => opt._id === id)).filter(Boolean) as Option[];
  const filteredOptions = [...options]
    .filter(opt => opt.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-container">
          <div className="logo">
            <img src="/favicon.svg" alt="Logo" className="logo-icon" />
            <span className="logo-text">Seleção de Cânticos - ICC</span>
          </div>
          <div className="header-buttons">
            <button
              className="btn btn-secondary btn-sm-text"
              onClick={handleLogout}
              style={{ marginRight: '1rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              Sair
            </button>
            <button
              className={selectedOptions.length === 7 ? 'btn btn-primary btn-sm-text' : 'btn btn-disabled btn-sm-text'}
              disabled={selectedOptions.length !== 7 || isSending}
              onClick={handleSend}
            >
              {isSending ? 'Enviando...' : `Enviar para o Estúdio (${selectedOptions.length}/7)`}
            </button>
          </div>
        </div>
      </header>

      <div className="main-layout">
        <main className="animate-fade-in main-content">
          <div className="header-actions" style={{ marginBottom: '2rem' }}>
            <div>
              <h1 style={{ fontSize: '2rem', margin: 0 }}>Escolha os Cânticos</h1>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
                Selecione os 7 cânticos que serão cantados no próximo culto.
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <input
              type="text"
              placeholder="Pesquisar cântico pelo nome ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-border)',
                background: 'rgba(255,255,255,0.05)',
                color: 'white',
                outline: 'none',
                fontSize: '1.125rem'
              }}
            />
          </div>

          {filteredOptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
              <p>{options.length === 0 ? 'Carregando opções...' : 'Nenhum cântico encontrado com essa pesquisa.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredOptions.map((option) => {
                const { badge, name } = formatTitle(option.title);
                return (
                  <div
                    key={option._id}
                    className="glass-panel"
                    style={{
                      padding: '1.5rem',
                      cursor: 'pointer',
                      border: selectedOptions.includes(option._id) ? '2px solid var(--color-primary)' : '2px solid transparent',
                      background: selectedOptions.includes(option._id) ? 'rgba(126, 34, 206, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => toggleOption(option._id)}
                  >
                    <div className="flex justify-between items-start" style={{ marginBottom: '1rem' }}>
                      <span className="badge">{badge}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {option.slidesCount} slides
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{name}</h3>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: selectedOptions.includes(option._id) ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      {selectedOptions.includes(option._id) ? '✓ Adicionado' : '+ Clique para adicionar'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        <aside className="glass-panel" style={{
          width: '400px',
          borderRight: 'none',
          borderTop: 'none',
          borderBottom: 'none',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 23, 42, 0.95)'
        }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Preview</h2>
            <p style={{ fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>Ordem dos {selectedOptions.length}/7 cânticos selecionados</p>
          </div>

          <div className="sidebar-scroll" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from({ length: 7 }).map((_, index) => {
              const opt = selectedOptionsData[index];
              if (!opt) {
                return (
                  <div key={index} style={{ padding: '1rem', border: '2px dashed var(--color-border)', borderRadius: '0.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    [ Bloco {index + 1} Vazio ]<br /><small>Selecione um cântico</small>
                  </div>
                );
              }
              const { name } = formatTitle(opt.title);
              return (
                <div key={index} style={{ paddingLeft: '1rem', borderLeft: '3px solid var(--color-primary)' }}>
                  <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>{index + 1}. {name}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {opt.images.map((img, imgIndex) => {
                      const folderName = opt.filePath.split('/').pop();
                      return (
                        <div key={imgIndex} style={{ background: '#000', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                          <img src={`${BASE_URL}/static/${folderName}/${img}`} alt={`Capa ${imgIndex + 1}`} style={{ width: '100%', display: 'block' }} loading="lazy" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
