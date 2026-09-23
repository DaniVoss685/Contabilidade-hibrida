import { Patient, ClinicalRecord, ClinicalAttachment, Organization, Professional } from '../types';
import { db } from './db';

export interface PrintClinicalDossierOptions {
  patient: Patient;
  records: ClinicalRecord[];
  attachments?: ClinicalAttachment[];
  organization?: Organization;
  professional?: Professional;
  filterDescription?: string;
}

export function generateClinicalDossierHtml(options: PrintClinicalDossierOptions): string {
  const { patient, records, attachments = [], organization, professional, filterDescription } = options;

  const clinicName = organization?.tradeName || organization?.name || 'Dental Finance — Clínica Odontológica';
  const profName = professional?.name || 'Cirurgião-Dentista Responsável';
  const profCro = professional?.cro ? `CRO-${professional.croUf || 'SP'} ${professional.cro}` : '';
  const clinicCnpj = professional?.cnpj || '';
  const nowStr = new Date().toLocaleString('pt-BR');

  // Formatação de idade se houver data de nascimento
  let ageStr = '';
  if (patient.birthDate) {
    const birth = new Date(patient.birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    if (!isNaN(age)) {
      ageStr = ` (${age} anos)`;
    }
  }

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Prontuário Clínico Odontológico — ${patient.name}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.4;
      font-size: 11pt;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .header-box {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .clinic-title {
      font-size: 16pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .clinic-sub {
      font-size: 9pt;
      color: #64748b;
      margin: 0;
    }
    .doc-badge {
      text-align: right;
      font-size: 8.5pt;
      color: #64748b;
    }
    .doc-badge strong {
      display: block;
      font-size: 10pt;
      color: #0284c7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .patient-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 18px;
    }
    .patient-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 8px 16px;
      font-size: 9.5pt;
    }
    .grid-item strong {
      color: #475569;
      font-size: 8.5pt;
      display: block;
      text-transform: uppercase;
      margin-bottom: 1px;
    }
    .alerts-container {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .alert-tag {
      font-size: 8.5pt;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .alert-red { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .alert-amber { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .alert-blue { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }

    .section-title {
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 18px 0 12px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-subtitle {
      font-size: 8.5pt;
      font-weight: normal;
      color: #64748b;
    }
    .timeline-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #f1f5f9;
    }
    .record-type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      background: #e2e8f0;
      color: #334155;
    }
    .badge-AVALIACAO, .badge-CONSULTA_INICIAL { background: #dbeafe; color: #1d4ed8; }
    .badge-PROCEDIMENTO { background: #dcfce7; color: #15803d; }
    .badge-CONCLUSAO { background: #fef3c7; color: #b45309; }
    .badge-INTERCORRENCIA { background: #fee2e2; color: #b91c1c; }

    .record-date {
      font-size: 9pt;
      font-weight: 600;
      color: #0f172a;
    }
    .record-prof {
      font-size: 8.5pt;
      color: #64748b;
    }
    .field-row {
      margin-bottom: 6px;
      font-size: 9.5pt;
    }
    .field-label {
      font-weight: 600;
      color: #475569;
      font-size: 8.5pt;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .field-content {
      color: #1e293b;
      white-space: pre-wrap;
    }

    .amendment-box {
      margin-top: 8px;
      padding: 8px 10px;
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
      border-radius: 0 4px 4px 0;
      font-size: 9pt;
    }
    .amendment-header {
      font-weight: 700;
      color: #b45309;
      font-size: 8pt;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .signature-area {
      margin-top: 30px;
      padding-top: 10px;
      page-break-inside: avoid;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .signature-line {
      width: 260px;
      text-align: center;
      border-top: 1px solid #334155;
      padding-top: 6px;
      font-size: 8.5pt;
      color: #475569;
    }
    .signature-line strong {
      display: block;
      color: #0f172a;
      font-size: 9pt;
    }
    .legal-notice {
      margin-top: 20px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      font-size: 7.5pt;
      color: #64748b;
      text-align: justify;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <h1 class="clinic-title">${clinicName}</h1>
      <p class="clinic-sub">Responsável Técnico: ${profName} ${profCro ? '• ' + profCro : ''}</p>
      ${clinicCnpj ? `<p class="clinic-sub">CNPJ: ${clinicCnpj}</p>` : ''}
    </div>
    <div class="doc-badge">
      <strong>Prontuário Odontológico</strong>
      <span>Emissão: ${nowStr}</span>
    </div>
  </div>

  <div class="patient-card">
    <div class="patient-grid">
      <div class="grid-item">
        <strong>Nome do Paciente</strong>
        ${patient.name}
      </div>
      <div class="grid-item">
        <strong>CPF</strong>
        ${patient.cpf || 'Não informado'}
      </div>
      <div class="grid-item">
        <strong>Nascimento / Idade</strong>
        ${patient.birthDate ? patient.birthDate.split('-').reverse().join('/') + ageStr : 'Não informado'}
      </div>
      <div class="grid-item">
        <strong>Telefone / WhatsApp</strong>
        ${patient.phone || 'Não informado'}
      </div>
      <div class="grid-item">
        <strong>E-mail</strong>
        ${patient.email || 'Não informado'}
      </div>
      <div class="grid-item">
        <strong>Cidade / UF</strong>
        ${patient.city ? `${patient.city} - ${patient.state || ''}` : 'Não informado'}
      </div>
    </div>

    ${
      (patient.allergies && patient.allergies.length > 0) ||
      (patient.conditions && patient.conditions.length > 0) ||
      (patient.medications && patient.medications.length > 0) ||
      patient.clinicalNotes
        ? `
    <div class="alerts-container">
      ${
        patient.allergies && patient.allergies.length > 0
          ? `<span class="alert-tag alert-red">⚠️ Alergias: ${patient.allergies.join(', ')}</span>`
          : ''
      }
      ${
        patient.conditions && patient.conditions.length > 0
          ? `<span class="alert-tag alert-amber">🩺 Condições: ${patient.conditions.join(', ')}</span>`
          : ''
      }
      ${
        patient.medications && patient.medications.length > 0
          ? `<span class="alert-tag alert-blue">💊 Medicamentos: ${patient.medications.join(', ')}</span>`
          : ''
      }
      ${
        patient.clinicalNotes
          ? `<div style="width: 100%; font-size: 8.5pt; color: #475569; margin-top: 4px;"><strong>Observações Gerais:</strong> ${patient.clinicalNotes}</div>`
          : ''
      }
    </div>
    `
        : ''
    }
  </div>

  <div class="section-title">
    <span>Histórico de Evoluções Clínicas</span>
    <span class="section-subtitle">${records.length} registro(s) listado(s) ${filterDescription ? `(${filterDescription})` : ''}</span>
  </div>

  ${
    records.length === 0
      ? `<p style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">Nenhuma evolução clínica registrada no período selecionado.</p>`
      : records
          .map((rec) => {
            const dateFormatted = rec.recordDate ? rec.recordDate.split('-').reverse().join('/') : '';
            const typeClass = `badge-${rec.recordType || 'OUTRO'}`;
            const isDraft = rec.status === 'DRAFT';
            const isVoided = rec.status === 'VOIDED';

            return `
    <div class="timeline-item"${isVoided ? ' style="background: #fafafa; border-color: #fecdd3;"' : ''}>
      <div class="timeline-header">
        <div>
          <span class="record-type-badge ${typeClass}">${rec.recordType || 'EVOLUÇÃO'}</span>
          ${isVoided ? `<span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: bold; margin-left: 6px; border: 1px solid #fecaca;">REGISTRO INVALIDADO</span>` : ''}
          ${isDraft ? `<span style="background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: bold; margin-left: 6px;">RASCUNHO</span>` : ''}
          ${rec.status === 'AMENDED' ? `<span style="background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 7.5pt; font-weight: bold; margin-left: 6px;">RETIFICADO</span>` : ''}
          ${rec.procedureName ? `<span style="margin-left: 8px; font-weight: 600; font-size: 9pt; color: #0284c7;">${rec.procedureName}</span>` : ''}
        </div>
        <div>
          <span class="record-date">${dateFormatted} ${rec.recordTime ? ' às ' + rec.recordTime : ''}</span>
        </div>
      </div>

      ${
        isVoided
          ? `
      <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; font-size: 8pt; color: #9f1239;">
        <strong>REGISTRO CLÍNICO INVALIDADO:</strong> Invalidado em ${rec.voidedAt ? new Date(rec.voidedAt).toLocaleString('pt-BR') : 'Data não informada'} por ${rec.voidedByName || 'Profissional'}.<br/>
        <strong>Motivo da invalidação:</strong> ${rec.voidReason || 'Não informado'}
      </div>`
          : ''
      }

      ${
        rec.continuationOfRecordId
          ? `
      <div style="font-size: 8pt; color: #0f766e; margin-bottom: 6px;">
        <em>↳ Continuação do atendimento de ${rec.continuationDate ? rec.continuationDate.split('-').reverse().join('/') : 'data anterior'}</em>
      </div>`
          : ''
      }

      ${
        rec.complaint
          ? `
      <div class="field-row">
        <div class="field-label">Queixa Principal / Motivo da Consulta</div>
        <div class="field-content">${rec.complaint}</div>
      </div>`
          : ''
      }

      ${
        rec.assessment
          ? `
      <div class="field-row">
        <div class="field-label">Avaliação Clínica / Diagnóstico</div>
        <div class="field-content">${rec.assessment}</div>
      </div>`
          : ''
      }

      <div class="field-row">
        <div class="field-label">Evolução / Procedimento Realizado</div>
        <div class="field-content">${rec.evolution}</div>
      </div>

      ${
        rec.conduct
          ? `
      <div class="field-row">
        <div class="field-label">Conduta Adotada</div>
        <div class="field-content">${rec.conduct}</div>
      </div>`
          : ''
      }

      ${
        rec.conclusion
          ? `
      <div class="field-row">
        <div class="field-label">Conclusão / Desfecho</div>
        <div class="field-content">${rec.conclusion}</div>
      </div>`
          : ''
      }

      ${
        rec.guidance
          ? `
      <div class="field-row">
        <div class="field-label">Orientações e Prescrições ao Paciente</div>
        <div class="field-content">${rec.guidance}</div>
      </div>`
          : ''
      }

      ${
        rec.returnDate
          ? `
      <div class="field-row" style="margin-top: 4px; font-size: 8.5pt; color: #0369a1;">
        <strong>Retorno Recomendado:</strong> ${rec.returnDate}
      </div>`
          : ''
      }

      <div style="margin-top: 6px; font-size: 8pt; color: #94a3b8;">
        Profissional: ${rec.professionalName || profName} ${rec.professionalCro ? '• ' + rec.professionalCro : ''}
      </div>

      ${
        rec.amendments && rec.amendments.length > 0
          ? rec.amendments
              .map(
                (amend) => `
        <div class="amendment-box">
          <div class="amendment-header">Retificação / Adendo Formal (${new Date(amend.createdAt).toLocaleString('pt-BR')})</div>
          <div style="font-size: 8.5pt; color: #78350f; margin-bottom: 2px;"><strong>Motivo:</strong> ${amend.reason}</div>
          <div style="color: #451a03;">${amend.content}</div>
          <div style="font-size: 7.5pt; color: #92400e; margin-top: 3px;">Assinado por: ${amend.createdByName}</div>
        </div>
      `
              )
              .join('')
          : ''
      }
    </div>
    `;
          })
          .join('')
  }

  ${
    attachments && attachments.length > 0
      ? `
  <div class="section-title" style="margin-top: 24px;">
    <span>Documentos e Anexos Vinculados</span>
    <span class="section-subtitle">${attachments.length} arquivo(s) registrado(s)</span>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 20px;">
    <thead>
      <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; text-align: left;">
        <th style="padding: 6px 8px;">Data</th>
        <th style="padding: 6px 8px;">Tipo</th>
        <th style="padding: 6px 8px;">Nome do Arquivo</th>
        <th style="padding: 6px 8px;">Legenda / Procedimento</th>
      </tr>
    </thead>
    <tbody>
      ${attachments
        .map(
          (a) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 8px;">${a.date ? a.date.split('-').reverse().join('/') : a.createdAt.split('T')[0].split('-').reverse().join('/')}</td>
          <td style="padding: 6px 8px; font-weight: 600;">${a.attachmentType}</td>
          <td style="padding: 6px 8px;">${a.originalFilename}</td>
          <td style="padding: 6px 8px; color: #64748b;">${a.caption || a.procedureName || '—'}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
  `
      : ''
  }

  <div class="signature-area">
    <div class="signature-line">
      <strong>${patient.name}</strong>
      <span>Paciente ou Responsável Legal</span>
    </div>

    <div class="signature-line">
      <strong>${profName}</strong>
      <span>${profCro || 'Cirurgião-Dentista'}</span>
    </div>
  </div>

  <div class="legal-notice">
    <strong>Termo de Autenticidade e Fidedignidade:</strong> Este documento constitui reprodução fidedigna do Prontuário Clínico Odontológico mantido eletronicamente pela clínica sob sigilo profissional médico-odontológico (Art. 5º do Código de Ética Odontológica e Lei Geral de Proteção de Dados - LGPD). As evoluções finalizadas possuem integridade cronológica auditada e rastreabilidade digital.
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;
}

export function printClinicalDossier(options: PrintClinicalDossierOptions): void {
  // Registrar auditoria
  try {
    (db as any).log(
      'EXPORTACAO_PRONTUARIO_PDF',
      'PATIENT',
      options.patient.id,
      `Prontuário clínico completo exportado para impressão/PDF (${options.records.length} registros).`
    );
  } catch {}

  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) {
    alert('Por favor, permita pop-ups para gerar o documento de impressão do prontuário.');
    return;
  }

  const htmlContent = generateClinicalDossierHtml(options);
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
