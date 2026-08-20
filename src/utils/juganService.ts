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

export interface SpecialistTeacher {
  subject?: string;
  name?: string;
  desc?: string;
  bg?: string;
  data?: { [day: string]: (string | null)[] }; // { "월": ["1", "2,7", null, ...], "화": [...] }
  hiddenWeeks?: number[]; // Weeks where this specialist is hidden (not shown)
  marks?: { [key: string]: string }; // Additional marker colors
}

const DAY_NAMES = ['월', '화', '수', '목', '금'];

// Convert Firestore ju-gan timetable structure ({ "월": ["국어", "수학", ...], ... }) to cell map ("1-1": "국어")
function parseJuGanTimetable(raw: any): TimetableData {
  if (!raw || typeof raw !== 'object') return {};
  const map: TimetableData = {};

  // Case 1: Already cell map format ("1-1": "국어")
  if (raw['1-1'] !== undefined || raw['2-1'] !== undefined) {
    return raw;
  }

  // Case 2: Ju-gan format ({ "월": ["국어", "수학"], ... })
  DAY_NAMES.forEach((dayName, dIdx) => {
    const dayId = dIdx + 1;
    const periodList = raw[dayName];
    if (Array.isArray(periodList)) {
      periodList.forEach((sub, pIdx) => {
        if (sub && typeof sub === 'string' && sub.trim()) {
          map[`${dayId}-${pIdx + 1}`] = sub.trim();
        }
      });
    } else if (periodList && typeof periodList === 'object') {
      Object.entries(periodList).forEach(([pIdx, sub]) => {
        if (sub && typeof sub === 'string' && sub.trim()) {
          map[`${dayId}-${Number(pIdx) + 1}`] = sub.trim();
        }
      });
    }
  });

  return map;
}

// Convert Firestore ju-gan bgColors structure ({ "월": ["#ecfdf5", ...], ... }) to cell map ("1-1": "#ecfdf5")
function parseJuGanBgColors(raw: any): BgColorData {
  if (!raw || typeof raw !== 'object') return {};
  const map: BgColorData = {};

  if (raw['1-1'] !== undefined || raw['2-1'] !== undefined) {
    return raw;
  }

  DAY_NAMES.forEach((dayName, dIdx) => {
    const dayId = dIdx + 1;
    const colorList = raw[dayName];
    if (Array.isArray(colorList)) {
      colorList.forEach((color, pIdx) => {
        if (color && typeof color === 'string' && color.trim()) {
          map[`${dayId}-${pIdx + 1}`] = color.trim();
        }
      });
    } else if (colorList && typeof colorList === 'object') {
      Object.entries(colorList).forEach(([pIdx, color]) => {
        if (color && typeof color === 'string' && color.trim()) {
          map[`${dayId}-${Number(pIdx) + 1}`] = color.trim();
        }
      });
    }
  });

  return map;
}

// Convert back to Ju-gan format for saving to Firestore so Ju-gan app reads it 100% identically
function serializeToJuGanFormat(map: { [key: string]: string }, maxPeriods: number = 6) {
  const result: { [day: string]: (string | null)[] } = {};
  DAY_NAMES.forEach((dayName, dIdx) => {
    const dayId = dIdx + 1;
    result[dayName] = [];
    for (let p = 1; p <= maxPeriods; p++) {
      const val = map[`${dayId}-${p}`] || null;
      result[dayName].push(val);
    }
  });
  return result;
}

