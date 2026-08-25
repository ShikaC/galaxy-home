export declare function assertSupportedNodeRuntime(version?: string): void

export declare function runtimeEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv & { PATH?: string; Path?: string }

export declare function npmInvocation(args: string[]): {
  command: string
  args: string[]
}

export declare function tauriCliPath(root: string): string

export declare function tauriInvocation(args: string[], webPort: string): string[]
