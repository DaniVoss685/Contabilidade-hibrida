import { Sale, Expense, BankAccount } from '../types';

export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Augments demo sales and expenses to provide a complete 12-month dataset
 * for baseYear (e.g. 2025) if not already populated across the whole year.
 */
export function augmentYearlyDataset(
  existingSales: Sale[],
  existingExpenses: Expense[],
  year: number = new Date().getFullYear()
): { sales: Sale[]; expenses: Expense[] } {
  // Check if year already has sales in more than 3 distinct months
  const monthsWithSales = new Set(
    existingSales
      .filter((s) => s.serviceDate && s.serviceDate.startsWith(`${year}-`))
      .map((s) => s.serviceDate.substring(0, 7))
  );

  const monthsWithExpenses = new Set(
    existingExpenses
      .filter((e) => e.competenceDate && e.competenceDate.startsWith(`${year}-`))
      .map((e) => e.competenceDate.substring(0, 7))
  );

  if (monthsWithSales.size >= 8 && monthsWithExpenses.size >= 8) {
    return { sales: existingSales, expenses: existingExpenses };
  }

  const newSales: Sale[] = [...existingSales];
  const newExpenses: Expense[] = [...existingExpenses];

  // Procedure templates for recurring monthly clinical activity
  const procedureTemplates = [
    {
      procedureName: 'Implante Dentário Cone Morse com Biomaterial',
      description: 'Cirurgia de instalação de implante CM com enxerto',
      totalValue: 2800.0,
      taxOrigin: 'CNPJ' as const,
      category: 'Implantodontia',
      installments: 3,
    },
    {
      procedureName: 'Tratamento Endodôntico (Canal Molar - 3 canais)',
      description: 'Tratamento de canal mecanizado em dente molar',
      totalValue: 1200.0,
      taxOrigin: 'CPF' as const,
      category: 'Endodontia',
      installments: 2,
    },
    {
      procedureName: 'Prótese Fixa em Zircônia Sobre Implante',
      description: 'Coroa protética fresada em Zircônia CAD/CAM',
      totalValue: 2400.0,
      taxOrigin: 'CNPJ' as const,
      category: 'Prótese',
      installments: 4,
    },
    {
      procedureName: 'Profilaxia e Raspagem Supragengival com Jato',
      description: 'Limpeza profilática com jato de bicarbonato e flúor',
      totalValue: 280.0,
      taxOrigin: 'CPF' as const,
      category: 'Periodontia',
      installments: 1,
    },
    {
      procedureName: 'Restauração em Resina Composta Estética',
      description: 'Restauração direta 2 faces resina Filtek Z350',
      totalValue: 350.0,
      taxOrigin: 'CPF' as const,
      category: 'Dentística',
      installments: 1,
    },
    {
      procedureName: 'Clareamento Dental de Consultório',
      description: 'Clareamento em consultório com peróxido a 35%',
      totalValue: 1400.0,
      taxOrigin: 'CPF' as const,
      category: 'Estética',
      installments: 2,
    },
  ];

  // Monthly recurrent expenses templates
  const recurrentExpenseTemplates = [
    {
      supplierName: 'Imobiliária Jardins Empreendimentos',
      supplierCpfCnpj: '11222333000144',
      description: 'Aluguel do conjunto comercial onde funciona a clínica',
      categoryId: 'cat_02_01',
      categoryCode: '02.01',
      categoryName: 'Aluguel do consultório',
      value: 3800.0,
      entity: 'CPF' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 10,
    },
    {
      supplierName: 'Condomínio Medical Center Plaza',
      supplierCpfCnpj: '22333444000155',
      description: 'Taxa condominial mensal com água e portaria 24h',
      categoryId: 'cat_02_02',
      categoryCode: '02.02',
      categoryName: 'Condomínio',
      value: 950.0,
      entity: 'CPF' as const,
      dedutivelLivroCaixaPf: 'CONDICIONAL' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 10,
    },
    {
      supplierName: 'Ana Paula Ferreira (ASB)',
      supplierCpfCnpj: '32165498700',
      description: 'Salário mensal da auxiliar em saúde bucal da clínica',
      categoryId: 'cat_01_01',
      categoryCode: '01.01',
      categoryName: 'Salários',
      value: 2200.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: true,
      despesaOperacionalPj: true,
      dayOfMonth: 5,
    },
    {
      supplierName: 'Caixa Econômica Federal - Guia FGTS',
      supplierCpfCnpj: '00360305000104',
      description: 'Guia do FGTS da funcionária referente ao mês',
      categoryId: 'cat_01_04',
      categoryCode: '01.04',
      categoryName: 'FGTS',
      value: 176.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: true,
      despesaOperacionalPj: true,
      dayOfMonth: 7,
    },
    {
      supplierName: 'Enel Distribuição São Paulo',
      supplierCpfCnpj: '61695227000193',
      description: 'Conta de energia elétrica da clínica',
      categoryId: 'cat_03_01',
      categoryCode: '03.01',
      categoryName: 'Energia elétrica',
      value: 580.0,
      entity: 'CPF' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 15,
    },
    {
      supplierName: 'Audicont Contabilidade Odontológica',
      supplierCpfCnpj: '44555666000177',
      description: 'Honorários contábeis mensais, Livro Caixa e DEFIS',
      categoryId: 'cat_08_04',
      categoryCode: '08.04',
      categoryName: 'Contabilidade e assessoria fiscal',
      value: 850.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'CONDICIONAL' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 15,
    },
    {
      supplierName: 'Dental Cremer Produtos Odontológicos',
      supplierCpfCnpj: '14190547000118',
      description: 'Reposição mensal de insumos, anestésicos e resinas',
      categoryId: 'cat_04_01',
      categoryCode: '04.01',
      categoryName: 'Materiais odontológicos de consumo',
      value: 2150.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 18,
    },
    {
      supplierName: 'Laboratório Protético Master Dental',
      supplierCpfCnpj: '08912345000167',
      description: 'Serviços de próteses em zircônia e placas oclusais CAD/CAM',
      categoryId: 'cat_06_01',
      categoryCode: '06.01',
      categoryName: 'Prótese dentária (laboratório TPD)',
      value: 1950.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 20,
    },
    {
      supplierName: 'CliniSystem Softwares Odontológicos',
      supplierCpfCnpj: '21345678000199',
      description: 'Licença de software de prontuário eletrônico e agendamento',
      categoryId: 'cat_09_01',
      categoryCode: '09.01',
      categoryName: 'Software de gestão clínica / odontológica',
      value: 189.9,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'CONDICIONAL' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 5,
    },
    {
      supplierName: 'BioEcoponto Resíduos de Saúde',
      supplierCpfCnpj: '05678912000134',
      description: 'Coleta quinzenal e incineração de lixo infectante',
      categoryId: 'cat_05_06',
      categoryCode: '05.06',
      categoryName: 'Coleta e descarte de resíduos infectantes',
      value: 290.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 16,
    },
    {
      supplierName: 'Receita Federal do Brasil / PGFN',
      supplierCpfCnpj: '00394460005887',
      description: 'Guia DAS Simples Nacional mensal da clínica odontológica',
      categoryId: 'cat_13_01',
      categoryCode: '13.01',
      categoryName: 'DAS - Documento de Arrecadação do Simples',
      value: 1840.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'NAO' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 20,
    },
    {
      supplierName: 'Cristófoli Biossegurança / Santander Financiamentos',
      supplierCpfCnpj: '01222333000144',
      description: 'Parcela de aquisição e modernização da Autoclave e Compressor',
      categoryId: 'cat_14_02',
      categoryCode: '14.02',
      categoryName: 'Autoclave (aquisição / ativo imobilizado)',
      value: 1250.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'NAO' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 12,
    },
    {
      supplierName: 'Google Brasil Internet Ltda (Google Ads)',
      supplierCpfCnpj: '06990590000123',
      description: 'Campanhas de tráfego pago para atração de pacientes de implante e prótese',
      categoryId: 'cat_10_01',
      categoryCode: '10.01',
      categoryName: 'Anúncios e campanhas digitais (Google/Meta Ads)',
      value: 650.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 22,
    },
    {
      supplierName: 'Stone Pagamentos S.A.',
      supplierCpfCnpj: '16501555000157',
      description: 'Taxas MDR de parcelamento e antecipação de cartão dos pacientes',
      categoryId: 'cat_12_01',
      categoryCode: '12.01',
      categoryName: 'Tarifas e taxas de cartão / maquininhas',
      value: 480.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 28,
    },
    {
      supplierName: 'Dental Fix Manutenção Técnica Odontológica',
      supplierCpfCnpj: '33444555000188',
      description: 'Revisão preventiva das cadeiras odontológicas e mangueiras',
      categoryId: 'cat_07_01',
      categoryCode: '07.01',
      categoryName: 'Manutenção preventiva e corretiva de equipamentos',
      value: 350.0,
      entity: 'CNPJ' as const,
      dedutivelLivroCaixaPf: 'SIM' as const,
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      dayOfMonth: 14,
    },
  ];

  // Patients pool
  const patientsPool = [
    { id: 'pat_01', name: 'Mariana Santos Lima', cpf: '21948375120' },
    { id: 'pat_02', name: 'Rodrigo Alves Pereira', cpf: '32819405631' },
    { id: 'pat_03', name: 'Camila Beatriz Duarte', cpf: '45920384752' },
    { id: 'pat_04', name: 'Lucas Henrique Silva', cpf: '56031495863' },
    { id: 'pat_05', name: 'Juliana Paes Nogueira', cpf: '67142506974' },
    { id: 'pat_06', name: 'Marcelo Castro Silveira', cpf: '78253617085' },
    { id: 'pat_07', name: 'Larissa Montenegro', cpf: '89364728196' },
    { id: 'pat_08', name: 'Felipe Albuquerque', cpf: '90475839207' },
    { id: 'pat_09', name: 'Patrícia Helena Vieira', cpf: '11586940318' },
    { id: 'pat_10', name: 'Gabriel Matos Fonseca', cpf: '22697051429' },
  ];

  // Populate months 1..12 except month 5 (May) which already has live items
  for (let m = 1; m <= 12; m++) {
    if (m === 5) continue; // Keep original May untouched

    const monthStr = String(m).padStart(2, '0');
    const ym = `${year}-${monthStr}`;
    const isPastMonth = m < 5; // Months 1..4 are realized/past

    // 1. Generate recurrent expenses for month m
    recurrentExpenseTemplates.forEach((tpl, idx) => {
      const expDate = `${ym}-${String(tpl.dayOfMonth).padStart(2, '0')}`;
      const status = isPastMonth ? 'PAGO' : 'A_PAGAR';

      newExpenses.push({
        id: `exp_yr_${year}_${m}_${idx + 1}`,
        orgId: 'org_mendes_01',
        supplierName: tpl.supplierName,
        supplierCpfCnpj: tpl.supplierCpfCnpj,
        description: tpl.description,
        categoryId: tpl.categoryId,
        categoryCode: tpl.categoryCode,
        categoryName: tpl.categoryName,
        value: tpl.value,
        competenceDate: expDate,
        dueDate: expDate,
        paymentDate: isPastMonth ? expDate : undefined,
        paymentMethod: 'BOLETO',
        bankAccountId: tpl.entity === 'CPF' ? 'bank_01' : 'bank_02',
        entity: tpl.entity,
        dedutivelLivroCaixaPf: tpl.dedutivelLivroCaixaPf,
        impactaFatorRPj: tpl.impactaFatorRPj,
        despesaOperacionalPj: tpl.despesaOperacionalPj,
        status: status,
        createdAt: `${expDate}T09:00:00Z`,
      });
    });

    // 2. Generate sales for month m
    // Past months (1..4) have completed treatments
    // Future months (6..12) have scheduled treatments or receivable installments
    const salesCountForMonth = isPastMonth ? 8 : m <= 9 ? 6 : 4;

    for (let s = 0; s < salesCountForMonth; s++) {
      const pTpl = procedureTemplates[s % procedureTemplates.length];
      const patient = patientsPool[(s + m) % patientsPool.length];
      const day = String(Math.min(28, (s * 3) + 4)).padStart(2, '0');
      const serviceDate = `${ym}-${day}`;
      const saleId = `sale_yr_${year}_${m}_${s + 1}`;
      const instCount = pTpl.installments;
      const instValue = Math.round((pTpl.totalValue / instCount) * 100) / 100;

      const installments = [];
      for (let i = 1; i <= instCount; i++) {
        // Due date advances month by month
        const instMonth = m + (i - 1);
        const instYear = instMonth > 12 ? year + 1 : year;
        const normalizedMonth = instMonth > 12 ? instMonth - 12 : instMonth;
        const dueDate = `${instYear}-${String(normalizedMonth).padStart(2, '0')}-${day}`;
        
        let instStatus: 'RECEBIDO' | 'A_RECEBER' = 'A_RECEBER';
        let paymentDate: string | undefined = undefined;
        let amountReceived = 0;

        if (isPastMonth) {
          instStatus = 'RECEBIDO';
          paymentDate = dueDate;
          amountReceived = instValue;
        } else if (m > 5) {
          instStatus = 'A_RECEBER';
        }

        installments.push({
          id: `inst_${saleId}_${i}`,
          saleId: saleId,
          installmentNumber: i,
          totalInstallments: instCount,
          value: instValue,
          dueDate: dueDate,
          paymentDate: paymentDate,
          amountReceived: amountReceived,
          status: instStatus,
          paymentMethod: 'PIX' as const,
          bankAccountId: pTpl.taxOrigin === 'CPF' ? 'bank_01' : 'bank_02',
        });
      }

      newSales.push({
        id: saleId,
        orgId: 'org_mendes_01',
        taxOrigin: pTpl.taxOrigin,
        patientId: patient.id,
        patientName: patient.name,
        patientCpf: patient.cpf,
        payerIsBeneficiary: true,
        procedureName: pTpl.procedureName,
        description: pTpl.description,
        totalValue: pTpl.totalValue,
        serviceDate: serviceDate,
        paymentMethod: 'PIX',
        installmentsCount: instCount,
        installments: installments,
        createdAt: `${serviceDate}T10:00:00Z`,
      });
    }
  }

  return { sales: newSales, expenses: newExpenses };
}
