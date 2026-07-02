# BrainWar — Setup & Deploy Guide

Ye ek real-time multiplayer quiz app hai (Kahoot/PanQuiz jaisi). Is guide mein step-by-step batayenge ki apne laptop pe kaise chalayein aur internet pe publish karke sabko link kaise bhejein.

## Step 1 — Node.js install karo
Agar pehle se nahi hai to https://nodejs.org se LTS version install karo.

## Step 2 — Project ko unzip karke folder mein jao
```
cd brainwar
npm install
```

## Step 3 — Firebase Realtime Database banao (free)
1. https://console.firebase.google.com par jao, Google account se login karo
2. "Add project" → naam do (e.g. brainwar) → continue → create
3. Left sidebar mein **Build → Realtime Database** → "Create Database" → koi bhi region choose karo → **Start in test mode** (testing ke liye, baad mein rules tighten kar sakte ho)
4. Gear icon (⚙) → **Project settings** → neeche scroll karke "Your apps" → `</>` (Web) icon par click karo
5. App ka naam do, register karo — ek `firebaseConfig` object milega jaisa neeche dikhaya gaya hai:
```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```
6. Ye poora object copy karke `src/firebase.js` file mein paste kar do (jo already wahan likha hai usko replace kar dena).

## Step 4 — Local test karo
```
npm run dev
```
Browser mein `http://localhost:5173` khulega. Ek tab mein "Create game" karo, doosre tab/phone (same wifi pe, apne laptop ka local IP use karke) se "Join game" karo aur dekho sync ho raha hai.

## Step 5 — Internet pe publish karo (Vercel — free)
1. https://vercel.com par GitHub se login karo
2. Apna project GitHub pe push karo (naya repo banao, code push karo)
3. Vercel mein "Add New Project" → apna repo select karo → Deploy
4. 1-2 minute mein ek public URL milega jaise `brainwar.vercel.app`
5. Ye URL kisi ko bhi bhejo — wo browser mein khol kar host ya player ban sakta hai, chahe wo kahin bhi ho

### Alternative: Netlify
Vercel jaisa hi free flow hai — netlify.com par GitHub connect karo, repo select karo, deploy.

## Important note on Firebase rules
Test mode 30 din baad expire ho jaata hai. Production ke liye Realtime Database → Rules tab mein jaake kuch aisa likho (basic open read/write, abuse se bachne ke liye baad mein tighten kar sakte ho):
```json
{
  "rules": {
    "games": {
      "$code": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

## File structure
```
brainwar/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx        ← saara app logic + UI yahan hai
    └── firebase.js     ← yahan apni Firebase keys daalni hain
```

Koi error aaye to error message copy karke bata dena, main fix kar dunga.
