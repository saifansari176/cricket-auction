import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCADznRvZZ9RC-wHDbRlaI1HZ1M86PAgDA",
  authDomain: "saifcricketauction.firebaseapp.com",
  projectId: "saifcricketauction",
  storageBucket: "saifcricketauction.appspot.com",
  messagingSenderId: "365618757794",
  appId: "1:365618757794:web:67e6d9298ee18a91d397fb",
  measurementId: "G-PGWEKXGD8C"
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

function supportsPersistentFirestoreCache(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return !!window.indexedDB && !!window.localStorage;
  } catch {
    // Some private-mode browsers and embedded mobile webviews deny storage.
    return false;
  }
}

// IndexedDB is Firestore's supported browser cache. It preserves Firestore
// value types, works offline, and synchronizes its cache across browser tabs.
// SSR and restricted mobile browsers safely use memory instead.
export const db = initializeFirestore(app, {
  localCache: supportsPersistentFirestoreCache()
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache()
});

export const storage = getStorage(app);

