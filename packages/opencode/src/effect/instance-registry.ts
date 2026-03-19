const disposers = new Set<{
  fn: (directory: string) => Promise<void>
  priority: number
}>()

export function registerDisposer(disposer: (directory: string) => Promise<void>, priority = 0) {
  const item = {
    fn: disposer,
    priority,
  }
  disposers.add(item)
  return () => {
    disposers.delete(item)
  }
}

export async function disposeInstance(directory: string) {
  const list = [...disposers].sort((a, b) => a.priority - b.priority)
  const seen = new Set<number>()
  for (const item of list) {
    if (seen.has(item.priority)) continue
    seen.add(item.priority)
    await Promise.allSettled(list.filter((x) => x.priority === item.priority).map((x) => x.fn(directory)))
  }
}
