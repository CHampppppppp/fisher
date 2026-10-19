import type { SaveFile } from './save-format.ts';

export const SAVE_DATABASE = 'island-fishing-survival-v2';
export const SAVE_STORE = 'saves';
export const SAVE_SLOT = 'current';
const TIMEOUT_MS = 4500;

/** One atomic IndexedDB slot. A put request succeeding is not a committed transaction. */
export class SaveStore {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve,reject)=>{
      let request: IDBOpenDBRequest;
      try { request=indexedDB.open(SAVE_DATABASE,1); } catch(error) { reject(error);return; }
      let settled=false;
      const timer=setTimeout(()=>{settled=true;reject(new Error('Storage open timed out'));},TIMEOUT_MS);
      const fail=(error:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(SAVE_STORE)) request.result.createObjectStore(SAVE_STORE);
      };
      request.onerror=()=>fail(request.error??new Error('Storage open failed'));
      request.onblocked=()=>fail(new Error('Storage is blocked by another tab'));
      request.onsuccess=()=>{
        if(settled) { request.result.close();return; }
        settled=true;clearTimeout(timer);request.result.onversionchange=()=>request.result.close();resolve(request.result);
      };
    });
  }

  private async transaction(mode: IDBTransactionMode, value?: SaveFile): Promise<unknown> {
    const started = Date.now();
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      let transaction: IDBTransaction;
      try { transaction=db.transaction(SAVE_STORE,mode); } catch(error) { db.close();reject(error);return; }
      let result: unknown;let settled=false;
      const finish=(ok:boolean,error?:unknown)=>{
        if(settled)return;settled=true;clearTimeout(timer);db.close();
        if(ok)resolve(result);else reject(error??transaction.error??new Error('Storage transaction aborted'));
      };
      const timer=setTimeout(()=>{try{transaction.abort();}catch{/* Transaction may have just settled. */}finish(false,new Error('Storage transaction timed out'));},Math.max(1,TIMEOUT_MS-(Date.now()-started)));
      transaction.oncomplete=()=>finish(true);
      transaction.onabort=()=>finish(false);
      transaction.onerror=()=>{try{transaction.abort();}catch{/* An abort may already be pending. */}finish(false);};
      try {
        const store=transaction.objectStore(SAVE_STORE);
        const request=mode==='readwrite'?store.put(value,SAVE_SLOT):store.get(SAVE_SLOT);
        request.onsuccess=()=>{result=request.result;};
        // Let the request's default error action abort the entire write transaction.
      } catch(error) {try{transaction.abort();}catch{/* No live transaction remains. */}finish(false,error);}
    });
  }

  async write(value: SaveFile): Promise<void> { await this.transaction('readwrite',value); }
  async read(): Promise<unknown> { return this.transaction('readonly'); }
}
