/* eslint-disable react-refresh/only-export-components */
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import enCommon from '../locales/en/common.json';
import enTickets from '../locales/en/tickets.json';
import enAssets from '../locales/en/assets.json';
import enDiagnostics from '../locales/en/diagnostics.json';
import enKnowledge from '../locales/en/knowledge.json';
import enSecurity from '../locales/en/security.json';
import enReports from '../locales/en/reports.json';
import enSettings from '../locales/en/settings.json';
import ptCommon from '../locales/pt-BR/common.json';
import ptTickets from '../locales/pt-BR/tickets.json';
import ptAssets from '../locales/pt-BR/assets.json';
import ptDiagnostics from '../locales/pt-BR/diagnostics.json';
import ptKnowledge from '../locales/pt-BR/knowledge.json';
import ptSecurity from '../locales/pt-BR/security.json';
import ptReports from '../locales/pt-BR/reports.json';
import ptSettings from '../locales/pt-BR/settings.json';

export type AppLanguage = 'pt-BR' | 'en';
export type AppTheme = 'operations' | 'dark';

const LANGUAGE_KEY = 'edy-helpdesk.language';
const THEME_KEY = 'edy-helpdesk.theme';
const namespaces = ['common', 'tickets', 'assets', 'diagnostics', 'knowledge', 'security', 'reports', 'settings'] as const;
const ptPhrases: Record<string, string> = {
  ...ptCommon,
  ...ptTickets,
  ...ptAssets,
  ...ptDiagnostics,
  ...ptKnowledge,
  ...ptSecurity,
  ...ptReports,
  ...ptSettings,
};

function storedLanguage(): AppLanguage {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === 'en' || value === 'pt-BR' ? value : 'pt-BR';
}

function storedTheme(): AppTheme {
  return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'operations';
}

const initialLanguage = storedLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, tickets: enTickets, assets: enAssets, diagnostics: enDiagnostics, knowledge: enKnowledge, security: enSecurity, reports: enReports, settings: enSettings },
    'pt-BR': { common: ptCommon, tickets: ptTickets, assets: ptAssets, diagnostics: ptDiagnostics, knowledge: ptKnowledge, security: ptSecurity, reports: ptReports, settings: ptSettings },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: [...namespaces],
  keySeparator: false,
  nsSeparator: '::',
  interpolation: { escapeValue: false },
  returnNull: false,
});

type Preferences = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function I18nThemeProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);
  const [theme, setThemeState] = useState<AppTheme>(storedTheme);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_KEY, language);
    void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const value = useMemo<Preferences>(() => ({
    language,
    setLanguage: (nextLanguage) => {
      document.documentElement.lang = nextLanguage;
      window.localStorage.setItem(LANGUAGE_KEY, nextLanguage);
      void i18n.changeLanguage(nextLanguage);
      setLanguageState(nextLanguage);
    },
    theme,
    setTheme: (nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
      window.localStorage.setItem(THEME_KEY, nextTheme);
      setThemeState(nextTheme);
    },
  }), [language, theme]);

  return <PreferencesContext.Provider value={value}><LocalizationBoundary language={language}>{children}</LocalizationBoundary></PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('I18nThemeProvider is missing.');
  return value;
}

export function useI18n() {
  const preferences = usePreferences();
  const { t } = useTranslation([...namespaces]);
  return { ...preferences, t };
}

export function translateUi(source: string, language: AppLanguage = currentLanguage()) {
  if (language === 'en') return source;
  return ptPhrases[source] ?? translatePattern(source);
}

