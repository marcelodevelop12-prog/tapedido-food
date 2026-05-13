/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.tapedido.food',
  productName: 'TáPedido Food',
  directories: {
    output: 'dist-electron',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'assets/**/*',
    'node_modules/**/*',
    'package.json',
  ],
  asarUnpack: [
    '**/better-sqlite3/**/*',
    '**/serialport/**/*',
  ],
  win: {
    target: 'nsis',
    icon: 'assets/icons/icon.ico',
  },
  artifactName: 'tapedido-food-setup-${version}.${ext}',
  nsis: {
    oneClick: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'TáPedido Food',
  },
  extraResources: [
    { from: 'assets/', to: 'assets/' },
  ],
  linux: {
    icon: 'assets/icons',
  },
  publish: {
    provider: 'github',
    owner: 'marcelodevelop12-prog',
    repo: 'tapedido-food',
    releaseType: 'release',
  },
}
