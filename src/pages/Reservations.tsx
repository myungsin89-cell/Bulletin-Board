import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, addDays, startOfWeek, subDays, getWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, Trash2, Check, AlertCircle, Plus, X, AlertTriangle, ChevronLeft, ChevronRight, MapPin, Info } from 'lucide-react';
import { cn } from '../utils/cn';

interface Reservation {
  id: string;
  equipmentId: string;
  equipmentName: string;
  date: string;
  period: number;
  authorId: string;
  authorName: string;
  createdAt: any;
}

interface Equipment {
  id: string;
  name: string;
  description?: string;
  createdBy?: string;
}

const DEFAULT_EQUIPMENTS: Equipment[] = [];

const PERIODS = [1, 2, 3, 4, 5, 6];
const DAYS_OF_WEEK = ['월', '화', '수', '목', '금'];

export function Reservations() {
  const { profile } = useAuth();
  const [equipments, setEquipments] = useState<Equipment[]>(DEFAULT_EQUIPMENTS);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  
  // Weekly selection state
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 1 });
  });

  const [selectedEquipment, setSelectedEquipment] = useState<string>(DEFAULT_EQUIPMENTS[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  // Delete Modals State
  const [deleteReservationId, setDeleteReservationId] = useState<string | null>(null);
  const [deleteEquipmentTarget, setDeleteEquipmentTarget] = useState<Equipment | null>(null);

  // Equipment Add Modal States
  const [isAddEquipmentModalOpen, setIsAddEquipmentModalOpen] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentDescription, setNewEquipmentDescription] = useState('');

  const isAdmin = profile?.role === 'admin';

  // Compute Monday to Friday dates
  const weekDays = Array.from({ length: 5 }).map((_, i) => addDays(currentWeekStart, i));
  const weekDaysStr = weekDays.map(d => format(d, 'yyyy-MM-dd'));

  // 1) Fetch Equipments from Firestore
  useEffect(() => {
    if (!db) {
      setEquipments(DEFAULT_EQUIPMENTS);
      return;
    }

    const q = query(collection(db, 'equipments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eqData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Equipment[];
      
      setEquipments(eqData);
      
      if (!eqData.some(e => e.id === selectedEquipment) && eqData.length > 0) {
        setSelectedEquipment(eqData[0].id);
      }
    }, (err) => {
      console.warn('Equipment snapshot fallback:', err);
    });

    return unsubscribe;
  }, []);

  // 2) Fetch Weekly Reservations
  useEffect(() => {
    if (!selectedEquipment || !db) return;

    const startDateStr = weekDaysStr[0];
    const endDateStr = weekDaysStr[4];

    const q = query(
      collection(db, 'reservations'),
      where('equipmentId', '==', selectedEquipment),
      where('date', '>=', startDateStr),
      where('date', '<=', endDateStr)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Reservation[];
      setReservations(resData);
      setError(null);
    }, (error) => {
      console.warn('Reservations error:', error);
    });

    return unsubscribe;
  }, [currentWeekStart, selectedEquipment]);

  // Week navigation controls
  const handlePrevWeek = () => {
    setCurrentWeekStart(prev => subDays(prev, 7));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => addDays(prev, 7));
  };

  const handleThisWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  // Handle Adding New Equipment
  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEquipmentName.trim()) return alert('기자재/장소 이름을 입력해주세요.');

    const newId = 'eq_' + Date.now();
    const newEq: Equipment = {
      id: newId,
      name: newEquipmentName.trim(),
      description: newEquipmentDescription.trim(),
      createdBy: profile?.uid
    };

    try {
      if (db) {
        await setDoc(doc(db, 'equipments', newId), newEq);
      }
    } catch (err) {
      console.warn('Set equipment remote error:', err);
    }
    
    setEquipments(prev => [...prev, newEq]);
    setSelectedEquipment(newId);
    setNewEquipmentName('');
    setNewEquipmentDescription('');
    setIsAddEquipmentModalOpen(false);
  };

  // Confirm Equipment Delete
  const confirmDeleteEquipment = async () => {
    if (!deleteEquipmentTarget) return;
    const eqId = deleteEquipmentTarget.id;

    try {
      if (db) {
        await deleteDoc(doc(db, 'equipments', eqId));
      }
    } catch (err) {
      console.warn('Firestore equipment delete permission fallback:', err);
    }

    setEquipments(prev => prev.filter(item => item.id !== eqId));
    if (selectedEquipment === eqId) {
      const remaining = equipments.filter(item => item.id !== eqId);
      if (remaining.length > 0) {
        setSelectedEquipment(remaining[0].id);
      }
    }
    setDeleteEquipmentTarget(null);
  };

  // Handle Making Reservation
  const handleReserve = async (dateStr: string, period: number) => {
    if (!profile) return;
    setError(null);

    const equipment = equipments.find(e => e.id === selectedEquipment);
    if (!equipment) return;

    const reservationId = `${selectedEquipment}_${dateStr}_${period}`;

    try {
      if (db) {
        await setDoc(doc(db, 'reservations', reservationId), {
          equipmentId: equipment.id,
          equipmentName: equipment.name,
          date: dateStr,
          period,
          authorId: profile.uid,
          authorName: profile.displayName,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions'))) {
        setError('이미 다른 선생님께서 예약하신 교시이거나 권한이 없습니다.');
      } else {
        console.warn('Reservation create error:', err);
      }
    }
  };

  // Confirm Reservation Delete
  const confirmCancelReservation = async () => {
    if (!deleteReservationId) return;
    try {
      if (db) {
        await deleteDoc(doc(db, 'reservations', deleteReservationId));
      }
    } catch (err) {
      console.warn('Reservation delete error:', err);
    }
    setReservations(prev => prev.filter(r => r.id !== deleteReservationId));
    setDeleteReservationId(null);
  };

  const currentEquipmentObj = equipments.find(e => e.id === selectedEquipment);

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Top Main Header Button */}
      <div className="flex items-center justify-between py-1">
        <h2 className="text-[19px] font-bold text-[#191f28] flex items-center gap-2">
          <Calendar className="w-5.5 h-5.5 text-[#10b981]" />
          주간 기자재 및 특별실 예약
        </h2>
        <button
          onClick={() => setIsAddEquipmentModalOpen(true)}
          className="px-4 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[14px] transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4.5 h-4.5 stroke-[3]" />
          예약 대상 추가
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-5">
        {/* 좌측: 예약 대상 선택 목록 */}
        <div className="md:col-span-1 space-y-5">
          {/* Equipment List Card */}
          <div className="bg-white p-5 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6] space-y-3.5">
            <div className="flex justify-between items-center border-b border-[#f8faf9] pb-2">
              <h3 className="text-[15px] font-bold text-[#191f28]">예약 대상 목록</h3>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {equipments.map((eq) => {
                const isSelected = selectedEquipment === eq.id;
                const canDeleteEquipment = isAdmin || eq.createdBy === profile?.uid || !eq.createdBy;

                return (
                  <div
                    key={eq.id}
                    onClick={() => setSelectedEquipment(eq.id)}
                    className={cn(
                      "w-full p-3 rounded-[16px] text-[13.5px] font-semibold transition-all flex flex-col cursor-pointer border",
                      isSelected
                        ? "bg-[#ecfdf5] text-[#10b981] border-[#a7f3d0] shadow-2xs"
                        : "bg-[#f8fafc] text-[#4e5968] hover:bg-[#f1f5f9] border-transparent"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate pr-2 font-bold text-[14px]">{eq.name}</span>
                      
                      {canDeleteEquipment && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteEquipmentTarget(eq);
                          }}
                          className="p-1 text-[#8b95a1] hover:text-[#f04452] hover:bg-white rounded-lg transition-colors shrink-0"
                          title="예약 대상 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Location/Description Box beneath selected item */}
                    {isSelected && eq.description && (
                      <div className="mt-2 text-[12px] text-[#047857] bg-white/80 p-2 rounded-xl border border-[#a7f3d0] flex items-start gap-1.5 leading-relaxed animate-fade-in">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#10b981]" />
                        <span className="font-medium">{eq.description}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {equipments.length === 0 && (
              <div className="py-8 text-center bg-[#f8fafc] rounded-xl border border-dashed border-[#e2e8f0]">
                <p className="text-[13.5px] font-bold text-[#64748b]">등록된 예약 대상이 없습니다.</p>
                <p className="text-[12px] text-[#94a3b8] mt-1">우측 상단의 추가 버튼을 눌러보세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* 우측: 주간 시간표 그리드 */}
        <div className="md:col-span-3 space-y-4">
          {/* Week Selector Bar */}
          <div className="bg-white p-3.5 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevWeek}
                className="p-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] rounded-lg transition-colors"
                title="이전 주"
              >
                <ChevronLeft className="w-4.5 h-4.5" />
              </button>
              
              <div className="px-3.5 py-1.5 bg-[#f2f4f6] rounded-lg text-[13.5px] font-bold text-[#191f28] flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#10b981]" />
                <span>
                  {format(weekDays[0], 'M월 d일')} ~ {format(weekDays[4], 'M월 d일')}
                </span>
                <span className="text-[11px] bg-[#ecfdf5] text-[#10b981] px-1.5 py-0.2 rounded-md font-medium border border-[#c2f0de] ml-1">
                  {getWeek(weekDays[0], { weekStartsOn: 1 })}주차
                </span>
              </div>

              <button
                onClick={handleNextWeek}
                className="p-2 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] rounded-lg transition-colors"
                title="다음 주"
              >
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleThisWeek}
                className="px-3 py-1.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] font-bold rounded-lg text-[12.5px] transition-colors"
              >
                이번 주
              </button>
              
              {/* Legends */}
              <div className="flex items-center gap-2 text-[11px] font-bold border-l border-[#f2f4f6] pl-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#ecfdf5] border border-[#c2f0de]"></div>
                  <span className="text-[#10b981]">내 예약</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#fff5f5] border border-[#ffe3e3]"></div>
                  <span className="text-[#f04452]">예약됨</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-[#fff5f5] rounded-[12px] flex items-start gap-2 text-[#f04452] text-[13px] font-medium">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Timetable Grid Card - NATURAL MODERN TIMETABLE LOOK */}
          <div className="bg-white p-5 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden border border-[#e2e8f0]">
            {/* Active Selected Equipment Info Header */}
            {currentEquipmentObj && (
              <div className="mb-3 pb-2 border-b border-[#f1f5f9] flex items-center justify-between">
                <h3 className="text-[15.5px] font-bold text-[#191f28] flex items-center gap-1.5">
                  📌 {currentEquipmentObj.name} 시간표
                </h3>
                {currentEquipmentObj.description && (
                  <span className="text-[12px] text-[#047857] bg-[#ecfdf5] px-2.5 py-0.5 rounded-lg border border-[#a7f3d0] font-medium flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#10b981]" />
                    {currentEquipmentObj.description}
                  </span>
                )}
              </div>
            )}

            <div className="w-full overflow-hidden rounded-2xl border border-[#e2e8f0]">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                    <th className="w-[12%] py-3 text-[13px] font-bold text-[#64748b] text-center border-r border-[#e2e8f0]">
                      교시
                    </th>
                    {weekDays.map((day, idx) => (
                      <th 
                        key={idx} 
                        className={cn(
                          "py-3 text-[13px] font-bold text-center border-r border-[#e2e8f0] last:border-r-0",
                          format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                            ? "text-[#10b981] font-extrabold bg-[#ecfdf5]"
                            : "text-[#475569]"
                        )}
                      >
                        <div className="flex flex-col items-center leading-tight">
                          <span className="text-[11px] opacity-75">{DAYS_OF_WEEK[idx]}요일</span>
                          <span className="text-[14px] font-bold mt-0.5">{format(day, 'M/d')}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period} className="border-b border-[#e2e8f0] last:border-b-0">
                      {/* Period Column */}
                      <td className="py-3 text-center font-bold text-[13.5px] text-[#64748b] bg-[#f8fafc] border-r border-[#e2e8f0]">
                        {period}교시
                      </td>
                      
                      {/* Mon ~ Fri Cells */}
                      {weekDaysStr.map((dateStr) => {
                        const reservation = reservations.find(r => r.date === dateStr && r.period === period);
                        const isMyReservation = reservation?.authorId === profile?.uid || reservation?.authorName === profile?.displayName;
                        const canDeleteReservation = !!reservation && (isMyReservation || isAdmin);
                        const isReserved = !!reservation;

                        const handleCellClick = () => {
                          if (!isReserved) {
                            handleReserve(dateStr, period);
                          } else {
                            if (canDeleteReservation) {
                              setDeleteReservationId(reservation.id);
                            } else {
                              setError('다른 선생님께서 예약하신 교시입니다.');
                            }
                          }
                        };

                        return (
                          <td key={dateStr} className="p-1 vertical-middle border-r border-[#e2e8f0] last:border-r-0 bg-white">
                            <div
                              onClick={handleCellClick}
                              className={cn(
                                "w-full min-h-[58px] sm:min-h-[60px] px-2 py-1.5 rounded-xl flex items-center justify-center transition-all select-none border cursor-pointer",
                                !isReserved 
                                  ? "bg-[#f8fafc] hover:bg-[#ecfdf5] border-dashed border-[#cbd5e1] hover:border-[#10b981] group" 
                                  : isMyReservation
                                    ? "bg-[#ecfdf5] hover:bg-[#d1fae5] border-[#a7f3d0] shadow-2xs"
                                    : "bg-[#fff1f2] hover:bg-[#ffe4e6] border-[#fecdd3]"
                              )}
                              title={isReserved ? (canDeleteReservation ? '클릭 시 예약 취소' : `${reservation.authorName} 선생님 예약`) : '클릭 시 예약'}
                            >
                              {/* Content inside cell - PERFECTLY CENTERED WITHOUT X BUTTON */}
                              <div className="flex items-center justify-center w-full text-center">
                                {isReserved ? (
                                  <span className={cn(
                                    "text-[13.5px] font-bold truncate leading-tight text-center w-full px-1",
                                    isMyReservation ? "text-[#047857]" : "text-[#be123c]"
                                  )}>
                                    {reservation.authorName}
                                  </span>
                                ) : (
                                  <span className="text-[13px] text-[#94a3b8] group-hover:text-[#10b981] font-bold w-full text-center py-1 transition-colors flex items-center justify-center gap-1">
                                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> 예약
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ADD EQUIPMENT MODAL */}
      {isAddEquipmentModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-8 w-full max-w-md shadow-xl border border-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#191f28] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#10b981]" />
                새 예약 대상 추가
              </h3>
              <button 
                onClick={() => setIsAddEquipmentModalOpen(false)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddEquipment} className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">기자재 또는 장소 이름</label>
                <input
                  type="text"
                  value={newEquipmentName}
                  onChange={(e) => setNewEquipmentName(e.target.value)}
                  placeholder="예: 3D 프린터, 컴퓨터실, VR 체험실"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">위치 및 상세 설명 (선택사항)</label>
                <input
                  type="text"
                  value={newEquipmentDescription}
                  onChange={(e) => setNewEquipmentDescription(e.target.value)}
                  placeholder="예: 본관 3층 6학년 연구실 복도 (30대 보유)"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddEquipmentModalOpen(false)}
                  className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-2xl transition-all shadow-sm text-[14px]"
                >
                  추가하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE EQUIPMENT MODAL */}
      {deleteEquipmentTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#f04452]">
              <AlertTriangle className="w-5 h-5 text-[#f04452]" />
              예약 대상 삭제
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">
              정말로 <b>'{deleteEquipmentTarget.name}'</b> 대상을 삭제하시겠습니까? 관련 데이터가 안전하게 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteEquipmentTarget(null)}
                className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteEquipment}
                className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-2xl hover:bg-[#d73a49] transition-colors text-[14px]"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE RESERVATION MODAL */}
      {deleteReservationId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#f04452]">
              <AlertTriangle className="w-5 h-5 text-[#f04452]" />
              예약 취소
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">
              정말 이 예약을 취소하시겠습니까? 해당 교시는 다시 예약 가능한 상태로 변합니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteReservationId(null)}
                className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                닫기
              </button>
              <button
                onClick={confirmCancelReservation}
                className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-2xl hover:bg-[#d73a49] transition-colors text-[14px]"
              >
                예약 취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Reservations;
