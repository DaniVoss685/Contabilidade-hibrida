import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Sidebar navigation sections respect clinic priority order', () => {
  const sidebarPath = path.resolve('src/components/Layout/Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  // Extract the sections array definition
  const sectionsMatch = sidebarContent.match(/const sections: NavSection\[\] = \[([\s\S]*?)\];/);
  assert(sectionsMatch, 'O array de seções do Sidebar deve estar definido');

  const content = sectionsMatch[1];

  // 1. Visão Geral (Dashboard) deve vir primeiro
  const idxDashboard = content.indexOf("id: 'dashboard'");
  assert(idxDashboard !== -1, 'Dashboard deve estar presente');

  // 2. Movimentação (sales, receivables, expenses)
  const idxSales = content.indexOf("id: 'sales'");
  const idxReceivables = content.indexOf("id: 'receivables'");
  const idxExpenses = content.indexOf("id: 'expenses'");
  assert(idxSales > idxDashboard, 'Receitas/Vendas deve vir após Dashboard');
  assert(idxReceivables > idxSales, 'Contas a Receber deve vir após Receitas/Vendas');
  assert(idxExpenses > idxReceivables, 'Despesas deve vir após Contas a Receber');

  // 3. Pacientes e Agenda
  const idxPatients = content.indexOf("id: 'patients'");
  const idxAgenda = content.indexOf("id: 'agenda'");
  assert(idxPatients > idxExpenses, 'Pacientes deve vir após Movimentação');
  assert(idxAgenda > idxPatients, 'Agenda deve vir com Pacientes');

  // 4. Fiscal e Estratégico (taxes, fiscal_simulator)
  const idxTaxes = content.indexOf("id: 'taxes'");
  const idxSimulator = content.indexOf("id: 'fiscal_simulator'");
  assert(idxTaxes > idxAgenda, 'Impostos & Fator R deve vir após Pacientes/Agenda');
  assert(idxSimulator > idxTaxes, 'Simulador Fiscal deve vir após Impostos');

  // 5. Procedimentos & Insumos rebaixados para Cadastros
  const idxProcedures = content.indexOf("id: 'procedures'");
  const idxSupplies = content.indexOf("id: 'supplies'");
  assert(idxProcedures > idxSimulator, 'Procedimentos deve ficar mais abaixo (Cadastros & Gestão)');
  assert(idxSupplies > idxProcedures, 'Insumos deve ficar junto a Procedimentos');
});
