// PDF do Orçamento — documento comercial apresentado ao paciente, precisa transmitir credibilidade
// e organização (padrão clínica odontológica profissional). Extraído de BudgetsView.tsx para isolar
// a lógica de paginação real (o problema original: o loop de itens nunca verificava a altura da
// página nem chamava addPage(), então orçamentos com muitos itens tinham o rodapé de totais
// desenhado fora da área visível do A4 — invisível/cortado no PDF gerado).

import jsPDF from 'jspdf';
import { Budget, Organization, Professional } from '../types';
import { formatCurrency, formatDateBr } from './masks';

/** "ORÇ-2026-U7F3K2" — label amigável e determinística (não é sequência real, não precisa de
 * contador atômico nem migration). Nunca usada como chave técnica, só exibição/comunicação com o
 * paciente. Se um dia precisar de sequência estrita (ORÇ-2026-0001, 0002...), aí sim precisa de
 * migration + RPC para incremento atômico por tenant. */
export function getBudgetDisplayCode(budget: { id: string; createdAt: string }): string {
  const year = new Date(budget.createdAt).getFullYear() || new Date().getFullYear();
  const suffix = budget.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '000000';
  return `ORÇ-${year}-${suffix}`;
}

const MARGIN_X = 20;
const PAGE_BOTTOM_LIMIT = 280; // mm — deixa espaço pro rodapé antes do fim do A4 (297mm)
const COLORS = {
  ink: [15, 23, 42] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  light: [148, 163, 184] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  lineStrong: [203, 213, 225] as [number, number, number],
  accent: [79, 70, 229] as [number, number, number], // indigo-600, mesma cor do módulo na UI
};

interface PdfContext {
  doc: jsPDF;
  pageWidth: number;
  contentWidth: number;
  page: number;
}

function drawTableHeader(ctx: PdfContext, y: number): number {
  const { doc, contentWidth } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text('PROCEDIMENTO', MARGIN_X, y);
  doc.text('QTD', MARGIN_X + contentWidth * 0.68, y, { align: 'center' });
  doc.text('VALOR', MARGIN_X + contentWidth, y, { align: 'right' });
  y += 3;
  doc.setDrawColor(...COLORS.lineStrong);
  doc.line(MARGIN_X, y, MARGIN_X + contentWidth, y);
  return y + 6;
}

function drawPageFooter(ctx: PdfContext, professional?: Professional | null): void {
  const { doc, pageWidth } = ctx;
  const footerY = 289;
  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN_X, footerY - 5, pageWidth - MARGIN_X, footerY - 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.light);
  const contactParts = [professional?.phone, professional?.email].filter(Boolean);
  const contactLine = contactParts.length ? contactParts.join('  •  ') : '';
  if (contactLine) doc.text(contactLine, MARGIN_X, footerY);
  doc.text(`Página ${ctx.page}`, pageWidth - MARGIN_X, footerY, { align: 'right' });
}

/** Garante espaço para o próximo bloco; se não couber, vira página e repete o cabeçalho da tabela
 * quando `repeatTableHeader` é passado — nunca deixa conteúdo (item ou rodapé de totais) ser
 * desenhado fora da área visível do A4. */
function ensureSpace(
  ctx: PdfContext,
  y: number,
  neededHeight: number,
  professional: Professional | null | undefined,
  repeatTableHeader: boolean
): number {
  if (y + neededHeight <= PAGE_BOTTOM_LIMIT) return y;
  drawPageFooter(ctx, professional);
  ctx.doc.addPage();
  ctx.page += 1;
  let newY = 20;
  if (repeatTableHeader) newY = drawTableHeader(ctx, newY);
  return newY;
}

