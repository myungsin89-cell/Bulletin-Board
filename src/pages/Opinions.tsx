import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { collatorService, TeacherProfile } from '../utils/collatorService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MessageSquare, Trash2, Plus, CheckCircle2, Lock, Eye, UserCheck, Sparkles, Check, BarChart2, X } from 'lucide-react';
import { cn } from '../utils/cn';

interface Opinion {
  id: string;
  title: string;
  description: string;
  authorId: string;
  authorName: string;
  options: string[];
  votes: Record<string, number>;
  type?: 'general' | 'candidate';
  isAnonymous?: boolean;
  createdAt: any;
}

const DEFAULT_14_CLASSES = Array.from({ length: 14 }).map((_, i) => `${i + 1}반`);
const LOCAL_OPINIONS_KEY = 'donghaknyeon_opinions_persistence_v1';

// Helper to load opinions from LocalStorage
const loadLocalOpinions = (): Opinion[] => {
  try {
    const data = localStorage.getItem(LOCAL_OPINIONS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

// Helper to save opinions to LocalStorage
const saveLocalOpinions = (data: Opinion[]) => {
  try {
    localStorage.setItem(LOCAL_OPINIONS_KEY, JSON.stringify(data));
  } catch (e) {}
};

export function Opinions() {
  const { profile } = useAuth();
  const [opinions, setOpinions] = useState<Opinion[]>(() => loadLocalOpinions());
  const [isComposing, setIsComposing] = useState(false);

  // Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [voteType, setVoteType] = useState<'general' | 'candidate'>('general');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [generalOptions, setGeneralOptions] = useState<string[]>(['찬성 (동의)', '반대 (미동의)']);

  // Registered teachers list from Collator Service
  const [teachers, setTeachers] = useState<TeacherProfile[]>(() => collatorService?.teachers || []);

  const displayTeacherNames = (teachers && teachers.length > 0)
    ? teachers.map(t => t.name)
    : DEFAULT_14_CLASSES;

  const [selectedCandidateNames, setSelectedCandidateNames] = useState<string[]>(DEFAULT_14_CLASSES);

  // Modal States
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [viewVotersOpinion, setViewVotersOpinion] = useState<Opinion | null>(null);

  useEffect(() => {
    if (!collatorService) return;
    if (collatorService.teachers && collatorService.teachers.length > 0) {
      setTeachers(collatorService.teachers);
      setSelectedCandidateNames(collatorService.teachers.map(t => t.name));
    }

    const handlePresenceChange = () => {
      const updated = collatorService.teachers || [];
      setTeachers([...updated]);
      if (updated.length > 0 && selectedCandidateNames.length === 0) {
        setSelectedCandidateNames(updated.map(t => t.name));
      }
    };

    collatorService.addEventListener('presenceChange', handlePresenceChange);
    return () => {
      collatorService.removeEventListener('presenceChange', handlePresenceChange);
    };
  }, []);

  // Fetch Opinions Realtime with LocalStorage Fallback Backup
  useEffect(() => {
    if (!db) return;
    try {
      const q = query(collection(db, 'opinions'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const serverOpinions = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Opinion[];

        setOpinions(prev => {
          const localStored = loadLocalOpinions();
          // Merge local storage + current local state + server docs
          const mergedMap = new Map<string, Opinion>();
          
          localStored.forEach(o => mergedMap.set(o.id, o));
          prev.forEach(o => mergedMap.set(o.id, o));
          serverOpinions.forEach(o => mergedMap.set(o.id, o));

          const merged = Array.from(mergedMap.values());
          
          // Sort by creation time
          merged.sort((a, b) => {
            const getMillis = (item: any) => {
              if (item?.createdAt?.toDate) return item.createdAt.toDate().getTime();
              if (typeof item?.createdAt === 'number') return item.createdAt;
              if (item?.createdAt instanceof Date) return item.createdAt.getTime();
              return Date.now();
            };
            return getMillis(b) - getMillis(a);
          });

          saveLocalOpinions(merged);
          return merged;
        });
      }, (error) => {
        // Silently fallback to LocalStorage if Firebase permissions fail
        console.warn('Firestore permissions fallback: using LocalStorage opinions');
      });

      return unsubscribe;
    } catch (err) {
      console.warn('Firestore opinions query error fallback:', err);
    }
  }, []);

  const toggleTeacherCandidate = (name: string) => {
    if (selectedCandidateNames.includes(name)) {
      if (selectedCandidateNames.length <= 2) {
        return alert('최소 2명 이상의 대상자를 선택하셔야 합니다.');
      }
      setSelectedCandidateNames(selectedCandidateNames.filter(n => n !== name));
    } else {
      setSelectedCandidateNames([...selectedCandidateNames, name]);
    }
  };

  const handleSelectAllTeachers = () => {
    if (selectedCandidateNames.length === displayTeacherNames.length) {
      setSelectedCandidateNames(displayTeacherNames.slice(0, 2));
    } else {
      setSelectedCandidateNames([...displayTeacherNames]);
    }
  };

  const handleAddGeneralOption = () => {
    if (generalOptions.length < 20) setGeneralOptions([...generalOptions, '']);
  };

  const handleGeneralOptionChange = (index: number, value: string) => {
    const newOpts = [...generalOptions];
    newOpts[index] = value;
    setGeneralOptions(newOpts);
  };

  const handleRemoveGeneralOption = (index: number) => {
    if (generalOptions.length <= 2) return alert('최소 2개 이상의 항목이 필요합니다.');
    setGeneralOptions(generalOptions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return alert('투표 제목을 입력해 주세요.');

    const authorDisplayName = profile?.displayName || '선생님';
    const authorUid = profile?.uid || 'user_' + Date.now();

    let finalOptions: string[] = [];
    if (voteType === 'candidate') {
      finalOptions = selectedCandidateNames;
    } else {
      finalOptions = generalOptions.filter(opt => opt.trim() !== '');
    }

    if (finalOptions.length < 2) {
      return alert('투표 항목은 최소 2개 이상 선택하거나 작성하셔야 합니다.');
    }

    const newOpinionObj: Opinion = {
      id: 'op_' + Date.now(),
      title: title.trim(),
      description: description.trim(),
      authorId: authorUid,
      authorName: authorDisplayName,
      options: finalOptions,
      type: voteType,
      isAnonymous,
      votes: {},
      createdAt: Date.now()
    };

    // Save to Local State + LocalStorage
    setOpinions(prev => {
      const updated = [newOpinionObj, ...prev];
      saveLocalOpinions(updated);
      return updated;
    });

    setIsComposing(false);
    setTitle('');
    setDescription('');
    setVoteType('general');
    setIsAnonymous(false);
    setGeneralOptions(['찬성 (동의)', '반대 (미동의)']);

    // Attempt Remote Firestore Save
    try {
      if (db) {
        await addDoc(collection(db, 'opinions'), {
          title: newOpinionObj.title,
          description: newOpinionObj.description,
          authorId: newOpinionObj.authorId,
          authorName: newOpinionObj.authorName,
          options: newOpinionObj.options,
          type: newOpinionObj.type,
          isAnonymous: newOpinionObj.isAnonymous,
          votes: {},
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.warn('Firestore remote save fallback: opinion persisted in LocalStorage');
    }
  };

  const handleDelete = async (id: string) => {
    setOpinions(prev => {
      const updated = prev.filter(o => o.id !== id);
      saveLocalOpinions(updated);
      return updated;
    });
    setDeleteConfirmId(null);

    try {
      if (db && !id.startsWith('op_')) {
        await deleteDoc(doc(db, 'opinions', id));
      }
    } catch (error) {
      console.warn('Delete opinion fallback:', error);
    }
  };

  const handleVote = async (opinionId: string, optionIndex: number) => {
    const voterUid = profile?.uid || 'anonymous_voter';
    const opinion = opinions.find(o => o.id === opinionId);
    if (!opinion) return;

    const newVotes = { ...(opinion.votes || {}) };
    if (newVotes[voterUid] === optionIndex) {
      delete newVotes[voterUid];
    } else {
      newVotes[voterUid] = optionIndex;
    }

    setOpinions(prev => {
      const updated = prev.map(o => o.id === opinionId ? { ...o, votes: newVotes } : o);
      saveLocalOpinions(updated);
      return updated;
    });

    try {
      if (db && !opinionId.startsWith('op_')) {
        await updateDoc(doc(db, 'opinions', opinionId), { votes: newVotes });
      }
    } catch (error) {
      console.warn('Vote update fallback:', error);
    }
  };

  const getVotersForOption = (opinion: Opinion, optionIndex: number) => {
    if (opinion.isAnonymous) return [];
    const votes = opinion.votes || {};
    const voterUserIds = Object.keys(votes).filter(uid => votes[uid] === optionIndex);

    return voterUserIds.map(uid => {
      const teacher = (teachers || []).find(t => t.id === uid);
      if (teacher) return teacher.name;
      if (uid === profile?.uid) return profile.displayName;
      return '선생님';
    });
  };

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <h2 className="text-[19px] font-bold text-[#191f28] flex items-center gap-2">
          <MessageSquare className="w-5.5 h-5.5 text-[#10b981]" />
          의견 및 투표
          <span className="text-[13px] bg-[#f2f4f6] text-[#4e5968] px-2.5 py-0.5 rounded-full font-mono font-bold ml-1">
            {opinions.length}
          </span>
        </h2>
        <button
          onClick={() => setIsComposing(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#10b981] text-white hover:bg-[#059669] rounded-xl font-bold text-[14px] transition-all active:scale-95 shadow-sm"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>새 안건/투표 개설</span>
        </button>
      </div>

      {/* Compose Form Modal */}
      {isComposing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-7 w-full max-w-2xl shadow-2xl border border-white max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-[#f2f4f6] pb-3.5">
              <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#10b981]" />
                새 안건 및 투표 개설
              </h3>
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="p-1.5 text-[#8b95a1] hover:text-[#191f28] hover:bg-[#f2f4f6] rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 pt-1">
              <div>
                <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">투표/안건 제목</label>
                <input
                  type="text"
                  placeholder="예: 2학기 동학년 대표 교사 추천 또는 현장학습 장소 선정"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-[16px] font-bold px-4 py-3.5 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors placeholder-[#b0b8c1] text-[#191f28]"
                  required
                />
              </div>

              <div>
                <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">상세 설명 (선택사항)</label>
                <textarea
                  placeholder="안건에 대한 추가 설명이나 일정을 자유롭게 입력하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-20 px-4 py-3 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors resize-none placeholder-[#b0b8c1] text-[#191f28] text-[14.5px] leading-relaxed"
                />
              </div>

              {/* Type & Confidentiality Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="bg-[#f8fafc] p-4 rounded-2xl border border-[#e2e8f0] space-y-2">
                  <label className="block text-[13.5px] font-bold text-[#191f28]">📌 투표 목적 구분</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVoteType('general')}
                      className={cn(
                        "py-2.5 px-3 rounded-xl font-bold text-[13px] border transition-all flex items-center justify-center gap-1.5",
                        voteType === 'general'
                          ? "bg-[#10b981] text-white border-[#10b981] shadow-xs"
                          : "bg-white text-[#4e5968] border-[#d1d6db] hover:bg-[#f2f4f6]"
                      )}
                    >
                      <MessageSquare className="w-4 h-4" />
                      일반 안건 투표
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoteType('candidate')}
                      className={cn(
                        "py-2.5 px-3 rounded-xl font-bold text-[13px] border transition-all flex items-center justify-center gap-1.5",
                        voteType === 'candidate'
                          ? "bg-[#10b981] text-white border-[#10b981] shadow-xs"
                          : "bg-white text-[#4e5968] border-[#d1d6db] hover:bg-[#f2f4f6]"
                      )}
                    >
                      <UserCheck className="w-4 h-4" />
                      대상자(선생님) 선정
                    </button>
                  </div>
                </div>

                <div className="bg-[#f8fafc] p-4 rounded-2xl border border-[#e2e8f0] space-y-2">
                  <label className="block text-[13.5px] font-bold text-[#191f28]">🔒 공개 / 익명 투표 설정</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAnonymous(false)}
                      className={cn(
                        "py-2.5 px-3 rounded-xl font-bold text-[13px] border transition-all flex items-center justify-center gap-1.5",
                        !isAnonymous
                          ? "bg-[#3b82f6] text-white border-[#3b82f6] shadow-xs"
                          : "bg-white text-[#4e5968] border-[#d1d6db] hover:bg-[#f2f4f6]"
                      )}
                    >
                      <Eye className="w-4 h-4" />
                      공개 투표
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAnonymous(true)}
                      className={cn(
                        "py-2.5 px-3 rounded-xl font-bold text-[13px] border transition-all flex items-center justify-center gap-1.5",
                        isAnonymous
                          ? "bg-[#8b5cf6] text-white border-[#8b5cf6] shadow-xs"
                          : "bg-white text-[#4e5968] border-[#d1d6db] hover:bg-[#f2f4f6]"
                      )}
                    >
                      <Lock className="w-4 h-4" />
                      비공개 (익명)
                    </button>
                  </div>
                </div>
              </div>

              {voteType === 'candidate' ? (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[14px] font-bold text-[#191f28] flex items-center gap-1.5">
                      <UserCheck className="w-4.5 h-4.5 text-[#10b981]" />
                      투표 대상자(선생님) 카드를 선택하세요
                      <span className="text-[12px] bg-[#ecfdf5] text-[#10b981] px-2 py-0.5 rounded-full font-bold ml-1">
                        {selectedCandidateNames.length}명 선택됨
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={handleSelectAllTeachers}
                      className="text-[12.5px] font-bold text-[#10b981] hover:underline flex items-center gap-1"
                    >
                      {selectedCandidateNames.length === displayTeacherNames.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1">
                    {displayTeacherNames.map((name, idx) => {
                      const isSelected = selectedCandidateNames.includes(name);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleTeacherCandidate(name)}
                          className={cn(
                            "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none",
                            isSelected
                              ? "bg-[#ecfdf5] border-[#10b981] text-[#047857] shadow-xs"
                              : "bg-[#f8fafc] border-[#e2e8f0] text-[#4e5968] hover:bg-[#f1f5f9]"
                          )}
                        >
                          <span className="font-bold text-[13.5px] truncate">{name}</span>
                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center transition-colors shrink-0",
                            isSelected ? "bg-[#10b981] text-white" : "bg-[#e2e8f0] text-transparent"
                          )}>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <label className="block text-[14px] font-bold text-[#191f28]">
                    📋 투표 항목 선택지
                  </label>

                  <div className="space-y-2">
                    {generalOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-7 text-[13px] font-bold text-[#8b95a1] text-center">{idx + 1}.</span>
                        <input
                          type="text"
                          placeholder={`항목 ${idx + 1}`}
                          value={opt}
                          onChange={(e) => handleGeneralOptionChange(idx, e.target.value)}
                          className="flex-1 px-4 py-2.5 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors text-[14.5px] text-[#191f28]"
                          required={idx < 2}
                        />
                        {generalOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGeneralOption(idx)}
                            className="p-2 text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] rounded-lg transition-colors"
                            title="항목 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {generalOptions.length < 20 && (
                    <button
                      type="button"
                      onClick={handleAddGeneralOption}
                      className="text-[13.5px] font-bold text-[#10b981] hover:text-[#059669] px-2 py-1.5 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> 항목 추가하기
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#f2f4f6]">
                <button
                  type="button"
                  onClick={() => setIsComposing(false)}
                  className="px-5 py-2.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="bg-[#10b981] text-white px-7 py-2.5 rounded-xl font-bold hover:bg-[#059669] active:scale-95 transition-all text-[14px] shadow-sm"
                >
                  투표 개설 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opinions Grid List */}
      <div className="grid gap-6 md:grid-cols-2">
        {opinions.map((opinion) => {
          const totalVotes = Object.keys(opinion.votes || {}).length;
          const userVote = profile ? opinion.votes[profile.uid] : undefined;
          const isCandidateType = opinion.type === 'candidate';
          const isAnon = !!opinion.isAnonymous;

          return (
            <div key={opinion.id} className="bg-white p-6 sm:p-7 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6] flex flex-col h-full transition-all">
              {/* Card Header & Badges */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className={cn(
                      "text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-md border flex items-center gap-1",
                      isCandidateType 
                        ? "bg-[#e0f2fe] text-[#0284c7] border-[#bae6fd]"
                        : "bg-[#f2f4f6] text-[#4e5968] border-[#e5e8eb]"
                    )}>
                      {isCandidateType ? <UserCheck className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {isCandidateType ? '대상자 선정' : '일반 투표'}
                    </span>

                    <span className={cn(
                      "text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-md border flex items-center gap-1",
                      isAnon 
                        ? "bg-[#f3e8ff] text-[#7e22ce] border-[#e9d5ff]"
                        : "bg-[#dbeafe] text-[#1d4ed8] border-[#bfdbfe]"
                    )}>
                      {isAnon ? <Lock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {isAnon ? '비공개 (익명)' : '공개 투표'}
                    </span>
                  </div>

                  <h3 className="text-[18px] font-bold text-[#191f28] leading-snug">{opinion.title}</h3>
                  <div className="flex items-center gap-2 text-[13px] text-[#8b95a1] mt-1.5 font-medium">
                    <span className="text-[#4e5968] font-bold">{opinion.authorName}</span>
                    <span>•</span>
                    <span>
                      {opinion.createdAt?.toDate ? format(opinion.createdAt.toDate(), 'PPP a', { locale: ko }) : '방금 전'}
                    </span>
                  </div>
                </div>

                {(profile?.uid === opinion.authorId || profile?.role === 'admin') && (
                  <button
                    onClick={() => setDeleteConfirmId(opinion.id)}
                    className="p-2 text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] rounded-xl transition-colors shrink-0"
                    title="삭제"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                )}
              </div>
              
              {opinion.description && (
                <p className="text-[14.5px] text-[#333d4b] mb-5 whitespace-pre-wrap leading-relaxed bg-[#f8fafc] p-3 rounded-xl border border-[#f1f5f9]">
                  {opinion.description}
                </p>
              )}

              {/* Options & Voting Progress */}
              <div className="space-y-3 mt-auto">
                {(opinion.options || []).map((opt, idx) => {
                  const voteCount = Object.values(opinion.votes || {}).filter(v => v === idx).length;
                  const percentage = totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100);
                  const isSelected = userVote === idx;

                  return (
                    <div key={idx} className="space-y-1.5">
                      <button
                        onClick={() => handleVote(opinion.id, idx)}
                        className={cn(
                          "w-full relative overflow-hidden rounded-xl p-3.5 text-left transition-all group border",
                          isSelected 
                            ? "bg-[#ecfdf5] border-[#a7f3d0]" 
                            : "bg-[#f8fafc] hover:bg-[#f1f5f9] border-[#e2e8f0]"
                        )}
                      >
                        <div 
                          className="absolute inset-y-0 left-0 bg-[#d1fae5] transition-all duration-500 ease-out"
                          style={{ width: `${percentage}%` }}
                        />
                        <div className="relative flex items-center justify-between z-10">
                          <span className={cn(
                            "text-[14.5px] font-bold flex items-center gap-2",
                            isSelected ? "text-[#047857]" : "text-[#191f28]"
                          )}>
                            {isSelected && <CheckCircle2 className="w-4.5 h-4.5 text-[#10b981]" />}
                            {opt}
                          </span>
                          <span className={cn(
                            "text-[13px] font-bold",
                            isSelected ? "text-[#047857]" : "text-[#8b95a1]"
                          )}>
                            {voteCount}표 ({percentage}%)
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Card Summary & Voter Details Button */}
              <div className="mt-5 pt-3 border-t border-[#f8faf9] flex items-center justify-between text-[12.5px] text-[#8b95a1] font-semibold">
                <span>
                  {isAnon ? '🔒 익명 비밀 투표' : '🔓 공개 투표'}
                </span>
                
                <div className="flex items-center gap-2">
                  {!isAnon && totalVotes > 0 && (
                    <button
                      onClick={() => setViewVotersOpinion(opinion)}
                      className="px-2.5 py-1 bg-[#eff6ff] hover:bg-[#dbeafe] text-[#1d4ed8] font-bold rounded-lg transition-colors flex items-center gap-1 border border-[#bfdbfe]"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      투표 현황 확인
                    </button>
                  )}
                  <span className="text-[#191f28] font-bold">
                    총 {totalVotes}명 참여
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {opinions.length === 0 && !isComposing && (
          <div className="col-span-full text-center py-16 bg-white rounded-[24px] border border-[#f2f4f6]">
            <div className="w-14 h-14 bg-[#f2f4f6] rounded-full flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-7 h-7 text-[#b0b8c1]" />
            </div>
            <p className="text-[16px] font-bold text-[#4e5968]">등록된 안건이 없습니다.</p>
            <p className="text-[14px] text-[#8b95a1] mt-1">새로운 의견수렴이나 대상자 선정 투표를 시작해 보세요.</p>
          </div>
        )}
      </div>

      {/* PUBLIC VOTE DETAILED VOTERS MODAL */}
      {viewVotersOpinion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-7 w-full max-w-lg shadow-xl border border-white space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-[#f1f5f9]">
              <div>
                <span className="text-[12px] font-bold text-[#1d4ed8] bg-[#dbeafe] px-2.5 py-0.5 rounded-md border border-[#bfdbfe] inline-block mb-1.5">
                  🔓 공개 투표 명단 현황
                </span>
                <h3 className="text-[18px] font-bold text-[#191f28] leading-snug">
                  {viewVotersOpinion.title}
                </h3>
              </div>
              <button
                onClick={() => setViewVotersOpinion(null)}
                className="p-1.5 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {(viewVotersOpinion.options || []).map((opt, idx) => {
                const voters = getVotersForOption(viewVotersOpinion, idx);
                return (
                  <div key={idx} className="bg-[#f8fafc] p-4 rounded-2xl border border-[#e2e8f0] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[14.5px] text-[#191f28] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                        {opt}
                      </span>
                      <span className="text-[12.5px] font-bold text-[#10b981] bg-[#ecfdf5] px-2 py-0.5 rounded-md border border-[#c2f0de]">
                        {voters.length}명 투표
                      </span>
                    </div>

                    {voters.length === 0 ? (
                      <p className="text-[12.5px] text-[#8b95a1] italic pl-5">아직 투표한 선생님이 없습니다.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pl-5 pt-1">
                        {voters.map((vName, vIdx) => (
                          <span key={vIdx} className="bg-white text-[#1e293b] font-bold text-[12.5px] px-3 py-1 rounded-xl border border-[#cbd5e1] shadow-2xs">
                            {vName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setViewVotersOpinion(null)}
                className="w-full py-3 bg-[#191f28] text-white font-bold rounded-xl hover:bg-[#333d4b] transition-colors text-[14px]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 text-[#f04452]">의견 안건 삭제</h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">정말로 이 안건 투표를 삭제하시겠습니까?</p>
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
    </div>
  );
}

export default Opinions;
