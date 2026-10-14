import { normalizeLanguage, translateUI } from '~/utils/localization.mjs'

export function useLanguage() {
  const cookie = useCookie<string>('quiz-language', {
    default: () => 'es', path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
    encode: value => normalizeLanguage(value), decode: value => normalizeLanguage(value)
  })
  const language = useState<string>('quiz-interface-language', () => normalizeLanguage(cookie.value))

  function setLanguage(value: string) {
    const next = normalizeLanguage(value)
    language.value = next
    cookie.value = next
  }

  function t(source: string, values: Record<string, string | number> = {}) {
    return translateUI(language.value, source, values)
  }

  return { language, setLanguage, t }
}
