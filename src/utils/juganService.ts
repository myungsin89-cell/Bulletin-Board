import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const juganFirebaseConfig = {
  apiKey: "AIzaSyDgleymUs9LokXyLr47doYpykRopuUsWVg",
  authDomain: "jugan-61d45.firebaseapp.com",
  projectId: "jugan-61d45",
  storageBucket: "jugan-61d45.firebasestorage.app",
  messagingSenderId: "903937990755",
  appId: "1:903937990755:web:7239d3b710e0d950385856"
};

// Initialize secondary Firebase App instance for ju-gan
const appName = 'WeeklyPlanJuganApp';
let juganApp;
const existingApps = getApps();
const found = existingApps.find(a => a.name === appName);
if (found) {
  juganApp = found;
} else {
  juganApp = initializeApp(juganFirebaseConfig, appName);
}

export const juganDb = getFirestore(juganApp);

// Clean undefined values before writing to Firestore
function cleanObject(obj: any) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export interface TimetableData {
  [cellKey: string]: string; // e.g. "1-1": "국어", "1-2": "수학"
}

export interface BgColorData {
  [cellKey: string]: string; // e.g. "1-1": "#ecfdf5"
}

export const juganService = {
  // Fetch available rooms
  async getAvailableRooms(): Promise<string[]> {
    try {
      const snap = await getDocs(collection(juganDb, 'rooms'));
      const roomIds = snap.docs.map(d => d.id);
      return roomIds.length > 0 ? roomIds : ['4학년'];
    } catch (e) {
      console.warn('Failed to fetch rooms from juganDb:', e);
      return ['4학년'];
    }
  },

  // Load data for a specific room, week, semester, and class
  async loadWeekData(roomCode: string, weekNum: number, semester: number, classNum: string) {
    try {
      const collectionName = semester === 2 ? 'sem2_weeks' : 'weeks';
      const rRef = doc(juganDb, 'rooms', roomCode);
      const wRef = doc(juganDb, 'rooms', roomCode, collectionName, String(weekNum));
      const classRef = doc(juganDb, 'rooms', roomCode, collectionName, String(weekNum), 'classes', String(classNum));

      const [roomSnap, weekSnap, classSnap] = await Promise.all([
        getDoc(rRef),
        getDoc(wRef),
        getDoc(classRef)
      ]);

      const roomData = roomSnap.exists() ? roomSnap.data() : {};
      const weekData = weekSnap.exists() ? weekSnap.data() : {};
      const classData = classSnap.exists() ? classSnap.data() : {};

      return {
        roomData,
        weeklyMemo: weekData.weeklyMemo || '',
        targets: weekData.targets || {},
        timetable: (classData.timetable || {}) as TimetableData,
        bgColors: (classData.bgColors || {}) as BgColorData
      };
    } catch (e) {
      console.error('Failed to load jugan data:', e);
      return {
        roomData: {},
        weeklyMemo: '',
        targets: {},
        timetable: {},
        bgColors: {}
      };
    }
  },

  // Save class timetable & background colors
  async saveClassData(
    roomCode: string,
    weekNum: number,
    semester: number,
    classNum: string,
    timetable: TimetableData,
    bgColors: BgColorData,
    weeklyMemo?: string
  ) {
    const collectionName = semester === 2 ? 'sem2_weeks' : 'weeks';
    const rRef = doc(juganDb, 'rooms', roomCode);
    const wRef = doc(juganDb, 'rooms', roomCode, collectionName, String(weekNum));
    const classRef = doc(juganDb, 'rooms', roomCode, collectionName, String(weekNum), 'classes', String(classNum));

    // Ensure parent docs exist
    await setDoc(rRef, { lastSavedAt: new Date() }, { merge: true });
    await setDoc(wRef, { _exists: true, ...(weeklyMemo !== undefined ? { weeklyMemo } : {}) }, { merge: true });

    // Save class data
    await setDoc(classRef, cleanObject({
      timetable,
      bgColors
    }));

    return true;
  }
};
