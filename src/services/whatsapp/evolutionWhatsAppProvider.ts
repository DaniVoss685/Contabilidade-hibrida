import {
  WhatsAppProvider,
  WhatsAppProviderConfig,
  SendMessageOptions,
  SendResult,
} from './whatsappProvider.interface';
import { normalizeBrazilianNumber } from '../../lib/phoneUtils';

export class EvolutionWhatsAppProvider implements WhatsAppProvider {
  private apiUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor(config: WhatsAppProviderConfig) {
    this.apiUrl = (config.apiUrl || '').replace(/\/$/, '');
    this.apiKey = config.apiKey || '';
    this.instanceName = config.instanceName || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  private cleanNumber(rawNumber: string): string {
    const norm = normalizeBrazilianNumber(rawNumber);
    return norm.replace(/\D/g, '');
  }

  async sendText(
    to: string,
    message: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      const url = `${this.apiUrl}/message/sendText/${encodeURIComponent(this.instanceName)}`;

      const payload: any = {
        number,
        text: message,
        options: { delay: 600, presence: 'composing' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        console.error('[EvolutionWhatsAppProvider] sendText error:', res.status, body);
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      const messageId = data?.key?.id || data?.messageId;
      return { success: true, messageId };
    } catch (err: any) {
      console.error('[EvolutionWhatsAppProvider] sendText exception:', err);
      return { success: false, error: err.message || 'Falha ao enviar mensagem de texto' };
    }
  }

  async sendImage(
    to: string,
    mediaBase64OrUrl: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      const url = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(this.instanceName)}`;

      let mediaContent = mediaBase64OrUrl;
      if (!mediaContent.startsWith('http')) {
        mediaContent = mediaContent.replace(/^data:image\/\w+;base64,/, '');
      }

      const payload: any = {
        number,
        media: mediaContent,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption || '',
        fileName: 'imagem.jpg',
        options: { delay: 800, presence: 'composing' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      return { success: true, messageId: data?.key?.id || data?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao enviar imagem' };
    }
  }

  async sendAudio(
    to: string,
    audioBase64OrUrl: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      // Evolution API dedicated endpoint for Voice Notes (PTT)
      const url = `${this.apiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(this.instanceName)}`;

      let audioContent = audioBase64OrUrl;
      if (!audioContent.startsWith('http')) {
        audioContent = audioContent.replace(/^data:audio\/\w+;base64,/, '');
      }

      const payload: any = {
        number,
        audio: audioContent,
        options: { delay: 800, presence: 'recording' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      return { success: true, messageId: data?.key?.id || data?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao enviar áudio' };
    }
  }

  async sendDocument(
    to: string,
    mediaBase64OrUrl: string,
    fileName: string,
    mimeType = 'application/pdf',
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      const url = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(this.instanceName)}`;

      let mediaContent = mediaBase64OrUrl;
      if (!mediaContent.startsWith('http')) {
        mediaContent = mediaContent.replace(/^data:[^;]+;base64,/, '');
      }

      const payload: any = {
        number,
        media: mediaContent,
        mediatype: 'document',
        mimetype: mimeType,
        fileName: fileName || 'documento.pdf',
        caption: caption || '',
        options: { delay: 800, presence: 'composing' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      return { success: true, messageId: data?.key?.id || data?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao enviar documento' };
    }
  }

  async sendVideo(
    to: string,
    videoBase64OrUrl: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      const url = `${this.apiUrl}/message/sendMedia/${encodeURIComponent(this.instanceName)}`;

      let mediaContent = videoBase64OrUrl;
      if (!mediaContent.startsWith('http')) {
        mediaContent = mediaContent.replace(/^data:video\/\w+;base64,/, '');
      }

      const payload: any = {
        number,
        media: mediaContent,
        mediatype: 'video',
        mimetype: 'video/mp4',
        caption: caption || '',
        fileName: 'video.mp4',
        options: { delay: 800, presence: 'composing' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      return { success: true, messageId: data?.key?.id || data?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao enviar vídeo' };
    }
  }

  async sendSticker(
    to: string,
    stickerBase64OrUrl: string,
    options?: SendMessageOptions
  ): Promise<SendResult> {
    try {
      const number = this.cleanNumber(to);
      const url = `${this.apiUrl}/message/sendSticker/${encodeURIComponent(this.instanceName)}`;

      let stickerContent = stickerBase64OrUrl;
      if (!stickerContent.startsWith('http')) {
        stickerContent = stickerContent.replace(/^data:image\/\w+;base64,/, '');
      }

      const payload: any = {
        number,
        sticker: stickerContent,
        options: { delay: 600, presence: 'composing' },
      };

      if (options?.quoted) {
        payload.quoted = options.quoted;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      const body = await res.text();
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${body}` };
      }

      const data = JSON.parse(body);
      return { success: true, messageId: data?.key?.id || data?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao enviar figurinha' };
    }
  }

  async validateNumber(number: string): Promise<{ exists: boolean; jid?: string }> {
    try {
      const clean = this.cleanNumber(number);
      const url = `${this.apiUrl}/chat/whatsappNumbers/${encodeURIComponent(this.instanceName)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ numbers: [clean] }),
      });

      if (!res.ok) return { exists: false };
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        return {
          exists: Boolean(item.exists),
          jid: item.jid,
        };
      }
      return { exists: false };
    } catch (err) {
      console.warn('[EvolutionWhatsAppProvider] validateNumber error:', err);
      return { exists: false };
    }
  }

  async getProfilePicture(number: string): Promise<string | null> {
    try {
      const clean = this.cleanNumber(number);
      const url = `${this.apiUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(this.instanceName)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ number: clean }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data?.profilePictureUrl || data?.url || null;
    } catch (err) {
      console.warn('[EvolutionWhatsAppProvider] getProfilePicture error:', err);
      return null;
    }
  }

  async deleteMessage(number: string, messageId: string, fromMe: boolean): Promise<boolean> {
    try {
      const clean = this.cleanNumber(number);
      const url = `${this.apiUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(this.instanceName)}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.headers,
        body: JSON.stringify({
          id: messageId,
          fromMe,
          remoteJid: `${clean}@s.whatsapp.net`,
        }),
      });

      return res.ok;
    } catch (err) {
      console.warn('[EvolutionWhatsAppProvider] deleteMessage error:', err);
      return false;
    }
  }
}
