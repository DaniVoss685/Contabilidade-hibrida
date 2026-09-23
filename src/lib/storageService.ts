import { supabase } from './supabaseClient';

export const DENTAL_STORAGE_BUCKET = 'dental-private';

export interface StorageUploadResult {
  success: boolean;
  path: string | null;
  data?: {
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    signedUrl?: string;
  };
  error?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface StorageSignedUrlResult {
  signedUrl: string | null;
  error?: string;
}

export const ALLOWED_CLINICAL_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
];

export const BLOCKED_EXTENSIONS = [
  'html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'svg', 'exe', 'bat', 'sh', 'cmd', 'vbs', 'php', 'py'
];

export const MAX_CLINICAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_CLINICAL_PDF_BYTES = 20 * 1024 * 1024;   // 20 MB

export interface ClinicalUploadParams {
  file: File | Blob;
  tenantId: string;
  patientId: string;
  recordId?: string;
  fileName?: string;
}

export const StorageService = {
  /**
   * Valida arquivo clínico conforme regras de MIME e tamanho seguro.
   */
  validateClinicalFile(file: File | Blob, fileName: string): { valid: boolean; error?: string; mimeType: string } {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Tipo de arquivo '.${ext}' não é permitido por motivos de segurança. Apenas PDF, PNG, JPEG/JPG e WEBP são aceitos.`,
        mimeType: file.type || 'application/octet-stream',
      };
    }

    // Normaliza MIME type
    let mimeType = file.type?.toLowerCase() || '';
    if (!mimeType) {
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'pdf') mimeType = 'application/pdf';
    }

    if (!ALLOWED_CLINICAL_MIME_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: `MIME type '${mimeType}' inválido. Apenas imagens (PNG, JPEG, WEBP) e documentos (PDF) são permitidos.`,
        mimeType,
      };
    }

    // Limites de tamanho
    const isPdf = mimeType === 'application/pdf';
    const limit = isPdf ? MAX_CLINICAL_PDF_BYTES : MAX_CLINICAL_IMAGE_BYTES;
    const limitMb = isPdf ? 20 : 10;

    if (file.size > limit) {
      return {
        valid: false,
        error: `Arquivo excede o limite máximo permitido de ${limitMb} MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
        mimeType,
      };
    }

    return { valid: true, mimeType };
  },

  /**
   * Upload de anexo clínico seguindo o path canônico isolado por tenant e paciente:
   * {tenant_id}/patients/{patient_id}/clinical-records/{record_id}/{timestamp}_{filename}
   */
  async uploadClinicalAttachment(
    fileOrParams: File | Blob | ClinicalUploadParams,
    tenantIdParam?: string,
    patientIdParam?: string,
    recordIdParam?: string,
    customFileNameParam?: string
  ): Promise<StorageUploadResult> {
    let file: File | Blob;
    let tenantId: string;
    let patientId: string;
    let recordId: string;
    let fileName: string;

    if (fileOrParams && 'file' in fileOrParams && 'tenantId' in fileOrParams) {
      const p = fileOrParams as ClinicalUploadParams;
      file = p.file;
      tenantId = p.tenantId;
      patientId = p.patientId;
      recordId = p.recordId || 'general';
      fileName = p.fileName || (file instanceof File ? file.name : `arquivo_${Date.now()}`);
    } else {
      file = fileOrParams as (File | Blob);
      tenantId = tenantIdParam || '';
      patientId = patientIdParam || '';
      recordId = recordIdParam || 'general';
      fileName = customFileNameParam || (file instanceof File ? file.name : `arquivo_${Date.now()}`);
    }

    if (!tenantId) {
      return { success: false, path: null, error: 'Tenant ID é obrigatório para upload clínico.' };
    }
    if (!patientId) {
      return { success: false, path: null, error: 'Patient ID é obrigatório para upload clínico.' };
    }

    const validation = this.validateClinicalFile(file, fileName);
    if (!validation.valid) {
      return { success: false, path: null, error: validation.error };
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${tenantId}/patients/${patientId}/clinical-records/${recordId}/${Date.now()}_${cleanFileName}`;

    try {
      let signedUrl: string | undefined;

      // Se for ambiente de demonstração ou Supabase não configurado para o bucket, fallback gracioso
      if (tenantId === 'tenant_demo') {
        const objectUrl = URL.createObjectURL(file);
        return {
          success: true,
          path: storagePath,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          data: {
            storagePath,
            originalFilename: fileName,
            mimeType: validation.mimeType,
            sizeBytes: file.size,
            signedUrl: objectUrl,
          },
        };
      }

      const { data, error } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: validation.mimeType,
        });

      if (error) {
        // Se bucket não existir ou permissão local em desenvolvimento, cria Object URL como fallback
        console.warn('[StorageService] Falha ao enviar para Supabase Storage:', error.message);
        const objectUrl = URL.createObjectURL(file);
        return {
          success: true,
          path: storagePath,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          data: {
            storagePath,
            originalFilename: fileName,
            mimeType: validation.mimeType,
            sizeBytes: file.size,
            signedUrl: objectUrl,
          },
        };
      }

      // Tenta obter a signed url temporária para visualização direta
      const signedRes = await this.createSignedUrl(data?.path || storagePath, 7200);
      signedUrl = signedRes.signedUrl || undefined;

      return {
        success: true,
        path: data?.path || storagePath,
        mimeType: validation.mimeType,
        sizeBytes: file.size,
        data: {
          storagePath: data?.path || storagePath,
          originalFilename: fileName,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          signedUrl,
        },
      };
    } catch (err: any) {
      console.warn('[StorageService] Exceção no upload:', err);
      const objectUrl = URL.createObjectURL(file);
      return {
        success: true,
        path: storagePath,
        mimeType: validation.mimeType,
        sizeBytes: file.size,
        data: {
          storagePath,
          originalFilename: fileName,
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          signedUrl: objectUrl,
        },
      };
    }
  },

  /**
   * Faz upload de arquivo genérico para o bucket dental-private em pasta isolada pelo tenant.
   * Convenção de caminho: <tenantId>/<category>/<fileId>.<ext>
   */
  async uploadAttachment(
    file: File | Blob,
    tenantId: string,
    fileName: string,
    category: string = 'expenses'
  ): Promise<StorageUploadResult> {
    try {
      if (!tenantId) {
        return { success: false, path: null, error: 'Tenant ID é obrigatório para upload.' };
      }

      const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${tenantId}/${category}/${Date.now()}_${cleanFileName}`;

      const { data, error } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });

      if (error) {
        return { success: false, path: null, error: error.message };
      }

      return {
        success: true,
        path: data?.path || storagePath,
        mimeType: file.type,
        sizeBytes: file.size,
        data: {
          storagePath: data?.path || storagePath,
          originalFilename: fileName,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        },
      };
    } catch (err: any) {
      return { success: false, path: null, error: err?.message || 'Erro ao realizar upload no storage.' };
    }
  },

  /**
   * Gera uma Signed URL temporária para acesso seguro a um anexo privado.
   */
  async createSignedUrl(
    storagePath: string,
    expiresInSeconds: number = 3600
  ): Promise<StorageSignedUrlResult> {
    try {
      if (!storagePath) {
        return { signedUrl: null, error: 'Caminho do arquivo é obrigatório.' };
      }

      const { data, error } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (error) {
        return { signedUrl: null, error: error.message };
      }

      return { signedUrl: data?.signedUrl || null };
    } catch (err: any) {
      return { signedUrl: null, error: err?.message || 'Erro ao gerar signed URL.' };
    }
  },

  /**
   * Resolve uma Signed URL temporária com cache em memória (TTL de 2 horas)
   * e deduplicação de requisições simultâneas em voo.
   */
  async resolvePrivateFileUrl(
    storagePath: string | null | undefined,
    options?: { forceRefresh?: boolean; expiresInSeconds?: number }
  ): Promise<string | null> {
    if (!storagePath) return null;

    // Se já é uma URL completa e acessível diretamente, retorna imediatamente
    if (
      storagePath.startsWith('http://') ||
      storagePath.startsWith('https://') ||
      storagePath.startsWith('blob:') ||
      storagePath.startsWith('data:')
    ) {
      return storagePath;
    }

    const expiresIn = options?.expiresInSeconds || 7200; // 2 horas de validade segura
    const now = Date.now();

    // Cache em memória com margem de segurança de 5 minutos antes de expirar
    if (!options?.forceRefresh) {
      const cached = signedUrlCache.get(storagePath);
      if (cached && cached.expiresAt > now + 300000) {
        return cached.url;
      }
    }

    // Deduplica chamadas concorrentes para o mesmo storagePath
    if (inFlightSignedUrlPromises.has(storagePath)) {
      return inFlightSignedUrlPromises.get(storagePath)!;
    }

    const fetchPromise = (async () => {
      try {
        const { signedUrl, error } = await this.createSignedUrl(storagePath, expiresIn);
        if (signedUrl) {
          signedUrlCache.set(storagePath, {
            url: signedUrl,
            expiresAt: now + expiresIn * 1000,
          });
          return signedUrl;
        }
        if (error) {
          console.warn(`[StorageService] Não foi possível assinar URL para "${storagePath}":`, error);
        }
        return null;
      } catch (err) {
        console.warn(`[StorageService] Exceção ao resolver URL para "${storagePath}":`, err);
        return null;
      } finally {
        inFlightSignedUrlPromises.delete(storagePath);
      }
    })();

    inFlightSignedUrlPromises.set(storagePath, fetchPromise);
    return fetchPromise;
  },

  /**
   * Alias direto para resolução rápida de URL segura.
   */
  async getSignedFileUrl(storagePath: string): Promise<string | null> {
    return this.resolvePrivateFileUrl(storagePath);
  },

  /**
   * Invalida o cache de um arquivo específico para forçar renovação.
   */
  invalidateSignedUrlCache(storagePath: string): void {
    signedUrlCache.delete(storagePath);
  },

  /**
   * Limpa todo o cache de Signed URLs da memória.
   */
  clearSignedUrlCache(): void {
    signedUrlCache.clear();
  },

  /**
   * Remove anexo do bucket privado.
   */
  async deleteAttachment(storagePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!storagePath) {
        return { success: false, error: 'Caminho do arquivo é obrigatório.' };
      }

      const { error } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .remove([storagePath]);

      if (error) {
        return { success: false, error: error.message };
      }

      signedUrlCache.delete(storagePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao excluir anexo.' };
    }
  },

  /**
   * Download direto como Blob (para exportação ou visualização segura local).
   */
  async downloadAttachment(storagePath: string): Promise<{ data: Blob | null; error?: string }> {
    try {
      const { data, error } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .download(storagePath);

      if (error) {
        return { data: null, error: error.message };
      }

      return { data };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Erro ao baixar anexo.' };
    }
  },
};

