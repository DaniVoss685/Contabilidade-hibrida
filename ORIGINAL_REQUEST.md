# Original User Request

## 2026-09-11T00:00:45Z

Auditoria profunda de UX, funcionalidades e consistência operacional em todo o sistema Dental Finance, corrigindo bugs funcionais, eliminando redundâncias visuais, padronizando nomenclaturas e aprimorando fluxos operacionais de ponta a ponta sem alterar a identidade visual já aprovada.

Working directory: c:\Users\Guilherme\Contabilidade-hibrida dentista
Integrity mode: development

---

## Requirements

### R1. Fonte Única de Verdade de Período (PeriodPicker) e Despoluição do Header
- Consolidar a navegação e exibição de competência/período em um único componente global conceitual (PeriodPicker), eliminando qualquer exibição duplicada/redundante do mesmo mês/ano na mesma tela.
- Reestruturar a hierarquia do Header da aplicação:
  - Manter busca global (⌘K) e botão primário + Nova Receita (destaque verde/teal).
  - Tratar + Nova Despesa como ação secundária com semântica própria (rose/vermelho suave), sem confundir com perigo/exclusão.
  - Substituir o ícone isolado de visibilidade do CPF por controle com estado explícito e acessível (ex: "CPF visível" / "CPF oculto" ou tooltip claro).
  - Adicionar label/contexto à ação do Fator R ou reposicioná-la contextualmente no fluxo fiscal.
  - Expandir o badge de pendências com label/tooltip explicativo (ex: "65 pendências") e rota de acesso previsível.
  - Remover dados estáticos ou pouco acionáveis que concorram com as ações operacionais.

### R2. Padronização Terminológica PF/PJ e Correção de Filtros em Contas a Receber/Pagar
- Padronizar globalmente a nomenclatura:
  - Contextos amplos: "Pessoa Física (CPF)" e "Pessoa Jurídica (CNPJ)".
  - Filtros compactos: "CPF" e "CNPJ".
- Corrigir o bug do filtro CPF/CNPJ em Contas a Receber para que a listagem, contadores e somatórios reajam com precisão à alternância entre "Todas", "CPF" e "CNPJ", mantendo a persistência com filtros de status e busca.
- Aplicar o mesmo comportamento e nomenclatura padronizados em Contas a Pagar, Receitas, Despesas e Relatórios.

### R3. Busca Precisa de Pacientes e Desativação de Sugestões Indesejadas
- Corrigir e aprimorar a busca de pacientes para funcionar de forma idêntica por nome, CPF e telefone:
  - Busca imune a diferenças de caixa (case-insensitive) e indiferente a acentuação.
  - Aceitar CPF digitado com ou sem pontuação (21948375120 ou 219.483.751-20).
  - Filtragem instantânea conforme o usuário digita.
- Desativar autocomplete, autofill e spellcheck do navegador em campos comuns de formulários onde sugestões automáticas causem poluição visual. Manter pesquisa dinâmica apenas em comboboxes específicos (pacientes e fornecedores cadastrados).

### R4. Redução de Densidade no Modal de Nova Receita e Reatividade no Modal de Nova Despesa
- No Modal "Nova Receita":
  - Otimizar espaçamentos verticais, hierarquia de títulos/subtítulos e divisores.
  - Reduzir o peso visual de textos auxiliares e tags técnicas ("Regime de Caixa", "Carnê-Leão", "Simples Nacional", "Impacta Fator R"), mantendo a clareza das 6 etapas mentais sem remover nenhum dado funcional.
- No Modal "Nova Despesa":
  - Fazer o campo de documento do fornecedor reagir à titularidade selecionada: exibir "CPF do Fornecedor" com máscara ###.###.###-## quando for Pessoa Física, e "CNPJ do Fornecedor" com máscara ##.###.###/####-## quando for Pessoa Jurídica.
- Implementar proteção contra duplo clique no salvamento de formulários (desabilitando o botão e exibindo "Salvando...").
- Implementar diálogo de confirmação "Descartar alterações?" apenas quando o usuário tentar fechar um modal com alterações não salvas relevantes (dirty state).

### R5. Separação de Colunas de Datas e Gestão de Comprovantes
- Na tabela de Contas a Pagar: separar em colunas distintas "Vencimento" e "Pagamento" (exibindo — se pendente).
- Na tabela de Contas a Receber: separar em colunas distintas "Vencimento" e "Recebimento" (exibindo — se pendente).
- Aprimorar o fluxo de upload de comprovantes (despesas/receitas):
  - Suportar PDF, PNG, JPG e JPEG com validação de formato e tamanho máximo.
  - Exibir nome, extensão e tamanho do arquivo após o upload.
  - Oferecer preview para imagens, visualização/abertura para PDF e botão de remoção com confirmação.

### R6. Sistema Global de Feedback e Acessibilidade dos Diálogos
- Implementar estratégia unificada de feedback pós-ação:
  - Ações destrutivas (excluir despesa, cancelar receita, excluir paciente, apagar insumo): acionar obrigatoriamente ConfirmDialog com botão vermelho de confirmação e mensagem descritiva do registro afetado.
  - Ações de criação/edição bem-sucedidas: emitir Toast de notificação não bloqueante (ex: "Despesa criada com sucesso", "Alterações salvas").
- Auditar e assegurar que 100% dos modais e diálogos possam ser fechados via:
  - Tecla Escape.
  - Botão de fechar X.
  - Botão Cancelar.
  - Clique no backdrop/área externa (quando não houver risco de perda de dados).
  - Garantir focus trap e z-index correto para que nenhum diálogo fique travado ou inacessível.

