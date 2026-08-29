import { Languages, Moon, Palette } from 'lucide-react';
import { useI18n, type AppLanguage, type AppTheme } from '../i18n/I18nProvider';

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  return <label className={`preference-control${compact ? ' preference-control--compact' : ''}`}>
    <span><Languages size={15} aria-hidden="true" />{t('Language')}</span>
    <select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value as AppLanguage)}>
      <option value="pt-BR">Português (Brasil)</option>
      <option value="en">English</option>
    </select>
  </label>;
}

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, t } = useI18n();
  return <label className={`preference-control${compact ? ' preference-control--compact' : ''}`}>
    <span>{theme === 'dark' ? <Moon size={15} aria-hidden="true" /> : <Palette size={15} aria-hidden="true" />}{t('Theme')}</span>
    <select aria-label={t('Theme')} value={theme} onChange={(event) => setTheme(event.target.value as AppTheme)}>
      <option value="operations">Operations</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
