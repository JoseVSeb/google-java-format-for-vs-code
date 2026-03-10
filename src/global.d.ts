// Minimal ambient declaration for the lodash-es/throttle subpath.
// lodash-es 4.x does not ship built-in TypeScript types.
declare module "lodash-es/throttle" {
  // biome-ignore lint/suspicious/noExplicitAny: generic constraint requires any[] for broader function compatibility
  export default function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: { leading?: boolean; trailing?: boolean },
  ): ((...args: Parameters<T>) => ReturnType<T> | undefined) & {
    cancel(): void;
    flush(): ReturnType<T> | undefined;
  };
}
