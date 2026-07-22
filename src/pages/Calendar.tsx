import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarDays, Plus, Trash2, X, AlertTriangle, Calendar as CalendarIcon, Info, User, Clock } from 'lucide-react';
import { cn } from '../utils/cn';

interface Event {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  authorId: string;
  authorName: string;
  color?: string;
}

const EVENT_COLORS = [
  { label: '기본 (초록)', value: '#10b981' },
  { label: '중요 (빨강)', value: '#ef4444' },
  { label: '행사 (파랑)', value: '#3b82f6' },
  { label: '휴무 (보라)', value: '#8b5cf6' },
  { label: '기타 (주황)', value: '#f97316' },
  { label: '주의 (노랑)', value: '#eab308' }
];

export function Calendar() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  
  // Unified Day Detail Modal States
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [dayEvents, setDayEvents] = useState<Event[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  
  // Add Event Form States (Only pure dates: yyyy-MM-dd)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDateInput, setStartDateInput] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDateInput, setEndDateInput] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [eventColor, setEventColor] = useState('#10b981');

  // Delete State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  // Helper to normalize any date input to yyyy-MM-dd string safely
  const safeDateStr = (dateVal: any): string => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') return dateVal.substring(0, 10);
    if (dateVal.toDate && typeof dateVal.toDate === 'function') {
      try {
        return format(dateVal.toDate(), 'yyyy-MM-dd');
      } catch (e) {}
    }
    if (dateVal instanceof Date) {
      try {
        return format(dateVal, 'yyyy-MM-dd');
      } catch (e) {}
    }
    return String(dateVal).substring(0, 10);
  };

  // 1) Fetch Events in Realtime safely
  useEffect(() => {
    if (!db) return;
    try {
      const unsubscribe = onSnapshot(collection(db, 'events'), (snapshot) => {
        const eventsData = snapshot.docs.map(docSnap => {
          const data = docSnap.data() || {};
          const rawStart = safeDateStr(data.start);
          const rawEnd = safeDateStr(data.end || data.start);

          return {
            id: docSnap.id,
            title: data.title || '',
            description: data.description || '',
            start: rawStart,
            end: rawEnd,
            allDay: true,
            authorId: data.authorId || '',
            authorName: data.authorName || '선생님',
            color: data.color || '#10b981'
          };
        }) as Event[];
        setEvents(eventsData);
      }, (error) => {
        console.warn('Events fetch warning:', error);
      });

      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Helper to filter events for the active date range safely
  const filterEventsForSelectedDate = (targetDateStr: string, currentEventsList = events) => {
    if (!targetDateStr) {
      setDayEvents([]);
      return;
    }

    const target = safeDateStr(targetDateStr);
    const active = currentEventsList.filter(ev => {
      if (!ev) return false;
      const evStart = safeDateStr(ev.start);
      const evEnd = safeDateStr(ev.end || ev.start);
      if (!evStart) return false;
      
      return evStart <= target && evEnd >= target;
    });
    
    setDayEvents(active);
  };

  // Sync dayEvents when events change
  useEffect(() => {
    if (selectedDateStr) {
      filterEventsForSelectedDate(selectedDateStr, events);
    }
  }, [events, selectedDateStr]);

  // Click on date slot or drag selection safely
  const handleDateSelect = (selectInfo: any) => {
    if (!selectInfo || !selectInfo.startStr) return;
    
    const startStr = safeDateStr(selectInfo.startStr);
    let endStr = startStr;

    // FullCalendar endStr for select info is exclusive (next day). Subtract 1 day for multi-day drag
    if (selectInfo.endStr && selectInfo.endStr !== selectInfo.startStr) {
      try {
        const exclusiveEnd = parseISO(selectInfo.endStr);
        if (isValid(exclusiveEnd)) {
          endStr = format(addDays(exclusiveEnd, -1), 'yyyy-MM-dd');
        }
      } catch (e) {
        endStr = safeDateStr(selectInfo.endStr);
      }
    }
    
    // Ensure endStr is not before startStr
    if (endStr < startStr) endStr = startStr;

    setSelectedDateStr(startStr);
    setStartDateInput(startStr);
    setEndDateInput(endStr);

    filterEventsForSelectedDate(startStr, events);
    
    // Clear forms
    setTitle('');
    setDescription('');
    setEventColor('#10b981');
    setExpandedEventId(null);
    setIsDayModalOpen(true);
  };

  // Clicking an event in FullCalendar opens the same Unified Day Modal safely
  const handleEventClick = (clickInfo: any) => {
    if (!clickInfo || !clickInfo.event) return;
    const clickedId = clickInfo.event.id;
    const event = events.find(e => e.id === clickedId);
    
    const eventStart = event ? safeDateStr(event.start) : safeDateStr(clickInfo.event.start);
    const eventEnd = event ? safeDateStr(event.end) : safeDateStr(clickInfo.event.end || clickInfo.event.start);
    
    const targetDate = eventStart || format(new Date(), 'yyyy-MM-dd');

    setSelectedDateStr(targetDate);
    setStartDateInput(eventStart || targetDate);
    setEndDateInput(eventEnd || targetDate);

    filterEventsForSelectedDate(targetDate, events);

    setTitle('');
    setDescription('');
    setEventColor(event?.color || '#10b981');
    setExpandedEventId(clickedId);
    setIsDayModalOpen(true);
  };

  // Add Event Form Submission
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDateInput || !endDateInput || !profile) return;

    if (endDateInput < startDateInput) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    try {
      if (db) {
        await addDoc(collection(db, 'events'), {
          title: title.trim(),
          description: description.trim(),
          start: startDateInput,
          end: endDateInput,
          allDay: true,
          authorId: profile.uid,
          authorName: profile.displayName,
          color: eventColor,
          createdAt: serverTimestamp()
        });
      }
      setTitle('');
      setDescription('');
    } catch (error) {
      console.warn('Add event error:', error);
    }
  };

  // Delete event confirmation handler
  const handleDelete = async (id: string) => {
    try {
      if (db) {
        await deleteDoc(doc(db, 'events', id));
      }
    } catch (error) {
      console.warn('Delete event error:', error);
    }
    setDeleteConfirmId(null);
    setDayEvents(prev => prev.filter(ev => ev.id !== id));
    setEvents(prev => prev.filter(ev => ev.id !== id));
  };

  const handleOpenDeleteConfirm = (e: React.MouseEvent, evId: string, authorId: string) => {
    e.stopPropagation();
    if (authorId !== profile?.uid && !isAdmin) {
      setAlertMessage('작성자 또는 관리자만 삭제할 수 있습니다.');
      return;
    }
    setDeleteConfirmId(evId);
  };

  // Format events for FullCalendar display (FullCalendar expects end date to be exclusive for multi-day allDay events)
  const fullCalendarEvents = events.map(ev => {
    let calendarEnd = ev.end;
    if (ev.start !== ev.end && ev.end) {
      try {
        const parsed = parseISO(ev.end);
        if (isValid(parsed)) {
          calendarEnd = format(addDays(parsed, 1), 'yyyy-MM-dd');
        }
      } catch (e) {}
    }
    return {
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: calendarEnd,
      allDay: true,
      backgroundColor: ev.color,
      borderColor: ev.color
    };
  });

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Calendar Card */}
      <div className="bg-white p-5 sm:p-6 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6]">
        <div className="calendar-container text-[14px]">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            events={fullCalendarEvents}
            select={handleDateSelect}
            eventClick={handleEventClick}
            height="auto"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,dayGridWeek'
            }}
            buttonText={{
              today: '오늘',
              month: '월',
              week: '주'
            }}
            locale="ko"
            eventClassNames="cursor-pointer hover:opacity-85 transition-opacity rounded-[6px] shadow-2xs text-white px-2 py-0.5 text-[11.5px] font-bold leading-tight border-none"
          />
        </div>
      </div>

      {/* UNIFIED DAY DETAIL MODAL */}
      {isDayModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 sm:p-7 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto border border-white space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-[#f2f4f6]">
              <div>
                <h3 className="text-[17px] font-bold text-[#191f28]">
                  일정 상세 목록 및 추가
                </h3>
                <p className="text-[12px] text-[#8b95a1] mt-0.5">선택한 날짜 ({selectedDateStr})의 일정 현황입니다.</p>
              </div>
              <button 
                onClick={() => setIsDayModalOpen(false)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors shrink-0"
              >
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            {/* List of existing events */}
            <div className="space-y-2">
              <h4 className="text-[13px] font-bold text-[#4e5968]">선택한 날짜의 진행 일정 ({dayEvents.length})</h4>
              
              {dayEvents.length === 0 ? (
                <p className="text-[12.5px] text-[#8b95a1] py-4 bg-[#f8faf9] rounded-xl text-center border border-dashed border-[#e5e8eb]">
                  등록된 일정이 없습니다. 아래 폼에서 새 일정을 등록해보세요!
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {dayEvents.map(ev => {
                    const isExpanded = expandedEventId === ev.id;
                    const canDelete = ev.authorId === profile?.uid || isAdmin;

                    return (
                      <div 
                        key={ev.id}
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        className={cn(
                          "p-3 rounded-xl border transition-all cursor-pointer",
                          isExpanded 
                            ? "bg-[#ecfdf5] border-[#10b981]" 
                            : "bg-[#f8faf9] border-transparent hover:border-[#10b981]/30"
                        )}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span 
                              className="font-bold text-[13.5px] text-[#191f28] truncate px-1.5 py-0.5 rounded text-white" 
                              style={{ backgroundColor: ev.color || '#10b981' }}
                            >
                              {ev.title}
                            </span>
                            {ev.start !== ev.end && (
                              <span className="text-[10px] bg-[#10b981]/10 text-[#059669] px-1.5 py-0.2 rounded font-bold shrink-0">
                                {ev.start} ~ {ev.end}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-[#8b95a1] font-semibold flex items-center gap-0.5 bg-white border px-1.5 py-0.5 rounded">
                              <User className="w-2.5 h-2.5" /> {ev.authorName}
                            </span>
                            
                            {canDelete && (
                              <button
                                onClick={(e) => handleOpenDeleteConfirm(e, ev.id, ev.authorId)}
                                className="p-1 text-[#8b95a1] hover:text-[#f04452] hover:bg-white rounded transition-colors"
                                title="일정 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded Description */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2.5 border-t border-[#10b981]/15 text-[12.5px] text-[#333d4b] whitespace-pre-wrap leading-relaxed space-y-1 bg-white/40 p-2 rounded-lg">
                            <p className="font-semibold text-[#059669] flex items-center gap-1 text-[11px] mb-1">
                              <Info className="w-3 h-3" /> 상세 설명
                            </p>
                            {ev.description ? ev.description : "상세 설명 정보가 없습니다."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Unified Add Event Form inside the modal */}
            <form onSubmit={handleAddEvent} className="border-t border-[#f2f4f6] pt-4 space-y-3.5">
              <h4 className="text-[13px] font-bold text-[#4e5968] flex items-center gap-1">
                <Plus className="w-4 h-4 text-[#10b981]" /> 새 일정 등록하기
              </h4>
              
              <div className="space-y-3">
                {/* Title */}
                <div>
                  <label className="block text-[12px] font-bold text-[#4e5968] mb-1">일정 제목</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 인성교육주간, 6학년 현장체험학습"
                    className="w-full px-3.5 py-2.5 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-xl text-[13.5px] transition-all outline-none"
                    required
                  />
                </div>

                {/* Date Period (Start & End) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[12px] font-bold text-[#4e5968] mb-1">시작일</label>
                    <input
                      type="date"
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-xl text-[12.5px] font-semibold transition-all outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-[#4e5968] mb-1">종료일 (기간 설정)</label>
                    <input
                      type="date"
                      value={endDateInput}
                      onChange={(e) => setEndDateInput(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-xl text-[12.5px] font-semibold transition-all outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Event Color */}
                <div>
                  <label className="block text-[12px] font-bold text-[#4e5968] mb-1.5">일정 색상</label>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_COLORS.map(color => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setEventColor(color.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all border-2",
                          eventColor === color.value ? "border-[#191f28] scale-105 shadow-sm" : "border-transparent opacity-70 hover:opacity-100 text-white"
                        )}
                        style={{ backgroundColor: color.value, color: 'white' }}
                      >
                        {color.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-[12px] font-bold text-[#4e5968] mb-1">상세 설명 (선택사항)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="일정에 대한 세부 설명을 입력해 주세요."
                    className="w-full h-16 px-3.5 py-2.5 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-xl text-[12.5px] transition-all outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsDayModalOpen(false)}
                  className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-xl hover:bg-[#e5e8eb] transition-colors text-[13.5px]"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="flex-1 py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl transition-all text-[13.5px] shadow-sm disabled:opacity-50"
                >
                  일정 등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#f04452]">
              <AlertTriangle className="w-5 h-5 text-[#f04452]" />
              일정 삭제
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">
              정말로 이 일정을 학년 달력에서 삭제하시겠습니까? 데이터가 데이터베이스에서 완전히 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-2xl hover:bg-[#d73a49] transition-colors text-[14px]"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT MODAL */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#10b981]">
              <Info className="w-5 h-5 text-[#10b981]" />
              알림
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="w-full py-3.5 bg-[#10b981] text-white font-bold rounded-2xl hover:bg-[#059669] transition-colors text-[14px]"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default Calendar;