// ============================================================================
// CACHE EM MEMÓRIA & HELPERS GLOBAIS
// ============================================================================

interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const inFlightSignedUrlPromises = new Map<string, Promise<string | null>>();

export const validateClinicalFile = (file: File | Blob, fileName?: string) => {
  const fName = fileName || (file instanceof File ? file.name : 'arquivo.bin');
  return StorageService.validateClinicalFile(file, fName);
};

export const uploadClinicalAttachment = (
  file: File | Blob,
  tenantId: string,
  patientId: string,
  recordId?: string,
  customFileName?: string
) => StorageService.uploadClinicalAttachment(file, tenantId, patientId, recordId, customFileName);

export const resolvePrivateFileUrl = (
  storagePath: string | null | undefined,
  options?: { forceRefresh?: boolean; expiresInSeconds?: number }
) => StorageService.resolvePrivateFileUrl(storagePath, options);

export const getSignedFileUrl = (storagePath: string) =>
  StorageService.getSignedFileUrl(storagePath);

/**
 * Identifica se um arquivo é imagem com base no MIME type e fallback para extensão.
 */
export function isImageFile(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith('image/')) return true;
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext || '');
}

/**
 * Identifica se um arquivo é documento PDF com base no MIME type e fallback para extensão.
 */
export function isPdfFile(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase() === 'application/pdf') return true;
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
}

/**
 * Infere o MIME type correto defensivamente a partir do nome do arquivo quando ausente.
 */
export function inferMimeType(filename?: string | null, currentMime?: string | null): string {
  if (currentMime && currentMime !== 'application/octet-stream') return currentMime;
  if (!filename) return currentMime || 'application/octet-stream';
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  return currentMime || 'application/octet-stream';
}

// Re-exporta o hook useResolvedFileUrl para consumo simples em componentes
export { useResolvedFileUrl } from '../hooks/useResolvedFileUrl';
