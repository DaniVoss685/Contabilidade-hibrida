import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  iconOnly?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, iconOnly = false }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <div
        className="inline-flex items-center cursor-help"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(!visible)}
      >
        {children}
        {iconOnly && <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-600 transition-colors ml-1 inline" />}
      </div>
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-none transition-all leading-relaxed">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

export const TaxBadge: React.FC<{ origin: 'CPF' | 'CNPJ' | string }> = ({ origin }) => {
  if (origin === 'CPF') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        CPF • Pessoa Física
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
      CNPJ • Pessoa Jurídica
    </span>
  );
};
