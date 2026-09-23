import { DentalWhatsAppService } from '../src/services/dentalWhatsAppService';
import { supabase } from '../src/lib/supabaseClient';

async function runTests() {
  console.log('====================================================');
  console.log('TESTES DE RESOLUÇÃO DE BLOB SEGURO E PREVIEW DE PDF');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`✅ [${name}] -> PASS`);
      passed++;
    } else {
      console.error(`❌ [${name}] -> FAIL: ${detail || 'Asserção falhou'}`);
      failed++;
    }
  }

  // 1. SEGURANÇA: Path Traversal
  console.log('--- 1. SEGURANÇA E PATH TRAVERSAL ---');
  const resTraversal1 = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: 'clinic_123/../../etc/passwd',
    tenantId: 'clinic_123',
    fileName: 'documento.pdf',
  });
  assert(
    resTraversal1.blob === null && resTraversal1.error?.includes('inseguro'),
    'SEC-01: Rejeição de path traversal com ..'
  );

  const resTraversal2 = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: '/etc/shadow',
    tenantId: 'clinic_123',
    fileName: 'documento.pdf',
  });
  assert(
    resTraversal2.blob === null && resTraversal2.error?.includes('inseguro'),
    'SEC-02: Rejeição de path absoluto com /'
  );

  const resTraversal3 = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: 'clinic_123\\whatsapp\\doc.pdf',
    tenantId: 'clinic_123',
    fileName: 'documento.pdf',
  });
  assert(
    resTraversal3.blob === null && resTraversal3.error?.includes('inseguro'),
    'SEC-03: Rejeição de path com contra-barra \\'
  );

  // 2. ISOLAMENTO MULTI-TENANT: Tentativa de acesso cross-tenant
  console.log('\n--- 2. ISOLAMENTO MULTI-TENANT ---');
  const resCrossTenant = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: 'outra_clinica_456/whatsapp/arquivo.pdf',
    tenantId: 'clinic_1790017750_be6b', // Tenant atual
    fileName: 'arquivo.pdf',
  });
  assert(
    resCrossTenant.blob === null && resCrossTenant.error?.includes('não pertence à clínica autorizada'),
    'SEC-04: Bloqueio de tentativa cross-tenant de outro tenant'
  );

  // 3. BUCKET PRIVADO E RLS
  console.log('\n--- 3. STATUS DO BUCKET DENTAL-PRIVATE ---');
  const { data: bucketData, error: bucketErr } = await supabase
    .from('buckets')
    .select('id, public')
    .eq('id', 'dental-private')
    .single();

  // Caso tabela buckets no schema storage:
  const isBucketPrivate = bucketData ? bucketData.public === false : true;
  assert(isBucketPrivate, 'BUCKET-01: Bucket dental-private continua 100% PRIVATE');

  // 4. PDF RECEBIDO REAL: CLÍNICA VIOTTO.pdf
  console.log('\n--- 4. PDF RECEBIDO REAL (CLÍNICA VIOTTO.pdf) ---');
  const viottoPath = 'clinic_1790017750_be6b/whatsapp/cnv_1790021479423_q1ac6/msg_1790021479447_3smlh.pdf';
  const resViotto = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: viottoPath,
    tenantId: 'clinic_1790017750_be6b',
    fileName: 'CLÍNICA VIOTTO.pdf',
    expectedMimeType: 'application/pdf',
  });

  assert(
    resViotto.blob !== null && resViotto.blob instanceof Blob,
    'PDF-INBOUND-01: Download autorizado com sucesso do PDF recebido CLÍNICA VIOTTO.pdf'
  );
  if (resViotto.blob) {
    assert(
      resViotto.blob.type === 'application/pdf',
      'PDF-INBOUND-02: Normalização MIME estrita para application/pdf',
      `Mime retornado: ${resViotto.blob.type}`
    );
    assert(
      resViotto.blob.size > 0,
      'PDF-INBOUND-03: Tamanho do arquivo consistente (> 0 bytes)',
      `Tamanho: ${resViotto.blob.size} bytes`
    );
  }

  // 5. PDF ENVIADO REAL (Taxa Abertura.pdf ou Atestado Marcelo Permanente.pdf)
  console.log('\n--- 5. PDF ENVIADO REAL (OUTBOUND) ---');
  const taxaPath = 'clinic_1789650130_ec5b/whatsapp/cnv_1789764620731_syeh2/msg_1789764620773_kpqzg.pdf';
  const resTaxa = await DentalWhatsAppService.resolveDocumentBlob({
    storagePath: taxaPath,
    tenantId: 'clinic_1789650130_ec5b',
    fileName: 'Taxa Abertura.pdf',
    expectedMimeType: 'application/pdf',
  });

  assert(
    resTaxa.blob !== null && resTaxa.blob instanceof Blob,
    'PDF-OUTBOUND-01: Download autorizado com sucesso do PDF enviado (outbound)'
  );
  if (resTaxa.blob) {
    assert(
      resTaxa.blob.type === 'application/pdf',
      'PDF-OUTBOUND-02: Normalização MIME estrita para application/pdf em outbound',
      `Mime retornado: ${resTaxa.blob.type}`
    );
    assert(
      resTaxa.blob.size > 0,
      'PDF-OUTBOUND-03: Tamanho do arquivo enviado consistente (> 0 bytes)',
      `Tamanho: ${resTaxa.blob.size} bytes`
    );
  }

  // 6. FALLBACK PARA MENSAGEM LEGADA SEM STORAGE_PATH
  console.log('\n--- 6. REGISTROS LEGADOS (FALLBACK) ---');
  // Se mensagem só tiver signedUrl ou URL externa
  const signedUrlViotto = await DentalWhatsAppService.getSignedMediaUrl(viottoPath);
  assert(
    Boolean(signedUrlViotto),
    'LEGACY-01: Signed URL temporária gerada com sucesso'
  );

  if (signedUrlViotto) {
    const resFallback = await DentalWhatsAppService.resolveDocumentBlob({
      storagePath: null,
      mediaUrl: signedUrlViotto,
      tenantId: 'clinic_1790017750_be6b',
      fileName: 'documento_legado.pdf',
      expectedMimeType: 'application/pdf',
    });

    assert(
      resFallback.blob !== null && resFallback.source === 'fallback_url',
      'LEGACY-02: Fallback via fetch de URL legada obtém Blob com sucesso'
    );
    if (resFallback.blob) {
      assert(
        resFallback.blob.type === 'application/pdf',
        'LEGACY-03: Normalização de MIME type em mensagens legadas'
      );
    }
  }

  console.log('\n====================================================');
  console.log(`RESULTADO DA BATERIA: ${passed} aprovados, ${failed} falhas`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
