export type ParentLifetimeInput = {
  readonly resume: () => void
  readonly once: (event: "end", listener: () => void) => void
}

export function watchParentLifetime(
  enabled: boolean,
  input: ParentLifetimeInput,
  close: () => Promise<void>,
): void {
  if (!enabled) return
  input.resume()
  input.once("end", () => {
    close().then(
      () => {
        process.exitCode = 0
      },
      () => {
        process.exitCode = 1
      },
    )
  })
}
