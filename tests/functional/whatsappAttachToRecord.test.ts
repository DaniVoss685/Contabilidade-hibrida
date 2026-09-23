import fs from 'fs';
import path from 'path';
import { hasPermission, ROLE_PERMISSIONS } from '../../src/lib/permissions';
import { isWhatsAppGroup } from '../../src/lib/phoneUtils';
import { mapAppClinicalAttachmentToDb, mapDbClinicalAttachmentToApp } from '../../src/lib/supabaseClient';
import { ALLOWED_CLINICAL_MIME_TYPES } from '../../src/lib/storageService';
import { CLINICAL_ATTACHMENT_TYPE_OPTIONS } from '../../src/lib/clinicalAttachmentTypes';
import { ClinicalAttachment } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: WHATSAPP -> ANEXAR AO PRONTUÁRIO');
  console.log('====================================================\n');

  // -----------------------------------------------------------------------
  // 1. Paridade de permissão 'patients:manage' com o espelho em
  //    supabase/functions/dental-whatsapp-attach-document/index.ts
  //    (ROLES_WITHOUT_PATIENT_MANAGE). Se este teste falhar após uma mudança
  //    em src/lib/permissions.ts, o Edge Function precisa ser atualizado junto.
  // -----------------------------------------------------------------------
  const ROLES_WITHOUT_PATIENT_MANAGE_MIRROR = ['FINANCE'];
  Object.keys(ROLE_PERMISSIONS).forEach((role) => {
    const expected = !ROLES_WITHOUT_PATIENT_MANAGE_MIRROR.includes(role);
    const actual = hasPermission(role, 'patients:manage');
    assert(
      actual === expected,
      `ATTACH-PERM: role ${role} -> hasPermission('patients:manage')=${actual} corresponde ao espelho do Edge Function (${expected})`
    );
  });

  // -----------------------------------------------------------------------
  // 2. Detecção de grupo do WhatsApp (nunca pode receber ação de prontuário)
  // -----------------------------------------------------------------------
  assert(isWhatsAppGroup('120363012345678901@g.us') === true, 'ATTACH-GROUP-01: jid de grupo oficial é detectado');
  assert(isWhatsAppGroup('5534991234567@s.whatsapp.net') === false, 'ATTACH-GROUP-02: contato individual não é detectado como grupo');
  assert(isWhatsAppGroup('5534991234567') === false, 'ATTACH-GROUP-03: número simples de paciente não é grupo');
  assert(isWhatsAppGroup(undefined) === false, 'ATTACH-GROUP-04: valor ausente não é grupo (fail-safe)');

  // -----------------------------------------------------------------------
  // 3. Round-trip dos campos de rastreabilidade de origem WhatsApp
  // -----------------------------------------------------------------------
  const attachment: ClinicalAttachment = {
    id: 'att_wa_1',
    tenantId: 'tenant_1',
    patientId: 'pat_1',
    storagePath: 'tenant_1/patients/pat_1/clinical-records/whatsapp/1_doc.pdf',
    originalFilename: 'CLINICA VIOTTO.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    attachmentType: 'DOCUMENT',
    createdBy: 'usr_1',
    createdAt: '2026-09-22T10:00:00Z',
    source: 'whatsapp',
    sourceMessageId: 'msg_1',
    sourceContactId: 'contact_1',
    sourceConversationId: 'conv_1',
  };

  const dbPayload = mapAppClinicalAttachmentToDb(attachment, 'tenant_1');
  assert(dbPayload.source === 'whatsapp', 'ATTACH-MAP-01: source persiste no payload de escrita');
  assert(dbPayload.source_message_id === 'msg_1', 'ATTACH-MAP-02: source_message_id persiste no payload de escrita');
  assert(dbPayload.source_contact_id === 'contact_1', 'ATTACH-MAP-03: source_contact_id persiste no payload de escrita');
  assert(dbPayload.source_conversation_id === 'conv_1', 'ATTACH-MAP-04: source_conversation_id persiste no payload de escrita');

  const reloaded = mapDbClinicalAttachmentToApp(dbPayload);
  assert(reloaded.source === 'whatsapp', 'ATTACH-MAP-05: source reconstruído após releitura');
  assert(reloaded.sourceMessageId === 'msg_1', 'ATTACH-MAP-06: sourceMessageId reconstruído após releitura (chave de idempotência)');

  // Anexo manual (upload direto, sem origem WhatsApp) não deve ganhar campos de origem
  const manualAttachment: ClinicalAttachment = { ...attachment, id: 'att_manual_1', source: undefined, sourceMessageId: undefined, sourceContactId: undefined, sourceConversationId: undefined };
  const manualPayload = mapAppClinicalAttachmentToDb(manualAttachment, 'tenant_1');
  assert(manualPayload.source === null, 'ATTACH-MAP-07: anexo manual não recebe source=whatsapp por engano');
  assert(manualPayload.source_message_id === null, 'ATTACH-MAP-08: anexo manual não recebe source_message_id por engano');

  // -----------------------------------------------------------------------
  // 4. MIME types aceitos pelo Edge Function devem ser exatamente os mesmos
  //    aceitos pelo upload manual (src/lib/storageService.ts)
  // -----------------------------------------------------------------------
  const EDGE_FUNCTION_ALLOWED_MIME_MIRROR = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
  assert(
    JSON.stringify([...ALLOWED_CLINICAL_MIME_TYPES].sort()) === JSON.stringify([...EDGE_FUNCTION_ALLOWED_MIME_MIRROR].sort()),
    'ATTACH-MIME-01: lista de MIME types do Edge Function está em sincronia com storageService.ts'
  );

  // -----------------------------------------------------------------------
  // 5. As categorias oferecidas no modal de anexar vêm da fonte canônica única
  //    (não foram reinventadas) e todas são aceitas pelo Edge Function
  // -----------------------------------------------------------------------
  const EDGE_FUNCTION_ALLOWED_TYPES_MIRROR = [
    'PHOTO_BEFORE', 'PHOTO_AFTER', 'RADIOGRAPHY', 'EXAM', 'DOCUMENT', 'CONSENT_FORM', 'REPORT', 'OTHER',
  ];
  CLINICAL_ATTACHMENT_TYPE_OPTIONS.forEach((opt) => {
    assert(
      EDGE_FUNCTION_ALLOWED_TYPES_MIRROR.includes(opt.value),
      `ATTACH-TYPE-01: categoria "${opt.value}" do modal é aceita pelo Edge Function`
    );
  });

  // -----------------------------------------------------------------------
  // 6. Regressão: AttachToRecordModal está empilhado sobre o MediaViewerModal,
  //    cujo backdrop fecha incondicionalmente em qualquer clique (onClick={handleClose},
  //    sem checagem de target). Sem interromper a propagação no próprio backdrop do
  //    AttachToRecordModal, qualquer clique interno (DatePicker, CustomSelect, o botão
  //    de submit) "escapa" e fecha o MediaViewerModal inteiro antes do <form> conseguir
  //    disparar o evento nativo "submit" — foi a causa raiz real de dois bugs reportados
  //    manualmente: o calendário fechando o modal inteiro, e "Anexar documento" não
  //    salvando nada perceptível (o form era desmontado antes do submit disparar).
  //    Este teste não renderiza DOM (sem jsdom/testing-library no projeto) — audita a
  //    presença estrutural do guard no código-fonte para não deixar a correção regredir
  //    silenciosamente numa futura edição.
  // -----------------------------------------------------------------------
  const attachModalSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/WhatsApp/AttachToRecordModal.tsx'),
    'utf-8'
  );
  const backdropOnClickMatch = attachModalSource.match(/z-\[60\][\s\S]{0,400}onClick=\{([\s\S]*?)\}\s*\n\s*>/);
  assert(
    Boolean(backdropOnClickMatch),
    'ATTACH-MODAL-STACK-01: backdrop do AttachToRecordModal (z-[60]) possui handler onClick localizável'
  );
  const backdropOnClickBody = backdropOnClickMatch ? backdropOnClickMatch[1] : '';
  assert(
    /e\.stopPropagation\(\)/.test(backdropOnClickBody),
    'ATTACH-MODAL-STACK-02: backdrop do AttachToRecordModal interrompe propagação (evita fechar o MediaViewerModal pai em qualquer clique interno)'
  );
  assert(
    /e\.target\s*===\s*e\.currentTarget/.test(backdropOnClickBody) && /onClose\(\)/.test(backdropOnClickBody),
    'ATTACH-MODAL-STACK-03: backdrop do AttachToRecordModal ainda fecha (onClose) quando o clique é realmente no próprio backdrop'
  );

  console.log('\n🎉 TODOS OS TESTES DE WHATSAPP -> PRONTUÁRIO PASSARAM!');
}

runTests();
