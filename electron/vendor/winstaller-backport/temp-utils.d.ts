export declare function createTempDir(prefix: string | { dir?: string; prefix?: string }): Promise<string>;
export declare function cleanupSync(): { files: number; dirs: number };
export declare const cleanup: {
  (): Promise<{ files: number; dirs: number }>;
  (callback: (error: Error | null, result?: { files: number; dirs: number }) => void): void;
};
