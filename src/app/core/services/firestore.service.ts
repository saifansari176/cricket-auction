import { Injectable } from '@angular/core';
import {
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  DocumentData
} from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { LoadingService } from './loading.service';

type FirestorePayload = object & { id?: unknown };

interface CachedRead<T> {
  value: T;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  /**
   * Keep one response in application memory so navigation does not repeat a
   * Firestore read. Firestore itself owns the persistent IndexedDB cache.
   * Writes clear the affected application entry.
   */
  private readonly readCache = new Map<string, CachedRead<unknown>>();
  private readonly inFlightReads = new Map<string, Promise<unknown>>();
  private readonly cacheVersions = new Map<string, number>();
  private cacheEpoch = 0;
  private readonly inFlightWrites = new Map<string, Promise<unknown>>();

  constructor(private loading: LoadingService) {}

  // ==========================
  // Get All Documents
  // ==========================

  async getAll<T>(collectionName: string, forceRefresh = false): Promise<T[]> {
    if (forceRefresh) this.invalidateCollection(collectionName);
    const key = this.readKey(collectionName, 'all');
    return this.cachedRead(collectionName, key, () => this.loading.track(async () => {
      const snapshot = await getDocs(collection(db, collectionName));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    }));

}

  // ==========================
  // Get Document By Id
  // ==========================

  async getById<T>(collectionName: string, id: string, forceRefresh = false): Promise<T | null> {
    if (forceRefresh) this.invalidateCollection(collectionName);
    const key = this.readKey(collectionName, 'document', id);
    return this.cachedRead(collectionName, key, () => this.loading.track(async () => {
      const snapshot = await getDoc(doc(db, collectionName, id));

      if (!snapshot.exists()) return null;

      return { id: snapshot.id, ...snapshot.data() } as T;
    }));

}

  /** Subscribe to a document so public displays update as soon as it changes. */
  watchById<T>(collectionName: string, id: string, onChange: (data: T | null) => void): Unsubscribe {
    return onSnapshot(doc(db, collectionName, id), (snapshot) => {
      const value = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null;
      this.invalidateCollection(collectionName);
      this.setCached(this.readKey(collectionName, 'document', id), value);
      onChange(this.clone(value));
    });
  }

  async getOneByField<T>(collectionName: string, field: string, value: unknown, forceRefresh = false): Promise<T | null> {
    if (forceRefresh) this.invalidateCollection(collectionName);
    const key = this.readKey(collectionName, 'field', field, JSON.stringify(value));
    return this.cachedRead(collectionName, key, () => this.loading.track(async () => {
      const snapshot = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
      const record = snapshot.docs[0];
      return record ? ({ id: record.id, ...record.data() } as T) : null;
    }));
  }

  // ==========================
  // Add New Document
  // ==========================

  async add<T extends FirestorePayload>(collectionName: string, data: T) {
    const payload = this.withoutId(data);
    const result = await this.runWrite(`add:${collectionName}:${this.writeFingerprint(payload)}`, () => this.loading.track(() => addDoc(
      collection(db, collectionName),
      payload
    )));
    this.invalidateCollection(collectionName);
    return result;

  }

  /**
   * Creates a document only if no document has the supplied field value.
   * The fixed id protects simultaneous submissions, while the lookup also
   * protects registrations that were stored with older, random document ids.
   */
  async createIfNoMatchingField<T extends FirestorePayload>(
    collectionName: string,
    id: string,
    field: string,
    value: unknown,
    data: T
  ): Promise<boolean> {
    const payload = this.withoutId(data);

    const created = await this.loading.track(async () => {
      const matchingDocuments = await getDocs(
        query(collection(db, collectionName), where(field, '==', value))
      );

      if (!matchingDocuments.empty) {
        return false;
      }

      return runTransaction(db, async (transaction) => {
      const document = doc(db, collectionName, id);
      if ((await transaction.get(document)).exists()) {
        return false;
      }

      transaction.set(document, payload);
      return true;
      });
    });

    if (created) this.invalidateCollection(collectionName);
    return created;
  }

  // ==========================
  // Create/Replace Document
  // ==========================

