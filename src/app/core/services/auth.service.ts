import { Injectable } from '@angular/core';
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';

import { auth, firebaseConfig } from '../../../firebase.config';
import { AppUser } from '../models/app-user';
import { FirebaseService } from './firestore.service';
import { LoadingService } from './loading.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersCollection = 'users';
  private ready = false;
  private readyResolver!: () => void;
  private readyPromise = new Promise<void>((resolve) => {
    this.readyResolver = resolve;
  });

  currentUser$ = new BehaviorSubject<AppUser | null>(null);

  constructor(private firebase: FirebaseService, private loading: LoadingService) {
    onAuthStateChanged(auth, async (firebaseUser) => {
      const appUser = firebaseUser ? await this.loadOrCreateProfile(firebaseUser) : null;

      this.currentUser$.next(appUser);

      if (!this.ready) {
        this.ready = true;
        this.readyResolver();
      }
    });
  }

  async login(email: string, password: string): Promise<AppUser | null> {
    return this.loading.track(async () => {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const appUser = await this.loadOrCreateProfile(credential.user);

      if (!appUser.active) {
        await signOut(auth);
        throw new Error('This user account is inactive.');
      }

      this.currentUser$.next(appUser);
      return appUser;
    });
  }

  async register(email: string, password: string, displayName: string): Promise<AppUser> {
    return this.loading.track(async () => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });

      const users = await this.getUsers();
      const now = new Date().toISOString();
      const profile: AppUser = {
        uid: credential.user.uid,
        email,
        displayName,
        role: users.length === 0 ? 'admin' : 'user',
        active: true,
        createdAt: now,
        updatedAt: now
      };

      await this.firebase.set(this.usersCollection, credential.user.uid, profile);
      const appUser = { ...profile, id: credential.user.uid };
      this.currentUser$.next(appUser);
      return appUser;
    });
  }

  async logout(): Promise<void> {
    await this.loading.track(async () => {
      await signOut(auth);
      this.currentUser$.next(null);
    });
  }

  async waitForUser(): Promise<AppUser | null> {
    if (!this.ready) {
      await this.readyPromise;
    }

    return this.currentUser$.value;
  }

  isAdmin(user: AppUser | null = this.currentUser$.value): boolean {
    return user?.role === 'admin';
  }

  async getUsers(): Promise<AppUser[]> {
    return await this.firebase.getAll<AppUser>(this.usersCollection);
  }

  async createUser(email: string, password: string, displayName: string, role: AppUser['role'], active: boolean): Promise<void> {
    const secondaryAppName = `user-create-${Date.now()}`;
    const secondaryApp: FirebaseApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

    await updateProfile(credential.user, { displayName });

    const now = new Date().toISOString();
    const profile: AppUser = {
      uid: credential.user.uid,
      email,
      displayName,
      role,
      active,
      createdAt: now,
      updatedAt: now
    };

    await this.firebase.set(this.usersCollection, credential.user.uid, profile);
    await deleteApp(secondaryApp);
  }

  async saveUser(user: AppUser): Promise<void> {
    const now = new Date().toISOString();
    const payload: AppUser = {
      ...user,
      updatedAt: now
    };

    if (user.id || user.uid) {
      await this.firebase.set(this.usersCollection, user.id || user.uid, payload);
    }
  }

  async deleteUser(uid: string): Promise<void> {
    await this.firebase.delete(this.usersCollection, uid);
  }

  private async loadOrCreateProfile(firebaseUser: User): Promise<AppUser> {
    const existing = await this.firebase.getById<AppUser>(this.usersCollection, firebaseUser.uid);

    if (existing) {
      return {
        ...existing,
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: existing.email || firebaseUser.email || ''
      };
    }

    const users = await this.getUsers();
    const now = new Date().toISOString();
    const profile: AppUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || firebaseUser.email || 'User',
      role: users.length === 0 ? 'admin' : 'user',
      active: true,
      createdAt: now,
      updatedAt: now
    };

    await this.firebase.set(this.usersCollection, firebaseUser.uid, profile);

    return {
      ...profile,
      id: firebaseUser.uid
    };
  }
}
