import type { Entry } from './mdbcTypes'

const DataStore: {
  cleanrun: boolean
  data: Record<string, Entry[]>
  zotIds: number[]
} = {
  cleanrun: true,
  data: {},
  zotIds: [],
}

export class DataManager {
  static initialize(): void {
    DataStore.cleanrun = true
    DataStore.data = {}
    DataStore.zotIds = []
  }

  static markFail(): void {
    DataStore.cleanrun = false
  }

  static checkForKey(key: string): boolean {
    return Object.keys(DataStore.data).includes(key)
  }

  static checkForZotId(itemId: number): boolean {
    return DataStore.zotIds.includes(itemId)
  }

  static getEntryList(itemId: number): Entry[] {
    return DataStore.data[itemId.toString()]
  }
  static addEntry(zotid: number, entry_res: Entry): void {
    if (Object.keys(DataStore.data).includes(zotid.toString())) {
      DataStore.data[zotid.toString()].push(entry_res)
    } else {
      DataStore.data[zotid.toString()] = [entry_res]
      DataStore.zotIds.push(zotid)
    }
  }
  static isClean(): boolean {
    return DataStore.cleanrun
  }
  static data() {
    return DataStore.data
  }
  static zotIds() {
    return DataStore.zotIds
  }
  static dump() {
    return {
      cleanrun: DataStore.cleanrun,
      data: DataStore.data,
      zotIds: DataStore.zotIds,
    }
  }
  static numberRecords(): number {
    return DataStore.zotIds.length
  }
}
