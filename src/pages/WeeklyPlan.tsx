import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { juganService, TimetableData, BgColorData, SpecialistTeacher } from '../utils/juganService';
import { 
  Save, Copy, RefreshCw, 
  Check, Edit2, ShieldCheck, Building2, BarChart3, Lock, Unlock,
  Maximize2, X
} from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Robust Class Number Parser
 * Parses input strings such as "4반", "4 반", "4", "4반 송명신", "4 반 송명신", "이음초 4학년 4반" to "4"
 */
export function parseClassNum(displayName: string | null | undefined): string {
  if (!displayName) return '1';
  
  const trimmed = displayName.trim();
  
  // 1. Look for number immediately before '반' (e.g. "4반", "4 반", "4학년 4반")
  const classBanMatch = trimmed.match(/(\d+)\s*반/);
  if (classBanMatch) {
    return classBanMatch[1];
  }

  // 2. Look for leading digits (e.g. "4", "4 송명신")
  const leadingNumMatch = trimmed.match(/^(\d+)/);
  if (leadingNumMatch) {
    return leadingNumMatch[1];
  }

  // 3. Fallback: find any digit in the string
  const anyDigitMatch = trimmed.match(/(\d+)/);
  if (anyDigitMatch) {
    return anyDigitMatch[1];
  }

  // Default fallback for non-homeroom roles
  return '1';
}

/**
 * Check if a cell text specifically contains the target class number (e.g. "4" matches "4반", "4, 5", but NOT "14반")
 */
function isExactClassMatch(cellVal: string | null | undefined, targetClass: string): boolean {
  if (!cellVal) return false;
  const target = String(targetClass).trim();
  // Split tokens by comma, space, slash, etc. and strip non-digits
  const tokens = String(cellVal).split(/[,\s/]+/).map(t => t.replace(/[^0-9]/g, '')).filter(Boolean);
  return tokens.includes(target);
}

const DAYS = [
  { id: 1, label: '월' },
  { id: 2, label: '화' },
  { id: 3, label: '수' },
  { id: 4, label: '목' },
  { id: 5, label: '금' }
];

const PERIODS = [1, 2, 3, 4, 5, 6];

const DEFAULT_SUBJECTS = [
  '국어', '수학', '사회', '과학', '체육', '체육(담)', '음악', '미술', '영어', '도덕', '창체'
];

/**
 * Format week date range e.g. "3월 2일(월) ~ 3월 6일(금)" or "8월 17일(월) ~ 8월 21일(금)"
 */