### R7. Redesign Funcional das Configurações, Contas Bancárias e Simulação Tributária
- Na página de Configurações & Parâmetros Tributários:
  - Todos os valores monetários (RBT12, FS12, INSS, pró-labore, bases) devem utilizar CurrencyInput e formatação BRL (R$ 280.000,00), eliminando valores crus não formatados.
- Implementar gestão completa (CRUD) de Contas Bancárias:
  - Adicionar, editar, desativar e excluir contas bancárias.
  - Campos essenciais: titularidade (Pessoa Física vs Pessoa Jurídica), Banco, Agência, Conta, Tipo de Conta e Chave PIX.
  - Integração visual nítida com o princípio da Separação Patrimonial.
- Bateria de Testes Fiscais / Cenários do Fator R:
  - Indicar visualmente qual cenário está ativo no card correspondente.
  - Após aplicação de um cenário, exibir feedback explícito com resumo "Antes → Depois" (ex: Anexo V → Anexo III, DAS: R$ X → R$ Y) e notificação indicando onde os efeitos se refletiram (Dashboard, Impostos & Fator R).
  - Oferecer opção segura para restaurar o cenário anterior.

### R8. Prevenção Absoluta de Valores Inválidos (NaN, undefined, Infinity)
- Realizar varredura global e implementar guardrails matemáticos para que nenhum cálculo financeiro, indicador de margem ou campo de procedimento exiba NaN, undefined, null ou Infinity.
- Caso custos ou dados ainda não estejam disponíveis para cálculo de margem, exibir — ou "Aguardando custos".
- Garantir estados visuais completos de Empty State (com orientações e ação recomendada), Loading e Error em todas as listagens e tabelas.

---

## Acceptance Criteria

### Navegação, Período e Header
- [ ] O componente global de período exibe a competência atual uma única vez na tela, permitindo navegar mês anterior/seguinte, selecionar mês diretamente e alterar ano sem redundâncias.
- [ ] O Header exibe busca global, + Nova Receita (primário teal), + Nova Despesa (secundário rose) e o botão de visibilidade de CPF possui indicador claro de estado (visível/oculto).
- [ ] A funcionalidade do Fator R no Header possui identificação clara com texto ou está integrada contextualmente na área tributária.
- [ ] O contador de pendências possui texto explicativo (ex: "X pendências") e direciona para as ações pendentes.

### Filtros e Terminologia
- [ ] O filtro de origem tributária em Contas a Receber filtra corretamente entre "Todas", "CPF" e "CNPJ", atualizando as linhas e contadores em sincronia com os filtros de status e busca.
- [ ] A terminologia "Pessoa Física (CPF)" e "Pessoa Jurídica (CNPJ)" é adotada de maneira coerente e uniforme em Contas a Receber, Contas a Pagar, Vendas e Despesas.
- [ ] As tabelas de Contas a Pagar e Contas a Receber contêm colunas separadas para Vencimento e Pagamento/Recebimento, com hífen — para valores em aberto.

### Busca e Formulários
- [ ] A busca de pacientes retorna resultados precisos tanto por nome (independente de maiúsculas/minúsculas e acentos) quanto por CPF (digitado com ou sem pontos e traço) e telefone.
- [ ] O Modal de Nova Despesa adapta dinamicamente o label e a máscara do documento do fornecedor ("CPF do Fornecedor" com máscara de CPF para PF; "CNPJ do Fornecedor" com máscara de CNPJ para PJ).
- [ ] O Modal de Nova Receita apresenta distribuição balanceada com peso visual secundário para metadados fiscais auxiliares, preservando todas as seções funcionais.
- [ ] O envio de formulários desabilita múltiplos cliques acidentais e exibe estado de progresso "Salvando...".
- [ ] Fechar modais com formulários alterados solicita confirmação antes de descartar dados, enquanto modais não editados fecham imediatamente.

### Feedback, Diálogos e Comprovantes
- [ ] Todas as ações de exclusão abrem um diálogo de confirmação com botão destrutivo vermelho e descrição do item a ser excluído.
- [ ] Ações bem-sucedidas de criação e edição exibem Toast de confirmação não intrusivo.
- [ ] Todos os diálogos e modais fecham corretamente via tecla Escape, botão X, botão Cancelar e clique fora (quando seguro).
- [ ] O upload de comprovantes aceita PDF, PNG, JPG e JPEG, valida formato/tamanho, exibe dados do arquivo anexado e permite preview de imagem e abertura de PDF.

### Configurações e Fiscal
- [ ] Todos os campos monetários da página de Configurações exibem formatação BRL e utilizam CurrencyInput.
- [ ] A interface permite cadastrar, editar, desativar e excluir contas bancárias com distinção nítida entre Pessoa Física e Pessoa Jurídica.
- [ ] A seleção de cenários fiscais (Fator R) destaca o card ativo, exibe resumo de impacto "Antes → Depois" e informa os módulos atualizados com opção de restauração.
- [ ] Nenhuma página ou cálculo exibe NaN%, undefined ou Infinity, possuindo fallbacks elegantes e mensagens de empty state com ações úteis.

### Verificação Automatizada e Compilação
- [ ] npx tsc --noEmit executa com código 0 (zero erros de TypeScript).
- [ ] npm run build conclui com sucesso gerando o bundle de produção sem falhas.
- [ ] Servidor de desenvolvimento opera de forma estável em http://localhost:3000/.
