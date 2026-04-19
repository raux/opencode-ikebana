// Phase 6.2 — Budget Alert
// Triggers a toast when session cost exceeds a threshold
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const THRESHOLD_KEY = "budget_threshold"
const ALERTED_KEY = "budget_alerted"

export function checkBudget(api: TuiPluginApi, cost: number) {
  const threshold = api.kv.get(THRESHOLD_KEY, 0.5) as number
  if (cost <= 0 || cost < threshold) return
  const alerted = api.kv.get(ALERTED_KEY, "") as string
  const key = `${threshold}:${Math.floor(cost * 100)}`
  if (alerted === key) return
  api.kv.set(ALERTED_KEY, key)
  api.ui.toast({
    title: "Budget Alert",
    message: `Session cost ${money.format(cost)} exceeded threshold ${money.format(threshold)}`,
    variant: "warning",
    duration: 5000,
  })
}
