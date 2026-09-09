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
}

// Helper para gerar as datas alvo da próxima semana (Domingo a Sábado)
const getTargetDates = (): string[] => {
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7));

  const targetDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nextSunday);
    d.setDate(d.getDate() + i);
    const dayStr = String(d.getDate()).padStart(2, '0');
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    targetDates.push(`${dayStr}/${monthStr}`);
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

export const getBirthdaysForNextWeek = async (): Promise<{ membros: BirthdayPerson[], dependentes: BirthdayPerson[] }> => {
  if (!clientEmail || !privateKey || !sheetId) {
    console.warn('Google Sheets API credentials not fully configured.');
    return { membros: [], dependentes: [] };
  }

  const targetDates = getTargetDates();
  const result = {
    membros: [] as BirthdayPerson[],
    dependentes: [] as BirthdayPerson[],
  };

  try {
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: ['membros!A2:B', 'dependentes!A2:C'],
    });

    const membrosData: string[][] = response.data.valueRanges?.[0].values || [];
    const dependentesData: string[][] = response.data.valueRanges?.[1].values || [];

    // Helper genérico para processar qualquer linha de aniversariante
    const processRow = (row: string[], nameIndex: number, dateIndex: number, responsavelIndex?: number): BirthdayPerson | null => {
      const name = row[nameIndex];
      const dateStr = row[dateIndex];
      if (!name || !dateStr) return null;

      const formattedDate = parseDayMonth(dateStr);
      if (formattedDate && targetDates.includes(formattedDate)) {
        const person: BirthdayPerson = { name, date: formattedDate };
        if (responsavelIndex !== undefined && row[responsavelIndex]) {
          person.responsavel = row[responsavelIndex];
        }
        return person;
      }
      return null;
    };

    membrosData.forEach(row => {
      // Membros: Nome (A=0), Data (B=1)
      const person = processRow(row, 0, 1);
      if (person) result.membros.push(person);
    });

    dependentesData.forEach(row => {
      // Dependentes: Nome (C=2), Data (B=1), Responsável (A=0)
      const person = processRow(row, 2, 1, 0);
      if (person) result.dependentes.push(person);
    });

  } catch (error) {
    console.error('Error fetching Google Sheets for birthdays:', error);
  }

  return result;
};
