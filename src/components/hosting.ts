/**
 * Whether the app runs on a shared `*.github.io` origin (#177). Every GitHub
 * Pages project site of an account shares that origin, and with it this
 * browser storage: another page published there could read what the app keeps
 * (the GitHub token, the sync folder). The dialogs say so on such a host.
 */
export function sharedOrigin(hostname: string = globalThis.location?.hostname ?? ''): boolean {
  return /\.github\.io$/i.test(hostname)
}
