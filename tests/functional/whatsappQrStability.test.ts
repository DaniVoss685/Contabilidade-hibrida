// Bug real reproduzido em múltiplas clínicas: ao conectar o WhatsApp de uma clínica nova, o QR
// aparece, o celular tenta escanear e frequentemente falha; "Verificar Status"/"Atualizar QR"/F5
// nem sempre resolvem; depois de um tempo um QR novo passa a funcionar.
//
// Causa raiz encontrada (auditoria de código real, não commitado): `get_status` em
// dental-whatsapp-api/index.ts tratava QUALQUER estado da Evolution diferente de 'open'/'connecting'
// (inclusive 'close' transitório, normal enquanto o QR aguarda leitura) como 'disconnected',
// sobrescrevendo um status 'qrcode' ainda válido — e zerando o QR retornado ao frontend. O MESMO
// padrão existia em create_instance/connect_instance para uma instância já 'connected': uma única
// consulta transitória não confirmando 'open' fazia a rota gerar e gravar um QR NOVO por cima de
// uma clínica genuinamente conectada (violando a regra de "instância CONNECTED é somente leitura").
// No frontend, `loadStatus` também chamava `handleConnect` (que soliciva um QR novo) em TODA
// checagem de status — mount, "Verificar Status" e cada tick do polling de 4s — sem nenhuma guarda
// de concorrência/sequência, então respostas fora de ordem podiam sobrescrever uma mais nova.
//
// Este arquivo faz verificação ESTÁTICA do código real (mesmo padrão de outros testes deste
// projeto sem framework de teste/DOM) — não simula rede/DOM, confirma que os mecanismos corrigidos
// estão de fato no código que roda em produção.
// Rodar com: npx tsx tests/functional/whatsappQrStability.test.ts

import { readFileSync } from 'node:fs';

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
const apiCode = src('supabase/functions/dental-whatsapp-api/index.ts');
const modalCode = src('src/components/WhatsApp/InstanceConfigModal.tsx');

console.log('\n=== Backend — get_status nunca apaga um QR/status válido por causa de estado transitório ===');
{
  assert(
    !/currentStatus = state === "open" \? "connected" : state === "connecting" \? "connecting" : "disconnected"/.test(apiCode),
    'a antiga cadeia ternária que mapeava QUALQUER estado não-open/connecting para disconnected foi removida'
  );
  assert(
    apiCode.includes('if (state === "open") {') && apiCode.includes('currentStatus = "connected";'),
    'get_status só marca connected quando a Evolution realmente confirma "open"'
  );
  assert(
    apiCode.includes('} else if (instanceRow.status === "connected") {') && apiCode.includes('currentStatus = "disconnected";'),
    'get_status só marca disconnected quando a instância JÁ estava connected (desconexão real), nunca a partir de qrcode/connecting'
  );
}

console.log('\n=== Backend — instância CONNECTED é somente leitura em create_instance/connect_instance ===');
{
  assert(
    apiCode.includes('esta ação é SOMENTE LEITURA para') && apiCode.includes('instâncias conectadas'),
    'comentário documenta a regra de somente-leitura para instância conectada'
  );
  // Depois da checagem "connected", a rota agora SEMPRE retorna (não cai mais para o bloco que
  // solicita/grava um QR novo) — confirmado pela ausência de qualquer caminho que grave
  // status:"qrcode" dentro do bloco `if (existingInst.status === "connected")`.
  const connectedBlockMatch = apiCode.match(/if \(existingInst\.status === "connected"\) \{[\s\S]*?\n        \}\n/);
  assert(!!connectedBlockMatch, 'bloco de tratamento de instância já connected encontrado');
  assert(
    !connectedBlockMatch![0].includes('status: "qrcode"'),
    'o bloco de instância já CONNECTED nunca grava status "qrcode" (nunca gera QR novo para quem já está conectado)'
  );
  assert(
    apiCode.includes('// Tentar obter QR Code da instância já existente (só quando NÃO está marcada como conectada)'),
    'a busca de QR para instância existente é explicitamente restrita a instâncias NÃO conectadas'
  );
}

