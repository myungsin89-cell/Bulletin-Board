import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { 
  FileSpreadsheet, Plus, ExternalLink, Maximize2, Minimize2, X, Trash2, 
  Settings, Key, FolderArchive, Lightbulb, Users, Search, Link2, Sparkles, Check, Globe,
  CheckCircle2, AlertCircle, AlertTriangle, Info, Pin
} from 'lucide-react';
import { cn } from '../utils/cn';

interface SheetCard {
  id: string;
  title: string;
  description: string;
  type?: 'sheet' | 'memo';
  content?: string;
  sheetUrl?: string;
  gid?: string;
  category: 'password' | 'equipment' | 'tips' | 'duty' | 'general';
  authorId: string;
  authorName: string;
  createdAt: any;
  updatedAt?: any;
  isImportant?: boolean;
}

const LOCAL_CARDS_KEY = 'donghaknyeon_sheet_cards_v1';
const LOCAL_GAS_URL_KEY = 'donghaknyeon_gas_url_v1';

// Default Sample Cards
const DEFAULT_SHEET_CARDS: SheetCard[] = [
  {
    id: 'sc_sample_1',
    title: '💻 노트북 & 와이파이 비밀번호 모음',
    description: '선생님 업무용 노트북 비밀번호 및 교실 와이파이 정보',
    type: 'memo',
    content: `🔑 [교실 무선 와이파이]\n- SSID: School_Teacher_5G\n- 비밀번호: teacher1234!\n\n💻 [노트북 초기 비밀번호]\n- 관리자 계정: admin / 0000\n- 선생님 기본 패스워드: school2026!\n\n🖨️ [메인 프린터 IP 주소]\n- 3층 교무실 컬러프린터: 192.168.0.200`,
    category: 'password',
    authorId: 'system',
    authorName: '동학년 시스템',
    createdAt: Date.now()
  },
  {
    id: 'sc_sample_2',
    title: '🏫 동학년 교실 비품 위치 목록',
    description: '라벨기, 코팅기, 칼라 프린터, 공동 학습 교구 위치 및 사용 현황',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=1',
    gid: '1',
    category: 'equipment',
    authorId: 'system',
    authorName: '동학년 시스템',
    createdAt: Date.now() - 3600000
  },
  {
    id: 'sc_sample_3',
    title: '💡 동학년 꿀팁 & 생기부 작성 팁',
    description: '행동특성 기재 문구 예시, 창체 활동 기록 유용한 팁 및 공통 양식',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=2',
    gid: '2',
    category: 'tips',
    authorId: 'system',
    authorName: '동학년 시스템',
    createdAt: Date.now() - 7200000
  },
  {
    id: 'sc_sample_4',
    title: '🍱 급식 지도 & 행사 역할 분담',
    description: '월별 급식 지도 순서, 운동회 및 학예회 업무 분담표',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=3',
    gid: '3',
    category: 'duty',
    authorId: 'system',
    authorName: '동학년 시스템',
    createdAt: Date.now() - 10800000
  }
];

// Helper to get safe url
const getSafeUrl = (url: string) => url;

