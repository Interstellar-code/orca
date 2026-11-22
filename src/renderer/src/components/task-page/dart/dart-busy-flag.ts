/** Runs `work` with `busy` set true until it settles, however it ends. Kept out of components because React Compiler cannot compile try/finally. */
export async function whileBusy(
  setBusy: (busy: boolean) => void,
  work: () => Promise<unknown>
): Promise<void> {
  setBusy(true)
  try {
    await work()
  } finally {
    setBusy(false)
  }
}
