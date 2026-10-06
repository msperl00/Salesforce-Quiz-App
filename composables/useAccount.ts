export function useAccount() {
  return useFetch('/api/auth/me', { key: 'account' })
}
