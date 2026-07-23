import React, { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, MessageSquare, Bell, CalendarDays, LogOut, BookOpen, Shield, FolderDown, Settings, RotateCcw, FileSpreadsheet, Copy, Check } from 'lucide-react';
import { cn } from '../utils/cn';

const getSchoolCode = () => {
  if (!firebaseConfig) return '';
  try {
    const jsonStr = JSON.stringify(firebaseConfig);
    const base64Str = btoa(unescape(encodeURIComponent(jsonStr)));
    return `SBC-${base64Str}`;
  } catch (e) {
    return '';
  }
};

const navItems = [
  { name: '대시보드', href: '/', icon: Bell },
  { name: '학년 달력', href: '/calendar', icon: CalendarDays },
  { name: '의견', href: '/opinions', icon: MessageSquare },
  { name: '예약', href: '/reservations', icon: Calendar },
  { name: '취합', href: '/collator', icon: FolderDown },
  { name: '정보창고', href: '/sheets', icon: FileSpreadsheet },
];

export function Layout({ children }: { children: ReactNode }) {
  const { profile, logout, enableAdminMode } = useAuth();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [isCodeCopied, setIsCodeCopied] = useState(false);

  const handleAdminClick = () => {
    if (profile?.role === 'admin') {
      setAlertMessage('이미 관리자 모드입니다.');
      return;
    }
    setIsModalOpen(true);
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = enableAdminMode(password);
    if (success) {
      setAlertMessage('관리자 모드가 활성화되었습니다. 모든 게시물을 관리할 수 있습니다.');
      setIsModalOpen(false);
      setPassword('');
    } else {
      setAlertMessage('비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6] flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="bg-white sticky top-0 z-40 border-b border-[#f2f4f6]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#10b981] rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-[#191f28] tracking-tight">동학년 게시판</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1 mr-4">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[15px] font-semibold transition-all",
                        isActive 
                          ? "text-[#191f28] bg-[#f2f4f6]" 
                          : "text-[#4e5968] hover:bg-[#f2f4f6] hover:text-[#191f28]"
                      )}
                    >
                      {item.name}
                    </Link>
                  );
                })}
                <button
                  onClick={handleAdminClick}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[15px] font-semibold transition-all flex items-center gap-1",
                    profile?.role === 'admin'
                      ? "text-[#10b981] bg-[#ecfdf5]"
                      : "text-[#4e5968] hover:bg-[#f2f4f6] hover:text-[#191f28]"
                  )}
                >
                  <Shield className="w-4 h-4" />
                  관리자
                </button>
              </div>
              
              <div className="flex items-center gap-2 pl-4 border-l border-[#f2f4f6]">
                <div className="flex flex-col items-end hidden sm:flex mr-2">
                  <span className="text-[14px] font-bold text-[#191f28]">{profile?.displayName}</span>
                  <span className="text-[12px] text-[#8b95a1]">
                    {profile?.role === 'admin' ? '관리자' : '선생님'}
                  </span>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 text-[#8b95a1] hover:text-[#191f28] hover:bg-[#f2f4f6] rounded-xl transition-colors animate-fade-in"
                  title="데이터베이스 설정"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button 
                  onClick={logout}
                  className="p-2 text-[#8b95a1] hover:text-[#f04452] hover:bg-[#fff5f5] rounded-xl transition-colors"
                  title="로그아웃"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation (Bottom) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#f2f4f6] z-40 pb-safe">
        <div className="flex justify-around items-center h-16 px-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full gap-0.5",
                  isActive ? "text-[#191f28]" : "text-[#8b95a1]"
                )}
              >
                <Icon className={cn("w-5.5 h-5.5", isActive ? "text-[#191f28]" : "text-[#b0b8c1]")} />
                <span className={cn("text-[9px] font-semibold", isActive ? "text-[#191f28]" : "text-[#8b95a1]")}>
                  {item.name}
                </span>
              </Link>
            );
          })}
          <button
            onClick={handleAdminClick}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full gap-0.5",
              profile?.role === 'admin' ? "text-[#10b981]" : "text-[#8b95a1]"
            )}
          >
            <Shield className={cn("w-5.5 h-5.5", profile?.role === 'admin' ? "text-[#10b981]" : "text-[#b0b8c1]")} />
            <span className={cn("text-[9px] font-semibold", profile?.role === 'admin' ? "text-[#10b981]" : "text-[#8b95a1]")}>
              관리자
            </span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full gap-0.5 text-[#8b95a1]"
          >
            <Settings className="w-5.5 h-5.5 text-[#b0b8c1]" />
            <span className="text-[9px] font-semibold text-[#8b95a1]">설정</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 sm:pb-8">
        {children}
      </main>

      {/* Admin Password Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-[#191f28] mb-1">👑 관리자 모드 전환</h3>
            <p className="text-[13px] text-[#8b95a1] mb-4">숫자 4자리 비밀번호를 입력하세요. (기본: <b className="text-[#10b981]">0000</b>)</p>
            <form onSubmit={handleAdminSubmit}>
              <input
                type="password"
                value={password}
                maxLength={4}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-4 py-3 bg-[#f2f4f6] border-transparent focus:border-[#10b981] focus:bg-white focus:ring-2 focus:ring-[#10b981]/20 rounded-xl text-[16px] text-center tracking-[6px] font-mono transition-colors mb-4 outline-none font-bold"
                placeholder="0000"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setPassword('');
                  }}
                  className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-semibold rounded-xl hover:bg-[#e5e8eb] transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#10b981] text-white font-semibold rounded-xl hover:bg-[#059669] transition-colors"
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-[#191f28] mb-2">알림</h3>
            <p className="text-[14px] text-[#8b95a1] mb-6">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="w-full py-3 bg-[#10b981] text-white font-semibold rounded-xl hover:bg-[#059669] transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Settings (Firebase Reset) Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
          <div className="bg-white rounded-[24px] p-6 w-full max-w-md shadow-xl border border-white">
            <h3 className="text-lg font-bold text-[#191f28] mb-2 flex items-center gap-1.5">
              <Settings className="w-5 h-5 text-[#10b981]" />
              시스템 설정
            </h3>
            <p className="text-[14px] text-[#4e5968] mb-4 leading-relaxed">
              현재 저장된 Firebase 데이터베이스 연결 설정을 확인하거나 초기화할 수 있습니다.
            </p>

            {/* Current School Code Box */}
            {getSchoolCode() && (
              <div className="mb-5 p-3.5 bg-[#f8fafc] rounded-2xl border border-[#e2e8f0]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12.5px] font-bold text-[#4e5968]">🏫 현재 학교 연동 코드</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(getSchoolCode());
                      setIsCodeCopied(true);
                      setTimeout(() => setIsCodeCopied(false), 2000);
                    }}
                    className="px-2.5 py-1 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-lg text-[11.5px] transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    {isCodeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {isCodeCopied ? '복사됨!' : '코드 복사'}
                  </button>
                </div>
                <div className="text-[11.5px] font-mono text-[#64748b] bg-white p-2 rounded-xl border border-[#e2e8f0] break-all select-all max-h-20 overflow-y-auto leading-relaxed">
                  {getSchoolCode()}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex-1 py-3 bg-[#f2f4f6] text-[#4e5968] font-semibold rounded-xl hover:bg-[#e5e8eb] transition-colors text-[14px]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('정말로 데이터베이스 연동 설정을 초기화하시겠습니까? 현재 로그인 세션 및 설정이 삭제되며 앱이 재시작됩니다.')) {
                    localStorage.removeItem('sb_firebase_config');
                    localStorage.removeItem('sb_user_profile');
                    localStorage.removeItem('teacher_profile');
                    window.location.reload();
                  }
                }}
                className="flex-1 py-3 bg-[#f04452] text-white font-semibold rounded-xl hover:bg-[#d9303e] transition-colors flex items-center justify-center gap-1.5 text-[14px]"
              >
                <RotateCcw className="w-4 h-4" />
                연동 초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
