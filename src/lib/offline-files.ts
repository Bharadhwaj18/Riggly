// Photos kept on the phone for a change that's waiting to be sent (a UPI payment photo for a merch sale
// made offline). Stored in IndexedDB, which holds files; localStorage can't.

const DB = 'riggly-offline'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Keeps the files for a change. False when the phone won't store them. */
export async function keepFiles(changeId: string, files: File[]): Promise<boolean> {
  try {
    await run('readwrite', s => s.put(files, changeId))
    return true
  } catch {
    return false
  }
}

export async function loadFiles(changeId: string): Promise<File[]> {
  try {
    return ((await run('readonly', s => s.get(changeId))) as File[] | undefined) ?? []
  } catch {
    return []
  }
}

export async function dropFiles(changeId: string): Promise<void> {
  try { await run('readwrite', s => s.delete(changeId)) } catch { /* already gone */ }
}
