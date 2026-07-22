import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Notices } from './pages/Notices';
import { Calendar } from './pages/Calendar';
import { Opinions } from './pages/Opinions';
import { Reservations } from './pages/Reservations';
import { Collator } from './pages/Collator';
import { SheetsRepository } from './pages/SheetsRepository';
import { isFirebaseConfigured } from './firebase';
import { Database, Check, Copy, Code, Link2, ShieldAlert } from 'lucide-react';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f4f6]">
        <div className="w-8 h-8 border-4 border-[#10b981] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function DatabaseSetupOnboarding() {
  const [activeTab, setActiveTab] = useState<'code' | 'direct'>('code');
  const [schoolCode, setSchoolCode] = useState('');
  const [firebaseConfigText, setFirebaseConfigText] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // 1) School Code submit handler
  const handleSchoolCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = schoolCode.trim();
    if (!code.startsWith('SBC-')) {
      alert('올바른 학교 연동 코드 형식이 아닙니다. (SBC-로 시작해야 합니다)');
      return;
    }
    try {
      const base64Str = code.substring(4);
      const decodedJson = decodeURIComponent(escape(atob(base64Str)));
      const config = JSON.parse(decodedJson);
      if (!config || (!config.databaseURL && !config.projectId)) {
        throw new Error('Invalid config');
      }
      
      // Auto-reconstruct databaseURL if missing (Realtime DB is required for collector tool)
      if (!config.databaseURL && config.projectId) {
        config.databaseURL = `https://${config.projectId}-default-rtdb.firebaseio.com`;
      }
      
      localStorage.setItem('sb_firebase_config', JSON.stringify(config));
      
      // Save config via IPC if running in Electron environment
      if (window.hasOwnProperty('electronAPI')) {
        (window as any).electronAPI.saveEmbeddedConfig(config);
      }
      
      alert('학교 데이터베이스 연동 성공! 앱을 재시작합니다.');
      window.location.reload();
    } catch (err) {
      alert('연동 코드가 유효하지 않거나 깨진 코드입니다. 다시 복사해서 입력해 주세요.');
    }
  };

  // 2) Direct firebase config submit handler
  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const configText = firebaseConfigText.trim();
    const pass = adminPassword.trim();
    const passConfirm = adminPasswordConfirm.trim();

    if (!configText) {
      alert('설정값 또는 데이터베이스 URL을 입력해 주세요.');
      return;
    }
    if (!pass) {
      alert('관리자 비밀번호를 설정해 주세요.');
      return;
    }
    if (!/^\d{4}$/.test(pass)) {
      alert('관리자 비밀번호는 숫자 4자리로 설정해 주세요. (예: 0000)');
      return;
    }
    if (pass !== passConfirm) {
      alert('입력하신 비밀번호와 비밀번호 확인 값이 일치하지 않습니다.');
      return;
    }

    let parsedConfig: any = {};
    if (configText.startsWith('http://') || configText.startsWith('https://')) {
      parsedConfig = {
        databaseURL: configText,
        apiKey: 'mock_apiKey',
        projectId: 'mock_projectId'
      };
    } else {
      let evaluatedSuccess = false;
      try {
        let cleanedJson = configText;
        if (configText.includes('{')) {
          const start = configText.indexOf('{');
          const end = configText.lastIndexOf('}') + 1;
          cleanedJson = configText.substring(start, end);
        }
        const evaluated = new Function(`return ${cleanedJson}`)();
        if (evaluated && typeof evaluated === 'object') {
          parsedConfig = evaluated;
          evaluatedSuccess = true;
        }
      } catch (err) {}

      // Robust regex fallback
      if (!evaluatedSuccess) {
        const apiKeyMatch = configText.match(/apiKey\s*:\s*["']([^"']+)["']/);
        const projectIdMatch = configText.match(/projectId\s*:\s*["']([^"']+)["']/);
        const dbUrlMatch = configText.match(/databaseURL\s*:\s*["']([^"']+)["']/);

        if (apiKeyMatch) parsedConfig.apiKey = apiKeyMatch[1];
        if (projectIdMatch) parsedConfig.projectId = projectIdMatch[1];
        if (dbUrlMatch) parsedConfig.databaseURL = dbUrlMatch[1];
      }
    }

    // Auto-reconstruct databaseURL using projectId if it's missing
    if (!parsedConfig.databaseURL && parsedConfig.projectId) {
      parsedConfig.databaseURL = `https://${parsedConfig.projectId}-default-rtdb.firebaseio.com`;
    }

    if (!parsedConfig.databaseURL) {
      alert('입력하신 정보에서 데이터베이스 URL(databaseURL) 또는 프로젝트 ID(projectId)를 찾을 수 없습니다. Firebase SDK 설정을 정확히 붙여넣어 주세요.');
      return;
    }

    if (!parsedConfig.apiKey) parsedConfig.apiKey = 'mock_apiKey';
    if (!parsedConfig.projectId) parsedConfig.projectId = 'mock_projectId';

    parsedConfig.adminPassword = pass;
    localStorage.setItem('sb_firebase_config', JSON.stringify(parsedConfig));

    // Save config via IPC if running in Electron environment
    if (window.hasOwnProperty('electronAPI')) {
      (window as any).electronAPI.saveEmbeddedConfig(parsedConfig);
    }

    alert('Firebase 설정 저장 성공! 앱을 재시작합니다.');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#f2f4f6] flex items-center justify-center p-4 font-sans leading-relaxed selection:bg-[#10b981]/20">
      <div className="w-full max-w-xl bg-white rounded-[32px] p-6 sm:p-8 shadow-[0_4px_30px_rgba(0,0,0,0.03)] border border-white">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#e8f7f2] text-[#10b981] rounded-[24px] flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Database className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-[#191f28] tracking-tight">🏫 동학년 게시판 & 취합도우미</h2>
          <p className="text-[#8b95a1] text-[15px] mt-2">
            다른 학교나 다른 학년에서 사용하기 위한 Firebase 데이터베이스 연동 마법사입니다.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#f2f4f6] p-1 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'code'
                ? 'bg-white text-[#191f28] shadow-sm'
                : 'text-[#8b95a1] hover:text-[#4e5968]'
            }`}
          >
            <Link2 className="w-4 h-4" />
            학교 연동 코드로 시작
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'direct'
                ? 'bg-white text-[#191f28] shadow-sm'
                : 'text-[#8b95a1] hover:text-[#4e5968]'
            }`}
          >
            <Code className="w-4 h-4" />
            파이어베이스 직접 연동 (관리자)
          </button>
        </div>

        {activeTab === 'code' ? (
          <form onSubmit={handleSchoolCodeSubmit} className="space-y-5">
            <div className="bg-[#e8f7f2] rounded-2xl p-5 border border-[#c2f0de]">
              <h4 className="font-bold text-[#065f46] text-[14px]">쉽고 빠른 학교 연결</h4>
              <p className="text-[#047857] text-[13px] mt-1">
                관리자 선생님으로부터 전달받은 <b>학교 연동 코드(SBC-로 시작)</b>를 아래에 붙여넣어 주세요. 자동으로 데이터 저장 공간이 연결됩니다.
              </p>
            </div>
            <div>
              <label className="block text-[13px] font-bold text-[#4e5968] mb-2">학교 연동 코드</label>
              <input
                type="text"
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                placeholder="SBC-eyJrZXkiOiJ2YWx1ZSIsImRhdGFiYXNlVVJMIjoiaHR0cHM6Ly8..."
                className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-4 bg-[#10b981] text-white font-bold rounded-2xl hover:bg-[#059669] transition-all shadow-[0_4px_12px_rgba(16,185,129,0.15)] text-[15px]"
            >
              연동 시작하기
            </button>
          </form>
        ) : (
          <form onSubmit={handleDirectSubmit} className="space-y-5">
            <div className="bg-[#fff9db] rounded-2xl p-5 border border-[#ffe066]">
              <h4 className="font-bold text-[#856404] text-[14px] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[#d9480f]" /> 
                Firebase Project 직접 생성 필요 (처음 1회)
              </h4>
              <p className="text-[#4e5968] text-[13px] mt-1 leading-relaxed">
                1. Firebase Console에서 프로젝트를 개설하고 <b>Realtime Database</b> 및 <b>Cloud Firestore</b>를 추가하세요.<br />
                2. 프로젝트 설정 {`>`} 웹 앱을 추가한 뒤, 제공되는 <b>firebaseConfig SDK 블록</b>을 아래에 복사해 넣으세요.<br />
                3. 해당 정보를 학교 코드로 변환(Base64)하여 다른 선생님들께 공유해 줄 수 있습니다.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#4e5968] mb-2">Firebase Config SDK 블록</label>
              <textarea
                value={firebaseConfigText}
                onChange={(e) => setFirebaseConfigText(e.target.value)}
                placeholder={`const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  databaseURL: "...",\n  ...\n};`}
                rows={5}
                className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[13px] font-mono transition-all outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-2">새 관리자 비밀번호</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="비밀번호 설정"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-bold text-[#4e5968] mb-2">비밀번호 확인</label>
                <input
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 확인"
                  className="w-full px-4 py-3 bg-[#f2f4f6] border border-transparent focus:border-[#10b981] focus:bg-white focus:ring-4 focus:ring-[#10b981]/10 rounded-2xl text-[14px] transition-all outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-[#10b981] text-white font-bold rounded-2xl hover:bg-[#059669] transition-all shadow-[0_4px_12px_rgba(16,185,129,0.15)] text-[15px]"
            >
              새로운 데이터베이스 개설 및 저장
            </button>
          </form>
        )}

        <div className="text-center text-[12px] text-[#b0b8c1] pt-4 border-t border-[#f2f4f6] mt-6">
          동학년 게시판 & 취합도우미 데스크톱 패키지 • 초보 교사 연수용
        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (!isFirebaseConfigured) {
    return <DatabaseSetupOnboarding />;
  }

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Notices /></PrivateRoute>} />
          <Route path="/calendar" element={<PrivateRoute><Calendar /></PrivateRoute>} />
          <Route path="/opinions" element={<PrivateRoute><Opinions /></PrivateRoute>} />
          <Route path="/reservations" element={<PrivateRoute><Reservations /></PrivateRoute>} />
          <Route path="/collator" element={<PrivateRoute><Collator /></PrivateRoute>} />
          <Route path="/sheets" element={<PrivateRoute><SheetsRepository /></PrivateRoute>} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
