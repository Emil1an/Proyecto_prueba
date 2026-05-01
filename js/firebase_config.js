import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs,
  query, where, onSnapshot,
  serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4kfjNQ2O6mDl-ssA9iZdEzONmqz0Zhnk",
  authDomain: "parking-a076f.firebaseapp.com",
  projectId: "parking-a076f",
  storageBucket: "parking-a076f.firebasestorage.app",
  messagingSenderId: "355378065598",
  appId: "1:355378065598:web:e7fcd19170c58049eaaeef",
  measurementId: "G-5XHRZ8MJCX"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs,
  query, where, onSnapshot,
  serverTimestamp, orderBy, limit
};
