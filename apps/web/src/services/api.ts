const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface Option {
  _id: string;
  title: string;
  category: string;
  slidesCount: number;
  filePath: string;
  originalFileName: string;
  images: string[];
  lyrics?: string;
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

export const deleteOption = async (id: string): Promise<void> => {
  const response = await fetch(`${API_URL}/options/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Erro ao deletar opção');
  }
};

export const generatePresentation = async (
  optionIds: string[],
  extraImages: File[] = [],
  preachTheme: string = '',
  preachTitle: string = '',
  includeBirthdays: boolean = false,
  noticeDuration: number = 10,
  noticeSlides?: (string | File)[]
): Promise<string> => {
  const password = sessionStorage.getItem('studio_password') || '';
  
  const formData = new FormData();
  formData.append('optionIds', JSON.stringify(optionIds));
  formData.append('preachTheme', preachTheme);
  formData.append('preachTitle', preachTitle);
  formData.append('includeBirthdays', String(includeBirthdays));
  formData.append('noticeDuration', String(noticeDuration));

  if (noticeSlides) {
    let temporaryIndex = 0;
    const order = noticeSlides.map(slide => {
      if (typeof slide === 'string') return slide;
      formData.append('temporaryNotices', slide);
      return temporaryIndex++;
    });
    formData.append('noticeOrder', JSON.stringify(order));
  }

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

  const { jobId } = await response.json();
  for (let attempt = 0; attempt < 300; attempt++) {
    await new Promise(resolve => window.setTimeout(resolve, 3000));
    const result = await fetch(`${API_URL}/options/generate/${jobId}`, {
      headers: { 'x-studio-password': password },
      cache: 'no-store',
    });
    const job = await result.json();
    if (!result.ok || job.status === 'error') throw new Error(job.message || 'Erro ao gerar apresentação');
    if (job.status === 'success') return job.message || 'A apresentação foi enviada para o e-mail da igreja.';
  }
  throw new Error('A apresentação ainda está em processamento. Confira o e-mail antes de tentar novamente.');
};

export const generatePreviewPdf = async (optionIds: string[], signal: AbortSignal): Promise<Blob> => {
  const response = await fetch(`${API_URL}/options/preview-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionIds }),
    signal,
  });
  if (!response.ok) throw new Error('Não foi possível gerar a prévia em PDF.');
  return response.blob();
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

export interface WeddingAnniversary {
  casal: string;
  date: string;
  anos: number;
  bodas?: string;
}

export interface BirthdayCard {
  name: string;
  day: string;
  month: string;
  weekday: string;
  gender?: 'M' | 'F';
}

export interface WeeklyAnniversaries {
  membros: BirthdayPerson[];
  dependentes: BirthdayPerson[];
  casamentos: WeddingAnniversary[] | null;
  slidesAniversariantes: { period: string; pages: BirthdayCard[][] } | null;
}

export const getBirthdays = async (): Promise<WeeklyAnniversaries> => {
  const response = await fetch(`${API_URL}/options/birthdays`);
  if (!response.ok) {
    throw new Error('Erro ao buscar aniversariantes');
  }
  return response.json();
};

export const getPreaching = async (signal: AbortSignal): Promise<{ theme: string; title: string }> => {
  const response = await fetch(`${API_URL}/options/preaching`, { signal });
  if (!response.ok) throw new Error('Não foi possível consultar a aba Pregação.');
  return response.json();
};

export interface Notice {
  _id: string;
  title: string;
  filename: string;
  isRecurring: boolean;
  expiresAfterPresentation?: boolean;
  isActive: boolean;
  order: number;
  duration: number;
  createdAt: string;
}

export const getNoticeImageUrl = (filename: string): string =>
  /^https?:\/\//.test(filename) ? filename : `${API_URL.replace(/\/api\/?$/, '')}/avisos/${encodeURIComponent(filename)}`;

export const getNotices = async (): Promise<Notice[]> => {
  const response = await fetch(`${API_URL}/notices`);
  if (!response.ok) throw new Error('Erro ao buscar avisos');
  return response.json();
};

const noticeAdminHeaders = () => ({
  'x-studio-password': sessionStorage.getItem('studio_password') || '',
});

export const createNotice = async (formData: FormData): Promise<Notice> => {
  const response = await fetch(`${API_URL}/notices`, {
    method: 'POST',
    headers: noticeAdminHeaders(),
    body: formData,
  });
  if (!response.ok) throw new Error('Não foi possível salvar o slide no Cloudinary.');
  return response.json();
};

export const updateNotice = async (id: string, updates: Partial<Notice>): Promise<Notice> => {
  const response = await fetch(`${API_URL}/notices/${id}`, {
    method: 'PATCH',
    headers: { ...noticeAdminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Erro ao atualizar aviso');
  return response.json();
};

export const deleteNotice = async (id: string): Promise<void> => {
  const response = await fetch(`${API_URL}/notices/${id}`, { method: 'DELETE', headers: noticeAdminHeaders() });
  if (!response.ok) throw new Error('Erro ao deletar aviso');
};

export const generateNoticeVideo = async (): Promise<string> => {
  const response = await fetch(`${API_URL}/notices/generate-video`, { method: 'POST', headers: noticeAdminHeaders() });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Erro ao gerar vídeo');
  }
  return URL.createObjectURL(await response.blob());
};