function translatePattern(source: string) {
  const patterns: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^Account menu for (.+)$/, (name) => `Menu da conta de ${name}`],
    [/^Download (.+)$/, (name) => `Baixar ${name}`],
    [/^Edit (.+)$/, (name) => `Editar ${name}`],
    [/^Archive (.+)$/, (name) => `Arquivar ${name}`],
    [/^Search (.+)…$/, (name) => `Buscar ${translateUi(name, 'pt-BR')}…`],
    [/^Search (.+)$/, (name) => `Buscar ${translateUi(name, 'pt-BR')}`],
    [/^Page (\d+) of (\d+)$/, (page, total) => `Página ${page} de ${total}`],
    [/^(\d+) open cases$/, (count) => `${count} casos abertos`],
    [/^(\d+) high or critical$/, (count) => `${count} de severidade alta ou crítica`],
    [/^(\d+) at risk · (\d+) breached$/, (risk, breached) => `${risk} em risco · ${breached} violados`],
    [/^Resolution target (.+)$/, (date) => `Prazo de resolução ${date}`],
    [/^Status changed to (.+)\.$/, (status) => `Status alterado para ${translateUi(status, 'pt-BR')}.`],
    [/^Severity changed to (.+)\.$/, (severity) => `Severidade alterada para ${translateUi(severity, 'pt-BR')}.`],
    [/^(\d+) observations$/, (count) => `${count} observações`],
    [/^(\d+) minutes$/, (count) => `${count} minutos`],
    [/^(\d+) hours$/, (count) => `${count} horas`],
    [/^Ticket version (v\d+)$/, (version) => `Versão do chamado ${version}`],
    [/^Source ticket (HD-[\d-]+)$/, (code) => `Chamado de origem ${code}`],
    [/^Rule version (\d+)$/, (version) => `Versão da regra ${version}`],
    [/^(\d+) records retained$/, (count) => `${count} registros retidos`],
    [/^(\d+) visible$/, (count) => `${count} visíveis`],
    [/^Add (user|department|category)$/, (kind) => `Adicionar ${translateUi(kind, 'pt-BR')}`],
    [/^(Users|Departments|Categories) directory$/, (kind) => `Diretório de ${translateUi(kind, 'pt-BR').toLocaleLowerCase('pt-BR')}`],
    [/^(Update|Create) (user|department|category)$/, (action, kind) => `${action === 'Update' ? 'Atualizar' : 'Criar'} ${translateUi(kind, 'pt-BR')}`],
    [/^Archive this (user|department|category)\? Historical references will be preserved\.$/, (kind) => `Arquivar este registro de ${translateUi(kind, 'pt-BR')}? As referências históricas serão preservadas.`],
    [/^Updated (.+)$/, (value) => `Atualizado ${value}`],
  ];
  for (const [pattern, format] of patterns) {
    const match = source.match(pattern);
    if (match) return format(...match.slice(1));
  }
  return source;
}

const textSources = new WeakMap<Text, string>();
const attributeSources = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ['aria-label', 'placeholder', 'title'] as const;

function localizeTextNode(node: Text, language: AppLanguage) {
  const current = node.nodeValue ?? '';
  let source = textSources.get(node);
  const previousTranslation = source ? translateUi(source, language === 'en' ? 'pt-BR' : 'en') : undefined;
  if (!source || (current !== source && current !== translateUi(source, language) && current !== previousTranslation)) {
    source = current;
    textSources.set(node, source);
  }
  const trimmed = source.trim();
  if (!trimmed) return;
  const localized = translateUi(trimmed, language);
  const leading = source.slice(0, source.indexOf(trimmed));
  const trailing = source.slice(source.indexOf(trimmed) + trimmed.length);
  const next = `${leading}${localized}${trailing}`;
  if (current !== next) node.nodeValue = next;
}

function localizeElement(element: Element, language: AppLanguage) {
  let sources = attributeSources.get(element);
  if (!sources) { sources = new Map(); attributeSources.set(element, sources); }
  for (const attribute of translatedAttributes) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const stored = sources.get(attribute);
    if (!stored || (current !== stored && current !== translateUi(stored, language))) sources.set(attribute, current);
    const source = sources.get(attribute)!;
    const localized = translateUi(source, language);
    if (current !== localized) element.setAttribute(attribute, localized);
  }
}

function localizeTree(root: Node, language: AppLanguage) {
  if (root.nodeType === Node.TEXT_NODE) { localizeTextNode(root as Text, language); return; }
  if (!(root instanceof Element) && root !== document.body) return;
  if (root instanceof Element) localizeElement(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, language);
    else localizeElement(node as Element, language);
    node = walker.nextNode();
  }
}

function LocalizationBoundary({ children, language }: { children: ReactNode; language: AppLanguage }) {
  useEffect(() => {
    let applying = false;
    const apply = (root: Node) => {
      if (applying) return;
      applying = true;
      observer.disconnect();
      localizeTree(root, language);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...translatedAttributes] });
      applying = false;
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') mutation.addedNodes.forEach(apply);
        else apply(mutation.target);
      }
    });
    const frame = requestAnimationFrame(() => apply(document.body));
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [language]);
  return <Fragment key={language}>{children}</Fragment>;
}

export function currentLanguage(): AppLanguage {
  return i18n.language === 'en' ? 'en' : 'pt-BR';
}

export function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDate(value: string | number | Date) {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium' }).format(new Date(value));
}

export function formatTime(value: string | number | Date) {
  return new Intl.DateTimeFormat(currentLanguage(), { timeStyle: 'short' }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(currentLanguage()).format(value);
}

export function formatRelative(value: string | number | Date) {
  const delta = new Date(value).getTime() - Date.now();
  const minutes = Math.round(delta / 60_000);
  const formatter = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: 'auto' });
  if (Math.abs(minutes) < 1) return formatter.format(0, 'minute');
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

export function languageLabel(language: AppLanguage) {
  return language === 'pt-BR' ? 'Português (Brasil)' : 'English';
}
