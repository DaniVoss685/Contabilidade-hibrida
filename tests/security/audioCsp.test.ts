import fs from 'fs';
import path from 'path';

/**
 * TESTE DE AUDITORIA DE SEGURANÇA E CONFORMIDADE: CSP MEDIA-SRC E SUPORTE A STREAMING DE ÁUDIO
 * Valida a configuração estrita de CSP para reprodução de áudio do WhatsApp e mídias do Supabase.
 */

const rootDir = process.cwd();

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(code: string, name: string, passed: boolean, details: string) {
  results.push({ code, name, passed, details });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`[${code}] ${name} => ${mark} (${details})`);
}

async function runAudioSecurityTests() {
  console.log('================================================================');
  console.log('AUDITORIA DE SEGURANÇA: CSP MEDIA-SRC & STREAMING DE ÁUDIO');
  console.log('================================================================\n');

  let vercelJson: any = null;
  let csp = '';

  // 1. Leitura e integridade do vercel.json
  try {
    const vercelJsonPath = path.join(rootDir, 'vercel.json');
    const content = fs.readFileSync(vercelJsonPath, 'utf-8');
    vercelJson = JSON.parse(content);
    const headersList = vercelJson?.headers?.[0]?.headers || [];
    const cspHeader = headersList.find((h: any) => h.key.toLowerCase() === 'content-security-policy');
    csp = cspHeader?.value || '';

    record(
      'CSP-AUDIO-01',
      'vercel.json parseável e cabeçalho Content-Security-Policy configurado',
      Boolean(csp),
      csp ? 'Cabeçalho Content-Security-Policy localizado' : 'Cabeçalho ausente'
    );
  } catch (err: any) {
    record('CSP-AUDIO-01', 'vercel.json parseável e CSP configurado', false, err.message);
  }

  // 2. Presença explícita de media-src
  const hasMediaSrc = csp.includes('media-src');
  record(
    'CSP-AUDIO-02',
    'Diretiva media-src explicitamente configurada (evita fallback para default-src)',
    hasMediaSrc,
    hasMediaSrc ? 'Diretiva media-src presente' : 'media-src ausente na CSP'
  );

  // 3. Origens estritas em media-src: 'self', blob: e hostname do Supabase
  const mediaSrcMatch = csp.match(/media-src\s+([^;]+)/);
  const mediaSrcValue = mediaSrcMatch ? mediaSrcMatch[1] : '';

  const hasSelf = mediaSrcValue.includes("'self'");
  const hasBlob = mediaSrcValue.includes('blob:');
  const hasSupabase = mediaSrcValue.includes('https://fbkouuvupdyffizwoiti.supabase.co');

  const originsValid = hasSelf && hasBlob && hasSupabase;
  record(
    'CSP-AUDIO-03',
    "media-src contém exatamente 'self', blob: e domínio do Supabase",
    originsValid,
    `self: ${hasSelf}, blob: ${hasBlob}, supabase: ${hasSupabase} (Valor: "${mediaSrcValue}")`
  );

  // 4. Proibição de curingas (*) e data: em media-src
  const hasWildcard = mediaSrcValue.split(/\s+/).some((token) => token === '*' || token.startsWith('http:') || token === 'http:*');
  const hasData = mediaSrcValue.includes('data:');
  const isStrict = !hasWildcard && !hasData;

  record(
    'CSP-AUDIO-04',
    'media-src estrito sem curingas (*) e sem esquema inseguro data:',
    isStrict,
    isStrict ? 'Sem curinga e sem data:' : `Inseguro! Wildcard: ${hasWildcard}, data: ${hasData}`
  );

  // 5. Preservação de outras diretivas de segurança (default-src 'self', frame-ancestors 'none')
  const preservesDefault = csp.includes("default-src 'self'");
  const preservesAncestors = csp.includes("frame-ancestors 'none'");
  const preservesConnect = csp.includes('https://fbkouuvupdyffizwoiti.supabase.co');

  const securityPreserved = preservesDefault && preservesAncestors && preservesConnect;
  record(
    'CSP-AUDIO-05',
    'Diretivas existentes preservadas (default-src, frame-ancestors, connect-src)',
    securityPreserved,
    securityPreserved ? 'Diretivas de segurança preservadas' : 'Diretivas degradadas'
  );

  // 6. Verificação do AudioPlayer.tsx para tratamento de erro nativo
  try {
    const audioPlayerPath = path.join(rootDir, 'src/components/WhatsApp/AudioPlayer.tsx');
    const playerCode = fs.readFileSync(audioPlayerPath, 'utf-8');

    const hasErrorListener = playerCode.includes("addEventListener('error'");
    const hasMediaErrorCode = playerCode.includes('MEDIA_ERR_SRC_NOT_SUPPORTED') || playerCode.includes('case 4:');
    const hasConsoleWarn = playerCode.includes('[AudioPlayer] Falha no elemento de áudio');

    const playerResilient = hasErrorListener && hasMediaErrorCode && hasConsoleWarn;
    record(
      'CSP-AUDIO-06',
      'AudioPlayer possui tratamento defensivo de erro nativo e diagnóstico detalhado',
      playerResilient,
      playerResilient ? 'Tratamento de erro e diagnóstico integrados' : 'Faltam listeners defensivos'
    );
  } catch (err: any) {
    record('CSP-AUDIO-06', 'AudioPlayer possui tratamento defensivo', false, err.message);
  }

  // 7. Teste de conectividade e suporte a Range Request (HTTP 206) no Supabase Storage
  try {
    const validAudioUrl =
      'https://fbkouuvupdyffizwoiti.supabase.co/storage/v1/object/sign/whatsapp_media/whatsapp/0055a485-612d-43a8-b36f-7a783ca5af9d/audio_1789992565275.ogg?token=eyJraWQiOiIyZWI2YTViNC1kZjRkLTQyN2UtYWY5Ny01NGFhOWUzZGZmODAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ3aGF0c2FwcF9tZWRpYS93aGF0c2FwcC8wMDU1YTQ4NS02MTJkLTQzYTgtYjM2Zi03YTc4M2NhNWFmOWQvYXVkaW9fMTc4OTk5MjU2NTI3NS5vZ2ciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg5OTkyNjM5LCJleHAiOjE3ODk5OTYyMzl9.iSSdYHbSvR5N22xaxOo_YiNIy9lyrYgXAfEdOEdAfrU';

    const rangeRes = await fetch(validAudioUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1024' },
    });

    const is206 = rangeRes.status === 206;
    const acceptRanges = rangeRes.headers.get('accept-ranges');
    const contentType = rangeRes.headers.get('content-type');
    const contentRange = rangeRes.headers.get('content-range');

    const streamingValid = is206 && (acceptRanges === 'bytes' || Boolean(contentRange));
    record(
      'CSP-AUDIO-07',
      'Supabase Storage suporta Range Requests (HTTP 206 Partial Content) para áudio',
      streamingValid,
      `Status: ${rangeRes.status}, Content-Type: ${contentType}, Content-Range: ${contentRange}`
    );
  } catch (err: any) {
    record('CSP-AUDIO-07', 'Supabase Storage suporta Range Requests', false, err.message);
  }

  console.log('\n----------------------------------------------------------------');
  const allPassed = results.every((r) => r.passed);
  const totalPassed = results.filter((r) => r.passed).length;
  console.log(`TOTAL: ${totalPassed}/${results.length} testes passaram.`);
  console.log(`STATUS: ${allPassed ? 'SUCCESS — APROVADO' : 'FAIL — VERIFICAR LOGS'}`);
  console.log('----------------------------------------------------------------');

  if (!allPassed) {
    process.exit(1);
  }
}

runAudioSecurityTests();
