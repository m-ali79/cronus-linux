#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

let writeTimer = null
const DEBOUNCE_MS = 7000

const EXTENSION_ID_MAPPING = {
  oalpgmdabmdbcaojnceoafmolpnhnajf: 'helium',
  E0BF6C301C3120E9D24E05CEBFD7D095: 'chrome'
}

function determineBrowserType(extensionId, userAgentHint) {
  if (extensionId && EXTENSION_ID_MAPPING[extensionId]) {
    return EXTENSION_ID_MAPPING[extensionId]
  }

  if (userAgentHint && userAgentHint.includes('Helium')) {
    return 'helium'
  }

  if (userAgentHint && userAgentHint.includes('Brave')) {
    return 'brave'
  }

  if (userAgentHint && userAgentHint.includes('Edg')) {
    return 'edge'
  }

  if (userAgentHint && userAgentHint.includes('Arc')) {
    return 'arc'
  }

  return 'chrome'
}

function readMessage() {
  try {
    const header = process.stdin.read(4)
    if (!header) return null

    const length = header.readUInt32LE(0)
    const data = process.stdin.read(length)
    if (!data) return null

    return JSON.parse(data.toString())
  } catch (err) {
    return null
  }
}

function writeMessage(msg) {
  try {
    const data = Buffer.from(JSON.stringify(msg))
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(data.length, 0)
    process.stdout.write(header)
    process.stdout.write(data)
  } catch (err) {}
}

function handleMessage(message) {
  if (!message || message.type !== 'tab-change') return

  if (writeTimer) clearTimeout(writeTimer)

  writeTimer = setTimeout(() => {
    try {
      const { extensionId, userAgentHint, url } = message
      const browserType = determineBrowserType(extensionId, userAgentHint)
      const filePath = `/tmp/cronus-url-${browserType}.json`

      const data = {
        url: url,
        browser: browserType,
        extensionId: extensionId,
        timestamp: Date.now()
      }

      fs.writeFileSync(filePath, JSON.stringify(data))

      writeMessage({
        status: 'written',
        browser: browserType,
        timestamp: data.timestamp
      })
    } catch (err) {
      console.error('Native Host Error:', err)
      writeMessage({ status: 'error', message: err.message })
    }
  }, DEBOUNCE_MS)
}

process.stdin.on('readable', () => {
  let message
  while ((message = readMessage()) !== null) {
    handleMessage(message)
  }
})

process.on('SIGINT', () => process.exit())
process.on('SIGTERM', () => process.exit())
process.stdin.resume()
