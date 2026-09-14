import React from 'react';
import {
  AppointmentDetailsModal,
  AppointmentDetailsModalProps,
} from './AppointmentDetailsModal';

export type AppointmentDetailsDrawerProps = AppointmentDetailsModalProps;

/**
 * Backward-compatible wrapper that renders the centered floating AppointmentDetailsModal.
 */
export const AppointmentDetailsDrawer: React.FC<AppointmentDetailsDrawerProps> = (props) => {
  return <AppointmentDetailsModal {...props} />;
};

export { AppointmentDetailsModal };
