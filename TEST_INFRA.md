# Arquitetura e Metodologia da Suíte de Testes E2E Opaque-Box — Dental Finance

## 1. Visão Geral da Infraestrutura
A suíte de testes E2E Opaque-Box do Dental Finance foi projetada para garantir cobertura integral e independente do design interno, focando em contratos de interface, integridade tributária, estabilidade de fluxo financeiro e experiência de usuário (UX) em conformidade estrita com `ORIGINAL_REQUEST.md` e `PROJECT.md`.

- **Localização dos Testes**: `tests/e2e/`
- **Runner Principal**: `tests/e2e/runner.ts`
- **Comando de Execução**: `npx tsx tests/e2e/runner.ts`
- **Compilação TypeScript**: `npx tsc --noEmit` (Código 0)
- **Tempo Médio de Execução**: ~120ms (94 testes automatizados)

---

## 2. Estrutura de Diretórios e Arquivos

```
tests/e2e/
├── harness/
│   ├── testHarness.ts       # Runner nativo, assertions ricas, mockStorage e tracking por Tier/Requisito
│   └── contracts.ts         # Contratos de interface canônicos (R1 a R8) e adaptadores de teste
├── tier1-feature-coverage.test.ts  # Tier 1: Cobertura funcional básica (41 testes, >=5 por requisito R1 a R8)
├── tier2-boundary-corner.test.ts   # Tier 2: Casos limites, extremos e estresse (40 testes, >=5 por requisito R1 a R8)
├── tier3-pairwise.test.ts          # Tier 3: Combinações multi-recurso e interações entre módulos (8 testes)
├── tier4-real-world-scenarios.test.ts # Tier 4: Jornadas clínicas completas de ponta a ponta (5 jornadas)
└── runner.ts                # Master runner executável com relatórios coloridos e métricas
```

---

## 3. Metodologia de Teste por Tiers

### Tier 1 — Feature Coverage (41 testes)
Cobre os fluxos principais (happy paths) de todos os 8 requisitos centrais:
- **R1**: Navegação de competência única, seletor de mês/ano, botões do Header (+ Nova Receita primário teal, + Nova Despesa rose suave, visibilidade de CPF com estado acessível, ação do Fator R, badge de pendências explicativo).
- **R2**: Padronização terminológica global ("Pessoa Física (CPF)" e "Pessoa Jurídica (CNPJ)"), filtro em Contas a Receber (listagem, contadores e somatórios reativos), consistência em Contas a Pagar, Receitas e Despesas.
- **R3**: Busca de pacientes imune a maiúsculas/minúsculas e acentos (normalização NFD), busca por CPF com e sem pontuação, busca por telefone com e sem formatação, higienização de formulários (`autoComplete="off"`, `spellCheck={false}`).
- **R4**: Modal Nova Receita com preservação das 6 etapas mentais, modal Nova Despesa com documento reativo (CPF do Fornecedor vs CNPJ do Fornecedor), proteção anti-duplo clique (`isSubmitting` e "Salvando..."), dirty state ("Descartar alterações?").
- **R5**: Separação clara de colunas "Vencimento" e "Pagamento/Recebimento" com fallback "—", suporte canônico a `paymentDate`, componente `ReceiptUploader` aceitando PDF/PNG/JPG/JPEG até 5MB, exibição de metadados e preview.
- **R6**: Sistema unificado de feedback com Toasts de notificação (`success`, `error`, `warning`, `info`), `ConfirmDialog` com variante `danger` (botão vermelho destrutivo) para exclusões, acessibilidade universal (tecla `Escape`, botão `X`, botão `Cancelar`, backdrop seguro).
- **R7**: Campos monetários com `CurrencyInput` e formatação BRL, CRUD de Contas Bancárias com distinção nítida PF vs PJ, simulação do Fator R com destaque do card ativo, comparativo "Antes → Depois" e rollback seguro.
- **R8**: Guardrails matemáticos (`safeDivide`, `safeMargin`) prevenindo `NaN`, `undefined` e `Infinity`, fallback elegante para margens ("Aguardando custos" ou "—"), Empty States informativos com ação recomendada, estados de Loading e Error.

