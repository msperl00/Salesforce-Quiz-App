import { cp, lstat, mkdir, rm, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(rootDir, '.output/public')
const linkPath = resolve(rootDir, '.output/server/chunks/public')

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(dirname(linkPath), { recursive: true })

  if (await exists(linkPath)) {
    await rm(linkPath, { recursive: true, force: true })
  }

  try {
    await symlink('../../public', linkPath, 'dir')
    console.log('Preview assets linked:', linkPath)
  } catch (error) {
    await cp(publicDir, linkPath, { recursive: true })
    console.warn('Symlink failed, copied preview assets instead.', error)
  }
}

await main()
