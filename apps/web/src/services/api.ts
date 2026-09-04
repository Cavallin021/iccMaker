const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface Option {
  _id: string;
  title: string;
  category: string;
  slidesCount: number;
  filePath: string;
  originalFileName: string;
  images: string[];
  createdAt: string;
}

export const getOptions = async (): Promise<Option[]> => {
  const response = await fetch(`${API_URL}/options`);
  if (!response.ok) {
    throw new Error('Erro ao buscar opções');
  }
  return response.json();
};

export const createOption = async (formData: FormData): Promise<Option> => {
  const response = await fetch(`${API_URL}/options`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Erro ao criar opção');
  }
  return response.json();
};

export const generatePresentation = async (optionIds: string[], extraImages: File[] = [], preachTheme: string = '', preachTitle: string = '', includeBirthdays: boolean = false): Promise<string> => {
  const password = sessionStorage.getItem('studio_password') || '';
  
  const formData = new FormData();
  formData.append('optionIds', JSON.stringify(optionIds));
  formData.append('preachTheme', preachTheme);
  formData.append('preachTitle', preachTitle);
  formData.append('includeBirthdays', String(includeBirthdays));

  extraImages.forEach((file) => {
    formData.append('extraImages', file);
  });

  const response = await fetch(`${API_URL}/options/generate`, {
    method: 'POST',
    headers: {
      'x-studio-password': password,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Erro ao gerar apresentação');
  }

  // Faz o download do arquivo retornado
  const blob = await response.blob();
  // Helper para formatar a data (ddMmmYY) ex: 30Ago26
  const getNextSunday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    const day = String(d.getDate()).padStart(2, '0');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const month = meses[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}${month}${year}`;
  };

  const emailStatus = response.headers.get('x-email-status') || 'disabled';

  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `Culto-${getNextSunday()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);

  return emailStatus;
};

export const verifyPassword = async (password: string, role: 'admin' | 'canticos') => {
  const response = await fetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, role }),
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Erro de autenticação');
  }
  
  return data.valid;
};

export interface Selection {
  _id: string;
  songs: string[];
  status: 'pending' | 'processed';
  createdAt: string;
}

export const createSelection = async (songs: string[]): Promise<Selection> => {
  const response = await fetch(`${API_URL}/selections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ songs }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Erro ao enviar seleção');
  }
  const data = await response.json();
  return data.selection;
};

export const getPendingSelections = async (): Promise<Selection[]> => {
  const response = await fetch(`${API_URL}/selections/pending`);
  if (!response.ok) {
    throw new Error('Erro ao buscar seleções pendentes');
  }
  return response.json();
};

export const markSelectionProcessed = async (id: string): Promise<void> => {
  const response = await fetch(`${API_URL}/selections/${id}/processed`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    throw new Error('Erro ao marcar seleção como processada');
  }
};
export const deleteSelection = async (id: string): Promise<void> => {
  const response = await fetch(`${API_URL}/selections/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Erro ao deletar seleção');
  }
};

export interface BirthdayPerson {
  name: string;
  date: string;
  responsavel?: string;
}

export const getBirthdays = async (): Promise<{ membros: BirthdayPerson[], dependentes: BirthdayPerson[] }> => {
  const response = await fetch(`${API_URL}/options/birthdays`);
  if (!response.ok) {
    throw new Error('Erro ao buscar aniversariantes');
  }
  return response.json();
};
