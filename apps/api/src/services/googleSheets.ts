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

export const getBirthdaysForNextWeek = async (): Promise<{ membros: BirthdayPerson[], dependentes: BirthdayPerson[] }> => {
  if (!clientEmail || !privateKey || !sheetId) {
    console.warn('Google Sheets API credentials not fully configured.');
    return { membros: [], dependentes: [] };
  }

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

  const result = {
    membros: [] as BirthdayPerson[],
    dependentes: [] as BirthdayPerson[],
  };

  try {
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: ['membros!A2:B', 'dependentes!A2:C'],
    });

    const membrosData = response.data.valueRanges?.[0].values || [];
    const dependentesData = response.data.valueRanges?.[1].values || [];

    const processMembroRow = (row: any[]) => {
      const name = row[0] as string;
      const dateStr = row[1] as string; 
      if (!name || !dateStr) return null;

      const parts = dateStr.split('/');
      if (parts.length >= 2) {
        const rowDayMonth = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
        if (targetDates.includes(rowDayMonth)) {
          return { name, date: rowDayMonth };
        }
      }
      return null;
    };

    const processDependenteRow = (row: any[]) => {
      const name = row[0] as string;
      const dateStr = row[1] as string;
      const responsavel = row[2] as string;
      if (!name || !dateStr) return null;

      const parts = dateStr.split('/');
      if (parts.length >= 2) {
        const rowDayMonth = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
        if (targetDates.includes(rowDayMonth)) {
          return { name, date: rowDayMonth, responsavel };
        }
      }
      return null;
    };

    membrosData.forEach(row => {
      const person = processMembroRow(row);
      if (person) result.membros.push(person);
    });

    dependentesData.forEach(row => {
      const person = processDependenteRow(row);
      if (person) result.dependentes.push(person);
    });

  } catch (error) {
    console.error('Error fetching Google Sheets:', error);
  }

  return result;
};
