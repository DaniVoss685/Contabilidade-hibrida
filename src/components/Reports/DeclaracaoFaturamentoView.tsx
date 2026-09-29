import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import { Download, Printer, FileCheck2, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { Professional } from '../../types';
import { CanonicalFiscalBase, formatCompetencyShortName } from '../../lib/fiscalBase';
import { ContabilexSnapshotPayload } from '../../types/contabilexIntegration';
import { ContabilexIntegrationService } from '../../services/contabilexIntegrationService';
import { AccountantSignatureService, AccountantSignatureConfig } from '../../services/accountantSignatureService';
import { db } from '../../lib/db';
import { formatCurrency } from '../../lib/masks';

interface DeclaracaoFaturamentoViewProps {
  professional: Professional;
  fiscalBase: CanonicalFiscalBase;
}

/**
 * Declaração de Faturamento dos Últimos 12 Meses — autoatendimento para clínicas com integração
 * Contábilex ATIVA (mesmo gate da base fiscal oficial: fiscalBase.status === 'AVAILABLE' &&
 * fiscalBase.source === 'CONTABILEX'). O faturamento mostrado vem dos snapshots OFICIAIS já
 * publicados pelo Contábilex (gross_revenue por competência — a mesma fonte do Fator R oficial),
 * nunca do lançamento bruto do próprio Dental Finance, porque é esse dado que o contador está
 * assinando como conforme aos registros contábeis, sob responsabilidade técnica dele. A assinatura
 * (nome/CRC/CPF/imagem) é a configuração global cadastrada pelo escritório em Modo Consultoria →
 * Configurações (ver accountantSignatureService.ts) — nunca fabricada aqui.
 */
export const DeclaracaoFaturamentoView: React.FC<DeclaracaoFaturamentoViewProps> = ({ professional, fiscalBase }) => {
  const isContabilexActive = fiscalBase.status === 'AVAILABLE' && fiscalBase.source === 'CONTABILEX';

  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState<ContabilexSnapshotPayload[]>([]);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [signature, setSignature] = useState<AccountantSignatureConfig | null>(null);
  const [issuedAt] = useState<string>(() => new Date().toISOString());

  useEffect(() => {
    if (!isContabilexActive) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSnapshotsError(null);
    const tenantId = db.getActiveTenantId();
    Promise.all([
      ContabilexIntegrationService.getPublishedSnapshots(tenantId, 12),
      AccountantSignatureService.getConfig(),
    ]).then(([snapRes, sigRes]) => {
      if (cancelled) return;
      const ordered = [...(snapRes.snapshots || [])].sort((a, b) => a.competency.localeCompare(b.competency));
      setSnapshots(ordered);
      if (snapRes.error) setSnapshotsError(snapRes.error);
      setSignature(sigRes.config);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContabilexActive]);

  const handlePrint = () => window.print();

  if (!isContabilexActive) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">Declaração de Faturamento dos Últimos 12 Meses</h3>
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Disponível só para clínicas com a integração Contábilex <strong>ativa</strong> (a mesma base oficial usada
            no Fator R, em Impostos &amp; Fator R). {fiscalBase.reasonMessage ? fiscalBase.reasonMessage + '. ' : ''}
            Fale com o escritório se acha que isso deveria estar configurado.
          </span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-10 flex flex-col items-center justify-center text-center">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
        <p className="text-xs text-slate-400">Carregando faturamento oficial dos últimos 12 meses...</p>
      </div>
    );
  }

  const total = snapshots.reduce((sum, s) => sum + (s.gross_revenue || 0), 0);
  const signatureReady = AccountantSignatureService.isComplete(signature);
  const razaoSocial = professional.razaoSocial || professional.nomeFantasia || professional.name;
  const regimeLabel = professional.regimeTributario === 'LUCRO_PRESUMIDO' ? 'Lucro Presumido' : 'Simples Nacional';
  const issuedDate = new Date(issuedAt);

  // Gera o PDF direto (sem passar pelo diálogo de impressão do navegador) — a maior parte dos
  // clientes usa este documento para enviar a bancos, então o pedido é "baixar", não "imprimir".
  // Desenhado com a API nativa do jsPDF (texto/linhas/retângulos), não uma captura de tela do HTML
  // (html2canvas): fica um PDF real, com texto selecionável, nítido em qualquer zoom, e bem menor.
  const handleSavePdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 22;
    const contentWidth = pageWidth - marginX * 2;
    let y = 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('DECLARAÇÃO DE FATURAMENTO', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.text('DOS ÚLTIMOS 12 MESES', pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Bloco Empresa / CNPJ / Regime
    const boxH = 26;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, y, contentWidth, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('EMPRESA / RAZÃO SOCIAL', pageWidth / 2, y + 7, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(razaoSocial, pageWidth / 2, y + 14, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('CNPJ', marginX + contentWidth * 0.3, y + 20, { align: 'center' });
    doc.text('REGIME TRIBUTÁRIO', marginX + contentWidth * 0.7, y + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(professional.cnpj || '—', marginX + contentWidth * 0.3, y + 24.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(regimeLabel, marginX + contentWidth * 0.7, y + 24.5, { align: 'center' });
    y += boxH + 9;

    // Tabela mês a mês
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('MÊS / ANO DE COMPETÊNCIA', marginX, y);
    doc.text('VALOR FATURADO (BRUTO)', marginX + contentWidth, y, { align: 'right' });
    y += 2.5;
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    snapshots.forEach((s, idx) => {
      if (idx > 0) {
        doc.setDrawColor(241, 245, 249);
        doc.line(marginX, y - 4, marginX + contentWidth, y - 4);
      }
      doc.setTextColor(51, 65, 85);
      doc.text(formatCompetencyShortName(s.competency), marginX, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(formatCurrency(s.gross_revenue || 0), marginX + contentWidth, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 6.5;
    });
    y += 3;

    // Total acumulado
    const totalBarH = 11;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(marginX, y, contentWidth, totalBarH, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`FATURAMENTO TOTAL ACUMULADO (${snapshots.length} MESES)`, marginX + 4, y + totalBarH / 2 + 1.3);
    doc.setFontSize(11);
    doc.text(formatCurrency(total), marginX + contentWidth - 4, y + totalBarH / 2 + 1.3, { align: 'right' });
    y += totalBarH + 10;

    // Texto da declaração
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const declText =
      'Declaramos, para os devidos fins de direito, que as informações acima transcritas guardam estrita ' +
      'conformidade com os registros contábeis e fiscais desta empresa, sob nossa responsabilidade técnica.';
    const declLines = doc.splitTextToSize(declText, contentWidth * 0.82);
    declLines.forEach((line: string, i: number) => {
      doc.text(line, pageWidth / 2, y + i * 4.6, { align: 'center' });
    });
    y += declLines.length * 4.6 + 10;

    // Assinatura
    if (signatureReady && signature?.signatureImageDataUrl) {
      try {
        const imgProps = doc.getImageProperties(signature.signatureImageDataUrl);
        const imgW = 42;
        const imgH = Math.min(22, (imgProps.height / imgProps.width) * imgW);
        doc.addImage(signature.signatureImageDataUrl, imgProps.fileType, pageWidth / 2 - imgW / 2, y, imgW, imgH);
        y += imgH + 3;
      } catch {
        // Imagem em formato não suportado pelo jsPDF (ex.: webp) — segue sem travar o PDF; a
        // validação de upload já restringe a PNG/JPG, então isto é só uma rede de segurança.
      }
      doc.setDrawColor(148, 163, 184);
      doc.line(pageWidth / 2 - 28, y, pageWidth / 2 + 28, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(signature.accountantName, pageWidth / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`${signature.crcRegistration} • CPF: ${signature.accountantCpf}`, pageWidth / 2, y, { align: 'center' });
      y += 10;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Emitido em ${issuedDate.toLocaleDateString('pt-BR')} às ${issuedDate.toLocaleTimeString('pt-BR')}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    const safeName = razaoSocial.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    doc.save(`Declaracao-Faturamento-${safeName}-${issuedDate.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .declaracao-print-area, .declaracao-print-area * { visibility: visible; }
          .declaracao-print-area { position: absolute; inset: 0; padding: 24px; }
          .declaracao-no-print { display: none !important; }
        }
      `}</style>

      <div className="declaracao-no-print flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900">Declaração de Faturamento dos Últimos 12 Meses</h3>
          <p className="text-xs text-slate-500">
            Faturamento oficial já publicado pelo Contábilex • Base: {formatCompetencyShortName(fiscalBase.referenceCompetency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            disabled={snapshots.length === 0 || !signatureReady}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
          <button
            onClick={handleSavePdf}
            disabled={snapshots.length === 0 || !signatureReady}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Salvar PDF</span>
          </button>
        </div>
      </div>

      {snapshotsError && (
        <div className="declaracao-no-print p-3.5 rounded-xl text-xs bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{snapshotsError}</span>
        </div>
      )}

      {!signatureReady && (
        <div className="declaracao-no-print p-3.5 rounded-xl text-xs bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            O escritório ainda não cadastrou a assinatura do contador para este documento. Fale com o Contaju antes de
            enviar esta declaração ao banco — sem a assinatura ela não tem validade.
          </span>
        </div>
      )}

      {snapshots.length === 0 && !snapshotsError ? (
        <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-600">
          Nenhuma competência publicada ainda pelo Contábilex para esta clínica.
        </div>
      ) : (
        <div className="declaracao-print-area border border-slate-200 rounded-2xl p-6 bg-white max-w-xl mx-auto">
          <div className="text-center space-y-1 mb-5">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500 text-white mb-1">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Declaração de Faturamento dos Últimos 12 Meses
            </h4>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center mb-5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Empresa / Razão Social</p>
            <p className="text-sm font-black text-slate-900">{razaoSocial}</p>
            <div className="flex items-center justify-center gap-6 mt-2 text-[11px]">
              <div>
                <span className="text-slate-400 uppercase tracking-wider font-bold block">CNPJ</span>
                <span className="font-mono text-slate-700">{professional.cnpj || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 uppercase tracking-wider font-bold block">Regime Tributário</span>
                <span className="font-bold text-slate-700">{regimeLabel}</span>
              </div>
            </div>
          </div>

          <table className="w-full text-xs mb-3">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-1.5 font-bold">Mês / Ano de Competência</th>
                <th className="text-right py-1.5 font-bold">Valor Faturado (Bruto)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshots.map((s) => (
                <tr key={s.competency}>
                  <td className="py-1.5 text-slate-700">{formatCompetencyShortName(s.competency)}</td>
                  <td className="py-1.5 text-right font-mono font-semibold text-slate-900">
                    {formatCurrency(s.gross_revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl text-white mb-5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Faturamento Total Acumulado ({snapshots.length} meses)</span>
            <span className="text-sm font-black font-mono">{formatCurrency(total)}</span>
          </div>

          <p className="text-[10.5px] text-slate-500 text-center italic leading-relaxed mb-5">
            Declaramos, para os devidos fins de direito, que as informações acima transcritas guardam estrita
            conformidade com os registros contábeis e fiscais desta empresa, sob nossa responsabilidade técnica.
          </p>

          {signatureReady && signature ? (
            <div className="flex flex-col items-center">
              <div className="p-2 border-b border-slate-300 mb-1">
                <img src={signature.signatureImageDataUrl!} alt="Assinatura do contador" className="h-14 object-contain" />
              </div>
              <p className="text-xs font-black text-slate-900">{signature.accountantName}</p>
              <p className="text-[10.5px] text-amber-700 font-semibold">
                {signature.crcRegistration} • CPF: {signature.accountantCpf}
              </p>
            </div>
          ) : (
            <div className="text-center text-[10.5px] text-slate-400 italic">Assinatura do contador pendente de configuração.</div>
          )}

          <p className="text-center text-[10px] text-slate-400 mt-5">
            Emitido em {issuedDate.toLocaleDateString('pt-BR')} às {issuedDate.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      )}
    </div>
  );
};
