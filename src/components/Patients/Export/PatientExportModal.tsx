import React, { useState } from 'react';
import { Patient } from '../../../types';
import { exportPatientsToCsv, exportPatientsToXlsx } from '../../../lib/exportUtils';
import { db } from '../../../lib/db';
import { X, Download, FileSpreadsheet, Check, Users } from 'lucide-react';

interface PatientExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
}

export const PatientExportModal: React.FC<PatientExportModalProps> = ({
  isOpen,
  onClose,
  patients,
}) => {
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');

  if (!isOpen) return null;

  const handleExport = () => {
    const filename = `pacientes_dental_finance_${new Date().toISOString().split('T')[0]}`;
    if (format === 'xlsx') {
      exportPatientsToXlsx(patients, `${filename}.xlsx`);
    } else {
      exportPatientsToCsv(patients, `${filename}.csv`);
    }

    try {
      (db as any).log(
        'EXPORTACAO_PACIENTES',
        'PATIENT',
        'bulk',
        `Exportação de base de ${patients.length} pacientes no formato ${format.toUpperCase()}.`
      );
    } catch {}

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Download className="w-5 h-5 text-teal-600" />
            Exportar Base de Pacientes
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-100 text-xs text-teal-900">
            <Users className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <strong>{patients.length} pacientes selecionados</strong> para exportação, incluindo
              dados de contato, alergias, condições médicas e observações clínicas.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Escolha o Formato do Arquivo:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  format === 'xlsx'
                    ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold shadow-xs ring-2 ring-teal-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 mb-1.5 text-teal-600" />
                <div className="text-sm">Excel (.xlsx)</div>
                <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                  Planilha formatada oficial
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  format === 'csv'
                    ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold shadow-xs ring-2 ring-teal-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <Download className="w-5 h-5 mb-1.5 text-blue-600" />
                <div className="text-sm">CSV (.csv)</div>
                <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                  Separador ; com UTF-8 BOM
                </p>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
            >
              <Download className="w-4 h-4" />
              Baixar {format.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
