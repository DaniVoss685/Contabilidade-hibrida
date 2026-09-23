import * as XLSX from 'xlsx';
import { Patient, ClinicalRecord, ImportPreviewRow, ImportReportSummary, ColumnMapping } from '../types';
import { db } from './db';

export interface RawParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Normaliza strings para comparação flexível de cabeçalhos
 */
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sugestão automática e heurística de mapeamento de colunas
 */
export function guessColumnMapping(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  const targets: Record<string, string[]> = {
    name: ['nome', 'paciente', 'nomecompleto', 'nomedopaciente', 'cliente', 'name', 'fullname'],
    cpf: ['cpf', 'documento', 'doc', 'cpfpaciente', 'taxid'],
    phone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'contato', 'phone', 'mobile'],
    email: ['email', 'correioeletronico', 'mail'],
    birthDate: ['nascimento', 'datanascimento', 'datadenascimento', 'dtnasc', 'aniversario', 'birthdate'],
    city: ['cidade', 'municipio', 'city'],
    state: ['uf', 'estado', 'state'],
    allergies: ['alergia', 'alergias', 'allergies'],
    conditions: ['condicoes', 'condicoesmedicas', 'doencas', 'antecedentes', 'historicomedico'],
    medications: ['medicamentos', 'remedios', 'medicacao', 'medicamentosemuso'],
    clinicalNotes: ['observacoes', 'obs', 'observacao', 'notas', 'anotacoes', 'clinicalnotes'],
    evolution: ['evolucao', 'historico', 'prontuario', 'procedimentorealizado', 'conduta', 'atendimento'],
  };

  const assignedTargets = new Set<string>();

  headers.forEach((hdr) => {
    const norm = normalizeHeader(hdr);
    let matchedTarget = '';

    for (const [targetKey, aliases] of Object.entries(targets)) {
      if (assignedTargets.has(targetKey)) continue;
      if (aliases.some((alias) => norm === alias || norm.includes(alias))) {
        matchedTarget = targetKey;
        assignedTargets.add(targetKey);
        break;
      }
    }

    if (matchedTarget) {
      mappings.push({ sourceColumn: hdr, targetField: matchedTarget });
    }
  });

  return mappings;
}

/**
 * Faz o parsing de arquivo CSV ou texto copiado da planilha (ex: Google Sheets)
 */
export function parseCsvContent(content: string): RawParsedTable {
  // Trata quebras de linha preservando quebras dentro de aspas
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  const cleanContent = content.replace(/^\uFEFF/, ''); // Remove BOM

  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || (char === '\r' && cleanContent[i + 1] === '\n')) && !inQuotes) {
      if (char === '\r') i++; // Skip \n
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detecta delimitador (, ou ; ou \t)
  const firstLine = lines[0];
  let delimiter = ';';
  const countSemicolon = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;

  if (countTab > countSemicolon && countTab > countComma) {
    delimiter = '\t';
  } else if (countComma > countSemicolon) {
    delimiter = ',';
  }

  const parseLine = (line: string): string[] => {
    const entries: string[] = [];
    let currentEntry = '';
    let insideQuote = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (insideQuote && line[i + 1] === '"') {
          currentEntry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (c === delimiter && !insideQuote) {
        entries.push(currentEntry.trim());
        currentEntry = '';
      } else {
        currentEntry += c;
      }
    }
    entries.push(currentEntry.trim());
    return entries;
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let l = 1; l < lines.length; l++) {
    const rawTokens = parseLine(lines[l]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (rawTokens[idx] || '').replace(/^["']|["']$/g, '').trim();
    });
    // Ignora linha se todos os campos forem vazios
    if (Object.values(rowObj).some((val) => val.length > 0)) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

/**
 * Lê arquivo (File) como ArrayBuffer ou Texto e extrai tabela estruturada
 */
export async function parseSpreadsheetFile(file: File): Promise<RawParsedTable> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv' || extension === 'txt') {
    const text = await file.text();
    return parseCsvContent(text);
  }

  // Excel (.xlsx, .xls)
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = Object.keys(jsonData[0]);
  const rows: Record<string, string>[] = jsonData.map((r) => {
    const rowObj: Record<string, string> = {};
    headers.forEach((h) => {
      rowObj[h] = String(r[h] ?? '').trim();
    });
    return rowObj;
  });

  return { headers, rows };
}

/**
 * Validação simplificada de CPF
 */
export function isValidCpfString(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleaned.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cleaned.charAt(10), 10)) return false;

  return true;
}

/**
 * Processa a tabela bruta gerando um Preview com validações e detecção de duplicidades
 */
