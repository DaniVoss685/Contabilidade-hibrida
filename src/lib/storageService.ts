import { supabase } from './supabaseClient';

export const DENTAL_STORAGE_BUCKET = 'dental-private';

export interface StorageUploadResult {
  path: string | null;
  error?: string;
}

export interface StorageSignedUrlResult {
  signedUrl: string | null;
  error?: string;
}

export const StorageService = {
  /**
   * Faz upload de arquivo para o bucket dental-private em pasta isolada pelo tenant.
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
        return { path: null, error: 'Tenant ID é obrigatório para upload.' };
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
        return { path: null, error: error.message };
      }

      return { path: data?.path || storagePath };
    } catch (err: any) {
      return { path: null, error: err?.message || 'Erro ao realizar upload no storage.' };
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