export function SheetsRepository() {
  const { profile } = useAuth();
  
  // Storage Loaders
  const [gasWebAppUrl, setGasWebAppUrl] = useState<string>(() => {
    return localStorage.getItem(LOCAL_GAS_URL_KEY) || '';
  });

  const [cards, setCards] = useState<SheetCard[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_CARDS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_SHEET_CARDS;
  });

  // Modal States
  const [isComposing, setIsComposing] = useState(false);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SheetCard | null>(null);
  const [customAlert, setCustomAlert] = useState<{ title: string; message: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  const showAlert = (title: string, message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    setCustomAlert({ title, message, type });
  };

  // New Card Form States
  const [newType, setNewType] = useState<'sheet' | 'memo'>('memo');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<SheetCard['category']>('general');
  const [newIsImportant, setNewIsImportant] = useState(false);

  // Active Memo Viewer/Editor Modal State
  const [activeMemoCard, setActiveMemoCard] = useState<SheetCard | null>(null);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [editMemoTitle, setEditMemoTitle] = useState('');
  const [editMemoDescription, setEditMemoDescription] = useState('');
  const [editMemoContent, setEditMemoContent] = useState('');
  const [editMemoCategory, setEditMemoCategory] = useState<SheetCard['category']>('general');

  // Save to LocalStorage helper
  const saveCardsLocal = (data: SheetCard[]) => {
    try {
      localStorage.setItem(LOCAL_CARDS_KEY, JSON.stringify(data));
    } catch (e) {}
  };

  const saveGasUrlLocal = (url: string) => {
    try {
      localStorage.setItem(LOCAL_GAS_URL_KEY, url);
    } catch (e) {}
  };

  // Firestore Sync with Fallback
  useEffect(() => {
    if (!db) return;
    try {
      const q = query(collection(db, 'sheet_cards'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const serverCards = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })) as SheetCard[];

        if (serverCards.length > 0) {
          setCards(prev => {
            const mergedMap = new Map<string, SheetCard>();
            prev.forEach(c => mergedMap.set(c.id, c));
            serverCards.forEach(c => mergedMap.set(c.id, c));

            const merged = Array.from(mergedMap.values());
            saveCardsLocal(merged);
            return merged;
          });
        }
      }, (error) => {
        console.warn('Firestore sheet_cards sync fallback:', error);
      });

      return unsubscribe;
    } catch (err) {
      console.warn('Firestore sheet_cards query error:', err);
    }
  }, []);

  // Handle Main Sheet URL Settings Save
  const handleSaveGasUrl = (e: React.FormEvent) => {
    e.preventDefault();
    saveGasUrlLocal(gasWebAppUrl);
    setIsSettingOpen(false);
  };

  // Handle Add New Card (Support Sheet & Memo)
  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return showAlert('입력 오류', '카드 제목을 입력하세요.', 'warning');

    // 1. 앱내 스마트 메모 카인 경우
    if (newType === 'memo') {
      const newCard: SheetCard = {
        id: 'sc_' + Date.now(),
        title: newTitle.trim(),
        description: newDescription.trim(),
        type: 'memo',
        content: newContent.trim(),
        category: newCategory,
        authorId: profile?.uid || 'user',
        authorName: profile?.displayName || '선생님',
        createdAt: Date.now(),
        isImportant: newIsImportant
      };

      setCards(prev => {
        const updated = [newCard, ...prev];
        saveCardsLocal(updated);
        return updated;
      });

      setIsComposing(false);
      setNewTitle('');
      setNewDescription('');
      setNewContent('');
      setNewCategory('general');
      setNewIsImportant(false);
      showAlert('생성 완료', '앱내 스마트 메모 카드가 성공적으로 생성되었습니다!', 'success');

      try {
        if (db) {
          await addDoc(collection(db, 'sheet_cards'), {
            ...newCard,
            createdAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn('Remote memo card add fallback:', e);
      }
      return;
    }

    // 2. 구글 시트 연동 카인 경우
    if (!gasWebAppUrl) {
      showAlert('연동 설정 필요', '설정에서 구글 앱스크립트(GAS) 연동 URL을 먼저 등록해주세요.', 'warning');
      setIsSettingOpen(true);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${gasWebAppUrl}?title=${encodeURIComponent(newTitle.trim())}`);
      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(data.message || '탭 생성에 실패했습니다.');
      }

      const newCard: SheetCard = {
        id: 'sc_' + Date.now(),
        title: newTitle.trim(),
        description: newDescription.trim(),
        type: 'sheet',
        sheetUrl: data.url,
        gid: String(data.gid),
        category: newCategory,
        authorId: profile?.uid || 'user',
        authorName: profile?.displayName || '선생님',
        createdAt: Date.now()
      };

      setCards(prev => {
        const updated = [newCard, ...prev];
        saveCardsLocal(updated);
        return updated;
      });

      setIsComposing(false);
      setNewTitle('');
      setNewDescription('');
      setNewCategory('general');

      // Attempt Remote Sync
      try {
        if (db) {
          await addDoc(collection(db, 'sheet_cards'), {
            ...newCard,
            createdAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn('Remote sheet_cards add fallback to local:', e);
      }
    } catch (err) {
      console.error(err);
      showAlert('생성 오류', '구글 시트 탭 생성 중 오류가 발생했습니다: ' + (err as Error).message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Delete Card (with GAS tab deletion)
  const handleDeleteCard = async (id: string) => {
    const cardToDelete = cards.find(c => c.id === id);
    if (!cardToDelete) return;

    const isMemo = cardToDelete.type === 'memo';
    const targetGid = cardToDelete.gid || cardToDelete.sheetUrl?.match(/[#&?]gid=([0-9]+)/)?.[1];
    let gasDeleteSuccess = true;

    // Delete the corresponding Google Sheet tab via GAS
    if (!isMemo && targetGid && gasWebAppUrl) {
      try {
        const res = await fetch(`${gasWebAppUrl}?action=delete&gid=${targetGid}`);
        const resData = await res.json();
        
        if (resData.status === 'deleted') {
          showAlert('삭제 완료', '구글 시트의 탭이 성공적으로 자동 삭제되었습니다!', 'success');
        } else if (resData.status === 'not_found') {
          showAlert('안내', '구글 시트에 해당 탭이 없거나 이미 삭제된 상태입니다. 연결 카드만 삭제합니다.', 'info');
        } else if (resData.status === 'error') {
          showAlert('삭제 실패', '구글 시트 탭 삭제에 실패했습니다: ' + (resData.message || '알 수 없는 오류') + '\\n(마지막 남은 탭은 구글 정책상 삭제할 수 없습니다.)', 'error');
          gasDeleteSuccess = false;
        } else if (resData.status === 'success') {
          showAlert('코드 업데이트 필요', '구글 시트 앱스크립트가 옛날 버전입니다! [apps_script_guide.md]의 최신 코드를 붙여넣고 [새 버전]으로 다시 배포해 주세요.', 'warning');
          // We allow deletion here because old script might have succeeded but returned legacy success message
        } else {
          showAlert('결과 안내', '구글 시트 탭 삭제 결과: ' + JSON.stringify(resData), 'info');
        }
      } catch (e) {
        console.warn('GAS tab delete fallback:', e);
        showAlert('오류 발생', '구글 시트 탭 삭제 중 네트워크/서버 오류가 발생했습니다: ' + (e as Error).message, 'error');
        gasDeleteSuccess = false;
      }
    } else if (!isMemo && !gasWebAppUrl) {
      showAlert('경고', '앱스크립트(GAS) URL이 설정되지 않아 구글 시트 탭은 삭제되지 않고 연결 카드만 삭제됩니다.', 'warning');
    }

    if (!gasDeleteSuccess) {
      setDeleteConfirmId(null);
      setSelectedCard(null);
      return; // Abort deleting from UI/Firestore so user can try again
    }

    // Proceed with UI and Firestore deletion
    setCards(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveCardsLocal(updated);
      return updated;
    });
    setDeleteConfirmId(null);
    setSelectedCard(null);

    try {
      if (db && !id.startsWith('sc_sample_') && !id.startsWith('sc_')) {
        await deleteDoc(doc(db, 'sheet_cards', id));
      }
    } catch (e) {
      console.warn('Delete card remote fallback:', e);
    }
  };

  // Check if a Google Sheet tab still exists via GAS
  const checkTabExists = async (gid: string): Promise<boolean> => {
    if (!gasWebAppUrl || !gid) return true;
    try {
      const response = await fetch(`${gasWebAppUrl}?action=check&gid=${gid}`);
      const data = await response.json();
      return data.exists === true;
    } catch (e) {
      return true; // Assume exists if check fails
    }
  };

  // Save Memo Edit
  const handleSaveMemoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMemoCard) return;

    const updatedCard: SheetCard = {
      ...activeMemoCard,
      title: editMemoTitle.trim(),
      description: editMemoDescription.trim(),
      content: editMemoContent.trim(),
      category: editMemoCategory,
      updatedAt: Date.now()
    };

    setCards(prev => {
      const updated = prev.map(c => c.id === activeMemoCard.id ? updatedCard : c);
      saveCardsLocal(updated);
      return updated;
    });

    setActiveMemoCard(updatedCard);
    setIsEditingMemo(false);
    showAlert('저장 완료', '메모 내용이 저장되었습니다.', 'success');

    try {
      if (db && !activeMemoCard.id.startsWith('sc_sample_')) {
        await setDoc(doc(db, 'sheet_cards', activeMemoCard.id), {
          ...updatedCard,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Update memo remote fallback:', e);
    }
  };

  // Handle Pin/Unpin Important Toggle
  const handleToggleImportant = async (e: React.MouseEvent, card: SheetCard) => {
    e.stopPropagation();
    const nextVal = !card.isImportant;

    setCards(prev => {
      const updated = prev.map(c => c.id === card.id ? { ...c, isImportant: nextVal } : c);
      saveCardsLocal(updated);
      return updated;
    });

    if (activeMemoCard && activeMemoCard.id === card.id) {
      setActiveMemoCard(prev => prev ? { ...prev, isImportant: nextVal } : null);
    }

    try {
      if (db && !card.id.startsWith('sc_sample_')) {
        await setDoc(doc(db, 'sheet_cards', card.id), { isImportant: nextVal }, { merge: true });
      }
    } catch (err) {
      console.warn('Toggle card important fallback:', err);
    }
  };
  const filteredCards = cards
    .filter(card => {
      const matchCategory = selectedCategory === 'all' || card.category === selectedCategory;
      const matchQuery = card.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         card.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (card.content && card.content.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchQuery;
    })
    .sort((a, b) => {
      const aImp = a.isImportant ? 1 : 0;
      const bImp = b.isImportant ? 1 : 0;
      if (aImp !== bImp) return bImp - aImp;

      const aTime = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const bTime = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return bTime - aTime;
    });

  const getCategoryBadge = (cat: SheetCard['category']) => {
    switch (cat) {
      case 'password':
        return { text: '비밀번호', color: 'bg-[#fee2e2] text-[#dc2626] border-[#fca5a5]', icon: Key };
      case 'equipment':
        return { text: '비품/위치', color: 'bg-[#e0f2fe] text-[#0284c7] border-[#bae6fd]', icon: FolderArchive };
      case 'tips':
        return { text: '동학년 꿀팁', color: 'bg-[#fef3c7] text-[#d97706] border-[#fde68a]', icon: Lightbulb };
      case 'duty':
        return { text: '역할분담', color: 'bg-[#f3e8ff] text-[#7e22ce] border-[#e9d5ff]', icon: Users };
      default:
        return { text: '일반정보', color: 'bg-[#f2f4f6] text-[#4e5968] border-[#e5e8eb]', icon: FileSpreadsheet };
    }
  };

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* Top Main Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-1">
        <h2 className="text-[19px] font-bold text-[#191f28] flex items-center gap-2">
          <FileSpreadsheet className="w-5.5 h-5.5 text-[#10b981]" />
          정보창고 (구글 시트 연동)
          <span className="text-[13px] bg-[#f2f4f6] text-[#4e5968] px-2.5 py-0.5 rounded-full font-mono font-bold ml-1">
            {cards.length}
          </span>
        </h2>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsSettingOpen(true)}
            className="px-3.5 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] font-bold rounded-xl text-[13.5px] transition-colors flex items-center gap-1.5"
            title="대표 구글 시트 주소 설정"
          >
            <Settings className="w-4 h-4 text-[#8b95a1]" />
            시트 연동 설정
          </button>
          
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
            <span>{isComposing ? '작성 취소' : '새 정보 카드 만들기'}</span>
          </button>
        </div>
      </div>

      {/* SEARCH & CATEGORY FILTER BAR */}
      <div className="bg-white p-4 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-[#f2f4f6] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: '전체 보기' },
            { id: 'password', label: '🔑 비밀번호' },
            { id: 'equipment', label: '📦 비품 위치' },
            { id: 'tips', label: '💡 꿀팁/생기부' },
            { id: 'duty', label: '🍱 역할 분담' },
            { id: 'general', label: '📑 일반' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap",
                selectedCategory === cat.id
                  ? "bg-[#10b981] text-white shadow-xs"
                  : "bg-[#f8fafc] text-[#64748b] hover:bg-[#f1f5f9]"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="정보 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] focus:border-[#10b981] focus:bg-white rounded-xl text-[13.5px] outline-none transition-all placeholder-[#94a3b8]"
          />
        </div>
      </div>

      {/* CREATE CARD FORM */}
      {isComposing && (
        <form onSubmit={handleCreateCard} className="bg-white p-6 sm:p-7 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-[#f2f4f6] space-y-4 animate-fade-in">
          <h3 className="text-[17px] font-bold text-[#191f28] flex items-center gap-2 pb-2 border-b border-[#f8faf9]">
            <Sparkles className="w-5 h-5 text-[#10b981]" />
            새 공유 정보 카드 개설
          </h3>

          {/* Card Type Selector */}
          <div className="flex items-center gap-2 p-1.5 bg-[#f2f4f6] rounded-2xl">
            <button
              type="button"
              onClick={() => setNewType('memo')}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl font-bold text-[13.5px] transition-all flex items-center justify-center gap-2",
                newType === 'memo'
                  ? "bg-white text-[#3b82f6] shadow-xs"
                  : "text-[#64748b] hover:text-[#191f28]"
              )}
            >
              <Sparkles className="w-4 h-4 text-[#3b82f6]" />
              📝 앱내 스마트 메모 (앱 안에서 읽기/수정)
            </button>
            <button
              type="button"
              onClick={() => setNewType('sheet')}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl font-bold text-[13.5px] transition-all flex items-center justify-center gap-2",
                newType === 'sheet'
                  ? "bg-white text-[#10b981] shadow-xs"
                  : "text-[#64748b] hover:text-[#191f28]"
              )}
            >
              <FileSpreadsheet className="w-4 h-4 text-[#10b981]" />
              📊 구글 시트 연동 (구글 탭 자동 생성)
            </button>
          </div>

          <div>
            <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">카드 제목</label>
            <input
              type="text"
              placeholder={newType === 'memo' ? "예: 💻 교실 무선 와이파이 & 비번" : "예: 🍱 급식 지도 및 학예회 역할 분담표"}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full text-[16px] font-bold px-4 py-3 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-colors placeholder-[#b0b8c1] text-[#191f28]"
              required
            />
          </div>

          <div>
            <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">카드의 간단한 한 줄 요약 (선택사항)</label>
            <input
              type="text"
              placeholder="카드 카드 목록에서 보일 간단한 개요"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] text-[#191f28] text-[14px] placeholder-[#b0b8c1]"
            />
          </div>

          {newType === 'memo' && (
            <div>
              <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">메모 상세 본문 내용</label>
              <textarea
                placeholder="비밀번호, 사용 방법, 공지사항 등 자유롭게 작성하세요..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-[#f2f4f6] border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3b82f6] transition-colors resize-none placeholder-[#b0b8c1] text-[#191f28] text-[14.5px] leading-relaxed font-sans"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13.5px] font-bold text-[#4e5968] mb-1.5">카테고리</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-[#f2f4f6] border-none rounded-xl text-[13.5px] font-bold text-[#191f28] focus:ring-2 focus:ring-[#10b981] outline-none"
              >
                <option value="password">🔑 비밀번호</option>
                <option value="equipment">📦 비품/위치</option>
                <option value="tips">💡 동학년 꿀팁</option>
                <option value="duty">🍱 역할 분담</option>
                <option value="general">📑 일반 정보</option>
              </select>
            </div>
            
            <div className="flex items-center sm:pt-6">
              <label className="flex items-center gap-2 cursor-pointer select-none bg-[#fff5f5] hover:bg-[#ffe3e3] px-4 py-2.5 rounded-xl border border-[#fecdd3] transition-colors w-full">
                <input
                  type="checkbox"
                  checked={newIsImportant}
                  onChange={(e) => setNewIsImportant(e.target.checked)}
                  className="w-4 h-4 rounded text-[#f04452] focus:ring-[#f04452] accent-[#f04452] cursor-pointer"
                />
                <span className="text-[13.5px] font-bold text-[#f04452] flex items-center gap-1.5 truncate">
                  <Pin className="w-4 h-4 fill-[#f04452] shrink-0" />
                  📌 [필독] 정보로 설정 (상단 고정)
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-[#f8faf9]">
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "text-white px-7 py-3 rounded-xl font-bold active:scale-95 transition-all text-[14px] disabled:opacity-50 flex items-center gap-2 shadow-sm",
                newType === 'memo' ? "bg-[#3b82f6] hover:bg-[#2563eb]" : "bg-[#10b981] hover:bg-[#059669]"
              )}
            >
              {isLoading ? '구글 시트 탭 생성 중...' : (newType === 'memo' ? '스마트 메모 카드 만들기' : '구글 시트 연동 카드 만들기')}
            </button>
          </div>
        </form>
      )}

      {/* SHEET CARDS GRID LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCards.map((card) => {
          const badge = getCategoryBadge(card.category);
          const BadgeIcon = badge.icon;
          const isMyCard = card.authorId === profile?.uid || profile?.role === 'admin';
          const isMemo = card.type === 'memo' || !card.sheetUrl;

          return (
            <div
              key={card.id}
              onClick={() => {
                if (isMemo) {
                  setActiveMemoCard(card);
                  setEditMemoTitle(card.title);
                  setEditMemoDescription(card.description || '');
                  setEditMemoContent(card.content || '');
                  setEditMemoCategory(card.category);
                  setIsEditingMemo(false);
                } else if (card.sheetUrl) {
                  // @ts-ignore
                  if (window.electronAPI?.openExternal) {
                    // @ts-ignore
                    window.electronAPI.openExternal(card.sheetUrl);
                  } else {
                    window.open(card.sheetUrl, '_blank');
                  }
                }
              }}
              className={cn(
                "p-6 rounded-[24px] transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden",
                card.isImportant
                  ? "bg-white border-2 border-[#f04452] shadow-[0_4px_20px_rgba(240,68,82,0.12)] hover:shadow-lg"
                  : "bg-white border border-[#f2f4f6] hover:border-[#10b981]/50 hover:shadow-md shadow-[0_2px_20px_rgba(0,0,0,0.02)]"
              )}
            >
              {/* Top Card Badge & Action */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {card.isImportant && (
                      <span className="text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-md bg-[#f04452] text-white flex items-center gap-1 shadow-xs">
                        <Pin className="w-3 h-3 fill-white" />
                        필독
                      </span>
                    )}
                    <span className={cn("text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-md border flex items-center gap-1", badge.color)}>
                      <BadgeIcon className="w-3 h-3" />
                      {badge.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[12px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5",
                      isMemo ? "text-[#3b82f6]" : "text-[#10b981]"
                    )}>
                      {isMemo ? '메모 열기' : '시트 열기'} <ExternalLink className="w-3.5 h-3.5" />
                    </span>

                    {/* Pin/Unpin Toggle Button */}
                    <button
                      onClick={(e) => handleToggleImportant(e, card)}
                      className={cn(
                        "p-1.5 rounded-xl transition-colors",
                        card.isImportant
                          ? "text-[#f04452] bg-[#fff5f5] hover:bg-[#ffe3e3]"
                          : "text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5]"
                      )}
                      title={card.isImportant ? "필독 해제" : "필독 설정 (상단 고정)"}
                    >
                      <Pin className={cn("w-4 h-4", card.isImportant && "fill-[#f04452]")} />
                    </button>

                    {!isMemo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCard(card);
                        }}
                        className="p-1.5 text-[#8b95a1] hover:text-[#10b981] hover:bg-[#ecfdf5] rounded-xl transition-colors"
                        title="URL 및 탭 정보 확인"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                    )}
                    {isMyCard && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(card.id);
                        }}
                        className="p-1.5 text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] rounded-xl transition-colors"
                        title="카드 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="text-[18px] font-bold text-[#191f28] leading-snug group-hover:text-[#10b981] transition-colors mb-2">
                  {card.title}
                </h3>

                <p className="text-[14.5px] text-[#4e5968] leading-relaxed line-clamp-2 mb-4 whitespace-pre-wrap">
                  {card.description || card.content || (isMemo ? '클릭하면 앱 내부에서 메모를 읽고 바로 편집할 수 있습니다.' : '클릭하면 크롬 브라우저에서 해당 구글 시트 탭이 열립니다.')}
                </p>
              </div>

              {/* Bottom Card Footer */}
              <div className="pt-3 border-t border-[#f8faf9] flex items-center justify-between text-[12.5px] text-[#8b95a1] font-medium">
                {isMemo ? (
                  <span className="flex items-center gap-1 text-[#1d4ed8] bg-[#eff6ff] px-2.5 py-1 rounded-lg border border-[#bfdbfe] font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#3b82f6]" />
                    앱내 스마트 메모
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[#047857] bg-[#ecfdf5] px-2.5 py-1 rounded-lg border border-[#c2f0de] font-bold">
                    <Globe className="w-3.5 h-3.5 text-[#10b981]" />
                    구글 시트 연동
                  </span>
                )}
                <span>작성: {card.authorName}</span>
              </div>
            </div>
          );
        })}

        {filteredCards.length === 0 && !isComposing && (
          <div className="col-span-full text-center py-16 bg-white rounded-[24px] border border-[#f2f4f6]">
            <div className="w-14 h-14 bg-[#f2f4f6] rounded-full flex items-center justify-center mx-auto mb-3">
              <FileSpreadsheet className="w-7 h-7 text-[#b0b8c1]" />
            </div>
            <p className="text-[16px] font-bold text-[#4e5968]">등록된 정보 카드가 없습니다.</p>
            <p className="text-[14px] text-[#8b95a1] mt-1">새로운 정보 카드를 만들어 구글 시트와 연동해 보세요.</p>
          </div>
        )}
      </div>

      {/* 🌟 1. GLASS WINDOW REMOVED */}

      {/* 🌟 2. MAIN SHEET URL SETTINGS MODAL */}
      {isSettingOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-7 w-full max-w-md shadow-xl border border-white space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#f8faf9]">
              <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#10b981]" />
                앱스크립트(GAS) 웹 앱 URL 설정
              </h3>
              <button
                onClick={() => setIsSettingOpen(false)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveGasUrl} className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">Google Apps Script Web App URL</label>
                <input
                  type="url"
                  value={gasWebAppUrl}
                  onChange={(e) => setGasWebAppUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white rounded-2xl text-[13.5px] outline-none transition-all"
                  required
                />
                <p className="text-[12px] text-[#8b95a1] mt-1.5 leading-relaxed">
                  💡 안내드린 구글 앱스크립트 코드를 배포한 뒤 얻은 URL을 이곳에 붙여넣어 주세요. 새 카드를 만들 때마다 구글 시트에 자동으로 탭이 생성됩니다.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingOpen(false)}
                  className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-2xl transition-colors text-[14px] shadow-sm"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🌟 CARD URL PREVIEW MODAL */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-7 w-full max-w-lg shadow-xl border border-white space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#f8faf9]">
              <h3 className="text-lg font-bold text-[#191f28] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#10b981]" />
                {selectedCard.title}
              </h3>
              <button
                onClick={() => setSelectedCard(null)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">연결된 구글 시트 URL</label>
              <div className="w-full px-4 py-3 bg-[#f2f4f6] rounded-2xl text-[12.5px] text-[#191f28] break-all select-all leading-relaxed font-mono">
                {selectedCard.sheetUrl}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedCard.sheetUrl);
                  showAlert('복사 완료', '구글 시트 URL이 클립보드에 복사되었습니다!', 'success');
                }}
                className="py-3 px-4 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px] flex items-center justify-center gap-1.5"
              >
                <Link2 className="w-4 h-4" />
                URL 복사
              </button>
              <button
                onClick={() => {
                  // @ts-ignore
                  if (window.electronAPI?.openExternal) {
                    // @ts-ignore
                    window.electronAPI.openExternal(selectedCard.sheetUrl);
                  } else {
                    window.open(selectedCard.sheetUrl, '_blank');
                  }
                  setSelectedCard(null);
                }}
                className="flex-1 py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-2xl transition-colors text-[14px] shadow-sm flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                구글 시트 열기
              </button>
              <button
                onClick={async () => {
                  if (!selectedCard.gid) return;
                  const exists = await checkTabExists(selectedCard.gid);
                  if (exists) {
                    showAlert('검증 완료', '이 탭은 구글 시트에 정상적으로 존재합니다!', 'success');
                  } else {
                    showAlert('탭 없음', '이 탭은 구글 시트에서 삭제된 것 같습니다.', 'warning');
                  }
                }}
                className="py-3 px-4 bg-[#f8fafc] text-[#64748b] font-bold rounded-2xl hover:bg-[#f1f5f9] transition-colors text-[14px] flex items-center justify-center gap-1.5 border border-[#e2e8f0]"
              >
                <Check className="w-4 h-4" />
                탭 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 3. DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#f04452] mb-2">정보 카드 삭제</h3>
            <p className="text-[14px] text-[#4e5968] mb-2 leading-relaxed">정말로 이 정보 카드를 삭제하시겠습니까?</p>
            <p className="text-[13px] text-[#8b95a1] mb-6 leading-relaxed bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0]">
              🗑️ 카드와 함께 <strong>구글 시트의 해당 탭도 자동으로 삭제</strong>됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteCard(deleteConfirmId)}
                className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-2xl hover:bg-[#d73a49] transition-colors text-[14px]"
              >
                카드 + 시트 탭 삭제
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🌟 IN-APP SMART MEMO VIEWER & EDITOR MODAL */}
      {activeMemoCard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-[28px] shadow-2xl border border-white w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-9 h-9 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#3b82f6]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[17px] font-bold text-[#191f28] truncate leading-tight">
                    {isEditingMemo ? '스마트 메모 편집' : activeMemoCard.title}
                  </h3>
                  <p className="text-[12px] text-[#64748b] truncate mt-0.5">
                    작성자: {activeMemoCard.authorName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isEditingMemo && (activeMemoCard.authorId === profile?.uid || profile?.role === 'admin') && (
                  <button
                    onClick={() => setIsEditingMemo(true)}
                    className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-xl text-[13px] transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    수정하기
                  </button>
                )}
                <button
                  onClick={() => setActiveMemoCard(null)}
                  className="p-2 text-[#64748b] hover:text-[#ef4444] hover:bg-[#f1f5f9] rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {isEditingMemo ? (
                <form onSubmit={handleSaveMemoEdit} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">제목</label>
                    <input
                      type="text"
                      value={editMemoTitle}
                      onChange={(e) => setEditMemoTitle(e.target.value)}
                      className="w-full text-[16px] font-bold px-4 py-3 bg-[#f2f4f6] rounded-xl outline-none focus:ring-2 focus:ring-[#3b82f6]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">간단 요약 설명</label>
                    <input
                      type="text"
                      value={editMemoDescription}
                      onChange={(e) => setEditMemoDescription(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#f2f4f6] rounded-xl outline-none focus:ring-2 focus:ring-[#3b82f6] text-[14px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-[#4e5968] mb-1.5">메모 본문 내용</label>
                    <textarea
                      value={editMemoContent}
                      onChange={(e) => setEditMemoContent(e.target.value)}
                      className="w-full h-48 px-4 py-3 bg-[#f2f4f6] rounded-xl outline-none focus:ring-2 focus:ring-[#3b82f6] text-[14.5px] leading-relaxed resize-none font-sans"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingMemo(false)}
                      className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-xl hover:bg-[#e5e8eb] text-[14px]"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-[#3b82f6] text-white font-bold rounded-xl hover:bg-[#2563eb] text-[14px] shadow-sm"
                    >
                      저장하기
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {activeMemoCard.description && (
                    <div className="bg-[#f8fafc] p-3.5 rounded-2xl border border-[#e2e8f0] text-[13.5px] font-medium text-[#64748b]">
                      💡 {activeMemoCard.description}
                    </div>
                  )}
                  <div className="bg-[#f8fafc] p-5 rounded-2xl border border-[#f1f5f9] min-h-[160px] whitespace-pre-wrap text-[15px] text-[#191f28] leading-relaxed font-sans select-text">
                    {activeMemoCard.content || '내용이 없습니다.'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🌟 CUSTOM ALERT MODAL */}
      {customAlert && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[60] px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 sm:p-7 w-full max-w-sm shadow-2xl border border-white space-y-4 text-center animate-scale-up">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shrink-0">
              {customAlert.type === 'success' && (
                <div className="w-14 h-14 rounded-2xl bg-[#ecfdf5] border border-[#a7f3d0] flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-[#10b981]" />
                </div>
              )}
              {customAlert.type === 'warning' && (
                <div className="w-14 h-14 rounded-2xl bg-[#fffbeb] border border-[#fde68a] flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-[#d97706]" />
                </div>
              )}
              {customAlert.type === 'error' && (
                <div className="w-14 h-14 rounded-2xl bg-[#fef2f2] border border-[#fca5a5] flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-[#ef4444]" />
                </div>
              )}
              {customAlert.type === 'info' && (
                <div className="w-14 h-14 rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] flex items-center justify-center">
                  <Info className="w-7 h-7 text-[#3b82f6]" />
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[18px] font-bold text-[#191f28] mb-1">{customAlert.title}</h3>
              <p className="text-[13.5px] text-[#4e5968] leading-relaxed break-keep">{customAlert.message}</p>
            </div>

            <button
              onClick={() => setCustomAlert(null)}
              className="w-full py-3.5 bg-[#191f28] hover:bg-[#333d4b] text-white font-bold rounded-2xl transition-all text-[14px] shadow-sm active:scale-95"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SheetsRepository;
