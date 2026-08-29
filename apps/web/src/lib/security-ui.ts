import { formatDateTime, translateUi } from '../i18n/I18nProvider';

export function securityLabel(value: string) {
  return translateUi(value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase()));
}

export function securityCaseCode(value: { securityCaseCode?: string; caseNumber?: string }) {
  return value.securityCaseCode ?? value.caseNumber ?? 'Security case';
}

export function securityDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : translateUi('Not recorded');
}
