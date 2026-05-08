import { screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

export function expectAndroidDiagnosticRows() {
  expect(screen.getByText('Android')).toBeInTheDocument();
  expect(screen.getAllByText('Object types')).toHaveLength(2);
  expect(screen.getAllByText('node_review')).toHaveLength(4);
  expect(screen.getByText('1 ready to send · 1 confirming · 1 not sent')).toBeInTheDocument();
  expect(screen.getByText('Device changes waiting')).toBeInTheDocument();
  expect(screen.getByText('Device changes not sent')).toBeInTheDocument();
  expect(screen.getAllByText('Body bytes to download').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Attachment bytes to download').length).toBeGreaterThan(0);
  expect(screen.getByText('Failed body downloads')).toBeInTheDocument();
  expect(screen.getByText('Failed attachment downloads')).toBeInTheDocument();
  expect(screen.getByText('Review queue bodies')).toBeInTheDocument();
  expect(screen.getByText('Current topic body')).toBeInTheDocument();
  expect(screen.getByText('Top-level topic bodies')).toBeInTheDocument();
  expect(screen.getByText('Nested topic bodies')).toBeInTheDocument();
  expect(screen.getByText('Review queue attachments')).toBeInTheDocument();
  expect(screen.getByText('Current topic attachments')).toBeInTheDocument();
  expect(screen.getByText('Image attachments')).toBeInTheDocument();
  expect(screen.getByText('PDF attachments')).toBeInTheDocument();
  expect(screen.getByText('Other attachments')).toBeInTheDocument();
}

export function expectDiagnosticTables() {
  expect(screen.getAllByText('5.0 MB').length).toBeGreaterThan(0);
  expect(screen.getAllByText('3.0 MB').length).toBeGreaterThan(0);
  expect(screen.getByText('Desktop confirmations waiting')).toBeInTheDocument();
  expect(screen.getByText('Device changes not sent')).toBeInTheDocument();
  expect(screen.getByText('accepted')).toBeInTheDocument();
  expect(screen.getByText('conflict')).toBeInTheDocument();
  expect(screen.getByText('seq 7')).toBeInTheDocument();
  expect(screen.getByText('seq -')).toBeInTheDocument();
  expect(screen.getAllByText('node-1').length).toBeGreaterThan(0);
  expect(screen.getByText('seq 4')).toBeInTheDocument();
  expect(screen.getByText('Desktop')).toBeInTheDocument();
}

export function expectCheckpointDetails() {
  expect(screen.getByText('Current topic')).toBeInTheDocument();
  expect(screen.getByText('Downloading: Current topic')).toBeInTheDocument();
  expect(screen.getByText('Earlier sync check finished')).toBeInTheDocument();
  expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  expect(screen.getByText('3 changes')).toBeInTheDocument();
  expect(screen.queryByText('Lagging object types')).not.toBeInTheDocument();
  expect(screen.getByText('2 on device / 2 on desktop')).toBeInTheDocument();
  expect(screen.queryByText('failed: Failed to apply companion desktop sync pack.')).not.toBeInTheDocument();
  expect(screen.queryByText('A finished sync check exists, but the Android cursor is still behind desktop.')).not.toBeInTheDocument();
}