export const juganService = {
  // Fetch available rooms from jugan-61d45 Firestore
  async getAvailableRooms(): Promise<string[]> {
    try {
      const snap = await getDocs(collection(juganDb, 'rooms'));
      const roomIds = snap.docs.map(d => d.id);
      return roomIds.length > 0 ? roomIds : ['이음초등학교4학년'];
    } catch (e) {
      console.warn('Failed to fetch rooms from juganDb:', e);
      return ['이음초등학교4학년'];
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

      const rawTimetable = classData.timetable || {};
      const rawBgColors = classData.bgColors || {};
      
      // Specialist priority: week-level overrides room-level when it exists and is non-empty
      const weekSpecialists = (weekData.specialists || []) as SpecialistTeacher[];
      const roomSpecialists = (roomData.specialists || []) as SpecialistTeacher[];
      const specialists = weekSpecialists.length > 0 ? weekSpecialists : roomSpecialists;
      
      const specialistCells = weekData.specialistCells || {};
      
      // Reference boards (used for specialist reference timetables display)
      const referenceBoards = (roomData.referenceBoards || []) as any[];

      return {
        roomData,
        weeklyMemo: weekData.weeklyMemo || '',
        targets: (weekData.targets || {}) as { [sub: string]: number },
        timetable: parseJuGanTimetable(rawTimetable),
        bgColors: parseJuGanBgColors(rawBgColors),
        specialists,
        specialistCells,
        referenceBoards,
        weekNum
      };
    } catch (e) {
      console.error('Failed to load jugan data:', e);
      return {
        roomData: {},
        weeklyMemo: '',
        targets: {},
        timetable: {},
        bgColors: {},
        specialists: [],
        specialistCells: {},
        referenceBoards: [],
        weekNum
      };
    }
  },

  // Load all weeks and classes for Validation & Hours Verification View
  async loadAllWeeksValidation(roomCode: string, semester: number) {
    try {
      const collectionName = semester === 2 ? 'sem2_weeks' : 'weeks';
      const rRef = doc(juganDb, 'rooms', roomCode);
      const roomSnap = await getDoc(rRef);
      const roomData = roomSnap.exists() ? roomSnap.data() : {};
      
      const config = roomData.config || {};
      const annualTargets = (config.annualTargets || {}) as { [sub: string]: number };
      const rawSubjects = config.subjects || [
        { name: '국어' }, { name: '수학' }, { name: '사회' }, { name: '과학' }, 
        { name: '체육' }, { name: '음악' }, { name: '미술' }, { name: '영어' }, { name: '도덕' }, { name: '창체' }
      ];

      const subjects = rawSubjects.map((s: any) => (typeof s === 'string' ? { name: s } : s));

      // Fetch all week docs
      const weeksRef = collection(juganDb, 'rooms', roomCode, collectionName);
      const weeksSnap = await getDocs(weeksRef);

      const weekTargets: { [week: number]: { [subject: string]: number } } = {};
      const classWeeklyHours: { [classNum: string]: { [week: number]: { [subject: string]: number } } } = {};

      for (const wDoc of weeksSnap.docs) {
        const wNum = parseInt(wDoc.id);
        if (isNaN(wNum)) continue;
        const wData = wDoc.data();
        weekTargets[wNum] = wData.targets || {};

        // Fetch classes for this week
        const classesRef = collection(juganDb, 'rooms', roomCode, collectionName, wDoc.id, 'classes');
        const classesSnap = await getDocs(classesRef);

        classesSnap.docs.forEach(cDoc => {
          const cNum = cDoc.id;
          if (!classWeeklyHours[cNum]) classWeeklyHours[cNum] = {};
          if (!classWeeklyHours[cNum][wNum]) classWeeklyHours[cNum][wNum] = {};

          const rawTimetable = cDoc.data().timetable || {};
          const timetableMap = parseJuGanTimetable(rawTimetable);

          Object.values(timetableMap).forEach((subName: any) => {
            if (typeof subName === 'string' && subName.trim()) {
              const name = subName.trim();
              classWeeklyHours[cNum][wNum][name] = (classWeeklyHours[cNum][wNum][name] || 0) + 1;
            }
          });
        });
      }

      return {
        subjects,
        annualTargets,
        weekTargets,
        classWeeklyHours
      };
    } catch (e) {
      console.error('Failed to load validation data:', e);
      return {
        subjects: [],
        annualTargets: {},
        weekTargets: {},
        classWeeklyHours: {}
      };
    }
  },

  // Save class timetable & background colors in Ju-gan standard format
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

    // Save class data serialized in standard Ju-gan format ({ "월": [...], ... })
    const serializedTimetable = serializeToJuGanFormat(timetable);
    const serializedBgColors = serializeToJuGanFormat(bgColors);

    await setDoc(classRef, cleanObject({
      timetable: serializedTimetable,
      bgColors: serializedBgColors
    }));

    return true;
  }
};
