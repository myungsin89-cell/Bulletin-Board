import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { juganService, TimetableData, BgColorData } from '../utils/juganService';
import { 
  BookOpen, Calendar, Save, RefreshCw, ChevronLeft, ChevronRight, 
  Check, Edit2, Info, Sparkles, Layers, Palette, ShieldCheck
} from 'lucide-react';
import { cn } from '../utils/cn';

const DAYS = [
  { id: 1, label: '월요일' },
  { id: 2, label: '화요일' },
  { id: 3, label: '수요일' },
  { id: 4, label: '목요일' },
  { id: 5, label: '금요일' }
];

const PERIODS = [1, 2, 3, 4, 5, 6];

const PRESET_COLORS = [
  { name: '기본 (흰색)', value: '#ffffff' },
  { name: '민트 (국어)', value: '#ecfdf5' },
  { name: '파랑 (수학)', value: '#eff6ff' },
  { name: '주황 (사회)', value: '#fff7ed' },
  { name: '보라 (과학)', value: '#f3e8ff' },
  { name: '노랑 (체육)', value: '#fefce8' },
  { name: '분홍 (음악/미술)', value: '#fff1f2' },
  { name: '남색 (영어)', value: '#e0e7ff' },
  { name: '회색 (창체)', value: '#f1f5f9' },
];

