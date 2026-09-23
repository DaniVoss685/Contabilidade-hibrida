// Export utilities for CSV / spreadsheets
import * as XLSX from 'xlsx';
import { Patient } from '../types';

export function exportToCsv(filename: string, rows: (string | number)[][]): void {
  const processRow = (row: (string | number)[]) => {
    return row
      .map((val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(';'); // Semicolon is the standard delimiter for Brazilian Excel!
  };

  const csvContent = '\uFEFF' + rows.map(processRow).join('\r\n'); // Add BOM for proper UTF-8 Excel support
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToXlsx(filename: string, sheetName: string, rows: (string | number)[][]): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function formatPatientsForExport(patients: Patient[]): (string | number)[][] {
  const headers = [
    'ID',
    'Nome Completo',
    'CPF',
    'Telefone / WhatsApp',
    'E-mail',
    'Data de Nascimento',
    'Cidade',
    'UF',
    'Alergias',
    'Condições Médicas',
    'Medicamentos em Uso',
    'Observações Clínicas',
    'Data de Cadastro',
  ];

  const rows = patients.map((p) => [
    p.id,
    p.name || '',
    p.cpf || '',
    p.phone || '',
    p.email || '',
    p.birthDate || '',
    p.city || '',
    p.state || '',
    (p.allergies || []).join(', '),
    (p.conditions || []).join(', '),
    (p.medications || []).join(', '),
    p.clinicalNotes || '',
    p.createdAt ? p.createdAt.split('T')[0] : '',
  ]);

  return [headers, ...rows];
}

export function exportPatientsToCsv(patients: Patient[], filename: string = 'pacientes_dental_finance.csv'): void {
  const rows = formatPatientsForExport(patients);
  exportToCsv(filename, rows);
}

export function exportPatientsToXlsx(patients: Patient[], filename: string = 'pacientes_dental_finance.xlsx'): void {
  const rows = formatPatientsForExport(patients);
  exportToXlsx(filename, 'Pacientes', rows);
}

