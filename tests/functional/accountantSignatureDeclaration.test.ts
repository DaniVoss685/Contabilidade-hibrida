// Declaração de Faturamento dos Últimos 12 Meses (autoatendimento, clientes com Contábilex ativo) +
// configuração global da assinatura do contador (nome/CRC/CPF/imagem PNG). Pedido do usuário: replicar
// o formato já usado no Contábilex (print de referência) sem inventar uma assinatura sem lastro real —
// a imagem é sempre a que o escritório cadastrou, nunca gerada/sintetizada pelo sistema.
// Rodar com: npx tsx tests/functional/accountantSignatureDeclaration.test.ts

import { readFileSync } from 'node:fs';
import { AccountantSignatureService, AccountantSignatureConfig } from '../../src/services/accountantSignatureService';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

console.log('\n=== 1. AccountantSignatureService.isComplete ===');
{
  const full: AccountantSignatureConfig = {
    accountantName: 'Priscila Souza Lima',
    crcRegistration: 'CRC/MG 121807/O',
    accountantCpf: '133.531.396-64',
    signatureImageDataUrl: 'data:image/png;base64,AAA',
    updatedAt: '2026-09-29T12:00:00Z',
    updatedByName: 'Leonardo',
  };
  assert(AccountantSignatureService.isComplete(full) === true, 'completa (nome+CRC+CPF+imagem) → true');
  assert(AccountantSignatureService.isComplete({ ...full, signatureImageDataUrl: null }) === false, 'sem imagem → false (nunca finge assinatura)');
  assert(AccountantSignatureService.isComplete({ ...full, accountantName: '' }) === false, 'sem nome → false');
  assert(AccountantSignatureService.isComplete({ ...full, crcRegistration: '   ' }) === false, 'CRC só com espaços → false');
  assert(AccountantSignatureService.isComplete({ ...full, accountantCpf: '' }) === false, 'sem CPF → false');
  assert(AccountantSignatureService.isComplete(null) === false, 'config nula → false');
  assert(AccountantSignatureService.isComplete(undefined) === false, 'config indefinida → false');
}

console.log('\n=== 2. Migration — RLS: leitura ampla, escrita só equipe do escritório ===');
{
  const sql = src('supabase/migrations/20260929120000_accountant_signature_config.sql');
  assert(sql.includes("CONSTRAINT df_accountant_signature_single_row CHECK (id = 'default')"), 'linha única garantida por CHECK (nunca vira tabela multi-linha por engano)');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS habilitada');
  assert(/df_accountant_signature_select[\s\S]*?FOR SELECT[\s\S]*?is_active = true\s*\)\s*\);/.test(sql), 'SELECT liberado para qualquer usuário ativo (precisa exibir na declaração da própria clínica)');
  assert(/df_accountant_signature_write[\s\S]*?is_primary = true OR role = 'SUPER_ADMIN'/.test(sql), 'escrita restrita a is_primary/SUPER_ADMIN — mesmo predicado de get_all_dental_tenants (migration 17)');
  assert((sql.match(/is_primary = true OR role = 'SUPER_ADMIN'/g) || []).length === 2, 'o predicado de equipe do escritório aparece no USING e no WITH CHECK (não só um dos dois)');
}

console.log('\n=== 3. Serviço — nunca inventa assinatura, escrita depende só da RLS (sem gate client-side furável) ===');
{
  const code = src('src/services/accountantSignatureService.ts');
  assert(!code.includes('.storage.') && !code.includes('StorageService'), 'não usa Storage/bucket (imagem fica como data URL na própria linha — não colide com as policies tenant-scoped de dental-private)');
  assert(code.includes('rows.length === 0') && code.includes('Sem permissão'), 'saveConfig trata "0 linhas afetadas" como bloqueio de RLS (PostgREST não erra explicitamente num UPDATE que a policy silenciosamente zera)');
}

console.log('\n=== 4. Painel de configuração (Modo Consultoria) — edição só para is_primary/SUPER_ADMIN ===');
{
  const code = src('src/components/Consulting/ConsultingSettingsView.tsx');
  assert(code.includes("currentSession?.user?.isPrimary || currentSession?.user?.role === 'SUPER_ADMIN'"), 'canEditSignature espelha exatamente o predicado da RLS no frontend (só para UX — a RLS é quem de fato protege)');
  assert(code.includes('!canEditSignature') && code.includes('Só a conta primária do escritório pode cadastrar ou alterar'), 'quem não pode editar vê aviso claro, nunca o formulário');
  assert(code.includes("file.size > 500 * 1024"), 'valida tamanho da imagem antes de gravar (evita base64 gigante na tabela)');
  assert(/image\\\/\(png\|jpeg\)/.test(code), 'valida tipo da imagem (só PNG/JPG)');
}

console.log('\n=== 5. Declaração (Relatórios) — gate Contábilex ATIVO e fonte oficial do faturamento ===');
{
  const code = src('src/components/Reports/DeclaracaoFaturamentoView.tsx');
  assert(code.includes("fiscalBase.status === 'AVAILABLE' && fiscalBase.source === 'CONTABILEX'"), "mesmo gate da base fiscal oficial (igual ao Fator R) — nunca libera para MANUAL_TOTAL/MANUAL_MONTHLY");
  assert(code.includes('ContabilexIntegrationService.getPublishedSnapshots') && code.includes('s.gross_revenue'), 'faturamento vem do snapshot OFICIAL (gross_revenue por competência) — nunca de sales/db diretamente');
  assert(!code.includes('sumCnpjRevenueForCompetence') && !/\bsales\s*\.\s*reduce/.test(code), 'não recalcula faturamento a partir dos lançamentos do Dental Finance (evita divergir do que o contador assinou)');
  assert(code.includes('AccountantSignatureService.isComplete(signature)') && code.includes('signatureReady'), 'só mostra bloco de assinatura quando está genuinamente completa (nunca <img> quebrada nem nome sem imagem)');
  assert(code.includes('Assinatura do contador pendente de configuração'), 'quando falta a assinatura, o documento avisa em vez de fingir que está assinado');
  assert(code.includes('disabled={snapshots.length === 0 || !signatureReady}'), 'botão de imprimir/baixar fica desabilitado sem dado ou sem assinatura completa');
  assert(code.includes('@media print') && code.includes('declaracao-print-area') && code.includes('declaracao-no-print'), 'CSS de impressão isola só o documento (esconde o resto da aplicação ao imprimir/salvar PDF)');
}

console.log('\n=== 6. Integração no Relatórios — gated, sem quebrar os relatórios existentes ===');
{
  const code = src('src/components/Reports/ReportsView.tsx');
  assert(code.includes("'DECLARACAO_FATURAMENTO'") && code.includes('DeclaracaoFaturamentoView'), 'novo tipo de relatório registrado e componente importado');
  assert(code.includes("selectedReport !== 'DECLARACAO_FATURAMENTO'") , 'fallback genérico de "outros relatórios" não roda por cima da declaração (evita duplicar conteúdo)');
  assert(/selectedReport !== 'DECLARACAO_FATURAMENTO' && \(\s*<button/.test(code) || code.includes("{selectedReport !== 'DECLARACAO_FATURAMENTO' && (\n            <button"), 'botão "Exportar CSV / Excel" (não se aplica a um documento assinado) fica oculto quando a declaração está selecionada');
}

console.log(`\n${passed} verificações passaram.`);
