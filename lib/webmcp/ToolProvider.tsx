'use client'
import { useApp } from '@/lib/store'
import { useWebMcpTools } from '@/lib/webmcp/useWebMcpTool'
import { readTools } from '@/lib/webmcp/tools/read'
import { navTools } from '@/lib/webmcp/tools/nav'
import { writeTools } from '@/lib/webmcp/tools/write'
import { receiptTools, receiptWriteTools } from '@/lib/webmcp/tools/receipts'

export const ALL_TOOLS = [
  ...readTools, ...navTools, ...writeTools, ...receiptWriteTools, ...receiptTools,
]

/**
 * Mounts Tabby's tool surface once the user is signed in and their data is
 * loaded. Registering before that would advertise tools that can only fail.
 */
export function ToolProvider() {
  const ready = useApp((s) => s.status === 'ready')
  const groupCount = useApp((s) => s.groups.length)

  useWebMcpTools(readTools, [groupCount], ready)
  useWebMcpTools(navTools, [groupCount], ready)
  useWebMcpTools(writeTools, [groupCount], ready)
  // Nothing to read if no expense in any group carries a photo.
  const anyReceipts = useApp((s) => s.expenses.some((e) => e.receiptPath))
  useWebMcpTools(receiptWriteTools, [], ready)
  useWebMcpTools(receiptTools, [anyReceipts], ready && anyReceipts)

  return null
}