### Tier 2 — Boundary & Corner Cases (40 testes)
Testa os limites de tolerância a falhas, concorrência e anomalias:
- Transições de ano em Dezembro e Janeiro, modo 'ALL' (Ano Inteiro), clamp de anos 2024–2027, reset para Maio/2025.
- Listas vazias sob filtros múltiplos, precisão decimal de centavos nos somatórios, preservação de filtros durante mudanças de status, liquidações parciais.
- Busca com acentos extremos, caracteres compostos, termos parciais (<3 dígitos), múltiplos espaços, metacaracteres de regex sem quebra.
- Rajada de cliques concorrentes (anti-duplo clique), troca dinâmica de titularidade PF/PJ adaptando validação, fechamento de modais pristine vs dirty.
- Arquivos no limite exato de 5MB (aceitos) vs 5MB + 1 byte (rejeitados), arquivos vazios (rejeitados), extensões com múltiplos pontos.
- Emissão em alta frequência de Toasts (enfileiramento), diálogos com descrições longas, tecla Escape com inputs focados, modais aninhados.
- CurrencyInput com R$ 0,00, R$ 0,01 e R$ 99.999.999,99, strings com ruído, divisão de Fator R com RBT12 zero (sem divisão por zero), idempotência do rollback.
- Divisões com numerador negativo e divisor zero, numeradores/denominadores não finitos, margem com prejuízo, formatação percentual extrema.

### Tier 3 — Cross-Feature Combinations / Pairwise (8 testes)
Valida o comportamento acoplado entre subsistemas:
- **Pair 1**: Filtro CPF/CNPJ em Recebíveis (R2) + Liquidação com `paymentDate` e separação de datas (R5).
- **Pair 2**: Busca de Paciente com acentos NFD (R3) + Nova Receita em 6 etapas (R4) + Atualização de KPIs do Período (R1).
- **Pair 3**: Nova Despesa com reatividade documental (R4) + Upload de Comprovante (R5) + Impacto no Fator R e DRE (R7).
- **Pair 4**: ConfirmDialog destrutivo vermelho (R6) + CRUD de Contas Bancárias PF/PJ (R7).
- **Pair 5**: Empty State informativo (R8) + Navegação de Período Global (R1).
- **Pair 6**: Simulação Fator R Antes/Depois (R7) + Guardrails de Margem Segura (R8).
- **Pair 7**: Segregação Patrimonial PF/PJ (R2) + Associação a Contas Bancárias (R7).
- **Pair 8**: Proteção Anti-Duplo Clique (R4) + Dirty State (R4) + Acessibilidade Escape/Backdrop (R6).

### Tier 4 — Real-World Clinical Journeys (5 jornadas)
Simulação completa do dia a dia de clínicas odontológicas brasileiras:
1. **Jornada Tratamento Ortodôntico**: Cadastro de paciente com acentos -> Orçamento de alinhadores em 12x -> Rastreamento em Contas a Receber -> Liquidação das parcelas com `paymentDate` -> Atualização do fluxo de caixa e status.
2. **Jornada Suprimentos Cirúrgicos & Contas a Pagar**: Lançamento de despesa PJ com fornecedor (Dental Cremer) -> Validação de CNPJ -> Anexo de Nota Fiscal PDF (250 KB) -> Visualização em Contas a Pagar -> Execução do pagamento -> Reflexo no DRE.
3. **Jornada Planejamento Tributário e Fator R**: Diagnóstico de clínica no Anexo V (<28%) -> Ajuste de pró-labore com CurrencyInput BRL -> Simulação com folha otimizada -> Migração comprovada para Anexo III com redução de alíquota e DAS -> Rollback para parâmetros originais.
4. **Jornada Segregação Patrimonial & Gestão de Contas Bancárias**: Abertura e parametrização de conta PF (Nubank) e conta PJ (Santander) com chaves PIX -> Vinculação estrita de despesas PF à conta PF e PJ à conta PJ -> Validação de segregação -> Exclusão segura de conta.
5. **Jornada Auditoria, Tolerância a Falhas e Prevenção de Falhas**: Tentativa de fechar formulário dirty -> Alerta "Descartar alterações?" -> Cancelamento do descarte -> Submissão concorrente com anti-duplo clique -> Toast de sucesso -> Exclusão via ConfirmDialog vermelho -> Empty state com CTA -> Guardrails matemáticos sem `NaN`/`undefined`/`Infinity`.

---

## 4. Como Executar os Testes

Para executar toda a suíte E2E:
```bash
npx tsx tests/e2e/runner.ts
```

Para verificar integridade estática do TypeScript:
```bash
npx tsc --noEmit
```
