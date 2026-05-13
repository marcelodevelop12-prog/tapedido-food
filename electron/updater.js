const { ipcMain, app } = require('electron')

let autoUpdater
let mainWindow = null

try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
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

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] download concluído, versão:', info.version)
    // Notifica o renderer para exibir o botão "Reiniciar e Atualizar"
    mainWindow?.webContents.send('update:baixado', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] erro:', err.message)
    mainWindow?.webContents.send('update:erro', { message: err.message })
  })

  // Weekly check, only in packaged builds
  if (app.isPackaged) {
    const checkSilently = () =>
      autoUpdater.checkForUpdates().catch(err =>
        console.log('[updater] sem updates:', err.message)
      )
    setTimeout(checkSilently, 5000)
    setInterval(checkSilently, 7 * 24 * 60 * 60 * 1000)
  }
}

function registrarHandlers() {
  ipcMain.handle('update:verificar', async () => {
    if (!autoUpdater || !app.isPackaged) return
    try { await autoUpdater.checkForUpdates() } catch {}
  })

  ipcMain.handle('update:baixar', async () => {
    if (!autoUpdater) return
    try { await autoUpdater.downloadUpdate() } catch (err) {
      console.error('[updater] erro ao baixar:', err.message)
    }
  })

  ipcMain.handle('update:instalar', () => {
    if (!autoUpdater) return
    console.log('[updater] iniciando quitAndInstall...')
    try {
      // isSilent=false → exibe a UI do instalador (necessário para UAC/elevação)
      // isForceRunAfter=true → reabre o app após instalar
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      console.error('[updater] erro em quitAndInstall:', err.message)
    }
  })

  ipcMain.handle('update:versao', () => app.getVersion())
}

module.exports = { setupUpdater, registrarHandlers }
