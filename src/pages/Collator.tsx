import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collatorService, TeacherProfile, CollectionRoom, SubmissionItem, CustomGroup } from '../utils/collatorService';
import { CollatorTeacherGrid } from '../components/CollatorTeacherGrid';
import { 
  Plus, Folder, Trash2, ExternalLink, FileUp, 
  Users, CheckCircle2, AlertCircle, RefreshCw, X, FolderOpen, Shield, DownloadCloud, UserCheck, Star, AlertTriangle
} from 'lucide-react';

export function Collator() {
  const { profile } = useAuth();
  
  // App States
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [createdRooms, setCreatedRooms] = useState<CollectionRoom[]>([]);
  const [mySubmissions, setMySubmissions] = useState<SubmissionItem[]>([]);
  const [groups, setGroups] = useState<CustomGroup[]>([]);
  const [roomFilter, setRoomFilter] = useState<'all' | 'mine'>('all');
  
  // Modal & Form States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomFolderPath, setNewRoomFolderPath] = useState('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  // Delete Modals
  const [deleteRoomTargetId, setDeleteRoomTargetId] = useState<string | null>(null);

  // Submit File States
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [activeSubItem, setActiveSubItem] = useState<SubmissionItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'connecting' | 'sending' | 'completed' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Group Management States
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTeacherIds, setNewGroupTeacherIds] = useState<string[]>([]);

  const isAdmin = profile?.role === 'admin';

  // Setup Firebase synchronizer
  useEffect(() => {
    if (profile) {
      collatorService.updateProfile(profile);
    }
    collatorService.initFirebase();
    
    const updateLocalStates = () => {
      setTeachers([...collatorService.teachers]);
      setCreatedRooms([...collatorService.createdRooms]);
      setMySubmissions([...collatorService.mySubmissions]);
      setGroups([...collatorService.groups]);
    };

    updateLocalStates();
    collatorService.addEventListener('presenceChange', updateLocalStates);
    
    return () => {
      collatorService.removeEventListener('presenceChange', updateLocalStates);
    };
  }, [profile]);

  // Folder selection via Electron API
  const handleSelectFolder = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.selectFolder) {
      const path = await electronAPI.selectFolder();
      if (path) {
        setNewRoomFolderPath(path);
      }
    } else {
      alert('데스크톱 앱 환경이 아닙니다. 폴더 경로를 수동으로 입력해 주세요.');
    }
  };

  // Open folder via Electron API
  const handleOpenFolder = async (path: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.openFolder) {
      await electronAPI.openFolder(path);
    } else {
      alert('데스크톱 앱 환경에서만 로컬 폴더를 열 수 있습니다.');
    }
  };

  // Create room - Available to ALL teachers!
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) return alert('취합 요청 제목을 입력하세요.');
    if (!newRoomFolderPath.trim()) return alert('파일을 저장할 로컬 폴더를 지정해 주세요.');
    if (selectedTeacherIds.length === 0) return alert('취합 대상 교사를 최소 한 명 이상 지정해야 합니다.');

    const creatorName = profile?.displayName || '나';
    const room = await collatorService.createCollectionRoom(
      newRoomTitle.trim(),
      newRoomFolderPath.trim(),
      selectedTeacherIds,
      creatorName
    );

    if (room) {
      setNewRoomTitle('');
      setNewRoomFolderPath('');
      setSelectedTeacherIds([]);
      setIsCreateModalOpen(false);
    }
  };

  // Confirm Delete Room via Custom React Modal
  const confirmDeleteRoom = async () => {
    if (!deleteRoomTargetId) return;
    await collatorService.deleteCollectionRoom(deleteRoomTargetId);
    setDeleteRoomTargetId(null);
  };

  // Submit file WebRTC signaling
  const handleFileSubmit = async () => {
    if (!selectedFile || !activeSubItem) return;

    setUploadStatus('connecting');
    setUploadProgress(0);
    setUploadError(null);

    try {
      await collatorService.simulateP2PTransfer(activeSubItem.id, selectedFile, (prog, stat) => {
        setUploadProgress(prog);
        if (stat === 'connecting' || stat === 'sending' || stat === 'completed') {
          setUploadStatus(stat as any);
        }
      });
    } catch (err: any) {
      console.error(err);
      setUploadStatus('error');
      setUploadError(err.message || '파일 전송에 실패했습니다. 상대방 컴퓨터 상태를 확인하세요.');
    }
  };

  const handleOpenSubmitModal = (item: SubmissionItem) => {
    setActiveSubItem(item);
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadError(null);
    setIsSubmitModalOpen(true);
  };

  const handleGroupCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return alert('그룹 이름을 입력하세요.');
    if (newGroupTeacherIds.length === 0) return alert('그룹에 추가할 선생님을 선택해 주세요.');

    collatorService.addGroup(newGroupName.trim(), newGroupTeacherIds);
    setNewGroupName('');
    setNewGroupTeacherIds([]);
    setIsGroupModalOpen(false);
  };

  const applyGroupPreset = (memberIds: string[]) => {
    setSelectedTeacherIds(memberIds);
  };

  const onlineTeachersCount = teachers.filter(t => t.online).length;
  const myProfileId = collatorService.myProfile?.id;
  const myDisplayName = profile?.displayName;

  // Filtered rooms logic
  const myCreatedRoomsCount = createdRooms.filter(room => 
    room.creatorId === myProfileId || room.creatorName === myDisplayName || room.creatorName === '나'
  ).length;

  const filteredRooms = createdRooms.filter(room => {
    if (roomFilter === 'mine') {
      return room.creatorId === myProfileId || room.creatorName === myDisplayName || room.creatorName === '나';
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      <div className="flex items-center justify-between py-1">
        <h2 className="text-[19px] font-bold text-[#191f28] flex items-center gap-2">
          <DownloadCloud className="w-5.5 h-5.5 text-[#10b981]" />
          실시간 파일 취합 도우미
        </h2>
        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setIsGroupModalOpen(true)}
            className="px-4 py-2.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] font-bold rounded-xl text-[14px] transition-colors flex items-center gap-1.5"
          >
            <Users className="w-4 h-4" />
            그룹 관리
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[14px] transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4.5 h-4.5 stroke-[3]" />
            새 취합 요청 만들기
          </button>
        </div>
      </div>

      {/* 🌟 1. 접속 중인 선생님 목록 (COMPACT PRESENCE STATUS VIEW) */}
      <div className="bg-white rounded-[24px] border border-[#f2f4f6] p-5 shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-[16px] font-bold text-[#191f28] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#10b981]" />
            접속 중인 선생님 목록
            <span className="text-[12px] bg-[#e8f7f2] text-[#10b981] font-bold px-2.5 py-0.5 rounded-full border border-[#c2f0de]">
              접속 {onlineTeachersCount}명 / 전체 {teachers.length}명
            </span>
          </h3>
        </div>

        <CollatorTeacherGrid
          teachers={teachers}
          isSelectable={false}
        />
      </div>

      {/* 🌟 2. 전체 및 내가 올린 취합 요청 목록 */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="text-[18px] font-bold text-[#191f28] flex items-center gap-2">
            📂 취합 요청 목록
            <span className="text-[12px] bg-white text-[#8b95a1] px-2.5 py-1 rounded-full border font-mono">
              {filteredRooms.length}개
            </span>
          </h3>

          {/* Filter Tabs & Admin Badge */}
          <div className="flex items-center gap-2">
            <div className="flex bg-[#f2f4f6] p-1 rounded-xl">
              <button
                onClick={() => setRoomFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all ${
                  roomFilter === 'all' 
                    ? 'bg-white text-[#191f28] shadow-xs' 
                    : 'text-[#8b95a1] hover:text-[#4e5968]'
                }`}
              >
                전체 목록 ({createdRooms.length})
              </button>
              <button
                onClick={() => setRoomFilter('mine')}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all flex items-center gap-1 ${
                  roomFilter === 'mine' 
                    ? 'bg-[#10b981] text-white shadow-xs' 
                    : 'text-[#8b95a1] hover:text-[#4e5968]'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                내가 올린 요청만 ({myCreatedRoomsCount})
              </button>
            </div>

            {isAdmin && (
              <span className="hidden lg:inline-block text-[11.5px] text-[#10b981] font-bold bg-[#e8f7f2] px-2.5 py-1.5 rounded-xl border border-[#c2f0de]">
                👑 관리자 정리 권한
              </span>
            )}
          </div>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 text-center border border-[#f2f4f6]">
            <div className="w-12 h-12 bg-[#f2f4f6] text-[#b0b8c1] rounded-full flex items-center justify-center mx-auto mb-3">
              <FolderOpen className="w-6 h-6" />
            </div>
            <p className="text-[#8b95a1] text-[14px]">
              {roomFilter === 'mine' ? '내가 개설한 취합 요청이 없습니다.' : '개설된 취합 요청이 없습니다.'}
            </p>
            <p className="text-[#b0b8c1] text-[12px] mt-1">
              상단의 '새 취합 요청 만들기' 버튼을 눌러 취합방을 만들 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRooms.map(room => {
              const total = room.targetTeacherIds.length;
              const submitted = room.submittedTeacherIds.length;
              const progressPercent = total > 0 ? Math.round((submitted / total) * 100) : 0;
              
              const isOwner = room.creatorId === myProfileId || room.creatorName === myDisplayName || room.creatorName === '나';
              const canDelete = isAdmin || isOwner;

              return (
                <div 
                  key={room.id} 
                  className={`bg-white rounded-[24px] border p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all ${
                    isOwner ? 'border-[#10b981]/40 ring-2 ring-[#10b981]/10' : 'border-[#f2f4f6]'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h4 className="font-bold text-[16px] text-[#191f28] line-clamp-1">{room.title}</h4>
                      
                      {isOwner ? (
                        <span className="text-[12px] font-bold shrink-0 text-[#065f46] bg-[#e8f7f2] border border-[#c2f0de] px-2.5 py-0.5 rounded-md flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current text-[#10b981]" />
                          내가 올린 요청
                        </span>
                      ) : (
                        <span className="text-[12px] font-semibold shrink-0 text-[#4e5968] bg-[#f2f4f6] px-2.5 py-0.5 rounded-md">
                          요청자: {room.creatorName}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1 text-[13px] text-[#8b95a1]">
                      {isOwner && (
                        <p className="flex items-center gap-1 text-[#10b981] font-semibold">
                          <span>내 저장 폴더:</span> 
                          <span className="font-mono text-[12px] truncate max-w-[280px]" title={room.folderPath}>{room.folderPath}</span>
                        </p>
                      )}
                      <p>
                        <span className="font-semibold text-[#4e5968]">개설 시간:</span> {new Date(room.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-[12.5px] font-semibold">
                        <span className="text-[#4e5968]">제출 현황 ({submitted}/{total}명)</span>
                        <span className="text-[#10b981]">{progressPercent}%</span>
                      </div>
                      <div className="w-full bg-[#f2f4f6] h-2.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-[#10b981] h-full rounded-full transition-all duration-500" 
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 border-t border-[#f2f4f6] pt-3">
                      <div className="text-[12px] font-bold text-[#8b95a1] mb-2">대상 교사 제출 상태</div>
                      <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                        {room.targetTeacherIds.map(id => {
                          const isSub = room.submittedTeacherIds.includes(id);
                          const tInfo = teachers.find(t => t.id === id);
                          const name = tInfo ? tInfo.name : '알 수 없음';
                          
                          return (
                            <span 
                              key={id} 
                              className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                                isSub 
                                  ? 'bg-[#e8f7f2] border-[#c2f0de] text-[#065f46]' 
                                  : 'bg-white border-[#e5e8eb] text-[#8b95a1]'
                              }`}
                            >
                              {name} {isSub ? '✓' : '✗'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-[#f2f4f6] pt-4 mt-2">
                    {isOwner && (
                      <button
                        onClick={() => handleOpenFolder(room.folderPath)}
                        className="flex-1 py-2.5 bg-[#e8f7f2] hover:bg-[#c2f0de] text-[#065f46] font-bold rounded-xl text-[13px] transition-colors flex items-center justify-center gap-1.5 border border-[#c2f0de]"
                      >
                        <FolderOpen className="w-4 h-4 text-[#10b981]" />
                        내 PC 저장 폴더 열기
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteRoomTargetId(room.id)}
                        className={`p-2.5 rounded-xl transition-colors border ${
                          isOwner 
                            ? 'text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] border-transparent hover:border-[#ffe3e3]'
                            : 'flex-1 bg-[#fff5f5] text-[#f04452] hover:bg-[#ffe3e3] border-[#ffe3e3] font-bold text-[13px] flex items-center justify-center gap-1.5'
                        }`}
                        title={isAdmin && !isOwner ? '관리자 권한으로 삭제' : '취합 요청 삭제'}
                      >
                        <Trash2 className="w-4 h-4" />
                        {isAdmin && !isOwner && <span>게시판 정리 (관리자 삭제)</span>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. TEACHER VIEW: 내가 제출해야 할 취합 요청 목록 */}
      <div className="space-y-4">
        <h3 className="text-[18px] font-bold text-[#191f28] flex items-center gap-1.5">
          📥 내가 제출해야 할 취합 요청 목록
          <span className="text-[12px] bg-white text-[#8b95a1] px-2.5 py-1 rounded-full border font-mono">
            {mySubmissions.length}
          </span>
        </h3>

        {mySubmissions.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 text-center border border-[#f2f4f6]">
            <div className="w-12 h-12 bg-[#f2f4f6] text-[#b0b8c1] rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-[#10b981]" />
            </div>
            <p className="text-[#8b95a1] text-[14px]">나에게 요청된 파일 제출 건이 없습니다.</p>
            <p className="text-[#b0b8c1] text-[12px] mt-1">다른 선생님이 나를 취합 대상자로 지정하면 여기에 카드 형태로 노출됩니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mySubmissions.map(item => (
              <div 
                key={item.id} 
                className={`bg-white rounded-[24px] border p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all ${
                  item.submitted ? 'border-[#c2f0de]' : 'border-[#f2f4f6]'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h4 className="font-bold text-[16px] text-[#191f28] line-clamp-1">{item.title}</h4>
                    <span className={`text-[12px] font-bold shrink-0 px-2 py-0.5 rounded-md ${
                      item.submitted 
                        ? 'bg-[#e8f7f2] text-[#10b981]' 
                        : 'bg-[#fff5f5] text-[#f04452]'
                    }`}>
                      {item.submitted ? '제출 완료' : '미제출'}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-[13px] text-[#8b95a1]">
                    <p><span className="font-semibold text-[#4e5968]">요청자:</span> {item.requesterName}</p>
                    <p><span className="font-semibold text-[#4e5968]">마감 기한:</span> {item.deadline}</p>
                    <p className="text-[12px] mt-2 opacity-80">{item.description}</p>
                  </div>
                </div>

                <div className="border-t border-[#f2f4f6] pt-4 mt-3">
                  {item.submitted ? (
                    <button
                      onClick={() => handleOpenSubmitModal(item)}
                      className="w-full py-3 bg-[#e8f7f2] hover:bg-[#c2f0de] text-[#065f46] font-bold rounded-xl text-[13.5px] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                      다시 제출하기
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenSubmitModal(item)}
                      className="w-full py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl text-[13.5px] transition-all flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(16,185,129,0.08)]"
                    >
                      <FileUp className="w-4 h-4" />
                      파일 전송하여 제출하기
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE ROOM MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto border border-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#191f28] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#10b981]" />
                새 취합 요청 만들기 (개설)
              </h3>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-6">
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-[13px] font-bold text-[#4e5968] mb-2">취합 요청 제목</label>
                  <input
                    type="text"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    placeholder="예: 4학년 1학기 교육과정 만족도 조사 취합"
                    className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                    required
                  />
                </div>

                {/* Path selection */}
                <div>
                  <label className="block text-[13px] font-bold text-[#4e5968] mb-2">파일을 수신받을 내 PC 저장 폴더 경로</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRoomFolderPath}
                      onChange={(e) => setNewRoomFolderPath(e.target.value)}
                      placeholder="C:\Users\Username\Documents\Collect"
                      className="flex-1 px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleSelectFolder}
                      className="px-4 py-3 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] font-bold rounded-2xl text-[14px] transition-colors shrink-0"
                    >
                      폴더 선택
                    </button>
                  </div>
                </div>

                {/* Teacher Group Presets */}
                {groups.length > 0 && (
                  <div>
                    <label className="block text-[13px] font-bold text-[#4e5968] mb-2">지정 그룹 불러오기</label>
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => applyGroupPreset(g.memberIds)}
                          className="px-3.5 py-1.5 bg-[#e8f7f2] hover:bg-[#c2f0de] text-[#065f46] border border-[#c2f0de] font-semibold rounded-xl text-[12px] transition-colors"
                        >
                          {g.name} ({g.memberIds.length}명)
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teacher grid list (Selectable inside modal) */}
                <div>
                  <label className="block text-[13px] font-bold text-[#4e5968] mb-2">
                    취합 대상 선생님 지정 ({selectedTeacherIds.length}명 선택됨)
                  </label>
                  <CollatorTeacherGrid
                    teachers={teachers}
                    selectedIds={selectedTeacherIds}
                    onSelectionChange={setSelectedTeacherIds}
                    isSelectable={true}
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-[#f2f4f6] pt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-4 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14.5px]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-2xl transition-all shadow-[0_4px_12px_rgba(16,185,129,0.15)] text-[14.5px]"
                >
                  취합 요청 개설
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE ROOM CONFIRMATION MODAL */}
      {deleteRoomTargetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5 text-[#f04452]">
              <AlertTriangle className="w-5 h-5 text-[#f04452]" />
              취합 요청 삭제
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-6 leading-relaxed">
              정말로 이 취합 요청을 삭제하시겠습니까? 관련 P2P 시그널링과 데이터베이스 취합방 정보가 영구 제거됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteRoomTargetId(null)}
                className="flex-1 py-3.5 bg-[#f2f4f6] text-[#4e5968] font-bold rounded-2xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteRoom}
                className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-2xl hover:bg-[#d73a49] transition-colors text-[14px]"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT FILE MODAL */}
      {isSubmitModalOpen && activeSubItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-lg shadow-xl border border-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#191f28] flex items-center gap-2">
                <FileUp className="w-5 h-5 text-[#10b981]" />
                파일 제출
              </h3>
              <button 
                onClick={() => {
                  if (uploadStatus === 'sending') {
                    if (!confirm('파일 전송 중입니다. 전송을 중단하고 모달을 닫으시겠습니까?')) return;
                  }
                  setIsSubmitModalOpen(false);
                }}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="bg-[#f2f4f6] rounded-2xl p-4">
                <h4 className="font-bold text-[15px] text-[#191f28]">{activeSubItem.title}</h4>
                <p className="text-[12.5px] text-[#8b95a1] mt-1">요청 교사: {activeSubItem.requesterName}</p>
              </div>

              {uploadStatus === 'idle' && (
                <div className="space-y-4">
                  <div 
                    onClick={() => document.getElementById('file-input')?.click()}
                    className="border-2 border-dashed border-[#e5e8eb] hover:border-[#10b981] bg-[#f8faf9] rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-white group"
                  >
                    <input 
                      type="file" 
                      id="file-input" 
                      className="hidden" 
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files[0]) {
                          setSelectedFile(files[0]);
                        }
                      }}
                    />
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-3 group-hover:scale-105 transition-transform">
                      <Folder className="w-6 h-6 text-[#10b981]" />
                    </div>
                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="font-bold text-[14px] text-[#191f28] max-w-[300px] truncate mx-auto">{selectedFile.name}</p>
                        <p className="text-[12px] text-[#8b95a1]">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-[14px] text-[#4e5968]">클릭하여 제출할 파일 선택</p>
                        <p className="text-[11.5px] text-[#8b95a1] mt-1">선생님 컴퓨터의 제출 자료를 선택하세요.</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleFileSubmit}
                    disabled={!selectedFile}
                    className={`w-full py-4 font-bold rounded-2xl transition-all text-[14.5px] flex items-center justify-center gap-1.5 ${
                      selectedFile 
                        ? 'bg-[#10b981] hover:bg-[#059669] text-white shadow-sm shadow-[#10b981]/10' 
                        : 'bg-[#f2f4f6] text-[#b0b8c1] cursor-not-allowed'
                    }`}
                  >
                    <FileUp className="w-4 h-4" />
                    파일 실시간 전송 시작
                  </button>
                </div>
              )}

              {(uploadStatus === 'connecting' || uploadStatus === 'sending') && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-12 h-12 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div className="space-y-1">
                    <p className="font-bold text-[15px] text-[#191f28]">
                      {uploadStatus === 'connecting' ? '호스트와 WebRTC P2P 연결을 수립 중...' : '파일 조각을 전송 중...'}
                    </p>
                    <p className="text-[12px] text-[#8b95a1]">
                      {selectedFile?.name} ({uploadProgress}%)
                    </p>
                  </div>
                  <div className="w-full bg-[#f2f4f6] h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#10b981] h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadStatus === 'completed' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-14 h-14 bg-[#e8f7f2] rounded-full flex items-center justify-center mx-auto text-[#10b981]">
                    <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-[16px] text-[#191f28]">제출 완료!</p>
                    <p className="text-[12.5px] text-[#8b95a1] leading-relaxed">
                      파일 전송이 완료되었습니다. 관리자 선생님의 로컬 디스크 지정 경로에 정상적으로 파일 저장을 마쳤습니다.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsSubmitModalOpen(false)}
                    className="w-full py-3.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] font-bold rounded-2xl text-[14px] transition-colors"
                  >
                    닫기
                  </button>
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-14 h-14 bg-[#fff5f5] rounded-full flex items-center justify-center mx-auto text-[#f04452]">
                    <AlertCircle className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-[16px] text-[#f04452]">전송 오류 발생</p>
                    <p className="text-[12.5px] text-[#8b95a1] px-4 leading-relaxed">
                      {uploadError}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUploadStatus('idle')}
                      className="flex-1 py-3.5 bg-[#f2f4f6] hover:bg-[#e5e8eb] text-[#4e5968] font-bold rounded-xl text-[13.5px] transition-colors"
                    >
                      다시 시도
                    </button>
                    <button
                      onClick={() => setIsSubmitModalOpen(false)}
                      className="flex-1 py-3.5 bg-[#f04452] text-white font-bold rounded-xl text-[13.5px] transition-colors"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GROUP MANAGEMENT MODAL */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto border border-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-[#191f28] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#10b981]" />
                그룹 관리
              </h3>
              <button 
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1 text-[#8b95a1] hover:bg-[#f2f4f6] rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-bold text-[14px] text-[#4e5968]">현재 등록된 그룹</h4>
                {groups.length === 0 ? (
                  <p className="text-[12.5px] text-[#8b95a1] bg-[#f2f4f6] p-4 rounded-2xl text-center">등록된 고유 그룹이 없습니다. 아래 양식에서 그룹을 추가하세요.</p>
                ) : (
                  <div className="space-y-2">
                    {groups.map(g => (
                      <div key={g.id} className="flex justify-between items-center bg-[#f2f4f6] px-4 py-3 rounded-2xl">
                        <div>
                          <span className="font-bold text-[13.5px] text-[#191f28]">{g.name}</span>
                          <span className="text-[12px] text-[#8b95a1] ml-2">({g.memberIds.length}명 지정됨)</span>
                        </div>
                        <button
                          onClick={() => collatorService.deleteGroup(g.id)}
                          className="text-[#8b95a1] hover:text-[#f04452] p-1.5 rounded-lg hover:bg-[#fff5f5] transition-colors"
                          title="그룹 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleGroupCreate} className="space-y-4 border-t border-[#f2f4f6] pt-6">
                <h4 className="font-bold text-[14px] text-[#4e5968]">새 그룹 추가</h4>
                <div>
                  <label className="block text-[12px] font-bold text-[#8b95a1] mb-1.5">그룹 이름</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="예: 4학년 담임 모임"
                    className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#8b95a1] mb-1.5">멤버 선생님 지정</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {teachers.map(teacher => {
                      const isAdded = newGroupTeacherIds.includes(teacher.id);
                      return (
                        <div
                          key={teacher.id}
                          onClick={() => {
                            if (isAdded) {
                              setNewGroupTeacherIds(newGroupTeacherIds.filter(id => id !== teacher.id));
                            } else {
                              setNewGroupTeacherIds([...newGroupTeacherIds, teacher.id]);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-center text-[12.5px] cursor-pointer select-none transition-all ${
                            isAdded
                              ? 'bg-[#e8f7f2] border-[#10b981] font-bold text-[#065f46]'
                              : 'bg-[#f2f4f6] border-transparent text-[#4e5968] hover:bg-[#e5e8eb]'
                          }`}
                        >
                          {teacher.name} ({teacher.role})
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-2xl text-[14px] transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  새 그룹 추가하기
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Collator;
