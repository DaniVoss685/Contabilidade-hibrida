import {
  isImageFile,
  isPdfFile,
  inferMimeType,
  StorageService,
  ALLOWED_CLINICAL_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  DENTAL_STORAGE_BUCKET,
} from '../lib/storageService';

console.log('====================================================');
console.log('  TESTE DE HOMOLOGAÇÃO: RESOLUÇÃO DE ARQUIVOS CLÍNICOS');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Testes de Detecção de Imagem
console.log('[1] Testes de Detecção de Imagens (isImageFile)');
assert(isImageFile('image/png', 'foto.png'), 'Detecta image/png com nome foto.png');
assert(isImageFile('image/jpeg', 'foto.jpg'), 'Detecta image/jpeg com nome foto.jpg');
assert(isImageFile(null, 'raiox.PNG'), 'Detecta extensão maiúscula .PNG sem MIME');
assert(isImageFile(null, 'sorriso.webp'), 'Detecta extensão .webp sem MIME');
assert(isImageFile('application/octet-stream', 'antes.JPG'), 'Detecta extensão .JPG mesmo quando octet-stream');
assert(!isImageFile('application/pdf', 'laudo.pdf'), 'Rejeita PDF como imagem');
assert(!isImageFile(null, 'documento.docx'), 'Rejeita DOCX');

// 2. Testes de Detecção de PDF
console.log('\n[2] Testes de Detecção de Documentos PDF (isPdfFile)');
assert(isPdfFile('application/pdf', 'prontuario.pdf'), 'Detecta application/pdf com nome prontuario.pdf');
assert(isPdfFile(null, 'EXAME.PDF'), 'Detecta extensão maiúscula .PDF sem MIME');
assert(!isPdfFile('image/png', 'foto.png'), 'Rejeita PNG como PDF');
assert(!isPdfFile(null, 'anotacao.txt'), 'Rejeita TXT como PDF');

// 3. Testes de Inferência de MIME type defensivo
console.log('\n[3] Testes de Inferência de MIME type (inferMimeType)');
assert(inferMimeType('foto.png', null) === 'image/png', 'Infere image/png de foto.png');
assert(inferMimeType('exame.JPG', null) === 'image/jpeg', 'Infere image/jpeg de exame.JPG');
assert(inferMimeType('scan.webp', null) === 'image/webp', 'Infere image/webp de scan.webp');
assert(inferMimeType('laudo.pdf', 'application/octet-stream') === 'application/pdf', 'Substitui octet-stream por application/pdf quando extensão é .pdf');
assert(inferMimeType('desconhecido.xyz', null) === 'application/octet-stream', 'Fallback para application/octet-stream em desconhecido');

// 4. Testes de Validação e Segurança
console.log('\n[4] Testes de Validação de Arquivos Clínicos');
const dummyBlob = new Blob(['teste'], { type: 'image/png' });
const validResult = StorageService.validateClinicalFile(dummyBlob, 'foto.png');
assert(validResult.valid === true, 'Arquivo PNG de teste é aceito');

const maliciousBlob = new Blob(['malicioso'], { type: 'text/html' });
const invalidHtml = StorageService.validateClinicalFile(maliciousBlob, 'payload.html');
assert(invalidHtml.valid === false, 'Arquivo HTML é bloqueado por segurança');

const exeBlob = new Blob(['exe'], { type: 'application/octet-stream' });
const invalidExe = StorageService.validateClinicalFile(exeBlob, 'malware.exe');
assert(invalidExe.valid === false, 'Arquivo EXE é bloqueado por segurança');

// 5. Testes de Resolução e Cache
console.log('\n[5] Testes de Resolução e Mecanismos de Cache');
const directBlobUrl = 'blob:http://localhost:3000/1234-uuid';
const directHttpUrl = 'https://supabase.co/storage/v1/object/sign/dental-private/test.png?token=xyz';

StorageService.resolvePrivateFileUrl(directBlobUrl).then((res) => {
  assert(res === directBlobUrl, 'resolvePrivateFileUrl retorna blob URL diretamente sem requisição');
});

StorageService.resolvePrivateFileUrl(directHttpUrl).then((res) => {
  assert(res === directHttpUrl, 'resolvePrivateFileUrl retorna URL http(s) existente diretamente');
});

StorageService.resolvePrivateFileUrl(null).then((res) => {
  assert(res === null, 'resolvePrivateFileUrl retorna null para path nulo');
});

// Cache control
StorageService.invalidateSignedUrlCache('tenant/patient/record/test.png');
StorageService.clearSignedUrlCache();
assert(true, 'Funções de invalidação e limpeza de cache executam sem lançar exceção');

setTimeout(() => {
  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} testes aprovados.`);
  if (passedTests === totalTests) {
    console.log('STATUS: HOMOLOGAÇÃO DE RESOLUÇÃO E ARMAZENAMENTO CONCLUÍDA COM SUCESSO');
  } else {
    console.error('STATUS: FALHA NA HOMOLOGAÇÃO');
    process.exit(1);
  }
  console.log('====================================================\n');
}, 500);
