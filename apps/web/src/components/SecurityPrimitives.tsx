import { ShieldCheck } from 'lucide-react';
import type { SecurityCaseStatus, SecuritySeverity } from '../lib/api';
import { securityLabel } from '../lib/security-ui';
import { translateUi } from '../i18n/I18nProvider';

export function SecurityCaseCode({ value }: { value: string }) {
  return <span className="security-code"><ShieldCheck size={13} aria-hidden="true" />{value}</span>;
}

export function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return <span className={`security-badge security-badge--${severity.toLowerCase()}`}><span aria-hidden="true" />{translateUi(severity)}</span>;
}

export function SecurityStatusBadge({ status }: { status: SecurityCaseStatus }) {
  return <span className={`security-status security-status--${status.toLowerCase()}`}>{securityLabel(status)}</span>;
}