export function generateImportPreview(
  parsed: RawParsedTable,
  mappings: ColumnMapping[],
  existingPatients: Patient[]
): ImportPreviewRow[] {
  const previewRows: ImportPreviewRow[] = [];

  parsed.rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const mappedPatient: Partial<Patient> = {};
    let evolutionText = '';

    mappings.forEach(({ sourceColumn, targetField }) => {
      const rawVal = row[sourceColumn] || '';
      if (!rawVal) return;

      switch (targetField) {
        case 'name':
          mappedPatient.name = rawVal;
          break;
        case 'cpf':
          mappedPatient.cpf = rawVal;
          break;
        case 'phone':
          mappedPatient.phone = rawVal;
          break;
        case 'email':
          mappedPatient.email = rawVal;
          break;
        case 'birthDate':
          // Formata datas comuns DD/MM/YYYY para YYYY-MM-DD se necessário
          if (rawVal.includes('/')) {
            const parts = rawVal.split('/');
            if (parts.length === 3) {
              const [d, m, y] = parts;
              mappedPatient.birthDate = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else {
              mappedPatient.birthDate = rawVal;
            }
          } else {
            mappedPatient.birthDate = rawVal;
          }
          break;
        case 'city':
          mappedPatient.city = rawVal;
          break;
        case 'state':
          mappedPatient.state = rawVal.toUpperCase().substring(0, 2);
          break;
        case 'allergies':
          mappedPatient.allergies = rawVal.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          break;
        case 'conditions':
          mappedPatient.conditions = rawVal.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          break;
        case 'medications':
          mappedPatient.medications = rawVal.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          break;
        case 'clinicalNotes':
          mappedPatient.clinicalNotes = rawVal;
          break;
        case 'evolution':
          evolutionText = rawVal;
          break;
      }
    });

    const messages: string[] = [];
    let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';

    if (!mappedPatient.name || mappedPatient.name.trim().length < 2) {
      status = 'ERROR';
      messages.push('Nome do paciente é obrigatório e precisa ter pelo menos 2 letras.');
    }

    if (mappedPatient.cpf) {
      const cleaned = mappedPatient.cpf.replace(/\D/g, '');
      if (cleaned.length > 0 && !isValidCpfString(cleaned)) {
        if (status !== 'ERROR') status = 'WARNING';
        messages.push('CPF com dígitos inconsistentes ou incompleto.');
      }
    }

    // Detecção de duplicidade
    let duplicateAction: 'IGNORE' | 'UPDATE' | 'MERGE' | undefined = undefined;
    let existingPatientId: string | undefined = undefined;

    const existingMatch = existingPatients.find((p) => {
      const pCpf = (p.cpf || '').replace(/\D/g, '');
      const mapCpf = (mappedPatient.cpf || '').replace(/\D/g, '');
      if (pCpf && mapCpf && pCpf === mapCpf) return true;
      if (p.name && mappedPatient.name && p.name.trim().toLowerCase() === mappedPatient.name.trim().toLowerCase()) return true;
      return false;
    });

    if (existingMatch) {
      existingPatientId = existingMatch.id;
      duplicateAction = 'MERGE';
      if (status !== 'ERROR') status = 'WARNING';
      messages.push(`Paciente já cadastrado (${existingMatch.name}). Modo padrão: Mesclar dados.`);
    }

    const mappedRecord: Partial<ClinicalRecord> | undefined = evolutionText
      ? {
          recordType: 'EVOLUCAO',
          evolution: evolutionText,
          recordDate: new Date().toISOString().split('T')[0],
          status: 'FINALIZED',
          origin: 'IMPORT',
        }
      : undefined;

    previewRows.push({
      rowNumber,
      data: row,
      mappedPatient,
      mappedRecord,
      status,
      messages,
      duplicateAction,
      existingPatientId,
    });
  });

  return previewRows;
}

/**
 * Executa a importação das linhas aprovadas no preview
 */
