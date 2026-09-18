// ==============================================================================
// INTERFACE DE PROVEDOR WHATSAPP
// ==============================================================================

export interface SendMessageOptions {
  quoted?: {
    key: { id: string; fromMe: boolean; remoteJid?: string };
    message?: any;
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppProviderConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface WhatsAppProvider {
  sendText(to: string, message: string, options?: SendMessageOptions): Promise<SendResult>;
  sendImage(
    to: string,
    mediaBase64OrUrl: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult>;
  sendAudio(
    to: string,
    audioBase64OrUrl: string,
    options?: SendMessageOptions
  ): Promise<SendResult>;
  sendDocument(
    to: string,
    mediaBase64OrUrl: string,
    fileName: string,
    mimeType?: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult>;
  sendVideo(
    to: string,
    videoBase64OrUrl: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<SendResult>;
  sendSticker(
    to: string,
    stickerBase64OrUrl: string,
    options?: SendMessageOptions
  ): Promise<SendResult>;
  validateNumber(number: string): Promise<{ exists: boolean; jid?: string }>;
  getProfilePicture(number: string): Promise<string | null>;
  deleteMessage(number: string, messageId: string, fromMe: boolean): Promise<boolean>;
}
