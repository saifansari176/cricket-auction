import { Injectable } from '@angular/core';
import {
  doc,
  onSnapshot,
  Unsubscribe,
  DocumentData
} from 'firebase/firestore';

import { auth, db } from '../../../firebase.config';
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
      return this.request<T[]>('getAll', { collection: collectionName });
    }));

}

  // ==========================
  // Get Document By Id
  // ==========================

  async getById<T>(collectionName: string, id: string, forceRefresh = false): Promise<T | null> {
    if (forceRefresh) this.invalidateCollection(collectionName);
    const key = this.readKey(collectionName, 'document', id);
    return this.cachedRead(collectionName, key, () => this.loading.track(async () => {
      return this.request<T | null>('getById', { collection: collectionName, id });
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
      return this.request<T | null>('getOneByField', { collection: collectionName, field, value });
    }));
  }

  // ==========================
  // Add New Document
  // ==========================

  async add<T extends FirestorePayload>(collectionName: string, data: T) {
    const payload = this.withoutId(data);
    const result = await this.runWrite(`add:${collectionName}:${this.writeFingerprint(payload)}`, () => this.loading.track(() =>
      this.request<{ id: string }>('add', { collection: collectionName, data: payload })
    ));
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
      const result = await this.request<{ created: boolean }>('createIfNoMatchingField', {
        collection: collectionName, id, field, value, data: payload
      }, [201, 409]);
      return result.created;
    });

    if (created) this.invalidateCollection(collectionName);
    return created;
  }

  // ==========================
  // Create/Replace Document
  // ==========================

  async set<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.runWrite(`set:${collectionName}:${id}:${this.writeFingerprint(payload)}`, () => this.loading.track(() =>
      this.request<void>('set', { collection: collectionName, id, data: payload })
    ));
    this.invalidateCollection(collectionName);

  }

  // ==========================
  // Update Document
  // ==========================

  async update<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.runWrite(`update:${collectionName}:${id}:${this.writeFingerprint(payload)}`, () => this.loading.track(() =>
      this.request<void>('update', { collection: collectionName, id, data: payload })
    ));
    this.invalidateCollection(collectionName);

  }

  // ==========================
  // Delete Document
  // ==========================

  async delete(collectionName: string, id: string) {
    await this.runWrite(`delete:${collectionName}:${id}`, () => this.loading.track(() =>
      this.request<void>('delete', { collection: collectionName, id })
    ));
    this.invalidateCollection(collectionName);

  }

  async deleteCollection(collectionName: string): Promise<void> {
    await this.loading.track(async () => {
      const records = await this.request<Array<{ id: string }>>('getAll', { collection: collectionName });
      await Promise.all(records.map((record) => this.request<void>('delete', { collection: collectionName, id: record.id })));
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

  /** Calls a purpose-built backend command, used for atomic auction actions. */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.apiRequest<T>(path, body);
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

  /** All normal data operations pass through Express, where Admin SDK checks ownership. */
  private async request<T>(action: string, payload: Record<string, unknown>, allowedStatuses = [200, 201, 204]): Promise<T> {
    const collectionPath = String(payload['collection'] || '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return this.apiRequest<T>(`/api/data/${encodeURIComponent(action)}/${collectionPath}`, { action, ...payload }, allowedStatuses);
  }

  private async apiRequest<T>(path: string, body: Record<string, unknown>, allowedStatuses = [200, 201, 204]): Promise<T> {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!allowedStatuses.includes(response.status)) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error || `Data API request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

}
