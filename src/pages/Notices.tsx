import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { collatorService, SubmissionItem } from '../utils/collatorService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { 
  Pin, Trash2, Plus, Image as ImageIcon, Bell, Calendar as CalendarIcon, 
  FileUp, Vote, ChevronRight, Check, AlertTriangle, X 
} from 'lucide-react';
import { cn } from '../utils/cn';

interface Notice {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  isImportant: boolean;
  imageUrl?: string;
  createdAt: any;
}

interface EventItem {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

interface OpinionItem {
  id: string;
  title: string;
  description: string;
  votes: Record<string, number>;
  options: string[];
}

export function Notices() {
  const { profile } = useAuth();
  
  // States for Notices
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // States for Dashboard Widgets
  const [todayEvents, setTodayEvents] = useState<EventItem[]>([]);
  const [activeOpinions, setActiveOpinions] = useState<OpinionItem[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<SubmissionItem[]>([]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // 1) Fetch Notices safely
  useEffect(() => {
    if (!db) return;
    try {
      const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const noticesData = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as Notice[];
        setNotices(noticesData);
      }, (error) => {
        console.warn('Notices fetch error:', error);
      });
      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 2) Fetch Today's Calendar Events safely
  useEffect(() => {
    if (!db) return;
    try {
      const q = query(collection(db, 'events'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const allEvents = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as EventItem[];
        
        // Filter events that happen today with robust safety checks
        const todayFiltered = allEvents.filter(ev => {
          if (!ev || !ev.start || !ev.end) return false;
          const startDay = ev.start.substring(0, 10);
          const endDay = ev.end.substring(0, 10);
          return todayStr >= startDay && todayStr <= endDay;
        });
        setTodayEvents(todayFiltered);
      }, (err) => {
        console.warn('Events fetch error:', err);
      });
      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, [todayStr]);

  // 3) Fetch Opinions safely (filter only opinions NOT voted on yet by the current user)
  useEffect(() => {
    if (!db || !profile) return;
    try {
      const q = query(collection(db, 'opinions'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const opinionsData = snapshot.docs.map(docSnap => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            title: data.title || '',
            description: data.description || '',
            votes: data.votes || {},
            options: data.options || [],
          } as OpinionItem;
        });

        // Filter out opinions where profile.uid already cast a vote
        const notVotedYet = opinionsData.filter(op => {
          const votes = op.votes || {};
          return votes[profile.uid] === undefined;
        });

        setActiveOpinions(notVotedYet.slice(0, 3));
      }, (err) => {
        console.warn('Opinions fetch error:', err);
      });
      return unsubscribe;
    } catch (e) {
      console.error(e);
    }
  }, [profile?.uid]);

  // 4) Fetch P2P File Submissions from Collator safely
  useEffect(() => {
    try {
      collatorService.initFirebase();
      
      const updateSubmissions = () => {
        const subs = collatorService.mySubmissions || [];
        const pending = subs.filter(item => item && !item.submitted);
        setPendingSubmissions(pending);
      };

      updateSubmissions();
      collatorService.addEventListener('presenceChange', updateSubmissions);

      return () => {
        collatorService.removeEventListener('presenceChange', updateSubmissions);
      };
    } catch (e) {
      console.error('Collator presence widget init failed:', e);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !profile || !db) return;

    try {
      await addDoc(collection(db, 'notices'), {
        title: title.trim(),
        content: content.trim(),
        authorId: profile.uid,
        authorName: profile.displayName,
        isImportant,
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
        createdAt: serverTimestamp()
      });
      setIsComposing(false);
      setTitle('');
      setContent('');
      setIsImportant(false);
      setImageUrl('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notices');
    }
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'notices', id));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notices/${id}`);
    }
  };

  const sortedNotices = [...notices].sort((a, b) => {
    if (a.isImportant && !b.isImportant) return -1;
    if (!a.isImportant && b.isImportant) return 1;
    return 0;
  });

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Notices (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between py-1">
            <h2 className="text-[19px] font-bold text-[#191f28] flex items-center gap-2">
              <Bell className="w-5.5 h-5.5 text-[#10b981]" />
              게시판 소식
              <span className="text-[13px] bg-[#f2f4f6] text-[#4e5968] px-2.5 py-0.5 rounded-full font-mono font-bold ml-1">
                {notices.length}
              </span>
            </h2>
            <button
              onClick={() => setIsComposing(!isComposing)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-[14px] transition-all active:scale-95 shadow-sm",
                isComposing 
                  ? "bg-[#f2f4f6] text-[#4e5968] hover:bg-[#e5e8eb]" 
                  : "bg-[#10b981] text-white hover:bg-[#059669]"
              )}
            >
              <Plus className={cn("w-4.5 h-4.5", isComposing && "rotate-45 transition-transform")} />
              <span>{isComposing ? '작성 취소' : '새 공지 작성'}</span>
            </button>
          </div>

          {/* Compose Form */}
          {isComposing && (
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6] space-y-4">
              <input
                type="text"
                placeholder="제목을 입력하세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-[17px] font-bold px-4 py-3.5 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors placeholder-[#b0b8c1] text-[#191f28]"
                required
              />
              <textarea
                placeholder="내용을 입력하세요"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-40 px-4 py-3.5 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors resize-none placeholder-[#b0b8c1] text-[#191f28] text-[15.5px] leading-relaxed"
                required
              />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <div className="flex-1 flex items-center gap-2 bg-[#f2f4f6] rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-[#10b981] transition-colors">
                  <ImageIcon className="w-5 h-5 text-[#8b95a1]" />
                  <input
                    type="url"
                    placeholder="이미지 URL (선택사항)"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none text-[14px] text-[#191f28] placeholder-[#b0b8c1]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 cursor-pointer text-[14px] font-bold text-[#4e5968] bg-[#f2f4f6] px-4 py-3 rounded-xl hover:bg-[#e5e8eb] transition-colors">
                    <input
                      type="checkbox"
                      checked={isImportant}
                      onChange={(e) => setIsImportant(e.target.checked)}
                      className="w-4 h-4 text-[#f04452] rounded border-[#d1d6db]"
                    />
                    <Pin className="w-4 h-4 text-[#f04452]" />
                    필독
                  </label>
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none bg-[#191f28] text-white px-7 py-3 rounded-xl font-bold hover:bg-[#333d4b] active:scale-95 transition-all text-[14px]"
                  >
                    공지 등록
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Notices List */}
          <div className="space-y-4">
            {sortedNotices.map((notice) => (
              <div
                key={notice.id}
                className={cn(
                  "bg-white p-6 sm:p-7 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border transition-all",
                  notice.isImportant ? "border-[#ffe3e3] bg-[#fffafb]" : "border-[#f2f4f6]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-3">
                      {notice.isImportant && (
                        <span className="flex items-center gap-1 text-[12.5px] font-extrabold text-[#f04452] bg-[#f04452]/10 px-2.5 py-0.5 rounded-md border border-[#f5d0d0]">
                          <Pin className="w-3.5 h-3.5" /> 필독
                        </span>
                      )}
                      <h3 className="text-[18px] font-bold text-[#191f28] leading-snug">{notice.title}</h3>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[13.5px] text-[#8b95a1] mb-4">
                      <span className="font-bold text-[#4e5968]">{notice.authorName}</span>
                      <span>•</span>
                      <span>
                        {notice.createdAt?.toDate ? format(notice.createdAt.toDate(), 'PPP a h:mm', { locale: ko }) : '방금 전'}
                      </span>
                    </div>

                    <p className="text-[15.5px] text-[#333d4b] whitespace-pre-wrap leading-relaxed">
                      {notice.content}
                    </p>
                    
                    {notice.imageUrl && (
                      <img 
                        src={notice.imageUrl} 
                        alt="첨부 이미지" 
                        className="mt-5 rounded-2xl max-h-80 w-full object-cover border border-[#f2f4f6]"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                  
                  {(profile?.uid === notice.authorId || profile?.role === 'admin') && (
                    <button
                      onClick={() => setDeleteConfirmId(notice.id)}
                      className="p-2 text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] rounded-xl transition-colors shrink-0"
                      title="삭제"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {notices.length === 0 && !isComposing && (
              <div className="text-center py-16 bg-white rounded-[24px] border border-[#f2f4f6]">
                <div className="w-14 h-14 bg-[#f2f4f6] rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-7 h-7 text-[#b0b8c1]" />
                </div>
                <p className="text-[16px] font-bold text-[#4e5968]">등록된 공지사항이 없습니다.</p>
                <p className="text-[14px] text-[#8b95a1] mt-1">새로운 소식을 가장 먼저 공유해 보세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Widgets / Quick Todos (1/3 width) */}
        <div className="space-y-6 pt-1">

          {/* 1) Today's Events Widget */}
          <div className="bg-white p-6 rounded-[24px] border border-[#f2f4f6] shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2.5 border-b border-[#f8faf9]">
              <h3 className="text-[16.5px] font-bold text-[#191f28] flex items-center gap-1.5">
                <CalendarIcon className="w-5 h-5 text-[#10b981]" />
                📅 오늘의 학년 일정
              </h3>
              <Link 
                to="/calendar" 
                className="text-[13.5px] text-[#10b981] hover:underline flex items-center gap-0.5 font-bold"
              >
                달력 보기 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {todayEvents.length === 0 ? (
              <p className="text-[13.5px] text-[#8b95a1] text-center py-4 bg-[#f8faf9] rounded-xl">
                오늘 예정된 공식 일정이 없습니다.
              </p>
            ) : (
              <div className="space-y-2.5">
                {todayEvents.map(ev => (
                  <div key={ev.id} className="p-3.5 bg-[#e8f7f2]/40 border border-[#c2f0de]/40 rounded-xl">
                    <h4 className="font-bold text-[14.5px] text-[#191f28]">{ev.title}</h4>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2) Pending File Submissions Widget */}
          <div className="bg-white p-6 rounded-[24px] border border-[#f2f4f6] shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2.5 border-b border-[#f8faf9]">
              <h3 className="text-[16.5px] font-bold text-[#191f28] flex items-center gap-1.5">
                <FileUp className="w-5 h-5 text-[#10b981]" />
                📥 미제출 취합 요청
                {pendingSubmissions.length > 0 && (
                  <span className="bg-[#f04452] text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-1">
                    {pendingSubmissions.length}
                  </span>
                )}
              </h3>
              <Link 
                to="/collator" 
                className="text-[13.5px] text-[#10b981] hover:underline flex items-center gap-0.5 font-bold"
              >
                취합 제출 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {pendingSubmissions.length === 0 ? (
              <p className="text-[13.5px] text-[#8b95a1] text-center py-4 bg-[#f8faf9] rounded-xl">
                제출할 파일이 없습니다.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
                {pendingSubmissions.map(item => (
                  <Link 
                    key={item.id} 
                    to="/collator"
                    className="block p-3.5 bg-[#fff5f5] hover:bg-[#ffe3e3]/50 border border-[#ffe3e3] rounded-xl transition-all"
                  >
                    <h4 className="font-bold text-[14px] text-[#191f28] line-clamp-1">{item.title}</h4>
                    <p className="text-[12.5px] text-[#f04452] font-semibold mt-1">요청: {item.requesterName} 선생님</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 3) Opinions Gathering Widget */}
          <div className="bg-white p-6 rounded-[24px] border border-[#f2f4f6] shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2.5 border-b border-[#f8faf9]">
              <h3 className="text-[16.5px] font-bold text-[#191f28] flex items-center gap-1.5">
                <Vote className="w-5 h-5 text-[#10b981]" />
                🗳️ 참여 대기 의견수렴
              </h3>
              <Link 
                to="/opinions" 
                className="text-[13.5px] text-[#10b981] hover:underline flex items-center gap-0.5 font-bold"
              >
                투표하기 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {activeOpinions.length === 0 ? (
              <p className="text-[13.5px] text-[#8b95a1] text-center py-4 bg-[#f8faf9] rounded-xl">
                진행 중인 설문 조사가 없습니다.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeOpinions.map(op => (
                  <Link
                    key={op.id}
                    to="/opinions"
                    className="block p-3.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] rounded-xl transition-all"
                  >
                    <h4 className="font-bold text-[14px] text-[#191f28] line-clamp-1">{op.title}</h4>
                    <p className="text-[12.5px] text-[#8b95a1] mt-1">선택지: {op.options.join(', ')}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* CUSTOM DELETE NOTICES MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#f04452]">
              <AlertTriangle className="w-5 h-5 text-[#f04452]" />
              공지사항 삭제
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">
              정말로 이 공지사항을 삭제하시겠습니까? 관련 데이터베이스의 등록글이 영구적으로 제거됩니다.
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
    </div>
  );
}
export default Notices;
