let port = null
let isConnected = false

function connectNativeHost() {
  try {
    port = chrome.runtime.connectNative('com.cronus.app')
    isConnected = true
    console.log('[Cronus] Native host connected')

    port.onDisconnect.addListener(() => {
      console.error('[Cronus] Native host disconnected:', chrome.runtime.lastError)
      isConnected = false
      port = null
    })
  } catch (error) {
    console.error('[Cronus] Failed to connect:', error)
    isConnected = false
  }
}

connectNativeHost()

function sendTabChange(url) {
  if (!isConnected || !port) {
    console.warn('[Cronus] Not connected, attempting reconnect...')
    connectNativeHost()
    if (!isConnected) {
      console.error('[Cronus] Failed to reconnect')
      return
    }
  }

  try {
    port.postMessage({
      type: 'tab-change',
      url: url,
      timestamp: Date.now()
    })
    console.log('[Cronus] Sent tab change:', url)
  } catch (error) {
    console.error('[Cronus] Failed to send:', error)
    isConnected = false
  }
}

chrome.tabs.onActivated.addListener(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (tab && tab.url) {
      sendTabChange(tab.url)
    }
  } catch (error) {
    console.error('[Cronus] Error:', error)
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    sendTabChange(changeInfo.url)
  }
})

console.log('[Cronus] Extension loaded')
