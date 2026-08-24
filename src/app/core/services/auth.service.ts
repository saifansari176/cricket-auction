import { Injectable } from '@angular/core';
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import {
  User,
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
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
      return this.completeSignIn(credential.user);
    });
  }

  async loginWithGoogle(): Promise<AppUser> {
    return this.loading.track(async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      return this.completeSignIn(credential.user);
    });
  }

  async sendPhoneOtp(phoneNumber: string, container: HTMLElement): Promise<ConfirmationResult> {
    const verifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });

    try {
      return await signInWithPhoneNumber(auth, phoneNumber, verifier);
    } catch (error) {
      verifier.clear();
      throw error;
    }
  }

  async loginWithPhoneOtp(confirmation: ConfirmationResult, otp: string): Promise<AppUser> {
    return this.loading.track(async () => {
      const credential = await confirmation.confirm(otp);
      return this.completeSignIn(credential.user);
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

  async createUser(email: string, password: string, displayName: string, role: AppUser['role'], active: boolean, teamLimit = 2, playerLimit = 10): Promise<void> {
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
      teamLimit,
      playerLimit,
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

  getUserLimits(user: AppUser | null = this.currentUser$.value): { teamLimit: number; playerLimit: number } {
    if (this.isAdmin(user)) return { teamLimit: Infinity, playerLimit: Infinity };
    const playerLimit = Number(user?.playerLimit ?? 10);
    return { teamLimit: Math.max(0, Number(user?.teamLimit ?? 2)), playerLimit: playerLimit === 0 ? Infinity : Math.max(0, playerLimit) };
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

  private async completeSignIn(firebaseUser: User): Promise<AppUser> {
    const appUser = await this.loadOrCreateProfile(firebaseUser);

    if (!appUser.active) {
      await signOut(auth);
      throw new Error('This user account is inactive.');
    }

    this.currentUser$.next(appUser);
    return appUser;
  }
}