console.log('\n=== Frontend — checagem de status nunca gera QR novo automaticamente (só bootstrap único) ===');
{
  assert(
    !apiCode.includes('// Obtém automaticamente QR Code novo'),
    'sanity check: comentário antigo não vazou para o arquivo errado'
  );
  assert(
    modalCode.includes('let needsBootstrapQr = false;') && modalCode.includes('needsBootstrapQr = true;'),
    'loadStatus só marca necessidade de buscar QR quando a instância realmente não tem nenhum QR ainda'
  );
  assert(
    /if \(needsBootstrapQr && requestSeqRef\.current === seq\) \{\s*\n\s*await handleConnect\(false\);/.test(modalCode),
    'handleConnect só é chamado a partir de loadStatus nesse caso de bootstrap único, fora do try/finally da checagem de status'
  );
  // Regressão: a chamada incondicional antiga (toda checagem de status também gerava QR novo) não existe mais.
  assert(
    !/setQrCode\(res\.qrcode\);\s*\n\s*\}\s*\n\s*\/\/[^\n]*\n\s*await handleConnect\(false\);/.test(modalCode),
    'não existe mais uma chamada incondicional a handleConnect logo após exibir um QR já existente'
  );
}

console.log('\n=== Frontend — guardas de concorrência e de sequência (evita respostas fora de ordem) ===');
{
  assert(modalCode.includes('const requestSeqRef = useRef(0);'), 'existe contador de sequência de requisição');
  assert(modalCode.includes('const busyRef = useRef(false);'), 'existe guarda de "requisição em voo" compartilhada');
  assert(
    (modalCode.match(/if \(requestSeqRef\.current !== seq\) return/g) || []).length >= 3,
    'handleConnect, loadStatus e o polling descartam respostas cuja sequência não é mais a mais recente'
  );
  assert(
    modalCode.includes('if (busyRef.current) return;') && (modalCode.match(/busyRef\.current = false;/g) || []).length >= 2,
    'handleConnect/loadStatus não disparam chamada nova enquanto outra já está em andamento, e sempre liberam a guarda ao final'
  );
}

console.log('\n=== Frontend — Realtime detecta "conectado" sem precisar de F5 ===');
{
  assert(
    modalCode.includes("supabase\n      .channel(`wa_instance_config_") || /\.channel\(`wa_instance_config_\$\{cleanTenantId\}`\)/.test(modalCode),
    'canal Realtime dedicado por tenant para df_wa_instances existe'
  );
  assert(
    modalCode.includes("table: 'df_wa_instances'") && modalCode.includes('filter: `tenant_id=eq.${cleanTenantId}`'),
    'o canal Realtime escuta especificamente a linha da instância deste tenant'
  );
  const channelStart = modalCode.indexOf('wa_instance_config_');
  const subscribeEnd = modalCode.indexOf('.subscribe();', channelStart);
  assert(channelStart >= 0 && subscribeEnd > channelStart, 'bloco do canal Realtime encontrado por completo');
  const realtimeBlock = modalCode.slice(channelStart, subscribeEnd);
  assert(
    realtimeBlock.includes("row.status === 'connected'") && realtimeBlock.includes('setJustConnected(true)'),
    'evento Realtime de conexão aplica o mesmo estado de sucesso que o polling aplicava — sem exigir F5'
  );
  assert(
    modalCode.includes('supabase.removeChannel(channel)'),
    'o canal Realtime é limpo ao desmontar/fechar (sem vazar subscrição)'
  );
}

console.log('\n=== Frontend — 1 tenant = 1 instância (idempotência já existente, não regredida) ===');
{
  assert(
    apiCode.includes('.eq("tenant_id", tenantId)') && apiCode.includes('Idempotência: 1 tenant = 1 instância'),
    'create_instance continua consultando a instância existente por tenant_id antes de criar (nunca cria duplicata)'
  );
}

console.log('\n=== Frontend — aviso de QR potencialmente desatualizado (nunca esconde, só avisa) ===');
{
  assert(modalCode.includes('const QR_STALE_WARNING_MS = 45_000;'), 'margem de aviso de QR desatualizado definida');
  assert(
    modalCode.includes('nowTick - qrIssuedAt > QR_STALE_WARNING_MS'),
    'aviso visual aparece quando o QR exibido está há muito tempo sem atualização, sem esconder a imagem'
  );
}

console.log('\n=== Frontend — erro de rede é diferenciado de erro de negócio ===');
{
  assert(
    modalCode.includes('function describeConnectError') && modalCode.includes('Não foi possível conectar ao servidor'),
    'erros de rede (fetch falhou) têm mensagem própria, distinta do erro retornado pelo backend'
  );
}

console.log(`\n${passed} verificações passaram.`);
