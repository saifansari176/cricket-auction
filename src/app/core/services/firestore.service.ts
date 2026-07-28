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
  DocumentData
} from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { LoadingService } from './loading.service';

type FirestorePayload = object & { id?: unknown };

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  constructor(private loading: LoadingService) {}

  // ==========================
  // Get All Documents
  // ==========================

  async getAll<T>(collectionName: string): Promise<T[]> {
    return this.loading.track(async () => {
      const snapshot = await getDocs(collection(db, collectionName));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];
    });

}

  // ==========================
  // Get Document By Id
  // ==========================

  async getById<T>(collectionName: string, id: string): Promise<T | null> {
    return this.loading.track(async () => {
      const snapshot = await getDoc(doc(db, collectionName, id));

      if (!snapshot.exists()) return null;

      return { id: snapshot.id, ...snapshot.data() } as T;
    });

}

  // ==========================
  // Add New Document
  // ==========================

  async add<T extends FirestorePayload>(collectionName: string, data: T) {
    const payload = this.withoutId(data);
    return this.loading.track(() => addDoc(
      collection(db, collectionName),
      payload
    ));

  }

  // ==========================
  // Create/Replace Document
  // ==========================

  async set<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.loading.track(() => setDoc(
      doc(db, collectionName, id),
      payload
    ));

  }

  // ==========================
  // Update Document
  // ==========================

  async update<T extends FirestorePayload>(collectionName: string, id: string, data: T) {
    const payload = this.withoutId(data);
    await this.loading.track(() => updateDoc(
      doc(db, collectionName, id),
      payload
    ));

  }

  // ==========================
  // Delete Document
  // ==========================

  async delete(collectionName: string, id: string) {
    await this.loading.track(() => deleteDoc(
      doc(db, collectionName, id)
    ));

  }

  async deleteCollection(collectionName: string): Promise<void> {
    await this.loading.track(async () => {
      const snapshot = await getDocs(collection(db, collectionName));
      await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
    });
  }

  private withoutId<T extends FirestorePayload>(data: T): DocumentData {
    const { id: _id, ...payload } = data;
    return payload as DocumentData;
  }

}
