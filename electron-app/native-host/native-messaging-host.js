#!/usr/bin/env node

const fs = require('fs')

let writeTimer = null
const DEBOUNCE_MS = 7000
const FILE_PATH = '/tmp/cronus-url-latest.json'

// Error handling
process.on('uncaughtException', (err) => {
  console.error('[NativeHost] Uncaught exception:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('[NativeHost] Unhandled rejection:', err)
})

function readMessage() {
  try {
    const header = process.stdin.read(4)
    if (!header || header.length < 4) return null
    
    const length = header.readUInt32LE(0)
    if (length <= 0 || length > 1000000) return null // Sanity check
    
    const data = process.stdin.read(length)
    if (!data || data.length < length) return null
    
    return JSON.parse(data.toString())
  } catch (err) {
    console.error('[NativeHost] Read error:', err.message)
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
  } catch (err) {
    console.error('[NativeHost] Write error:', err.message)
  }
}

function handleMessage(message) {
  if (!message || message.type !== 'tab-change') {
    writeMessage({ status: 'error', message: 'Invalid message type' })
    return
  }

  // Clear existing timer
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }

  // Send immediate ACK
  writeMessage({ 
    status: 'received', 
    url: message.url,
    timestamp: Date.now() 
  })

  // Debounced write to file
  writeTimer = setTimeout(() => {
    try {
      const data = {
        url: message.url,
        timestamp: message.timestamp || Date.now()
      }
      fs.writeFileSync(FILE_PATH, JSON.stringify(data))
      console.error('[NativeHost] Written to', FILE_PATH)
    } catch (err) {
      console.error('[NativeHost] Write file error:', err.message)
    }
  }, DEBOUNCE_MS)
}

// Keep stdin open
process.stdin.on('readable', () => {
  try {
    let message
    while ((message = readMessage()) !== null) {
      handleMessage(message)
    }
  } catch (err) {
    console.error('[NativeHost] Handler error:', err.message)
  }
})

process.stdin.on('end', () => {
  console.error('[NativeHost] stdin ended')
  process.exit(0)
})

process.stdin.on('error', (err) => {
  console.error('[NativeHost] stdin error:', err.message)
})

process.stdout.on('error', (err) => {
  console.error('[NativeHost] stdout error:', err.message)
})

// Don't exit on SIGINT/SIGTERM during development
// process.on('SIGINT', () => process.exit())
// process.on('SIGTERM', () => process.exit())

// Keep process alive
process.stdin.resume()
console.error('[NativeHost] Started and waiting for messages')
