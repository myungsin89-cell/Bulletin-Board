import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { juganService, TimetableData, BgColorData } from '../utils/juganService';
import { 
  BookOpen, Calendar, Save, RefreshCw, ChevronLeft, ChevronRight, 
  Check, Edit2, Info, Sparkles, Layers, Palette, ShieldCheck, Plus, Building2, UserCheck, BarChart3, AlertCircle, AlertTriangle, X
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

  // Default fallback for non-homeroom roles (e.g. "교과", "부장")
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

const PRESET_COLORS = [
  { name: '연빨강', value: '#fecaca' },
  { name: '연주황', value: '#fed7aa' },
  { name: '연노랑', value: '#fef08a' },
  { name: '연초록', value: '#dcfce7' },
  { name: '연청록', value: '#cffafe' },
  { name: '연파랑', value: '#dbeafe' },
  { name: '연보라', value: '#ede9fe' },
  { name: '연분홍', value: '#fce7f3' },
  { name: '연회색', value: '#e5e7eb' },
  { name: '흰색', value: '#ffffff' },
];

export function WeeklyPlan() {
  const { profile } = useAuth();

  // Active Main Menu: 'timetable' (반별 시간표) | 'validation' (시수확인 대시보드)
  const [activeMenu, setActiveMenu] = useState<'timetable' | 'validation'>('timetable');

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

  // Timetable & Memo state
  const [timetable, setTimetable] = useState<TimetableData>({});
  const [bgColors, setBgColors] = useState<BgColorData>({});
  const [targets, setTargets] = useState<{ [sub: string]: number }>({});
  const [weeklyMemo, setWeeklyMemo] = useState<string>('');

  // Active selection in Sidebar Palette
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Validation Dashboard View State
  const [validationData, setValidationData] = useState<{
    subjects: { name: string }[];
    annualTargets: { [sub: string]: number };
    weekTargets: { [week: number]: { [sub: string]: number } };
    classWeeklyHours: { [cNum: string]: { [wNum: number]: { [sub: string]: number } } };
  }>({ subjects: [], annualTargets: {}, weekTargets: {}, classWeeklyHours: {} });
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Cell Modal Editor State
  const [editingCell, setEditingCell] = useState<{ day: number; period: number } | null>(null);
  const [modalSubjectText, setModalSubjectText] = useState('');
  const [modalCellColor, setModalCellColor] = useState('#ffffff');

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

  // Load data whenever parameters change
  useEffect(() => {
    if (activeMenu === 'timetable') {
      loadData();
    } else {
      loadValidationData();
    }
  }, [roomCode, weekNum, semester, classNum, activeMenu]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await juganService.loadWeekData(roomCode, weekNum, semester, classNum);
    setTimetable(data.timetable || {});
    setBgColors(data.bgColors || {});
    setTargets(data.targets || {});
    setWeeklyMemo(data.weeklyMemo || '');
    setIsLoading(false);
  };

  const loadValidationData = async () => {
    setIsValidating(true);
    const vData = await juganService.loadAllWeeksValidation(roomCode, semester);
    setValidationData(vData);
    setIsValidating(false);
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

  // Handle Timetable Cell Click
  const handleCellClick = (day: number, period: number) => {
    const key = `${day}-${period}`;

    // 1. If subject is selected in sidebar -> Apply subject directly!
    if (selectedSubject) {
      const updatedTimetable = { ...timetable };
      if (selectedSubject === 'DELETE_CELL') {
        delete updatedTimetable[key];
      } else {
        updatedTimetable[key] = selectedSubject;
      }
      setTimetable(updatedTimetable);
      return;
    }

    // 2. If highlighter color is selected in sidebar -> Apply color directly!
    if (selectedColor) {
      const updatedBgColors = { ...bgColors };
      if (selectedColor === '#ffffff') {
        delete updatedBgColors[key];
      } else {
        updatedBgColors[key] = selectedColor;
      }
      setBgColors(updatedBgColors);
      return;
    }

    // 3. Otherwise -> Open cell editor modal
    setEditingCell({ day, period });
    setModalSubjectText(timetable[key] || '');
    setModalCellColor(bgColors[key] || '#ffffff');
  };

  const handleSaveModalCell = () => {
    if (!editingCell) return;
    const key = `${editingCell.day}-${editingCell.period}`;
    const updatedTimetable = { ...timetable };
    const updatedBgColors = { ...bgColors };

    if (modalSubjectText.trim()) {
      updatedTimetable[key] = modalSubjectText.trim();
    } else {
      delete updatedTimetable[key];
    }

    if (modalCellColor && modalCellColor !== '#ffffff') {
      updatedBgColors[key] = modalCellColor;
    } else {
      delete updatedBgColors[key];
    }

    setTimetable(updatedTimetable);
    setBgColors(updatedBgColors);
    setEditingCell(null);
  };

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
      setSaveToast(`✅ ${classNum}반 주간 시간표가 [주간학습 앱]에 성공적으로 저장되었습니다!`);
      setTimeout(() => setSaveToast(null), 3500);
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다. 파이어베이스 연동 상태를 확인하세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 font-sans max-w-[1440px] mx-auto">
      {/* ── 1. Top Header Navigation Bar (ju-gan Exact Style) ── */}
      <div className="bg-white border-b border-[#e2e8f0] pb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#10b981]" />
            <h1 className="text-[19px] font-extrabold text-[#0f172a] tracking-tight">
              주간학습프로그램
            </h1>
            {boardSubTitle && (
              <span className="text-[12px] font-bold text-[#10b981] bg-[#ecfdf5] px-2.5 py-1 rounded-full border border-[#a7f3d0]">
                {boardSubTitle}
              </span>
            )}
          </div>

          <nav className="flex gap-1 ml-4">
            <button
              type="button"
              onClick={() => setActiveMenu('timetable')}
              className={cn(
                "px-4 py-2 rounded-xl text-[14px] font-bold transition-all flex items-center gap-1.5",
                activeMenu === 'timetable'
                  ? "bg-[#ecfdf5] text-[#059669] shadow-2xs"
                  : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              )}
            >
              <Calendar className="w-4 h-4" />
              <span>반별 시간표</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('validation')}
              className={cn(
                "px-4 py-2 rounded-xl text-[14px] font-bold transition-all flex items-center gap-1.5",
                activeMenu === 'validation'
                  ? "bg-[#ecfdf5] text-[#059669] shadow-2xs"
                  : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              <span>시수확인</span>
            </button>
          </nav>
        </div>

        {/* Right Status Badge & Save Action Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl text-[13px] font-bold text-[#047857]">
            <ShieldCheck className="w-4 h-4 text-[#10b981]" />
            <span>{classNum}반 담임 연결됨 ({profile?.displayName})</span>
          </div>

          <button
            onClick={handleSaveServer}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>주간학습 DB 저장</span>
          </button>
        </div>
      </div>

      {/* Toast Notification Alert */}
      {saveToast && (
        <div className="p-3.5 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl text-[#047857] text-[14px] font-bold flex items-center gap-2 shadow-2xs animate-fade-in">
          <Check className="w-5 h-5 text-[#10b981] shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* ── 2. Top Week Toolbar (ju-gan Exact Style) ── */}
      <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        {/* Left: Week Selector Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekNum(prev => Math.max(1, prev - 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[16px] transition-colors"
          >
            &lt;
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-extrabold text-[#0f172a]">
              {weekNum}주차 시간표
            </h2>
            <span className="text-[12.5px] font-bold px-2.5 py-0.5 bg-[#ede9fe] text-[#6366f1] rounded-full border border-[#ddd6fe]">
              {semester}학기
            </span>
          </div>
          <button
            onClick={() => setWeekNum(prev => Math.min(21, prev + 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0f172a] font-bold text-[16px] transition-colors"
          >
            &gt;
          </button>
        </div>

        {/* Right: Room, Semester, and Class Selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Room Selector */}
          <div className="flex items-center gap-1 bg-[#f8fafc] px-3 py-1.5 rounded-xl border border-[#e2e8f0] text-[13px]">
            <span className="text-[#64748b] font-bold">방:</span>
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

          {/* Class Selector with Auto-Parse Match */}
          <div className="flex items-center gap-1 bg-[#ecfdf5] px-3 py-1.5 rounded-xl border border-[#a7f3d0] text-[13px]">
            <span className="text-[#047857] font-bold">학급:</span>
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

      {/* ── 3. MAIN TIMETABLE VIEW (ju-gan 3-Column Layout: Left Palette | Center Timetable & Memo | Right Hours Verification) ── */}
      {activeMenu === 'timetable' && (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* COLUMN 1: LEFT SIDEBAR (Subject & Highlighter Palette) */}
          <aside className="w-full lg:w-[160px] shrink-0 sticky top-20 z-10">
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-3.5 shadow-xs space-y-4">
              {/* Subject Palette List */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[13px] font-bold text-[#64748b]">과목 선택</h3>
                  {selectedSubject && (
                    <button
                      onClick={() => setSelectedSubject(null)}
                      className="text-[11px] text-[#ef4444] font-bold hover:underline"
                    >
                      해제
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {PRESET_SUBJECTS.map(sub => {
                    const isSelected = selectedSubject === sub;
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => {
                          setSelectedSubject(isSelected ? null : sub);
                          setSelectedColor(null);
                        }}
                        className={cn(
                          "w-full px-2.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-all text-center border flex items-center justify-between",
                          isSelected
                            ? "bg-[#10b981] text-white border-[#059669] shadow-2xs"
                            : "bg-white text-[#0f172a] border-[#e2e8f0] hover:border-[#10b981] hover:bg-[#ecfdf5]/40"
                        )}
                      >
                        <span>{sub}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-[1px] bg-[#f1f5f9]" />

              {/* Highlighter Color Palette */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[12.5px] font-bold text-[#64748b] flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-[#10b981]" /> 형광펜 색상
                  </h3>
                  {selectedColor && (
                    <button
                      onClick={() => setSelectedColor(null)}
                      className="text-[11px] text-[#ef4444] font-bold hover:underline"
                    >
                      해제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5 justify-items-center">
                  {PRESET_COLORS.map(c => {
                    const isSelected = selectedColor === c.value;
                    return (
                      <div
                        key={c.value}
                        onClick={() => {
                          setSelectedColor(isSelected ? null : c.value);
                          setSelectedSubject(null);
                        }}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                        className={cn(
                          "w-5.5 h-5.5 rounded-full cursor-pointer border transition-transform hover:scale-110 shadow-2xs",
                          isSelected ? "ring-2 ring-[#10b981] ring-offset-1 border-[#10b981]" : "border-[#cbd5e1]"
                        )}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Hint Notice */}
              {(selectedSubject || selectedColor) && (
                <div className="p-2 bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl text-[11px] text-[#047857] font-bold text-center leading-snug">
                  💡 {selectedSubject ? `[${selectedSubject}] 선택` : `[형광펜] 선택`}<br />
                  시간표 클릭 시 적용!
                </div>
              )}
            </div>
          </aside>

          {/* COLUMN 2: CENTER (Timetable Grid & Weekly Memo) */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Timetable Card */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-5 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-2.5">
                <h3 className="text-[16px] font-bold text-[#0f172a] flex items-center gap-2">
                  <span>{roomCode} [{classNum}반 시간표]</span>
                </h3>
                <span className="text-[12px] text-[#64748b]">
                  셀 클릭 시 과목/색상 편집
                </span>
              </div>

              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#8b95a1]">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#10b981]" />
                  <span className="text-[14px] font-bold">주간학습 DB에서 반별 시간표를 불러오는 중...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center text-[13.5px] border border-[#e2e8f0] rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                        <th className="p-2.5 w-14 border-r border-[#e2e8f0]">교시</th>
                        {DAYS.map(day => (
                          <th key={day.id} className="p-2.5 min-w-[100px] border-r border-[#e2e8f0] last:border-r-0">
                            {day.label}요일
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERIODS.map(period => (
                        <tr key={period} className="border-b border-[#e2e8f0] last:border-b-0 hover:bg-[#f8fafc]/50 transition-colors">
                          <td className="p-2.5 font-bold text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0]">
                            {period}
                          </td>
                          {DAYS.map(day => {
                            const key = `${day.id}-${period}`;
                            const subject = timetable[key] || '';
                            const bg = bgColors[key] || '#ffffff';

                            return (
                              <td
                                key={key}
                                onClick={() => handleCellClick(day.id, period)}
                                style={{ backgroundColor: bg }}
                                className="p-2.5 border-r border-[#e2e8f0] last:border-r-0 cursor-pointer hover:opacity-80 transition-all font-bold text-[#0f172a] h-13 select-none"
                              >
                                <div className="flex items-center justify-center h-full">
                                  {subject ? (
                                    <span>{subject}</span>
                                  ) : (
                                    <span className="text-[#cbd5e1] text-[12px] font-normal flex items-center gap-0.5 hover:text-[#94a3b8]">
                                      <Plus className="w-3.5 h-3.5" /> 입력
                                    </span>
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

            {/* Weekly Memo Section */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-5 shadow-xs space-y-3">
              <h3 className="text-[15px] font-bold text-[#0f172a] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#10b981]" />
                <span>{weekNum}주차 [{classNum}반 전달사항 및 학급 메모]</span>
              </h3>
              <textarea
                value={weeklyMemo}
                onChange={(e) => setWeeklyMemo(e.target.value)}
                placeholder="이번 주 학급 전달사항, 준비물, 주의사항 등을 입력하세요..."
                className="w-full h-24 p-3.5 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-xl text-[13.5px] text-[#0f172a] outline-none transition-colors leading-relaxed resize-none font-sans"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveServer}
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13px] transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>주간학습 DB에 저장</span>
                </button>
              </div>
            </div>
          </div>

          {/* COLUMN 3: RIGHT SIDEBAR (Target Hours Verification & Settings Card - ju-gan Exact Placement) */}
          <aside className="w-full lg:w-[280px] shrink-0 sticky top-20 z-10 space-y-4">
            {/* RIGHT CARD 1: 📊 차시 확인 (Target vs Actual Hours Verification) */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-2">
                <h3 className="text-[14.5px] font-extrabold text-[#0f172a] flex items-center gap-1.5">
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

            {/* RIGHT CARD 2: 🎯 이번 주 과목별 목표 시수 설정 */}
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-4 shadow-xs space-y-3">
              <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-2">
                <h3 className="text-[13.5px] font-bold text-[#0f172a]">
                  이번 주 목표 차시 (학년 기준)
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {PRESET_SUBJECTS.map(subName => {
                  const val = targets[subName] || 0;
                  return (
                    <div key={subName} className="flex items-center justify-between bg-[#f8fafc] px-2.5 py-1.5 rounded-xl border border-[#e2e8f0]">
                      <span className="font-bold text-[#475569]">{subName}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={val}
                          onChange={(e) => {
                            const newNum = parseInt(e.target.value) || 0;
                            setTargets(prev => ({ ...prev, [subName]: newNum }));
                          }}
                          className="w-10 px-1 py-0.5 text-center bg-white border border-[#cbd5e1] rounded-md font-bold text-[#0f172a] outline-none focus:border-[#10b981]"
                        />
                        <span className="text-[11px] text-[#94a3b8]">차시</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── 4. VALIDATION VIEW (ju-gan 1:1 Exact 시수확인 대시보드) ── */}
      {activeMenu === 'validation' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-[#f1f5f9] pb-3">
              <h3 className="text-[17px] font-bold text-[#0f172a] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#10b981]" />
                <span>{roomCode} {semester}학기 과목별 시수 검증 대시보드</span>
              </h3>
              <span className="text-[12.5px] bg-[#ecfdf5] text-[#047857] font-bold px-3 py-1 rounded-full border border-[#a7f3d0]">
                {semester}학기 전 주차 누적 집계
              </span>
            </div>

            {isValidating ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-[#8b95a1]">
                <RefreshCw className="w-8 h-8 animate-spin text-[#10b981]" />
                <span className="text-[14px] font-bold">주간학습 전체 주차 시수 데이터를 집계하는 중...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-center text-[13px] border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-[#f8fafc] text-[#475569] font-bold border-b border-[#e2e8f0]">
                      <th className="p-3 w-44 text-left pl-4 border-r border-[#e2e8f0]">항목 / 과목</th>
                      {validationData.subjects.map(s => (
                        <th key={s.name} className="p-3 border-r border-[#e2e8f0] last:border-r-0 min-w-[70px]">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Row 1: 학기 기준시수 */}
                    <tr className="border-b border-[#f1f5f9]">
                      <td className="p-3 text-left pl-4 font-bold text-[#334155] bg-[#f8fafc] border-r border-[#e2e8f0]">
                        {semester}학기 기준시수
                      </td>
                      {validationData.subjects.map(s => {
                        const target = validationData.annualTargets[s.name] || 0;
                        return (
                          <td key={s.name} className="p-3 border-r border-[#f1f5f9] font-bold text-[#475569]">
                            {target > 0 ? `${target}h` : '-'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row 2: 주차별 목표 시수 누적 합산 */}
                    <tr className="border-b border-[#f1f5f9] bg-[#ecfdf5]/30">
                      <td className="p-3 text-left pl-4 font-bold text-[#047857] bg-[#ecfdf5]/70 border-r border-[#e2e8f0]">
                        주차별 목표 시수 누적
                      </td>
                      {validationData.subjects.map(s => {
                        let totalTarget = 0;
                        Object.values(validationData.weekTargets).forEach(wT => {
                          totalTarget += (wT[s.name] || 0);
                        });
                        return (
                          <td key={s.name} className="p-3 border-r border-[#f1f5f9] font-bold text-[#047857]">
                            {totalTarget}차시
                          </td>
                        );
                      })}
                    </tr>

                    {/* Row 3: 우리 반 실제 시간표 배정 시수 누적 */}
                    <tr className="border-b border-[#f1f5f9]">
                      <td className="p-3 text-left pl-4 font-bold text-[#0f172a] bg-[#f8fafc] border-r border-[#e2e8f0]">
                        [{classNum}반] 실제 배정 시수
                      </td>
                      {validationData.subjects.map(s => {
                        let totalClassHours = 0;
                        const classData = validationData.classWeeklyHours[classNum] || {};
                        Object.values(classData).forEach(wHours => {
                          totalClassHours += (wHours[s.name] || 0);
                        });
                        return (
                          <td key={s.name} className="p-3 border-r border-[#f1f5f9] font-bold text-[#0f172a]">
                            {totalClassHours}차시
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cell Editor Modal */}
      {editingCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-white space-y-5">
            <div className="flex justify-between items-center border-b border-[#f2f4f6] pb-3">
              <h3 className="text-[17px] font-bold text-[#0f172a] flex items-center gap-1.5">
                <Edit2 className="w-4.5 h-4.5 text-[#10b981]" />
                {DAYS.find(d => d.id === editingCell.day)?.label}요일 {editingCell.period}교시 과목 수정
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-[#8b95a1] hover:text-[#0f172a] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Subject Input */}
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">과목명 입력</label>
                <input
                  type="text"
                  value={modalSubjectText}
                  onChange={(e) => setModalSubjectText(e.target.value)}
                  placeholder="예: 국어, 수학, 체육, 창체 등"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border-none rounded-xl text-[15px] font-bold text-[#0f172a] focus:ring-2 focus:ring-[#10b981] outline-none"
                  autoFocus
                />
              </div>

              {/* Preset Subject Buttons for fast clicking */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SUBJECTS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setModalSubjectText(s)}
                    className="px-2.5 py-1 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] rounded-lg text-[12px] font-bold transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Color Palette Picker */}
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-2 flex items-center gap-1">
                  <Palette className="w-4 h-4 text-[#10b981]" /> 배경 색상 선택
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setModalCellColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={cn(
                        "p-2 rounded-xl text-[11px] font-bold border transition-all text-center",
                        modalCellColor === c.value
                          ? "border-[#10b981] ring-2 ring-[#10b981]/30 shadow-2xs font-extrabold"
                          : "border-[#e2e8f0]"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveModalCell}
                className="flex-1 py-3 bg-[#10b981] text-white font-bold rounded-xl hover:bg-[#059669] transition-colors text-[14px]"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
