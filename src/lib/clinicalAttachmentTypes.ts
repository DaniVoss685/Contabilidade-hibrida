import { ClinicalAttachmentType } from '../types';
import { SelectOption } from '../components/UI/CustomSelect';

/**
 * Fonte canônica única das categorias de anexo clínico usadas em toda a aplicação
 * (upload manual em Documentos do Prontuário e anexo vindo do WhatsApp).
 * Não duplicar esta lista em outros componentes — sempre importar daqui.
 */
export const CLINICAL_ATTACHMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'RADIOGRAPHY', label: 'Radiografia (Panorâmica, Periapical, Interproximal)' },
  { value: 'PHOTO_BEFORE', label: 'Foto de Antes' },
  { value: 'PHOTO_AFTER', label: 'Foto de Depois' },
  { value: 'EXAM', label: 'Exame Laboratorial / Tomografia' },
  { value: 'CONSENT_FORM', label: 'Termo de Consentimento Livre e Esclarecido' },
  { value: 'DOCUMENT', label: 'Documento Clínico / Laudo' },
  { value: 'OTHER', label: 'Outro Anexo' },
];

export function getClinicalAttachmentTypeLabel(type: ClinicalAttachmentType): string {
  switch (type) {
    case 'PHOTO_BEFORE':
      return 'Foto de Antes';
    case 'PHOTO_AFTER':
      return 'Foto de Depois';
    case 'RADIOGRAPHY':
      return 'Radiografia';
    case 'EXAM':
      return 'Exame / Tomografia';
    case 'CONSENT_FORM':
      return 'Termo de Consentimento';
    case 'DOCUMENT':
      return 'Documento / Laudo';
    case 'REPORT':
      return 'Laudo';
    default:
      return 'Outro Anexo';
  }
}
