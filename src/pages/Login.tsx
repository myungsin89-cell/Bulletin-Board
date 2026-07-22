import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export function Login() {
  const { login, user, loading } = useAuth();
  const [classNum, setClassNum] = useState('');
  const [name, setName] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f4f6]">
        <div className="w-8 h-8 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && classNum.trim()) {
      // Login with combined format e.g. "14반 송명신" or "교과 송명신"
      const fullName = `${classNum.trim()} ${name.trim()}`;
      login(fullName);
    }
  };

  return (
    <div className="min-h-screen bg-white sm:bg-[#f2f4f6] flex flex-col justify-center items-center p-0 sm:p-4 font-sans">
      <div className="w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-[24px] sm:shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6 sm:p-8 flex flex-col">
        <div className="flex-1 flex flex-col justify-center mt-12 sm:mt-0">
          <h1 className="text-[28px] font-bold text-[#191f28] leading-[1.35] mb-3">
            동학년 게시판에<br />오신 것을 환영합니다
          </h1>
          <p className="text-[15px] text-[#8b95a1] mb-8">
            선생님들의 원활한 소통과 협업을 위한 공간입니다.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-5 flex-1 flex flex-col">
            <div className="space-y-4 flex-1">
              {/* Class Text Input Field */}
              <div>
                <label className="block text-[13px] font-semibold text-[#4e5968] mb-2 ml-1">소속 반 / 직책</label>
                <input
                  type="text"
                  value={classNum}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClassNum(e.target.value)}
                  placeholder="예: 14반, 교과, 부장 등"
                  className="w-full px-5 py-4 bg-[#f2f4f6] border-none rounded-[16px] text-[15px] text-[#191f28] placeholder-[#b0b8c1] focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-all font-semibold"
                  required
                />
                <p className="mt-1.5 text-[11.5px] text-[#8b95a1] ml-1">
                  교과 전담 선생님이나 부장님은 '교과', '부장', '체육전담' 등 직책을 써주시면 됩니다. (예: 14반 / 교과)
                </p>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-[13px] font-semibold text-[#4e5968] mb-2 ml-1">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="선생님 성함을 입력해주세요"
                  className="w-full px-5 py-4 bg-[#f2f4f6] border-none rounded-[16px] text-[15px] text-[#191f28] placeholder-[#b0b8c1] focus:outline-none focus:ring-2 focus:ring-[#10b981] transition-all"
                  required
                />
              </div>

              <p className="text-[13px] text-[#8b95a1] ml-1 pt-2">
                입력하신 소속과 이름은 브라우저에 저장되어<br />다음 방문 시 자동으로 로그인됩니다.
              </p>
            </div>
            
            <div className="mt-auto pt-6 pb-4 sm:pb-0">
              <button
                type="submit"
                disabled={!name.trim() || !classNum.trim()}
                className="w-full flex items-center justify-center bg-[#10b981] disabled:bg-[#e5e8eb] disabled:text-[#b0b8c1] rounded-[16px] px-4 py-4 text-white text-[16px] font-bold hover:bg-[#059669] active:scale-[0.98] transition-all focus:outline-none"
              >
                시작하기
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
