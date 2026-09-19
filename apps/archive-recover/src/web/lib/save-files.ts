import type { BrowserRecoveredFile } from './browser-recover.js'

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

/**
 * Writes every recovered file into a folder the person chooses, preserving
 * the manifest's relative paths exactly. Only available in browsers that
 * support the File System Access API.
 */
export async function saveFilesToDirectory(files: BrowserRecoveredFile[]): Promise<void> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) {
    throw new Error('This browser does not support choosing a folder to save into.')
  }

  const root = await picker({ mode: 'readwrite' })

  for (const file of files) {
    const segments = file.path.split('/')
    let dir = root
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment, { create: true })
    }
    const fileName = segments[segments.length - 1] as string
    const handle = await dir.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(Uint8Array.from(file.bytes))
    await writable.close()
  }
}

/**
 * Fallback for browsers without the File System Access API: triggers one
 * download per file. Directory separators are flattened into the filename
 * (e.g. `folios/page-001.jpg` -> `folios__page-001.jpg`) since the plain
 * download attribute cannot create subfolders.
 */
export function downloadFileIndividually(file: BrowserRecoveredFile): void {
  const flatName = file.path.replace(/\//g, '__')
  const blob = new Blob([file.bytes.slice()], { type: file.contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = flatName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
