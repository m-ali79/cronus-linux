const { execSync } = require('child_process')
const path = require('path')

if (process.platform === 'linux') {
  const installScript = path.join(__dirname, '..', 'native-host', 'install-native-host.js')
  try {
    execSync(`node ${installScript}`, { stdio: 'inherit' })
    console.log('Native host installed successfully')
  } catch (error) {
    console.error('Failed to install native host:', error)
  }
}