export function WeeklyPlan() {
  const { profile } = useAuth();

  // Auto-detect class number from profile.displayName (e.g. "14반 송명신" -> "14", "2반" -> "2")
  const detectedClass = React.useMemo(() => {
    if (!profile?.displayName) return '1';
    const match = profile.displayName.match(/(\d+)반?/);
    return match ? match[1] : '1';
  }, [profile]);

  const [roomCode, setRoomCode] = useState('4학년');
  const [availableRooms, setAvailableRooms] = useState<string[]>(['4학년']);
  const [semester, setSemester] = useState<number>(1);
  const [weekNum, setWeekNum] = useState<number>(1);
  const [classNum, setClassNum] = useState<string>(detectedClass);

  const [timetable, setTimetable] = useState<TimetableData>({});
  const [bgColors, setBgColors] = useState<BgColorData>({});
  const [weeklyMemo, setWeeklyMemo] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Cell Editor Modal State
  const [editingCell, setEditingCell] = useState<{ day: number; period: number } | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editColor, setEditColor] = useState('#ffffff');

  // Load available rooms on mount
  useEffect(() => {
    juganService.getAvailableRooms().then(rooms => {
      setAvailableRooms(rooms);
      if (rooms.length > 0 && !rooms.includes(roomCode)) {
        setRoomCode(rooms[0]);
      }
    });
  }, []);

  // Update classNum when profile changes
  useEffect(() => {
    setClassNum(detectedClass);
  }, [detectedClass]);

  // Load week data whenever roomCode, weekNum, semester, or classNum changes
  useEffect(() => {
    loadData();
  }, [roomCode, weekNum, semester, classNum]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await juganService.loadWeekData(roomCode, weekNum, semester, classNum);
    setTimetable(data.timetable || {});
    setBgColors(data.bgColors || {});
    setWeeklyMemo(data.weeklyMemo || '');
    setIsLoading(false);
  };

  const handleCellClick = (day: number, period: number) => {
    const key = `${day}-${period}`;
    setEditingCell({ day, period });
    setEditSubject(timetable[key] || '');
    setEditColor(bgColors[key] || '#ffffff');
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const key = `${editingCell.day}-${editingCell.period}`;
    const updatedTimetable = { ...timetable };
    const updatedBgColors = { ...bgColors };

    if (editSubject.trim()) {
      updatedTimetable[key] = editSubject.trim();
    } else {
      delete updatedTimetable[key];
    }

    if (editColor && editColor !== '#ffffff') {
      updatedBgColors[key] = editColor;
    } else {
      delete updatedBgColors[key];
    }

    setTimetable(updatedTimetable);
    setBgColors(updatedBgColors);
    setEditingCell(null);
  };

  const handleSaveAll = async () => {
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
      setSaveSuccessMessage(`${classNum}반 주간시간표가 [주간학습 앱]에 성공적으로 저장되었습니다!`);
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다. 파이어베이스 연결 상태를 확인해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-1">
        <div>
          <h2 className="text-[20px] font-bold text-[#191f28] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#10b981]" />
            담임 주간학습 연동 관리자
            <span className="text-[12px] font-bold bg-[#ecfdf5] text-[#047857] px-2.5 py-0.5 rounded-full border border-[#a7f3d0] flex items-center gap-1 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              {classNum}반 담임 전용
            </span>
          </h2>
          <p className="text-[13.5px] text-[#8b95a1] mt-1">
            여기서 작성한 시간표와 학급 메모는 선생님의 <b>[주간학습 프로그램(jugan-61d45)]</b>에 실시간으로 양방향 자동 반영됩니다.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleSaveAll}
          disabled={isSaving || isLoading}
          className="px-5 py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[14.5px] transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 active:scale-95 shrink-0"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4.5 h-4.5" />
          )}
          <span>{isSaving ? '주간학습 앱 동기화 중...' : '주간학습 앱에 저장'}</span>
        </button>
      </div>

      {/* Success Notification Alert */}
      {saveSuccessMessage && (
        <div className="p-4 bg-[#ecfdf5] border border-[#a7f3d0] rounded-2xl text-[#047857] text-[14px] font-bold flex items-center gap-2 animate-fade-in shadow-2xs">
          <Check className="w-5 h-5 text-[#10b981] shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Control Bar: Room, Semester, Week, Class Selectors */}
      <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Room Selector */}
          <div>
            <label className="block text-[12.5px] font-bold text-[#4e5968] mb-1.5">방 코드 (학년)</label>
            <select
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#f2f4f6] border-none rounded-xl text-[13.5px] font-bold text-[#191f28] outline-none focus:ring-2 focus:ring-[#10b981]"
            >
              {availableRooms.map((r) => (
                <option key={r} value={r}>🏫 {r}</option>
              ))}
            </select>
          </div>

          {/* Semester Selector */}
          <div>
            <label className="block text-[12.5px] font-bold text-[#4e5968] mb-1.5">학기 선택</label>
            <div className="flex bg-[#f2f4f6] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSemester(1)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[13px] font-bold transition-all",
                  semester === 1 ? "bg-white text-[#191f28] shadow-2xs" : "text-[#8b95a1]"
                )}
              >
                1학기
              </button>
              <button
                type="button"
                onClick={() => setSemester(2)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[13px] font-bold transition-all",
                  semester === 2 ? "bg-white text-[#191f28] shadow-2xs" : "text-[#8b95a1]"
                )}
              >
                2학기
              </button>
            </div>
          </div>

          {/* Week Selector */}
          <div>
            <label className="block text-[12.5px] font-bold text-[#4e5968] mb-1.5">주차 선택</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekNum(prev => Math.max(1, prev - 1))}
                className="p-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] rounded-xl text-[#4e5968] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={weekNum}
                onChange={(e) => setWeekNum(Number(e.target.value))}
                className="flex-1 px-3 py-2.5 bg-[#f2f4f6] border-none rounded-xl text-[13.5px] font-bold text-[#191f28] text-center outline-none focus:ring-2 focus:ring-[#10b981]"
              >
                {Array.from({ length: 21 }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w}>{w}주차</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setWeekNum(prev => Math.min(21, prev + 1))}
                className="p-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] rounded-xl text-[#4e5968] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Class Number Selector (Auto-detected from Login Name) */}
          <div>
            <label className="block text-[12.5px] font-bold text-[#4e5968] mb-1.5">담임 학급 (반)</label>
            <div className="flex items-center gap-2">
              <select
                value={classNum}
                onChange={(e) => setClassNum(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl text-[13.5px] font-bold text-[#047857] outline-none focus:ring-2 focus:ring-[#10b981]"
              >
                {Array.from({ length: 15 }, (_, i) => String(i + 1)).map(c => (
                  <option key={c} value={c}>{c}반 시간표</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Timetable Grid (월~금, 1~6교시) */}
      <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-[17px] font-bold text-[#191f28] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#10b981]" />
            <span>{roomCode} {semester}학기 {weekNum}주차 [{classNum}반 주간 시간표]</span>
          </h3>
          <span className="text-[12px] text-[#8b95a1] hidden sm:inline">
            💡 셀을 클릭하여 과목명과 색상을 편집할 수 있습니다.
          </span>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#8b95a1]">
            <RefreshCw className="w-8 h-8 animate-spin text-[#10b981]" />
            <span className="text-[14px] font-bold">주간학습 파이어베이스 데이터 불러오는 중...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-[13.5px]">
              <thead>
                <tr className="bg-[#f8fafc] text-[#4e5968] font-bold border-b border-[#e2e8f0]">
                  <th className="p-3 w-16 border-r border-[#e2e8f0]">교시</th>
                  {DAYS.map(day => (
                    <th key={day.id} className="p-3 min-w-[120px] border-r border-[#e2e8f0] last:border-r-0">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(period => (
                  <tr key={period} className="border-b border-[#f1f5f9] last:border-b-0 hover:bg-[#f8fafc]/50 transition-colors">
                    <td className="p-3 font-bold text-[#64748b] bg-[#f8fafc]/80 border-r border-[#e2e8f0]">
                      {period}교시
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
                          className="p-3 border-r border-[#f1f5f9] last:border-r-0 cursor-pointer hover:opacity-80 transition-all font-bold text-[#191f28] relative group h-14 select-none"
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            {subject ? (
                              <span>{subject}</span>
                            ) : (
                              <span className="text-[#cbd5e1] text-[12px] font-normal group-hover:text-[#94a3b8] flex items-center gap-1">
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

      {/* Homeroom Notes & Weekly Memo Section */}
      <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-6 shadow-sm space-y-3">
        <h3 className="text-[16px] font-bold text-[#191f28] flex items-center gap-2">
          <Edit2 className="w-4.5 h-4.5 text-[#10b981]" />
          <span>{weekNum}주차 학급 메모 및 주간 전달사항</span>
        </h3>
        <textarea
          value={weeklyMemo}
          onChange={(e) => setWeeklyMemo(e.target.value)}
          placeholder="이번 주 학급 전달사항, 준비물, 주의사항 등을 자유롭게 입력하세요..."
          className="w-full h-28 p-4 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-2xl text-[14px] text-[#191f28] outline-none transition-colors leading-relaxed resize-none font-sans"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-4 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Save className="w-4 h-4" />
            <span>메모 및 시간표 저장</span>
          </button>
        </div>
      </div>

      {/* Cell Editor Modal */}
      {editingCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[24px] p-6 w-full max-w-md shadow-xl border border-white space-y-5">
            <div className="flex justify-between items-center border-b border-[#f2f4f6] pb-3">
              <h3 className="text-[17px] font-bold text-[#191f28] flex items-center gap-1.5">
                <Edit2 className="w-4.5 h-4.5 text-[#10b981]" />
                {DAYS.find(d => d.id === editingCell.day)?.label} {editingCell.period}교시 과목 수정
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-[#8b95a1] hover:text-[#191f28] text-lg font-bold"
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
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="예: 국어, 수학, 체육, 창체 등"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border-none rounded-xl text-[15px] font-bold text-[#191f28] focus:ring-2 focus:ring-[#10b981] outline-none"
                  autoFocus
                />
              </div>

              {/* Color Palette Picker */}
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-2 flex items-center gap-1">
                  <Palette className="w-4 h-4 text-[#10b981]" /> 배경 색상 선택
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={cn(
                        "p-2.5 rounded-xl text-[12px] font-bold border transition-all flex items-center justify-between",
                        editColor === c.value
                          ? "border-[#10b981] ring-2 ring-[#10b981]/30 shadow-2xs"
                          : "border-[#e2e8f0]"
                      )}
                    >
                      <span className="text-[#334155] truncate">{c.name.split(' ')[0]}</span>
                      {editColor === c.value && <Check className="w-3.5 h-3.5 text-[#10b981] shrink-0" />}
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
                onClick={handleSaveCell}
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
