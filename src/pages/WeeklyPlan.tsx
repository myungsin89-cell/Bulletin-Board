import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { juganService, TimetableData, BgColorData, SpecialistTeacher } from '../utils/juganService';
import { 
  Save, Copy, RefreshCw, ChevronLeft, ChevronRight, 
  Check, Edit2, ShieldCheck, Building2, BarChart3
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

const DAYS = [
  { id: 1, label: '월' },
  { id: 2, label: '화' },
  { id: 3, label: '수' },
  { id: 4, label: '목' },
  { id: 5, label: '금' }
];

const PERIODS = [1, 2, 3, 4, 5, 6];

const PRESET_SUBJECTS = [
  '국어', '수학', '사회', '과학', '체육', '음악', '미술', '영어', '도덕', '창체'
];

/**
 * Format week date range e.g. "3월 4일(월) ~ 3월 8일(금)"
 */
function getWeekDateRange(week: number, semester: number, customAnchor?: { week: number; startDate: string } | null): string {
  let anchor = customAnchor;
  if (!anchor || !anchor.startDate) {
    const currentYear = new Date().getFullYear();
    const defaultStart = semester === 2 ? `${currentYear}-08-25` : `${currentYear}-03-02`;
    anchor = { week: 1, startDate: defaultStart };
  }
  const base = new Date(anchor.startDate + 'T00:00:00');
  const diff = (week - anchor.week) * 7;
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

  const [availableRooms, setAvailableRooms] = useState<string[]>(['4학년']);
  const [roomCode, setRoomCode] = useState<string>('4학년');
  const [semester, setSemester] = useState<number>(1);
  const [weekNum, setWeekNum] = useState<number>(1);
  const [classNum, setClassNum] = useState<string>(detectedClassNum);

  // Timetable, Targets, Memo & Specialist State
  const [timetable, setTimetable] = useState<TimetableData>({});
  const [bgColors, setBgColors] = useState<BgColorData>({});
  const [targets, setTargets] = useState<{ [sub: string]: number }>({});
  const [weeklyMemo, setWeeklyMemo] = useState<string>('');
  const [specialists, setSpecialists] = useState<SpecialistTeacher[]>([]);
  const [weekAnchor, setWeekAnchor] = useState<{ week: number; startDate: string } | null>(null);

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
        const exact = rooms.find(r => r.trim() === boardSubTitle.trim());
        if (exact) {
          setRoomCode(exact);
          return;
        }
        const partial = rooms.find(r => boardSubTitle.includes(r) || r.includes(boardSubTitle));
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
    setTimetable(data.timetable || {});
    setBgColors(data.bgColors || {});
    setTargets(data.targets || {});
    setWeeklyMemo(data.weeklyMemo || '');
    setSpecialists(data.specialists || []);
    if (data.roomData?.config?.weekAnchor) {
      setWeekAnchor(data.roomData.config.weekAnchor);
    }
    setIsLoading(false);
  };

  // Count assigned hours per subject for active timetable
  const assignedHoursPerSubject = useMemo(() => {
    const counts: { [subName: string]: number } = {};
    Object.values(timetable).forEach((sub: any) => {
      if (typeof sub === 'string' && sub.trim()) {
        const name = sub.trim();
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return counts;
  }, [timetable]);

  // Total weekly filled hours vs total weekly target hours
  const totalWeeklyFilled = useMemo(() => {
    return Object.values(assignedHoursPerSubject).reduce((a: number, b: number) => a + b, 0);
  }, [assignedHoursPerSubject]);

  const totalWeeklyTarget = useMemo(() => {
    return PRESET_SUBJECTS.reduce((a: number, s: string) => a + (Number(targets[s]) || 0), 0);
  }, [targets]);

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
        const bg = bgColors[`${day.id}-${period}`] || '';
        const bgStyle = bg ? `background:${bg};` : '';
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
      console.warn('ClipboardItem API failed, using fallback:', e);
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

        {/* Right: Room (이음초등학교 4학년), Semester Switcher, Class Selector & Login Profile Status */}
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

      {/* ── 2. TOP GLOBAL TARGET HOURS BAR (ju-gan Exact Style) ── */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-[#0f172a] flex items-center gap-1.5">
            🎯 이번 주 학년 과목별 목표 차시
          </span>
          <span className="text-[11.5px] text-[#64748b]">
            (과목별 목표 차시를 입력하면 실시간 반영됩니다)
          </span>
        </div>

        <table className="w-full text-center text-[12.5px] border-collapse border border-[#e2e8f0] rounded-xl overflow-hidden">
          <thead>
            <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
              <th className="p-2.5 w-28 bg-[#f1f5f9] border-r border-[#e2e8f0]">목표 차시</th>
              {PRESET_SUBJECTS.map(s => (
                <th key={s} className="p-2.5 border-r border-[#e2e8f0] last:border-r-0 min-w-[65px]">
                  {s}
                </th>
              ))}
              <th className="p-2.5 bg-[#ecfdf5] text-[#047857] font-extrabold w-20 border-l border-[#a7f3d0]">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2.5 font-bold text-[#334155] bg-[#f8fafc] border-r border-[#e2e8f0]">
                이번 주 목표
              </td>
              {PRESET_SUBJECTS.map(subName => {
                const val = targets[subName] || 0;
                return (
                  <td key={subName} className="p-1.5 border-r border-[#e2e8f0]">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={val}
                      onChange={(e) => {
                        const newNum = parseInt(e.target.value) || 0;
                        setTargets(prev => ({ ...prev, [subName]: newNum }));
                      }}
                      className="w-11 px-1 py-1 text-center bg-[#f8fafc] focus:bg-white border border-[#e2e8f0] focus:border-[#10b981] rounded-lg font-bold text-[#0f172a] outline-none"
                    />
                  </td>
                );
              })}
              <td className="p-2.5 font-extrabold text-[#047857] bg-[#ecfdf5]/50 border-l border-[#a7f3d0] font-mono text-[13.5px]">
                {totalWeeklyTarget}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 3. MAIN TIMETABLE & RIGHT VERIFICATION LAYOUT ── */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* CENTER/LEFT: Main Timetable Grid & Weekly Memo Section (FULL VISIBILITY, NO INNER SCROLLBAR) */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Timetable Card - Direct Text Input & Arrow Key Navigation */}
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-4">
            {/* Header: Class Name + [복사], [저장] Buttons */}
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3">
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
                          const bg = bgColors[key] || '#ffffff';

                          return (
                            <td
                              key={key}
                              style={{ backgroundColor: bg }}
                              className="p-1 border-r border-[#e2e8f0] last:border-r-0 h-14"
                            >
                              <input
                                ref={el => { inputRefs.current[key] = el; }}
                                type="text"
                                value={subject}
                                onChange={(e) => handleCellChange(day.id, period, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, day.id, period)}
                                placeholder="—"
                                className="w-full h-full text-center font-bold text-[#0f172a] text-[14px] bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#10b981] rounded-lg transition-all"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[12px] text-[#94a3b8] mt-2 text-right">
                  💡 칸 안에서 <b>방향키(↑, ↓, ←, →)</b> 또는 <b>Enter</b>를 누르면 인접 칸으로 바로 이동합니다.
                </p>
              </div>
            )}
          </div>

          {/* Weekly Memo Section */}
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-5 shadow-xs space-y-3">
            <h3 className="text-[15.5px] font-bold text-[#0f172a] flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#10b981]" />
              <span>{weekNum}주차 [{classNum}반 전달사항 및 학급 메모]</span>
            </h3>
            <textarea
              value={weeklyMemo}
              onChange={(e) => setWeeklyMemo(e.target.value)}
              placeholder="이번 주 학급 전달사항, 준비물, 주의사항 등을 자유롭게 입력하세요..."
              className="w-full h-24 p-3.5 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-xl text-[13.5px] text-[#0f172a] outline-none transition-colors leading-relaxed resize-none font-sans"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveServer}
                disabled={isSaving}
                className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>시간표 & 메모 저장</span>
              </button>
            </div>
          </div>

          {/* 🏫 SCROLL DOWN SECTION: 우리 반 배정 전담 시간표 (Specialist Teacher Timetables for Class) */}
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3">
              <div>
                <h3 className="text-[16px] font-bold text-[#0f172a] flex items-center gap-2">
                  <span>🏫 우리 반 ({classNum}반) 배정 전담 시간표</span>
                </h3>
                <p className="text-[12px] text-[#64748b] mt-0.5">
                  우리 반 수업이 포함된 전담 선생님들의 전체 시간표입니다. (스크롤을 내려 바로 확인 가능)
                </p>
              </div>
              <span className="text-[12px] bg-[#ecfdf5] text-[#047857] font-bold px-3 py-1 rounded-full border border-[#a7f3d0]">
                {classNum}반 수업 강조됨
              </span>
            </div>

            {specialists.length === 0 ? (
              <div className="p-8 text-center bg-[#f8fafc] rounded-xl border border-[#e2e8f0] text-[#64748b] text-[13.5px]">
                <span>등록된 전담 배정 데이터가 없습니다. (전담 배정 메뉴에서 등록된 경우 자동 표시됩니다)</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {specialists.map((sp, sIdx) => {
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

                      <table className="w-full text-center text-[12px] border-collapse">
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
                            <tr key={p} className="border-b border-[#f1f5f9] last:border-b-0">
                              <td className="p-1.5 font-bold text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0]">
                                {p}
                              </td>
                              {DAYS.map(d => {
                                const dayValList = sp.data?.[d.label] || [];
                                const cellVal = dayValList[p - 1] || '';
                                const isMyClass = String(cellVal).includes(classNum);

                                return (
                                  <td
                                    key={d.id}
                                    className={cn(
                                      "p-1.5 border-r border-[#f1f5f9] last:border-r-0 font-bold",
                                      isMyClass
                                        ? "bg-[#ecfdf5] text-[#047857] border-2 border-[#10b981] font-extrabold shadow-2xs"
                                        : "text-[#475569]"
                                    )}
                                  >
                                    {cellVal || '-'}
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
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR: 📊 차시 확인 (Target vs Actual Hours Verification Grid Card) */}
        <aside className="w-full lg:w-[290px] shrink-0 sticky top-20 z-10 space-y-4">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4.5 shadow-xs space-y-3">
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-2.5">
              <h3 className="text-[15px] font-extrabold text-[#0f172a] flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-[#10b981]" />
                <span>차시 확인 [{classNum}반]</span>
              </h3>
              <span className="text-[11px] font-bold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-md">
                배정 / 목표
              </span>
            </div>

            {/* 2-Column Subject Verification Table */}
            <div className="overflow-hidden border border-[#e2e8f0] rounded-xl">
              <table className="w-full text-[12.5px] text-center border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] font-bold text-[#475569] border-b border-[#e2e8f0]">
                    <th className="p-2 border-r border-[#e2e8f0]">과목</th>
                    <th className="p-2 border-r border-[#e2e8f0]">배정/목표</th>
                    <th className="p-2 border-r border-[#e2e8f0]">과목</th>
                    <th className="p-2">배정/목표</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(PRESET_SUBJECTS.length / 2) }).map((_, idx) => {
                    const s1 = PRESET_SUBJECTS[idx * 2];
                    const s2 = PRESET_SUBJECTS[idx * 2 + 1];

                    const f1 = assignedHoursPerSubject[s1] || 0;
                    const t1 = Number(targets[s1]) || 0;
                    const isOk1 = t1 > 0 ? f1 === t1 : true;
                    const isOver1 = t1 > 0 && f1 > t1;

                    const f2 = s2 ? (assignedHoursPerSubject[s2] || 0) : 0;
                    const t2 = s2 ? (Number(targets[s2]) || 0) : 0;
                    const isOk2 = t2 > 0 ? f2 === t2 : true;
                    const isOver2 = t2 > 0 && f2 > t2;

                    return (
                      <tr key={idx} className="border-b border-[#f1f5f9] last:border-b-0">
                        {/* Subject 1 */}
                        <td className="p-1.5 font-bold text-[#475569] bg-[#f8fafc]/50 border-r border-[#e2e8f0]">
                          {s1}
                        </td>
                        <td className={cn(
                          "p-1.5 font-mono font-bold border-r border-[#e2e8f0]",
                          t1 > 0 && isOk1 ? "bg-[#ecfdf5] text-[#047857]" :
                          t1 > 0 && isOver1 ? "bg-[#fff1f2] text-[#be123c]" :
                          t1 > 0 && !isOk1 ? "bg-[#fffbeb] text-[#b45309]" : "text-[#94a3b8]"
                        )}>
                          {f1}/{t1}
                        </td>

                        {/* Subject 2 */}
                        {s2 ? (
                          <>
                            <td className="p-1.5 font-bold text-[#475569] bg-[#f8fafc]/50 border-r border-[#e2e8f0]">
                              {s2}
                            </td>
                            <td className={cn(
                              "p-1.5 font-mono font-bold",
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
                  <tr className="bg-[#f8fafc] font-bold border-t border-[#e2e8f0]">
                    <td colSpan={2} className="p-2 text-left pl-3 text-[#0f172a] border-r border-[#e2e8f0]">
                      주간 총계
                    </td>
                    <td colSpan={2} className={cn(
                      "p-2 font-mono font-extrabold text-[13px]",
                      totalWeeklyTarget > 0 && totalWeeklyFilled === totalWeeklyTarget ? "text-[#047857]" : "text-[#b45309]"
                    )}>
                      {totalWeeklyFilled} / {totalWeeklyTarget} 차시
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