export async function executePatientImport(
  previewRows: ImportPreviewRow[],
  defaultDuplicateStrategy: 'IGNORE' | 'UPDATE' | 'MERGE' = 'MERGE',
  filename?: string
): Promise<ImportReportSummary> {
  const validRows = previewRows.filter((r) => r.status !== 'ERROR');
  const errorRows = previewRows.filter((r) => r.status === 'ERROR');

  let importedCount = 0;
  let updatedCount = 0;
  let ignoredCount = 0;
  let errorCount = errorRows.length;
  const errorDetails: Array<{ rowNumber: number; reason: string; dataSample: string }> = errorRows.map((r) => ({
    rowNumber: r.rowNumber,
    reason: r.messages.join(', ') || 'Erro de validação cadastral.',
    dataSample: JSON.stringify(r.data),
  }));

  const patientsToInsert: (Omit<Patient, 'id' | 'orgId' | 'createdAt'> & { id?: string })[] = [];
  const existingPatients = db.getPatients();

  for (const row of validRows) {
    try {
      const { mappedPatient, mappedRecord, existingPatientId } = row;
      const strategy = row.duplicateAction || defaultDuplicateStrategy;

      if (existingPatientId) {
        const existing = existingPatients.find((p) => p.id === existingPatientId);
        if (!existing) continue;

        if (strategy === 'IGNORE') {
          ignoredCount++;
          continue;
        }

        if (strategy === 'UPDATE') {
          await db.updatePatientAsync(existingPatientId, {
            ...mappedPatient,
          });
          updatedCount++;
        } else if (strategy === 'MERGE') {
          // Mescla listas de alergias, medicamentos, condições e observações
          const mergedAllergies = Array.from(new Set([...(existing.allergies || []), ...(mappedPatient.allergies || [])]));
          const mergedConditions = Array.from(new Set([...(existing.conditions || []), ...(mappedPatient.conditions || [])]));
          const mergedMeds = Array.from(new Set([...(existing.medications || []), ...(mappedPatient.medications || [])]));
          let mergedNotes = existing.clinicalNotes || '';
          if (mappedPatient.clinicalNotes && !mergedNotes.includes(mappedPatient.clinicalNotes)) {
            mergedNotes = mergedNotes ? `${mergedNotes}\n[Importação]: ${mappedPatient.clinicalNotes}` : mappedPatient.clinicalNotes;
          }

          await db.updatePatientAsync(existingPatientId, {
            phone: mappedPatient.phone || existing.phone,
            email: mappedPatient.email || existing.email,
            birthDate: mappedPatient.birthDate || existing.birthDate,
            city: mappedPatient.city || existing.city,
            state: mappedPatient.state || existing.state,
            allergies: mergedAllergies,
            conditions: mergedConditions,
            medications: mergedMeds,
            clinicalNotes: mergedNotes,
          });
          updatedCount++;
        }

        // Se houver registro clínico associado, cria a evolução para o paciente existente
        if (mappedRecord && mappedRecord.evolution) {
          await db.addClinicalRecord({
            patientId: existingPatientId,
            professionalId: db.getProfessional()?.id || 'prof_01',
            professionalName: db.getProfessional()?.name || 'Cirurgião-Dentista',
            recordType: mappedRecord.recordType || 'EVOLUCAO',
            recordDate: mappedRecord.recordDate || new Date().toISOString().split('T')[0],
            evolution: mappedRecord.evolution,
            status: 'FINALIZED',
            origin: 'IMPORT',
            importMetadata: {
              filename: filename || 'importacao_planilha',
              importedAt: new Date().toISOString(),
            },
            createdBy: db.getUser()?.id || 'usr_01',
            createdByName: db.getUser()?.name || 'Administrador',
          });
        }
      } else {
        // Novo paciente
        const newPatientData: Omit<Patient, 'id' | 'orgId' | 'createdAt'> = {
          name: mappedPatient.name || 'Paciente Importado',
          cpf: mappedPatient.cpf || '',
          phone: mappedPatient.phone || '',
          email: mappedPatient.email || '',
          birthDate: mappedPatient.birthDate,
          city: mappedPatient.city,
          state: mappedPatient.state,
          allergies: mappedPatient.allergies || [],
          conditions: mappedPatient.conditions || [],
          medications: mappedPatient.medications || [],
          clinicalNotes: mappedPatient.clinicalNotes,
        };

        const res = await db.addPatientAsync(newPatientData);
        if (res.success && res.patient) {
          importedCount++;

          // Se houver registro clínico associado, cria a evolução
          if (mappedRecord && mappedRecord.evolution) {
            await db.addClinicalRecord({
              patientId: res.patient.id,
              professionalId: db.getProfessional()?.id || 'prof_01',
              professionalName: db.getProfessional()?.name || 'Cirurgião-Dentista',
              recordType: mappedRecord.recordType || 'EVOLUCAO',
              recordDate: mappedRecord.recordDate || new Date().toISOString().split('T')[0],
              evolution: mappedRecord.evolution,
              status: 'FINALIZED',
              origin: 'IMPORT',
              importMetadata: {
                filename: filename || 'importacao_planilha',
                importedAt: new Date().toISOString(),
              },
              createdBy: db.getUser()?.id || 'usr_01',
              createdByName: db.getUser()?.name || 'Administrador',
            });
          }
        } else {
          errorCount++;
          errorDetails.push({
            rowNumber: row.rowNumber,
            reason: res.error || 'Erro ao persistir novo paciente.',
            dataSample: JSON.stringify(row.data),
          });
        }
      }
    } catch (err: any) {
      errorCount++;
      errorDetails.push({
        rowNumber: row.rowNumber,
        reason: err?.message || 'Falha inesperada no processamento da linha.',
        dataSample: JSON.stringify(row.data),
      });
    }
  }

  return {
    totalRows: previewRows.length,
    validRows: validRows.length,
    warningRows: previewRows.filter((r) => r.status === 'WARNING').length,
    errorRows: errorRows.length,
    importedCount,
    updatedCount,
    ignoredCount,
    errorCount,
    errors: errorDetails,
  };
}
