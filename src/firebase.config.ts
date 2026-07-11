import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCADznRvZZ9RC-wHDbRlaI1HZ1M86PAgDA",
  authDomain: "saifcricketauction.firebaseapp.com",
  projectId: "saifcricketauction",
  storageBucket: "saifcricketauction.appspot.com",
  messagingSenderId: "365618757794",
  appId: "1:365618757794:web:67e6d9298ee18a91d397fb"
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const storage = getStorage(app);