function getWeekDateRange(week: number, semester: number, customAnchor?: { week: number; startDate: string } | null): string {
  const currentYear = new Date().getFullYear();
  let base: Date;
  let anchorWeek = 1;

  if (semester === 1) {
    // 1학기는 항상 3월 2일 기준 (2026-03-02는 월요일)
    base = new Date(`${currentYear}-03-02T00:00:00`);
    anchorWeek = 1;
  } else {
    // 2학기는 8월 기준 (설정된 앵커가 8월 이후인 경우 사용)
    if (customAnchor && customAnchor.startDate) {
      const anchorDate = new Date(customAnchor.startDate + 'T00:00:00');
      if (anchorDate.getMonth() >= 6) { // 7월 이후
        base = anchorDate;
        anchorWeek = customAnchor.week || 1;
      } else {
        base = new Date(`${currentYear}-08-17T00:00:00`);
      }
    } else {
      base = new Date(`${currentYear}-08-17T00:00:00`);
    }
  }

  // 월요일로 보정
  const dayOfWeek = base.getDay(); // 0: 일요일, 1: 월요일
  const mondayOffset = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
  base.setDate(base.getDate() + mondayOffset);

  const diff = (week - anchorWeek) * 7;
  const mon = new Date(base);
  mon.setDate(base.getDate() + diff);

  const days = ['월', '화', '수', '목', '금'];
  const getFmt = (dOffset: number) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + dOffset);
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${days[dOffset]})`;
  };

  return `${getFmt(0)} ~ ${getFmt(4)}`;
}

export function WeeklyPlan() {
  const { profile } = useAuth();

  // Board SubTitle for auto-matching room name (e.g. "이음초등학교 4학년")
  const boardSubTitle = useMemo(() => {
    return localStorage.getItem('sb_sub_title') || '';
  }, []);

  // Robust class number parsing
  const detectedClassNum = useMemo(() => {
    return parseClassNum(profile?.displayName);
  }, [profile?.displayName]);

  // Default to current semester (Aug~Dec is Semester 2, Jan~July is Semester 1)
  const defaultSemester = useMemo(() => {
    const m = new Date().getMonth() + 1;
    return m >= 8 ? 2 : 1;
  }, []);

  const [availableRooms, setAvailableRooms] = useState<string[]>(['이음초등학교4학년']);
  const [roomCode, setRoomCode] = useState<string>('이음초등학교4학년');
  const [semester, setSemester] = useState<number>(defaultSemester);
  const [weekNum, setWeekNum] = useState<number>(1);
  const [classNum, setClassNum] = useState<string>(detectedClassNum);

  // Timetable, Targets, Memo & Specialist State
  const [roomData, setRoomData] = useState<any>({});
  const [timetable, setTimetable] = useState<TimetableData>({});
  const [bgColors, setBgColors] = useState<BgColorData>({});
  const [targets, setTargets] = useState<{ [sub: string]: number }>({});
  const [weeklyMemo, setWeeklyMemo] = useState<string>('');
  const [specialists, setSpecialists] = useState<SpecialistTeacher[]>([]);
  const [specialistCells, setSpecialistCells] = useState<any>({});
  const [referenceBoards, setReferenceBoards] = useState<any[]>([]);
  const [weekAnchor, setWeekAnchor] = useState<{ week: number; startDate: string } | null>(null);

  // Track user-unlocked cells for the current session
  const [unlockedCells, setUnlockedCells] = useState<Set<string>>(new Set());

  // Unlock Confirmation Modal
  const [confirmUnlockCell, setConfirmUnlockCell] = useState<{ dayId: number; period: number } | null>(null);

  // Large Weekly Memo Modal State
  const [isMemoModalOpen, setIsMemoModalOpen] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Grid cell input refs for arrow key navigation
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Load available rooms on mount and perform auto-matching with boardSubTitle
  useEffect(() => {
    juganService.getAvailableRooms().then(rooms => {
      setAvailableRooms(rooms);
      
      if (boardSubTitle) {
        const cleanSub = boardSubTitle.replace(/\s+/g, '').toLowerCase();
        const exact = rooms.find(r => r.replace(/\s+/g, '').toLowerCase() === cleanSub);
        if (exact) {
          setRoomCode(exact);
          return;
        }
        const partial = rooms.find(r => {
          const cleanR = r.replace(/\s+/g, '').toLowerCase();
          return cleanSub.includes(cleanR) || cleanR.includes(cleanSub);
        });
        if (partial) {
          setRoomCode(partial);
          return;
        }
      }

      if (rooms.length > 0 && !rooms.includes(roomCode)) {
        setRoomCode(rooms[0]);
      }
    });
  }, [boardSubTitle]);

  // Update classNum when profile changes
  useEffect(() => {
    setClassNum(detectedClassNum);
  }, [detectedClassNum]);

  // Load week data whenever roomCode, weekNum, semester, or classNum changes
  useEffect(() => {
    loadData();
  }, [roomCode, weekNum, semester, classNum]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await juganService.loadWeekData(roomCode, weekNum, semester, classNum);
    setRoomData(data.roomData || {});
    setTimetable(data.timetable || {});
    setBgColors(data.bgColors || {});
    setTargets(data.targets || {});
    setWeeklyMemo(data.weeklyMemo || '');
    setSpecialists(data.specialists || []);
    setSpecialistCells(data.specialistCells || {});
    setReferenceBoards(data.referenceBoards || []);
    if (data.roomData?.config?.weekAnchor) {
      setWeekAnchor(data.roomData.config.weekAnchor);
    }
    setIsLoading(false);
  };

  // Dynamically resolve subject list from roomData.config.subjects and targets (filter out empty/dash)
  const activeSubjects = useMemo(() => {
    const cfgSubjects = roomData?.config?.subjects;
    let list: string[] = [];
    if (Array.isArray(cfgSubjects) && cfgSubjects.length > 0) {
      list = cfgSubjects.map((s: any) => typeof s === 'string' ? s : s.name);
    } else {
      const targetKeys = Object.keys(targets);
      if (targetKeys.length > 0) {
        list = targetKeys;
      } else {
        list = DEFAULT_SUBJECTS;
      }
    }
    return list.filter(s => s && s.trim() && s !== '-' && s !== '—');
  }, [roomData, targets]);

  // Count assigned hours per subject for active timetable (excluding '-' dashes)
  const assignedHoursPerSubject = useMemo(() => {
    const counts: { [subName: string]: number } = {};
    Object.values(timetable).forEach((sub: any) => {
      if (typeof sub === 'string' && sub.trim()) {
        const name = sub.trim();
        // Ignore hyphens, dashes, empty indicators
        if (name !== '-' && name !== '—' && name !== 'X' && name !== 'x') {
          counts[name] = (counts[name] || 0) + 1;
        }
      }
    });
    return counts;
  }, [timetable]);

  // Total weekly filled hours vs total weekly target hours (excluding dashes)
  const totalWeeklyFilled = useMemo(() => {
    return Object.entries(assignedHoursPerSubject)
      .filter(([name]) => name !== '-' && name !== '—')
      .reduce((a: number, [_, b]: [string, number]) => a + b, 0);
  }, [assignedHoursPerSubject]);

  const totalWeeklyTarget = useMemo(() => {
    return activeSubjects.reduce((a: number, s: string) => a + (Number(targets[s]) || 0), 0);
  }, [activeSubjects, targets]);

  // Find matching specialist for a cell (exact class match, respecting hiddenWeeks)
  const getSpForCell = (c: string, d: string, pIdx: number) => {
    return specialists.find(sp => {
      // Skip specialists hidden for this week
      if (sp.hiddenWeeks && sp.hiddenWeeks.includes(weekNum)) return false;
      if (!sp.data || !sp.data[d]) return false;
      const cellVal = sp.data[d][pIdx];
      if (!cellVal) return false; // null or empty string
      return isExactClassMatch(String(cellVal), c);
    }) || null;
  };

  // Resolve cell background color & specialist lock info (100% Ju-gan exact logic)
  const getCellColorAndLock = (dayId: number, period: number) => {
    const key = `${dayId}-${period}`;
    const customBg = bgColors[key];
    const dayName = DAYS.find(d => d.id === dayId)?.label || '';
    const cellVal = timetable[key] || '';
    const cStr = String(classNum).trim();
    const pIdx = period - 1;
    
    // In Ju-gan app: isSpLocked is true if this cell is registered in specialistCells[c][d][p]
    const isSpLocked = !!(specialistCells?.[cStr]?.[dayName]?.[pIdx]);
    
    let finalBg = '';
    if (customBg) {
      finalBg = customBg;
    } else if (cellVal && isSpLocked) {
      const sp = getSpForCell(cStr, dayName, pIdx);
      if (sp && sp.bg) {
        finalBg = sp.bg;
      }
    }

    const isLocked = (!!customBg || isSpLocked) && !unlockedCells.has(key);

    return {
      bg: finalBg,
      isLocked,
      isSpLocked
    };
  };

  // Handle cell click / focus protection
  const handleCellFocus = (dayId: number, period: number) => {
    const key = `${dayId}-${period}`;
    const cellInfo = getCellColorAndLock(dayId, period);
    if (cellInfo.isLocked) {
      inputRefs.current[key]?.blur();
      setConfirmUnlockCell({ dayId, period });
    }
  };

  // Confirm Unlock
  const handleConfirmUnlock = () => {
    if (!confirmUnlockCell) return;
    const key = `${confirmUnlockCell.dayId}-${confirmUnlockCell.period}`;
    setUnlockedCells(prev => new Set(prev).add(key));
    setConfirmUnlockCell(null);
    setTimeout(() => {
      const input = inputRefs.current[key];
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  };

  // Handle direct cell text change
  const handleCellChange = (dayId: number, period: number, value: string) => {
    const key = `${dayId}-${period}`;
    setTimetable(prev => {
      const next = { ...prev };
      if (value.trim()) {
        next[key] = value.trim();
      } else {
        delete next[key];
      }
      return next;
    });
  };

  // Keyboard navigation handler (ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dayId: number, period: number) => {
    let nextDay = dayId;
    let nextPeriod = period;

    if (e.key === 'ArrowUp') {
      if (period > 1) nextPeriod = period - 1;
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      if (period < PERIODS.length) nextPeriod = period + 1;
    } else if (e.key === 'ArrowLeft') {
      if (dayId > 1) nextDay = dayId - 1;
    } else if (e.key === 'ArrowRight') {
      if (dayId < DAYS.length) nextDay = dayId + 1;
    } else {
      return; // Regular typing key
    }

    e.preventDefault();
    const nextKey = `${nextDay}-${nextPeriod}`;
    const nextInput = inputRefs.current[nextKey];
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  // Copy timetable table to clipboard (HTML & Text format)
  const handleCopyTable = async () => {
    const tdS = 'border:1px solid #000000;padding:4px 14px;text-align:center;font-size:10pt;background:#ffffff;';
    const thS = 'border:1px solid #000000;padding:4px 14px;text-align:center;font-size:10pt;background:#f3f4f6;font-weight:bold;color:#000000;';
    const hdS = 'border:1px solid #000000;padding:6px 8px;text-align:center;font-size:11pt;font-weight:bold;background:#ffffff;color:#000000;';
    const pdS = 'border:1px solid #000000;padding:4px 8px;text-align:center;font-size:9pt;color:#666;background:#f3f4f6;';

    let t = `<table align="center" border="1" style="border-collapse:collapse;width:auto;min-width:320px;">`;
    t += `<tr><th colspan="${DAYS.length + 1}" style="${hdS}">${classNum}반 시간표 (${weekNum}주차)</th></tr>`;
    t += `<tr><th style="${thS}">교시</th>${DAYS.map(d => `<th style="${thS}">${d.label}</th>`).join('')}</tr>`;
    for (const period of PERIODS) {
      t += `<tr><td style="${pdS}">${period}</td>`;
      DAYS.forEach(day => {
        const sub = timetable[`${day.id}-${period}`] || '';
        const cellInfo = getCellColorAndLock(day.id, period);
        const bgStyle = cellInfo.bg ? `background:${cellInfo.bg};` : '';
        t += `<td style="${tdS}${bgStyle}">${sub}</td>`;
      });
      t += `</tr>`;
    }
    t += `</table>`;

    try {
      const blobHtml = new Blob([t], { type: 'text/html' });
      const blobText = new Blob([
        `${classNum}반 시간표 (${weekNum}주차)\n` +
        `교시\t` + DAYS.map(d => d.label).join('\t') + '\n' +
        PERIODS.map(p => `${p}\t` + DAYS.map(d => timetable[`${d.id}-${p}`] || '').join('\t')).join('\n')
      ], { type: 'text/plain' });

      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      });
      await navigator.clipboard.write([item]);
      setSaveToast('📋 시간표가 복사되었습니다! (한글/Word/Excel에 붙여넣기 가능)');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (e) {
      console.warn('ClipboardItem API fallback:', e);
      navigator.clipboard.writeText(
        `${classNum}반 시간표 (${weekNum}주차)\n` +
        `교시\t` + DAYS.map(d => d.label).join('\t') + '\n' +
        PERIODS.map(p => `${p}\t` + DAYS.map(d => timetable[`${d.id}-${p}`] || '').join('\t')).join('\n')
      );
      setSaveToast('📋 시간표 텍스트가 클립보드에 복사되었습니다.');
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  // Save to Firestore
  const handleSaveServer = async () => {
    setIsSaving(true);
    try {
      await juganService.saveClassData(
        roomCode,
        weekNum,
        semester,
        classNum,
        timetable,
        bgColors,
        weeklyMemo
      );
      setSaveToast(`✅ ${classNum}반 시간표가 [주간학습 앱]에 성공적으로 저장되었습니다!`);
      setTimeout(() => setSaveToast(null), 3500);
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다. 파이어베이스 연동 상태를 확인하세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const weekDateString = useMemo(() => {
    return getWeekDateRange(weekNum, semester, weekAnchor);
  }, [weekNum, semester, weekAnchor]);

  return (
    <div className="space-y-4 font-sans max-w-[1440px] mx-auto pb-20">
      {/* ── 1. Top Control Bar (School/Room, Semester, Class & Week Selector + Date Range) ── */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        {/* Left: Week Navigation Controls & Date Range */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setWeekNum(prev => Math.max(1, prev - 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[16px] transition-colors"
          >
            &lt;
          </button>
          
          <div className="flex items-center gap-2">
            <h2 className="text-[19px] font-extrabold text-[#0f172a]">
              {weekNum}주차 시간표
            </h2>
            <span className="text-[13px] font-bold text-[#64748b] bg-[#f8fafc] px-3 py-1 rounded-xl border border-[#e2e8f0]">
              {weekDateString}
            </span>
          </div>

          <button
            onClick={() => setWeekNum(prev => Math.min(21, prev + 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[16px] transition-colors"
          >
            &gt;
          </button>
        </div>

        {/* Right: Room (이음초등학교4학년), Semester Switcher, Class Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Room / School Selector */}
          <div className="flex items-center gap-1.5 bg-[#f8fafc] px-3 py-1.5 rounded-xl border border-[#e2e8f0] text-[13px]">
            <Building2 className="w-3.5 h-3.5 text-[#10b981]" />
            <select
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="bg-transparent font-bold text-[#0f172a] outline-none cursor-pointer"
            >
              {availableRooms.map(r => (
                <option key={r} value={r}>🏫 {r}</option>
              ))}
            </select>
          </div>

          {/* Semester Switcher */}
          <div className="flex bg-[#f1f5f9] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSemester(1)}
              className={cn(
                "px-3 py-1 rounded-lg text-[12.5px] font-bold transition-all",
                semester === 1 ? "bg-white text-[#0f172a] shadow-2xs" : "text-[#64748b]"
              )}
            >
              1학기
            </button>
            <button
              type="button"
              onClick={() => setSemester(2)}
              className={cn(
                "px-3 py-1 rounded-lg text-[12.5px] font-bold transition-all",
                semester === 2 ? "bg-white text-[#0f172a] shadow-2xs" : "text-[#64748b]"
              )}
            >
              2학기
            </button>
          </div>

          {/* Class Number Selector with Auto Match */}
          <div className="flex items-center gap-1 bg-[#ecfdf5] px-3 py-1.5 rounded-xl border border-[#a7f3d0] text-[13px]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
            <select
              value={classNum}
              onChange={(e) => setClassNum(e.target.value)}
              className="bg-transparent font-bold text-[#047857] outline-none cursor-pointer"
            >
              {Array.from({ length: 15 }, (_, i) => String(i + 1)).map(c => (
                <option key={c} value={c}>
                  {c}반 {c === detectedClassNum ? '⭐' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Toast Notification Alert */}
      {saveToast && (
        <div className="p-3.5 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl text-[#047857] text-[14px] font-bold flex items-center gap-2 shadow-2xs animate-fade-in">
          <Check className="w-5 h-5 text-[#10b981] shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* ── 2. TOP GLOBAL TARGET HOURS BAR (Clean, Dynamic Subjects, Centered, Read-Only Display) ── */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs overflow-x-auto">
        <table className="w-full text-center text-[12.5px] border-collapse border border-[#e2e8f0] rounded-xl overflow-hidden">
          <thead>
            <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
              <th className="p-2.5 w-24 bg-[#f1f5f9] border-r border-[#e2e8f0]">목표 차시</th>
              {activeSubjects.map(s => (
                <th key={s} className="p-2.5 border-r border-[#e2e8f0] last:border-r-0 min-w-[55px] text-center">
                  {s}
                </th>
              ))}
              <th className="p-2.5 bg-[#ecfdf5] text-[#047857] font-extrabold w-16 border-l border-[#a7f3d0] text-center">
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2.5 font-bold text-[#334155] bg-[#f8fafc] border-r border-[#e2e8f0]">
                이번 주 목표
              </td>
              {activeSubjects.map(subName => {
                const val = targets[subName] || 0;
                return (
                  <td key={subName} className="p-2 border-r border-[#e2e8f0] text-center">
                    <span className="font-extrabold text-[13.5px] text-[#0f172a]">
                      {val}
                    </span>
                  </td>
                );
              })}
              <td className="p-2.5 font-extrabold text-[#047857] bg-[#ecfdf5]/50 border-l border-[#a7f3d0] font-mono text-[14px] text-center">
                {totalWeeklyTarget}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 3. MAIN TIMETABLE & SIDE-BY-SIDE MATCHED HEIGHT VERIFICATION CARD ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-4 items-stretch">
        {/* LEFT: Main Timetable Card (FULL VISIBILITY, NO INNER SCROLLBAR) */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            {/* Header: Class Name + [복사], [저장] Buttons */}
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3 mb-4">
              <h3 className="text-[17px] font-extrabold text-[#0f172a] flex items-center gap-2">
                <span className="text-[#10b981]">{classNum}반</span>
                <span>시간표</span>
              </h3>

              {/* Action Buttons: [복사], [저장] directly above table */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTable}
                  title="표를 복사해 한글/Word/Excel에 붙여넣기"
                  className="px-3 py-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 border border-[#e2e8f0]"
                >
                  <Copy className="w-3.5 h-3.5 text-[#64748b]" />
                  <span>복사</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveServer}
                  disabled={isSaving || isLoading}
                  className="px-4 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>저장</span>
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#8b95a1]">
                <RefreshCw className="w-8 h-8 animate-spin text-[#10b981]" />
                <span className="text-[14px] font-bold">주간학습 DB에서 반별 시간표를 불러오는 중...</span>
              </div>
            ) : (
              <div className="w-full overflow-visible">
                <table className="w-full border-collapse text-center text-[14px] border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                      <th className="p-3 w-16 border-r border-[#e2e8f0]">교시</th>
                      {DAYS.map(day => (
                        <th key={day.id} className="p-3 border-r border-[#e2e8f0] last:border-r-0">
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(period => (
                      <tr key={period} className="border-b border-[#e2e8f0] last:border-b-0 hover:bg-[#f8fafc]/40 transition-colors">
                        <td className="p-2.5 font-bold text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0] select-none">
                          {period}
                        </td>
                        {DAYS.map(day => {
                          const key = `${day.id}-${period}`;
                          const subject = timetable[key] || '';
                          const cellInfo = getCellColorAndLock(day.id, period);

                          return (
                            <td
                              key={key}
                              style={{ backgroundColor: cellInfo.bg || undefined }}
                              className={cn(
                                "p-1 border-r border-[#e2e8f0] last:border-r-0 h-14 relative transition-colors",
                                cellInfo.bg ? "font-bold" : ""
                              )}
                            >
                              <div className="w-full h-full relative flex items-center justify-center">
                                <input
                                  ref={el => { inputRefs.current[key] = el; }}
                                  type="text"
                                  value={subject}
                                  readOnly={cellInfo.isLocked}
                                  onFocus={() => handleCellFocus(day.id, period)}
                                  onChange={(e) => handleCellChange(day.id, period, e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(e, day.id, period)}
                                  placeholder="—"
                                  className={cn(
                                    "w-full h-full text-center text-[14px] bg-transparent outline-none rounded-lg transition-all",
                                    cellInfo.isLocked ? "cursor-pointer select-none font-bold" : "focus:bg-white focus:ring-2 focus:ring-[#10b981] font-bold text-[#0f172a]"
                                  )}
                                />
                                {cellInfo.isLocked && (
                                  <Lock className="w-3 h-3 text-[#64748b] absolute right-1.5 top-1.5 opacity-60 pointer-events-none" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: 📊 차시 확인 (SPACIOUS ROWS & PERFECT HEIGHT MATCH) */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-5 shadow-xs flex flex-col justify-between">
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3 mb-3">
              <h3 className="text-[16px] font-extrabold text-[#0f172a] flex items-center gap-1.5">
                <BarChart3 className="w-4.5 h-4.5 text-[#10b981]" />
                <span>차시 확인 [{classNum}반]</span>
              </h3>
              <span className="text-[11.5px] font-bold text-[#64748b] bg-[#f1f5f9] px-2.5 py-1 rounded-md">
                배정 / 목표
              </span>
            </div>

            {/* 2-Column Subject Verification Table with Spacious Rows */}
            <div className="overflow-hidden border border-[#e2e8f0] rounded-xl flex-1 flex flex-col justify-between">
              <table className="w-full text-[13px] text-center border-collapse flex-1">
                <thead>
                  <tr className="bg-[#f8fafc] font-bold text-[#475569] border-b border-[#e2e8f0] h-9">
                    <th className="p-2 border-r border-[#e2e8f0]">과목</th>
                    <th className="p-2 border-r border-[#e2e8f0]">배정/목표</th>
                    <th className="p-2 border-r border-[#e2e8f0]">과목</th>
                    <th className="p-2">배정/목표</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(activeSubjects.length / 2) }).map((_, idx) => {
                    const s1 = activeSubjects[idx * 2];
                    const s2 = activeSubjects[idx * 2 + 1];

                    const f1 = assignedHoursPerSubject[s1] || 0;
                    const t1 = Number(targets[s1]) || 0;
                    const isOk1 = t1 > 0 ? f1 === t1 : true;
                    const isOver1 = t1 > 0 && f1 > t1;

                    const f2 = s2 ? (assignedHoursPerSubject[s2] || 0) : 0;
                    const t2 = s2 ? (Number(targets[s2]) || 0) : 0;
                    const isOk2 = t2 > 0 ? f2 === t2 : true;
                    const isOver2 = t2 > 0 && f2 > t2;

                    return (
                      <tr key={idx} className="border-b border-[#f1f5f9] last:border-b-0 h-10.5">
                        {/* Subject 1 */}
                        <td className="p-1.5 font-bold text-[#475569] bg-[#f8fafc]/60 border-r border-[#e2e8f0] text-center">
                          {s1}
                        </td>
                        <td className={cn(
                          "p-1.5 font-mono font-bold border-r border-[#e2e8f0] text-center",
                          t1 > 0 && isOk1 ? "bg-[#ecfdf5] text-[#047857]" :
                          t1 > 0 && isOver1 ? "bg-[#fff1f2] text-[#be123c]" :
                          t1 > 0 && !isOk1 ? "bg-[#fffbeb] text-[#b45309]" : "text-[#94a3b8]"
                        )}>
                          {f1}/{t1}
                        </td>

                        {/* Subject 2 */}
                        {s2 ? (
                          <>
                            <td className="p-1.5 font-bold text-[#475569] bg-[#f8fafc]/60 border-r border-[#e2e8f0] text-center">
                              {s2}
                            </td>
                            <td className={cn(
                              "p-1.5 font-mono font-bold text-center",
                              t2 > 0 && isOk2 ? "bg-[#ecfdf5] text-[#047857]" :
                              t2 > 0 && isOver2 ? "bg-[#fff1f2] text-[#be123c]" :
                              t2 > 0 && !isOk2 ? "bg-[#fffbeb] text-[#b45309]" : "text-[#94a3b8]"
                            )}>
                              {f2}/{t2}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-1.5 border-r border-[#e2e8f0]" />
                            <td className="p-1.5" />
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* Total Weekly Sum Row */}
                  <tr className="bg-[#f8fafc] font-bold border-t border-[#e2e8f0] h-11">
                    <td colSpan={2} className="p-2 text-center text-[#0f172a] border-r border-[#e2e8f0]">
                      주간 총계
                    </td>
                    <td colSpan={2} className={cn(
                      "p-2 font-mono font-extrabold text-[14px] text-center",
                      totalWeeklyTarget > 0 && totalWeeklyFilled === totalWeeklyTarget ? "text-[#047857]" : "text-[#b45309]"
                    )}>
                      {totalWeeklyFilled} / {totalWeeklyTarget} 차시
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. FULL WIDTH BELOW: Expanded Weekly Memo Section & Specialist Timetables ── */}
      <div className="space-y-4">
        {/* Weekly Memo Section - Expanded for comfortable writing and reading */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-3.5">
          <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3 flex-wrap gap-2">
            <h3 className="text-[16px] font-bold text-[#0f172a] flex items-center gap-2">
              <Edit2 className="w-4.5 h-4.5 text-[#10b981]" />
              <span>{weekNum}주차 [{classNum}반 전달사항 및 학급 메모]</span>
            </h3>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMemoModalOpen(true)}
                className="px-3.5 py-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] font-bold rounded-xl text-[12.5px] transition-all flex items-center gap-1.5 border border-[#e2e8f0] shadow-2xs"
                title="전달사항 넓은 모달 창으로 크게 보기 및 편집"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#64748b]" />
                <span>크게 보기</span>
              </button>
              <span className="text-[12px] text-[#64748b] hidden sm:inline">
                작성 후 아래 [시간표 & 메모 저장] 버튼을 누르면 저장됩니다.
              </span>
            </div>
          </div>

          <textarea
            value={weeklyMemo}
            onChange={(e) => setWeeklyMemo(e.target.value)}
            placeholder="이번 주 학급 전달사항, 준비물, 행사 안내, 주의사항 등을 자유롭고 자세하게 작성하세요..."
            className="w-full min-h-[140px] p-4 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-xl text-[14px] text-[#0f172a] outline-none transition-colors leading-relaxed resize-y font-sans"
          />

          <div className="flex justify-between items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsMemoModalOpen(true)}
              className="px-4 py-2 bg-[#f8fafc] hover:bg-[#f1f5f9] text-[#475569] font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 border border-[#e2e8f0]"
            >
              <Maximize2 className="w-4 h-4 text-[#64748b]" />
              <span>넓은 창으로 크게 보기</span>
            </button>

            <button
              onClick={handleSaveServer}
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-4 h-4" />
              <span>시간표 & 메모 저장</span>
            </button>
          </div>
        </div>

        {/* 🏫 SCROLL DOWN SECTION: {classNum}반 배정 전담시간표 */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3">
            <div>
              <h3 className="text-[16px] font-bold text-[#0f172a] flex items-center gap-2">
                <span>🏫 {classNum}반 배정 전담시간표</span>
              </h3>
              <p className="text-[12px] text-[#64748b] mt-0.5">
                전담 선생님 시간표 중 {classNum}반 수업이 있는 시간표를 확인하실 수 있습니다.
              </p>
            </div>
            <span className="text-[12px] bg-[#ecfdf5] text-[#047857] font-bold px-3 py-1 rounded-full border border-[#a7f3d0]">
              {classNum}반 수업 강조됨
            </span>
          </div>

          {(() => {
            // Filter specialists: exclude hidden for this week, only include those with class assignments
            const visibleSpecialists = specialists.filter(sp => {
              if (sp.hiddenWeeks && sp.hiddenWeeks.includes(weekNum)) return false;
              if (!sp.data) return false;
              // Check if this specialist has at least one assignment for our class
              return DAYS.some(d => {
                const dayArr = sp.data?.[d.label] || [];
                return dayArr.some(val => val && isExactClassMatch(String(val), classNum));
              });
            });

            if (visibleSpecialists.length === 0) {
              return (
                <div className="p-8 text-center bg-[#f8fafc] rounded-xl border border-[#e2e8f0] text-[#64748b] text-[13.5px]">
                  <span>이번 주에 {classNum}반에 배정된 전담 시간표가 없습니다.</span>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleSpecialists.map((sp, sIdx) => {
                  const spName = sp.subject || sp.name || `전담 ${sIdx + 1}`;
                  const spDesc = sp.desc || '';
                  const spBg = sp.bg || '#f8fafc';

                  return (
                    <div key={sIdx} className="border border-[#e2e8f0] rounded-xl overflow-hidden bg-white shadow-2xs">
                      <div
                        style={{ backgroundColor: spBg }}
                        className="px-3.5 py-2.5 border-b border-[#e2e8f0] flex justify-between items-center"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[14px] text-[#0f172a]">{spName}</span>
                          {spDesc && (
                            <span className="text-[12px] text-[#64748b] font-medium border-l border-[#cbd5e1] pl-2">
                              {spDesc}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-[#047857] bg-white/80 px-2 py-0.5 rounded-md border border-[#a7f3d0]">
                          전담 시간표
                        </span>
                      </div>

                      <table className="w-full text-center text-[12px] border-collapse table-fixed">
                        <thead>
                          <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                            <th className="p-1.5 w-10 border-r border-[#e2e8f0]">교시</th>
                            {DAYS.map(d => (
                              <th key={d.id} className="p-1.5 border-r border-[#e2e8f0] last:border-r-0">
                                {d.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PERIODS.map(p => (
                            <tr key={p} className="border-b border-[#f1f5f9] last:border-b-0 h-9">
                              <td className="p-1.5 font-bold text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0] select-none">
                                {p}
                              </td>
                              {DAYS.map(d => {
                                const dayValList = sp.data?.[d.label] || [];
                                const rawVal = dayValList[p - 1];
                                const cellVal = (rawVal && String(rawVal).trim()) ? String(rawVal).trim() : '';
                                
                                // Tokenize classes in this cell
                                const allTokens = cellVal ? String(cellVal).split(/[,\s/]+/).map(t => t.replace(/[^0-9]/g, '')).filter(Boolean) : [];
                                const isMyClass = cellVal ? isExactClassMatch(cellVal, classNum) : false;
                                const isMultiClass = isMyClass && allTokens.length > 1;
                                const otherClassesCount = allTokens.length - 1;

                                if (isMyClass) {
                                  if (isMultiClass) {
                                    // Multi-class (합반): Purple distinct color with badge & hover tooltip
                                    return (
                                      <td
                                        key={d.id}
                                        title={`[합반 수업] 참여 학급: ${allTokens.map(t => t + '반').join(', ')} (총 ${allTokens.length}개 반)`}
                                        className="p-1 border-r border-[#f1f5f9] last:border-r-0 font-extrabold bg-[#ede9fe] text-[#6d28d9] border-2 border-[#8b5cf6] shadow-2xs cursor-help transition-transform hover:scale-[1.03]"
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          <span>{classNum}반</span>
                                          <span className="text-[10px] px-1 py-0.2 rounded bg-[#8b5cf6]/20 text-[#5b21b6] font-bold">
                                            +{otherClassesCount}
                                          </span>
                                        </div>
                                      </td>
                                    );
                                  } else {
                                    // Single class: Emerald Green
                                    return (
                                      <td
                                        key={d.id}
                                        title={`${classNum}반 단독 전담 수업`}
                                        className="p-1 border-r border-[#f1f5f9] last:border-r-0 font-extrabold bg-[#ecfdf5] text-[#047857] border-2 border-[#10b981] shadow-2xs cursor-default"
                                      >
                                        <span>{classNum}반</span>
                                      </td>
                                    );
                                  }
                                }

                                // Not my class: Show clean '-' with hover info
                                return (
                                  <td
                                    key={d.id}
                                    title={cellVal ? `타 학급 배정: ${cellVal}` : '배정 없음'}
                                    className="p-1 border-r border-[#f1f5f9] last:border-r-0 text-[#94a3b8] font-medium"
                                  >
                                    -
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Unlock Confirmation Dialog */}
      {confirmUnlockCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-white space-y-4">
            <div className="flex items-center gap-2.5 text-[#b45309]">
              <Lock className="w-5 h-5" />
              <h3 className="text-[16px] font-extrabold text-[#0f172a]">
                지정 수업 잠금 해제 확인
              </h3>
            </div>
            
            <p className="text-[13.5px] text-[#4e5968] leading-relaxed">
              이 수업은 <b>전담 또는 관리자가 지정한 색상 시간표</b>입니다.<br />
              잠금을 해제하고 직접 수정하시겠습니까?
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmUnlockCell(null)}
                className="flex-1 py-2.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#4e5968] font-bold rounded-xl text-[13.5px] transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlock}
                className="flex-1 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-colors flex items-center justify-center gap-1"
              >
                <Unlock className="w-4 h-4" />
                <span>잠금 해제</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Memo Expand Modal */}
      {isMemoModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-[#e2e8f0] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex justify-between items-center bg-[#f8fafc]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#ecfdf5] text-[#10b981] rounded-2xl border border-[#a7f3d0] shadow-2xs">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-extrabold text-[#0f172a] flex items-center gap-2 flex-wrap">
                    <span>{weekNum}주차 [{classNum}반 주차 전달사항 및 학급 메모]</span>
                    <span className="text-[12px] font-bold text-[#64748b] bg-white px-2.5 py-0.5 rounded-lg border border-[#e2e8f0]">
                      {weekDateString}
                    </span>
                  </h3>
                  <p className="text-[12px] text-[#64748b] mt-0.5">
                    학급 주간 전달사항, 준비물, 행사 일정 등을 넓은 화면에서 편안하게 작성하고 확인하세요.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMemoModalOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a] border border-[#e2e8f0] transition-colors"
                title="닫기 (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Spacious Large Textarea */}
            <div className="p-6 flex-1 flex flex-col min-h-[380px] bg-white overflow-hidden">
              <textarea
                value={weeklyMemo}
                onChange={(e) => setWeeklyMemo(e.target.value)}
                placeholder="이번 주 학급 전달사항, 준비물, 행사 안내, 시간표 변동 사항, 주의사항 등을 자유롭고 자세하게 작성하세요..."
                className="w-full flex-1 min-h-[360px] p-5 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-2xl text-[15px] text-[#0f172a] outline-none transition-colors leading-relaxed resize-none font-sans"
                autoFocus
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#e2e8f0] bg-[#f8fafc] flex justify-between items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(weeklyMemo);
                  setSaveToast('📋 메모 내용이 클립보드에 복사되었습니다.');
                  setTimeout(() => setSaveToast(null), 3000);
                }}
                className="px-4 py-2.5 bg-white hover:bg-[#f1f5f9] text-[#334155] font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 border border-[#e2e8f0]"
              >
                <Copy className="w-4 h-4 text-[#64748b]" />
                <span>메모 복사</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMemoModalOpen(false)}
                  className="px-5 py-2.5 bg-white hover:bg-[#e2e8f0] text-[#475569] font-bold rounded-xl text-[13.5px] transition-colors border border-[#e2e8f0]"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveServer();
                    setIsMemoModalOpen(false);
                  }}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>저장 후 닫기</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
