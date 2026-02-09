const port = chrome.runtime.connectNative('com.cronus.app')

const browserType = (() => {
  if (navigator.userAgent.includes('Brave')) return 'brave'
  if (navigator.userAgent.includes('Edg')) return 'edge'
  if (navigator.userAgent.includes('Arc')) return 'arc'
  return 'chrome'
})()

chrome.tabs.onActivated.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab) {
    port.postMessage({
      type: 'tab-change',
      url: tab.url,
      browser: browserType
    })
  }
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    port.postMessage({
      type: 'tab-change',
      url: changeInfo.url,
      browser: browserType
    })
  }
})
