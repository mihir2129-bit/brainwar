// 1. Go to https://console.firebase.google.com -> Create a project (free)
// 2. In the project, click "Build" -> "Realtime Database" -> Create database -> start in TEST mode
// 3. Click the gear icon -> Project settings -> scroll to "Your apps" -> click the </> (web) icon
// 4. Register the app, copy the firebaseConfig object it gives you, and paste it below.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
