const { ipcMain, app } = require('electron')

let autoUpdater
let mainWindow = null

try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
} catch {}

function setupUpdater(win) {
  if (!autoUpdater) return
  mainWindow = win

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:disponivel', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progresso', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:baixado')
  })

  autoUpdater.on('error', () => {})

  // Weekly check, only in packaged builds
  if (app.isPackaged) {
    setTimeout(() => { try { autoUpdater.checkForUpdates() } catch {} }, 5000)
    setInterval(() => { try { autoUpdater.checkForUpdates() } catch {} }, 7 * 24 * 60 * 60 * 1000)
  }
}

function registrarHandlers() {
  ipcMain.handle('update:verificar', async () => {
    if (!autoUpdater || !app.isPackaged) return
    try { await autoUpdater.checkForUpdates() } catch {}
  })

  ipcMain.handle('update:baixar', async () => {
    if (!autoUpdater) return
    try { await autoUpdater.downloadUpdate() } catch {}
  })

  ipcMain.handle('update:instalar', () => {
    if (!autoUpdater) return
    try { autoUpdater.quitAndInstall() } catch {}
  })

  ipcMain.handle('update:versao', () => app.getVersion())
}

module.exports = { setupUpdater, registrarHandlers }
