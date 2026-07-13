import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import type { JsonRpcError } from './codexAppServerProtocol.js';
import type { SpawnedCodexProcess } from './codexAppServerSessionTypes.js';

const MAX_DIAGNOSTIC_TEXT_LENGTH = 2_048;

export class CodexAppServerTurnDiagnostics {
  private stderrTail = '';

  attach(child: SpawnedCodexProcess, handlers: ProcessEndHandlers) {
    child.stderr.on('data', (chunk) => {
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_TEXT_LENGTH);
    });
    child.on('error', (error) => {
      this.logProcessEnded('error', error);
      handlers.onError();
    });
    child.on('exit', (code) => {
      this.logProcessEnded('exit', { code });
      handlers.onExit(typeof code === 'number' ? code : null);
    });
  }

  logProcessEnded(kind: 'error' | 'exit', detail: unknown) {
    appendMainProcessDiagnosticLog('codex_app_server_turn_process_ended', {
      detail,
      kind,
      stderrTail: sanitizeDiagnosticText(this.stderrTail)
    });
  }

  logProtocolError(error: JsonRpcError) {
    appendMainProcessDiagnosticLog('codex_app_server_turn_protocol_error', {
      code: typeof error.code === 'number' ? error.code : null,
      message: sanitizeDiagnosticText(typeof error.message === 'string' ? error.message : '')
    });
  }
}

interface ProcessEndHandlers {
  onError: () => void;
  onExit: (code: number | null) => void;
}

export function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b(?:bearer|token|api[_ -]?key)\s*[:=]?\s*\S+/gi, '[redacted-credential]')
    .slice(-MAX_DIAGNOSTIC_TEXT_LENGTH);
}
