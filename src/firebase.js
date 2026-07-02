import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDDkIF2OL5llHhjpd4R-nBwqizlA5ls2ck",
  authDomain: "brainwar-93757.firebaseapp.com",
  databaseURL: "https://brainwar-93757-default-rtdb.firebaseio.com",
  projectId: "brainwar-93757",
  storageBucket: "brainwar-93757.firebasestorage.app",
  messagingSenderId: "1096785440559",
  appId: "1:1096785440559:web:ec9db8fe23599470fc7bda",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
window._fbDb = db;
