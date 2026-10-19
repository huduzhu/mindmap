import { deleteDB } from 'idb'
import { getDB, resetDBConnection, DB_NAME } from '../io/db'

export async function resetDatabase() {
  const db = await getDB()
  db.close()
  resetDBConnection()
  await deleteDB(DB_NAME, {
    blocked() {
      // A stray connection reopened mid-delete (e.g. an in-flight history write)
      // would otherwise hang teardown silently.
      throw new Error('resetDatabase: deleteDB blocked by an open connection')
    },
  })
}
