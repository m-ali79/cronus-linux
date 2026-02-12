const fs = require('fs')
const path = require('path')
const os = require('os')

function installManifest(browserPath, hostPath, extensionId) {
  const manifestDir = path.join(os.homedir(), '.config', browserPath, 'NativeMessagingHosts')

  fs.mkdirSync(manifestDir, { recursive: true })

  const templatePath = path.join(__dirname, 'manifest-template.json')
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at ${templatePath}`)
  }

  const template = fs.readFileSync(templatePath, 'utf8')
  const manifest = template
    .replace('{{HOST_PATH}}', hostPath)
    .replace('{{EXTENSION_ID}}', extensionId)

  const targetPath = path.join(manifestDir, 'com.cronus.app.json')

  fs.writeFileSync(targetPath, manifest)

  console.log(`Successfully installed manifest for ${browserPath} at ${targetPath}`)
}

const extensionId = process.env.CRONUS_EXTENSION_ID || '{{EXTENSION_ID}}'
const hostPath = path.join(__dirname, 'native-messaging-host.js')

const browsers = [
  'google-chrome',
  'BraveSoftware/Brave-Browser',
  'microsoft-edge',
  'net.imput.helium'
]

console.log('Installing Cronus Native Messaging Host...')
console.log(`Extension ID: ${extensionId}`)
console.log(`Host Path: ${hostPath}`)

browsers.forEach((browser) => {
  try {
    installManifest(browser, hostPath, extensionId)
  } catch (err) {
    console.error(`Error installing for ${browser}: ${err.message}`)
  }
})