export function generateBudgetPdf(
  budget: Budget,
  professional: Professional | null | undefined,
  org: Organization | null | undefined
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN_X * 2;
  const ctx: PdfContext = { doc, pageWidth, contentWidth, page: 1 };
  let y = 20;

  const clinicName = professional?.nomeFantasia || professional?.razaoSocial || org?.tradeName || org?.name || 'Clínica Odontológica';

  // Cabeçalho
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pageWidth, 3, 'F');
  y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.ink);
  doc.text(clinicName, MARGIN_X, y);
  y += 6;

  const identityLine = [
    professional?.cro ? `CRO-${professional.croUf || ''} ${professional.cro}` : null,
    professional?.cnpj ? `CNPJ ${professional.cnpj}` : professional?.cpf ? `CPF ${professional.cpf}` : null,
    professional?.municipio ? `${professional.municipio}${professional.uf ? '/' + professional.uf : ''}` : null,
  ]
    .filter(Boolean)
    .join('  •  ');
  if (identityLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(identityLine, MARGIN_X, y);
    y += 8;
  } else {
    y += 4;
  }

  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN_X, y, MARGIN_X + contentWidth, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.ink);
  doc.text('PLANO DE TRATAMENTO E ORÇAMENTO', MARGIN_X, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(getBudgetDisplayCode(budget), MARGIN_X + contentWidth, y, { align: 'right' });
  y += 10;

  // Bloco paciente / datas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text(`Paciente: ${budget.patientName}`, MARGIN_X, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Emitido em: ${new Date(budget.createdAt).toLocaleDateString('pt-BR')}`, MARGIN_X, y);
  if (budget.validUntil) {
    doc.text(`Válido até: ${formatDateBr(budget.validUntil)}`, MARGIN_X + contentWidth, y, { align: 'right' });
  }
  y += 10;

  // Tabela de itens
  y = drawTableHeader(ctx, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const PROC_LINE_HEIGHT = 4.3; // mm por linha do nome do procedimento (quando quebra em 2+ linhas)
  budget.items.forEach((item) => {
    // Calcula a altura real ANTES de desenhar — nome de procedimento longo pode quebrar em várias
    // linhas, e a linha do profissional (quando existe) precisa nascer DEPOIS da última delas,
    // nunca sobrepor o texto (bug real encontrado em teste com nomes longos: "Profissional
    // responsável" desenhado por cima da 2ª linha do nome do procedimento).
    const procLines: string[] = doc.splitTextToSize(item.procedureName, contentWidth * 0.62);
    const procBlockHeight = Math.max(1, procLines.length) * PROC_LINE_HEIGHT;
    const rowHeight = procBlockHeight + (item.professionalName ? 4 : 0) + 2.5;
    y = ensureSpace(ctx, y, rowHeight, professional, true);

    doc.setTextColor(...COLORS.slate);
    doc.text(procLines, MARGIN_X, y);
    if (item.professionalName) {
      doc.setFontSize(7.5);
      doc.setTextColor(...COLORS.light);
      doc.text(`Profissional responsável: ${item.professionalName}`, MARGIN_X, y + procBlockHeight);
      doc.setFontSize(9.5);
    }
    doc.setTextColor(...COLORS.slate);
    doc.text(String(item.quantity), MARGIN_X + contentWidth * 0.68, y, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(item.totalPrice), MARGIN_X + contentWidth, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += rowHeight;
  });

  // Rodapé de totais — reserva o bloco inteiro de uma vez (nunca quebra Subtotal/Desconto/Total
  // em páginas diferentes).
  const totalsBlockHeight = 7 + 6 + (budget.discountValue > 0 ? 6 : 0) + 10;
  y = ensureSpace(ctx, y, totalsBlockHeight + 4, professional, false);
  y += 4;
  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN_X, y, MARGIN_X + contentWidth, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Subtotal', MARGIN_X + contentWidth * 0.75, y, { align: 'right' });
  doc.text(formatCurrency(budget.subtotal), MARGIN_X + contentWidth, y, { align: 'right' });
  y += 6;
  if (budget.discountValue > 0) {
    doc.text('Desconto', MARGIN_X + contentWidth * 0.75, y, { align: 'right' });
    doc.text(`- ${formatCurrency(budget.subtotal - budget.total)}`, MARGIN_X + contentWidth, y, { align: 'right' });
    y += 6;
  }
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN_X + contentWidth * 0.55, y - 5.5, contentWidth * 0.45, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.accent);
  doc.text('TOTAL', MARGIN_X + contentWidth * 0.75, y, { align: 'right' });
  doc.text(formatCurrency(budget.total), MARGIN_X + contentWidth, y, { align: 'right' });
  y += 12;

  // Observações (só se existir — não deixa área vazia enorme quando não há)
  if (budget.notes && budget.notes.trim()) {
    const lines: string[] = doc.splitTextToSize(budget.notes.trim(), contentWidth);
    y = ensureSpace(ctx, y, 6 + lines.length * 4.2, professional, false);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.muted);
    doc.text('OBSERVAÇÕES', MARGIN_X, y);
    y += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.slate);
    lines.forEach((line: string, i: number) => doc.text(line, MARGIN_X, y + i * 4.2));
    y += lines.length * 4.2;
  }

  // Validade em destaque discreto
  if (budget.validUntil) {
    y = ensureSpace(ctx, y, 10, professional, false);
    y += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Este orçamento é válido até ${formatDateBr(budget.validUntil)}.`, MARGIN_X, y);
  }

  drawPageFooter(ctx, professional);

  const safeName = budget.patientName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  doc.save(`Orcamento-${safeName}-${getBudgetDisplayCode(budget)}.pdf`);
}
