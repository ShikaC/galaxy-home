export const PORT_IN_USE_EXIT_CODE = 98

export function serverExitCode(error: unknown): number {
  if (error instanceof Error && "code" in error && error.code === "EADDRINUSE")
    return PORT_IN_USE_EXIT_CODE
  return 1
}
