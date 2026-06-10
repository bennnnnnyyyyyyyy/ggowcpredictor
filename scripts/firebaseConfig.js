
// Firebase configuration for Node.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAVBLnjdM4cV9vBwV27dl6bEc4ZqVjuFBw",
  authDomain: "ggowcpredictor.firebaseapp.com",
  projectId: "ggowcpredictor",
  storageBucket: "ggowcpredictor.firebasestorage.app",
  messagingSenderId: "126058028551",
  appId: "1:126058028551:web:e60b6e211c3e2e56e154a2",
  measurementId: "G-YQLEYQ386D"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default firebaseConfig;