import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const sheetId = process.env.GOOGLE_SHEET_ID;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

export interface BirthdayPerson {
  name: string;
  date: string; // "DD/MM"
  responsavel?: string;
  gender?: 'M' | 'F';
}

export interface BirthdayCard {
  name: string;
  day: string;
  month: string;
  weekday: string;
  gender?: 'M' | 'F';
}

export interface BirthdaySlides {
  period: string;
  pages: BirthdayCard[][];
}

export interface WeddingAnniversary {
  casal: string;
  date: string;
  anos: number;
  bodas?: string;
}

const formatDayMonth = (day: number, month: number) =>
  `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

// Domingo a sábado, com o ano de cada dia para calcular bodas na virada do ano.
const getTargetDates = (): Map<string, number> => {
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7));

  const targetDates = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(nextSunday);
    d.setDate(d.getDate() + i);
    targetDates.set(formatDayMonth(d.getDate(), d.getMonth() + 1), d.getFullYear());
  }
  return targetDates;
};

// Helper para padronizar strings de data (ex: D/M/AAAA ou DD/MM) para DD/MM
const parseDayMonth = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  return null;
};

const parseSheetDate = (value: unknown): { date: string; year: number } | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    if (Number.isNaN(date.getTime())) return null;
    return { date: formatDayMonth(date.getUTCDate(), date.getUTCMonth() + 1), year: date.getUTCFullYear() };
  }
  if (typeof value !== 'string') return null;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() + 1 !== month || date.getUTCFullYear() !== year) {
    return null;
  }
  return { date: formatDayMonth(day, month), year };
};

const getWeddingAnniversaries = async (spreadsheetId: string, targetDates: Map<string, number>): Promise<WeddingAnniversary[]> => {
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['Casamento!A2:B', 'Bodas!A2:B'],
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  });

  const weddingRows: unknown[][] = response.data.valueRanges?.[0]?.values ?? [];
  const anniversaryRows: unknown[][] = response.data.valueRanges?.[1]?.values ?? [];
  const namesByYear = new Map<number, string>();
  for (const [years, name] of anniversaryRows) {
    if (typeof years !== 'number' && typeof years !== 'string') continue;
    const age = Number(years);
    if (Number.isInteger(age) && age > 0 && typeof name === 'string' && name.trim()) {
      namesByYear.set(age, name.trim());
    }
  }

  const anniversariesByDate = new Map<string, WeddingAnniversary[]>();
  for (const [couple, value] of weddingRows) {
    if (typeof couple !== 'string' || !couple.trim()) continue;
    const wedding = parseSheetDate(value);
    if (!wedding) continue;
    const celebrationYear = targetDates.get(wedding.date);
    if (celebrationYear === undefined) continue;
    const years = celebrationYear - wedding.year;
    if (years < 1) continue;
    const anniversaries = anniversariesByDate.get(wedding.date) ?? [];
    anniversaries.push({ casal: couple.trim(), date: wedding.date, anos: years, bodas: namesByYear.get(years) });
    anniversariesByDate.set(wedding.date, anniversaries);
  }

  return Array.from(targetDates.keys()).flatMap(date => anniversariesByDate.get(date) ?? []);
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });

const formatBirthdayDate = (date: string, year: number) => {
  const [day, month] = date.split('/');
  const calendarDate = new Date(Date.UTC(year, Number(month) - 1, Number(day)));
  return {
    day,
    month: monthFormatter.format(calendarDate).toLocaleUpperCase('pt-BR'),
    weekday: weekdayFormatter.format(calendarDate).toLocaleUpperCase('pt-BR')
  };
};

const buildBirthdaySlides = (people: BirthdayPerson[], targetDates: Map<string, number>): BirthdaySlides => {
  const days = Array.from(targetDates, ([date, year]) => ({ date, ...formatBirthdayDate(date, year) }));
  const first = days[0];
  const last = days[days.length - 1];
  const period = first.month === last.month
    ? `${first.day} a ${last.day} de ${last.month}`
    : `${first.day} de ${first.month} a ${last.day} de ${last.month}`;
  const cards = days.flatMap(({ date, day, month, weekday }) =>
    people.filter(person => person.date === date).map(({ name, gender }) => {
      const parts = name.trim().split(/\s+/);
      const shortName = parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
      return { name: shortName, gender, day, month, weekday };
    })
  );
  const pages: BirthdayCard[][] = [];
  for (let index = 0; index < cards.length; index += 3) pages.push(cards.slice(index, index + 3));
  return { period, pages };
};

export const getBirthdaysForNextWeek = async (): Promise<{
  membros: BirthdayPerson[];
  dependentes: BirthdayPerson[];
  casamentos: WeddingAnniversary[] | null;
  slidesAniversariantes: BirthdaySlides | null;
}> => {
  if (!clientEmail || !privateKey || !sheetId) {
    console.warn('Google Sheets API credentials not fully configured.');
    return { membros: [], dependentes: [], casamentos: null, slidesAniversariantes: null };
  }

  const targetDates = getTargetDates();
  const weddings = getWeddingAnniversaries(sheetId, targetDates).catch(error => {
    console.error('Erro ao buscar as abas Casamento e Bodas:', error);
    return null;
  });
  const result = {
    membros: [] as BirthdayPerson[],
    dependentes: [] as BirthdayPerson[],
  };

  let slidesAniversariantes: BirthdaySlides | null = null;
  try {
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: ['membros!A2:C', 'dependentes!A2:D'],
    });

    const membrosData: string[][] = response.data.valueRanges?.[0].values || [];
    const dependentesData: string[][] = response.data.valueRanges?.[1].values || [];

    // Helper genérico para processar qualquer linha de aniversariante
    const processRow = (row: string[], nameIndex: number, dateIndex: number, genderIndex: number, responsavelIndex?: number): BirthdayPerson | null => {
      const name = row[nameIndex];
      const dateStr = row[dateIndex];
      if (!name || !dateStr) return null;

      const formattedDate = parseDayMonth(dateStr);
      if (formattedDate && targetDates.has(formattedDate)) {
        const person: BirthdayPerson = { name, date: formattedDate };
        const gender = row[genderIndex]?.trim().toUpperCase();
        if (gender === 'M' || gender === 'F') person.gender = gender;
        if (responsavelIndex !== undefined && row[responsavelIndex]) {
          person.responsavel = row[responsavelIndex];
        }
        return person;
      }
      return null;
    };

    membrosData.forEach(row => {
      // Membros: Nome (A=0), Data (B=1)
      const person = processRow(row, 0, 1, 2);
      if (person) result.membros.push(person);
    });

    dependentesData.forEach(row => {
      // Dependentes: Nome (C=2), Data (B=1), Responsável (A=0)
      const person = processRow(row, 2, 1, 3, 0);
      if (person) result.dependentes.push(person);
    });
    slidesAniversariantes = buildBirthdaySlides([...result.membros, ...result.dependentes], targetDates);
  } catch (error) {
    console.error('Error fetching Google Sheets for birthdays:', error);
  }

  return { ...result, casamentos: await weddings, slidesAniversariantes };
};

export const getPreachingForNextSunday = async (): Promise<{ theme: string; title: string }> => {
  if (!clientEmail || !privateKey || !sheetId) {
    throw new Error('A integração com o Google Sheets não está configurada.');
  }
  const [sunday] = getTargetDates();
  const [dayMonth, year] = sunday;
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: ["'Pregação'!B2", "'Pregação'!A4:B"],
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
  }, { timeout: 10_000 });

  const theme: unknown = response.data.valueRanges?.[0]?.values?.[0]?.[0];
  const rows: unknown[][] = response.data.valueRanges?.[1]?.values ?? [];
  for (const [date, title] of rows) {
    const parsed = parseSheetDate(date);
    if (parsed?.date === dayMonth && parsed.year === year && typeof title === 'string' && title.trim()) {
      return { theme: typeof theme === 'string' ? theme.trim() : '', title: title.trim() };
    }
  }
  return { theme: typeof theme === 'string' ? theme.trim() : '', title: '' };
};