  async set<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.runWrite(`set:${collectionName}:${id}:${this.writeFingerprint(payload)}`, () => this.loading.track(() => setDoc(
      doc(db, collectionName, id),
      payload
    )));
    this.invalidateCollection(collectionName);

  }

  // ==========================
  // Update Document
  // ==========================

  async update<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.runWrite(`update:${collectionName}:${id}:${this.writeFingerprint(payload)}`, () => this.loading.track(() => updateDoc(
      doc(db, collectionName, id),
      payload
    )));
    this.invalidateCollection(collectionName);

  }

  // ==========================
  // Delete Document
  // ==========================

  async delete(collectionName: string, id: string) {
    await this.runWrite(`delete:${collectionName}:${id}`, () => this.loading.track(() => deleteDoc(
      doc(db, collectionName, id)
    )));
    this.invalidateCollection(collectionName);

  }

  async deleteCollection(collectionName: string): Promise<void> {
    await this.loading.track(async () => {
      const snapshot = await getDocs(collection(db, collectionName));
      await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
    });
    this.invalidateCollection(collectionName);
  }

  /** Clears stored reads, for example if a caller needs a guaranteed fresh reload. */
  clearReadCache(collectionName?: string): void {
    if (collectionName) {
      this.invalidateCollection(collectionName);
      return;
    }

    this.readCache.clear();
    this.inFlightReads.clear();
    this.cacheVersions.clear();
    this.cacheEpoch += 1;
  }

  private withoutId<T extends FirestorePayload>(data: T): DocumentData {
    const { id: _id, ...payload } = data;
    return payload as DocumentData;
  }

  /** Reuses an identical write already in progress instead of sending it again. */
  private runWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlightWrites.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const pending = operation().finally(() => this.inFlightWrites.delete(key));
    this.inFlightWrites.set(key, pending);
    return pending;
  }

  private writeFingerprint(payload: DocumentData): string {
    return JSON.stringify(payload, Object.keys(payload).sort());
  }

  private async cachedRead<T>(collectionName: string, key: string, request: () => Promise<T>): Promise<T> {
    const cached = this.getCached<T>(key);
    if (cached.found) return this.clone(cached.value);

    const existing = this.inFlightReads.get(key) as Promise<T> | undefined;
    if (existing) return this.clone(await existing);

    const cacheVersion = this.cacheVersions.get(collectionName) ?? 0;
    const cacheEpoch = this.cacheEpoch;
    const pending = request()
      .then((value) => {
        // A write may have finished while this read was in flight. Do not put
        // that older response back into a cache which was just invalidated.
        if (this.cacheEpoch === cacheEpoch
          && (this.cacheVersions.get(collectionName) ?? 0) === cacheVersion) {
          this.setCached(key, value);
        }
        return value;
      })
      .finally(() => {
        if (this.inFlightReads.get(key) === pending) this.inFlightReads.delete(key);
      });

    this.inFlightReads.set(key, pending);
    return this.clone(await pending);
  }

  private getCached<T>(key: string): { found: true; value: T } | { found: false } {
    const memoryEntry = this.readCache.get(key) as CachedRead<T> | undefined;
    return memoryEntry
      ? { found: true, value: memoryEntry.value }
      : { found: false };
  }

  private setCached<T>(key: string, value: T): void {
    const entry: CachedRead<T> = {
      value: this.clone(value)
    };
    this.readCache.set(key, entry);
  }

  private invalidateCollection(collectionName: string): void {
    const prefix = this.collectionCachePrefix(collectionName);
    this.cacheVersions.set(collectionName, (this.cacheVersions.get(collectionName) ?? 0) + 1);
    for (const key of this.readCache.keys()) {
      if (key.startsWith(prefix)) this.readCache.delete(key);
    }
    for (const key of this.inFlightReads.keys()) {
      if (key.startsWith(prefix)) this.inFlightReads.delete(key);
    }

  }

  private readKey(collectionName: string, kind: string, ...parts: string[]): string {
    return `${this.collectionCachePrefix(collectionName)}${kind}:${parts.map(encodeURIComponent).join(':')}`;
  }

  private collectionCachePrefix(collectionName: string): string {
    return `${encodeURIComponent(collectionName)}:`;
  }

  private clone<T>(value: T): T {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  }

}
