import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { collatorService } from '../utils/collatorService';

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: 'teacher' | 'admin';
  createdAt: string;
}

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (name: string) => Promise<void>;
  logout: () => Promise<void>;
  enableAdminMode: (password: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('teacher_profile');
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored profile");
      }
    }
    setLoading(false);
  }, []);

  const login = async (name: string) => {
    if (!name.trim()) return;
    
    const trimmedName = name.trim();
    const existingStored = localStorage.getItem('teacher_profile');
    let uid = '';
    if (existingStored) {
      try {
        const parsed = JSON.parse(existingStored);
        if (parsed.displayName === trimmedName && parsed.uid) {
          uid = parsed.uid;
        }
      } catch (e) {}
    }
    
    if (!uid) {
      uid = 'user_' + encodeURIComponent(trimmedName.replace(/\s+/g, '_'));
    }
    
    const newProfile: UserProfile = {
      uid: uid,
      displayName: trimmedName,
      email: 'no-email@local.com',
      role: 'teacher',
      createdAt: new Date().toISOString()
    };
    
    localStorage.setItem('teacher_profile', JSON.stringify(newProfile));
    setProfile(newProfile);
    try {
      collatorService.updateProfile(newProfile);
    } catch (e) {}
  };

  const logout = async () => {
    try {
      collatorService.removeCurrentUser();
    } catch (e) {}
    localStorage.removeItem('teacher_profile');
    setProfile(null);
  };

  const enableAdminMode = (password: string) => {
    // Import or resolve firebaseConfig locally to avoid dependency cycles if any
    const storedConfigStr = localStorage.getItem('sb_firebase_config');
    let customAdminPassword = '0000';
    if (storedConfigStr) {
      try {
        const config = JSON.parse(storedConfigStr);
        if (config.adminPassword) {
          customAdminPassword = config.adminPassword;
        }
      } catch (e) {}
    }

    const customPassFromStorage = localStorage.getItem('sb_admin_password');
    if (customPassFromStorage) {
      customAdminPassword = customPassFromStorage;
    }

    if ((password === '0000' || password === customAdminPassword) && profile) {
      const updatedProfile = { ...profile, role: 'admin' as const };
      localStorage.setItem('teacher_profile', JSON.stringify(updatedProfile));
      setProfile(updatedProfile);
      try {
        collatorService.updateProfile(updatedProfile);
      } catch (e) {}
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user: profile, profile, loading, login, logout, enableAdminMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
