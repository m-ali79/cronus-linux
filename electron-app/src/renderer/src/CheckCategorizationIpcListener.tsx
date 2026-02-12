import { useEffect } from 'react'
import { trpc } from './utils/trpc'

/**
 * Listens for main-process check-categorization requests (from native Linux before OCR),
 * calls tRPC checkCategorization with the current token, and sends the result back.
 */
export function CheckCategorizationIpcListener(): null {
  const utils = trpc.useUtils()

  useEffect(() => {
    const cleanup = window.api.onCheckCategorizationRequest(async (payload, replyChannel) => {
      console.log(`[IPC-Renderer] Received check request for ${payload.ownerName}`)
      const token = localStorage.getItem('accessToken')
      console.log(`[IPC-Renderer] Has token: ${!!token}`)
      if (!token) {
        window.api.sendCheckCategorizationResult(replyChannel, { isCategorized: false })
        return
      }
      try {
        const result = await utils.client.activeWindowEvents.checkCategorization.query({
          token,
          ownerName: payload.ownerName,
          type: payload.type as 'window' | 'browser' | 'system',
          title: payload.title,
          url: payload.url ?? undefined
        })
        console.log(`[IPC-Renderer] tRPC result: isCategorized=${result.isCategorized}`)
        window.api.sendCheckCategorizationResult(replyChannel, result)
      } catch {
        window.api.sendCheckCategorizationResult(replyChannel, { isCategorized: false })
      }
    })
    return cleanup
  }, [utils])

  return null
}
