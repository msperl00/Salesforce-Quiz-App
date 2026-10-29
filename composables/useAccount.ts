import { initialCachedData } from '~/utils/async-cache.mjs'

export function useAccount() {
  return useFetch('/api/auth/me', { key: 'account', getCachedData: initialCachedData })
}
