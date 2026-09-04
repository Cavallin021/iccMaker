import { useState } from 'react';
import { verifyPassword } from '../services/api';

interface LoginProps {
  role: 'admin' | 'canticos';
  onLoginSuccess: (password: string) => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

export function Login({ role, onLoginSuccess, title = "Acesso Restrito", description = "Igreja de Cristo em Brasília - Studio Maker", children }: LoginProps) {
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const isValid = await verifyPassword(loginPassword, role);
      if (isValid) {
        onLoginSuccess(loginPassword);
      }
    } catch (error: any) {
      setLoginError(error.message || 'Senha incorreta');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--color-bg)' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '450px', textAlign: 'center' }}>
        <img src="/favicon.svg" alt="Logo" style={{ width: '4rem', height: '4rem', marginBottom: '1.5rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{title}</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          {description}
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="password"
            placeholder="Senha"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-border)',
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              outline: 'none',
              fontSize: '1rem',
              textAlign: 'center'
            }}
          />
          {loginError && <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: 0 }}>{loginError}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoggingIn || !loginPassword}
            style={{ width: '100%', padding: '0.875rem', marginTop: '0.5rem' }}
          >
            {isLoggingIn ? 'Verificando...' : 'Acessar'}
          </button>
        </form>
        {children}
      </div>
    </div>
  );
}
