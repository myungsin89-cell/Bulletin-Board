import { ref, set, get, onValue, push, update, remove, onDisconnect, onChildAdded, Database } from 'firebase/database';
import { rtdb } from '../firebase';

export interface TeacherProfile {
  id: string;
  name: string;
  role: string;
  grade: number;
  isSpecial: boolean;
  online: boolean;
  lastActive: number;
}

export interface CustomGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface CollectionRoom {
  id: string;
  title: string;
  folderPath: string;
  targetTeacherIds: string[];
  submittedTeacherIds: string[];
  creatorName: string;
  creatorId: string;
  createdAt: number;
}

export interface SubmissionItem {
  id: string;
  title: string;
  requesterName: string;
  description: string;
  deadline: string;
  submitted: boolean;
  progress: number;
  uploading: boolean;
}

export class CollatorService {
  public teachers: TeacherProfile[] = [];
  public groups: CustomGroup[] = [];
  public createdRooms: CollectionRoom[] = [];
  public mySubmissions: SubmissionItem[] = [];

  private listeners: { [key: string]: Function[] } = {
    presenceChange: [],
    teacherSubmitted: []
  };

  public myProfile: { id: string; name: string; role: string; isAdmin: boolean } | null = null;
  private db: Database | null = null;
  private activeSignalingListeners = new Set<string>();

  constructor() {
    this.db = rtdb;
    this.initProfile();
    this.initFirebase();
  }

  // Subscribe to service events
  public addEventListener(event: 'presenceChange' | 'teacherSubmitted', callback: Function) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  // Remove listener
  public removeEventListener(event: 'presenceChange' | 'teacherSubmitted', callback: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  // Trigger local listeners
  private triggerEvent(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(...args); } catch (err) { console.error('Listener error:', err); }
      });
    }
  }

  private initProfile() {
    const stored = localStorage.getItem('teacher_profile');
    if (stored) {
      try {
        const profile = JSON.parse(stored);
        this.myProfile = {
          id: profile.uid || 't_' + Math.random().toString(36).substring(2, 11),
          name: profile.displayName || '이름 없음',
          role: profile.role || '선생님',
          isAdmin: profile.role === 'admin'
        };
      } catch (e) {
        console.error('Failed to parse user profile', e);
      }
    }
  }

  public initFirebase() {
    this.db = rtdb;
    if (!this.db) {
      console.warn('Firebase RTDB is not initialized. Running in offline/setup mode.');
      this.loadGroups();
      return;
    }

    this.loadGroups();
    this.setupPresence();
    this.setupRoomsSync();
  }

  // 1) Setup Presence & Realtime User Sync
  private async setupPresence() {
    if (!this.db || !this.myProfile) return;

    const myId = this.myProfile.id;
    
    // Only register actual teachers (not admin managers) in the database presence node
    if (!this.myProfile.isAdmin) {
      const teacherRef = ref(this.db, `teachers/${myId}`);
      const isSpecial = this.myProfile.role.includes('전담') || 
                        this.myProfile.role.includes('영어') || 
                        this.myProfile.role.includes('체육') || 
                        this.myProfile.role.includes('과학') || 
                        this.myProfile.role.includes('음악') || 
                        this.myProfile.role.includes('정보');
      
      const myData: TeacherProfile = {
        id: myId,
        name: this.myProfile.name,
        role: this.myProfile.role,
        grade: 4, // Default grade
        isSpecial: isSpecial,
        online: true,
        lastActive: Date.now()
      };

      await set(teacherRef, myData);

      const onlineRef = ref(this.db, `teachers/${myId}/online`);
      onDisconnect(onlineRef).set(false);
    }

    // Listen to all connected teachers and automatically deduplicate by class & ID
    const teachersRef = ref(this.db, 'teachers');
    onValue(teachersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const rawTeachers: TeacherProfile[] = Object.entries(data).map(([key, val]: [string, any]) => {
          return {
            id: val.id || key,
            name: val.name || '알 수 없는 사용자',
            role: val.role || '역할 없음',
            ...val
          };
        });

        // 🌟 Smart Class-based & ID Deduplication:
        // Keep only the most recently active profile for each class (e.g. "2반") or user ID
        const teacherMap = new Map<string, TeacherProfile>();

        // Sort by lastActive ascending so newer entry overwrites older entry
        rawTeachers.sort((a, b) => (a.lastActive || 0) - (b.lastActive || 0));

        rawTeachers.forEach(t => {
          // Extract class identifier prefix if present (e.g. "2반" from "2반 한미소")
          const match = t.name ? t.name.trim().match(/^(\d+반)/) : null;
          const key = match ? match[1] : t.id; // Use "2반" as key if present, otherwise ID

          teacherMap.set(key, t); // Overwrites older record for "2반" automatically!
        });

        this.teachers = Array.from(teacherMap.values());
      } else {
        this.teachers = [];
      }
      this.triggerEvent('presenceChange');
    });
  }

  // Explicitly remove current user from DB (used during user switch / logout)
  public async removeCurrentUser() {
    if (!this.db || !this.myProfile || this.myProfile.isAdmin) return;
    const myId = this.myProfile.id;
    const teacherRef = ref(this.db, `teachers/${myId}`);
    const onlineRef = ref(this.db, `teachers/${myId}/online`);
    
    await onDisconnect(onlineRef).cancel();
    await remove(teacherRef);
  }

  // 2) Sync Rooms & Submissions Realtime
  private setupRoomsSync() {
    if (!this.db) return;

    const roomsRef = ref(this.db, 'rooms');
    onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      const rooms: CollectionRoom[] = data ? Object.values(data) : [];
      
      rooms.forEach(r => {
        if (!r.targetTeacherIds) r.targetTeacherIds = [];
        if (!r.submittedTeacherIds) r.submittedTeacherIds = [];
      });

      this.createdRooms = rooms;

      if (this.myProfile) {
        const myId = this.myProfile.id;
        this.mySubmissions = rooms
          .filter(r => r.targetTeacherIds.includes(myId))
          .map(r => {
            const isSubmitted = r.submittedTeacherIds.includes(myId);
            return {
              id: r.id,
              title: r.title,
              requesterName: `${r.creatorName} 선생님`,
              description: `내 PC의 파일을 취합자에게 전송합니다.`,
              deadline: '진행 중',
              submitted: isSubmitted,
              progress: 0,
              uploading: false
            };
          });
      }

      this.triggerEvent('presenceChange');
      this.updateSignalingListeners();
    });
  }

  private updateSignalingListeners() {
    if (!this.db || !this.myProfile) return;

    const myName = this.myProfile.name;
    const myId = this.myProfile.id;

    this.createdRooms.forEach(room => {
      if ((room.creatorName === '나' || room.creatorName === myName || room.creatorId === myId) && !this.activeSignalingListeners.has(room.id)) {
        this.activeSignalingListeners.add(room.id);
        this.listenForP2PSignaling(room.id);
      }
    });
  }

  // 3) WebRTC Signaling Receiver (App Creator listens for incoming files)
  private listenForP2PSignaling(roomId: string) {
    if (!this.db) return;

    const signalingRef = ref(this.db, `signaling/${roomId}`);
    onChildAdded(signalingRef, (snapshot) => {
      const teacherId = snapshot.key;
      const data = snapshot.val();
      
      if (teacherId && data && data.offer && !data.answer) {
        this.acceptP2PConnection(roomId, teacherId, data.offer);
      }
    });
  }

  private async acceptP2PConnection(roomId: string, teacherId: string, offerSDP: any) {
    if (!this.db) return;

    console.log(`[WebRTC] Incoming connection request for room ${roomId} from teacher ${teacherId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidatesRef = ref(this.db!, `signaling/${roomId}/${teacherId}/answerCandidates`);
        push(candidatesRef, event.candidate.toJSON());
      }
    };

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      let fileMeta: any = null;
      let receivedSize = 0;
      let isFinished = false;

      dc.onmessage = async (e) => {
        if (typeof e.data === 'string') {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'meta') {
              fileMeta = msg;
              receivedSize = 0;
              isFinished = false;
              console.log(`[WebRTC] Starting file receive stream: ${fileMeta.name} (${fileMeta.size} bytes)`);
              
              const room = this.createdRooms.find(r => r.id === roomId);
              const electronAPI = (window as any).electronAPI;
              if (room && electronAPI && electronAPI.startFileWrite) {
                await electronAPI.startFileWrite(roomId, teacherId, room.folderPath, fileMeta.name);
              }
            } else if (msg.type === 'eof') {
              console.log(`[WebRTC] File transfer completed: ${fileMeta.name}. Closing stream.`);
              isFinished = true;

              const electronAPI = (window as any).electronAPI;
              if (electronAPI && electronAPI.closeFileWrite) {
                await electronAPI.closeFileWrite(roomId, teacherId, false);
              }
              
              await this.markTeacherSubmitted(roomId, teacherId);
              
              dc.close();
              pc.close();
              remove(ref(this.db!, `signaling/${roomId}/${teacherId}`));
            }
          } catch (err) {
            console.error('[WebRTC] Failed to parse message metadata:', err);
          }
        } else {
          receivedSize += e.data.byteLength;
          const electronAPI = (window as any).electronAPI;
          if (electronAPI && electronAPI.writeFileChunk) {
            await electronAPI.writeFileChunk(roomId, teacherId, e.data);
          }
        }
      };

      dc.onclose = async () => {
        console.log('[WebRTC] Data channel closed.');
        const electronAPI = (window as any).electronAPI;
        if (!isFinished && electronAPI && electronAPI.closeFileWrite) {
          await electronAPI.closeFileWrite(roomId, teacherId, true);
        }
        pc.close();
      };
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSDP));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const answerRef = ref(this.db, `signaling/${roomId}/${teacherId}/answer`);
      await set(answerRef, { type: answer.type, sdp: answer.sdp });

      const offerCandidatesRef = ref(this.db, `signaling/${roomId}/${teacherId}/offerCandidates`);
      onChildAdded(offerCandidatesRef, (cSnap) => {
        const candidateData = cSnap.val();
        pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => {
          console.error('[WebRTC] Failed to add remote ICE candidate:', e);
        });
      });
    } catch (err) {
      console.error('[WebRTC] Failed to accept P2P connection:', err);
      pc.close();
    }
  }

  private async markTeacherSubmitted(roomId: string, teacherId: string) {
    if (!this.db) return;

    const roomRef = ref(this.db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (snapshot.exists()) {
      const room = snapshot.val();
      const submitted = room.submittedTeacherIds || [];
      if (!submitted.includes(teacherId)) {
        submitted.push(teacherId);
        await update(roomRef, { submittedTeacherIds: submitted });
        this.triggerEvent('teacherSubmitted', roomId, teacherId, { ...room, submittedTeacherIds: submitted });
      }
    }
  }

  // 4) WebRTC Signaling Sender (Teacher sends file to App Creator)
  public simulateP2PTransfer(roomId: string, file: File, onProgress: (progress: number, status: string) => void): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      if (!this.db || !this.myProfile) {
        reject(new Error('Firebase DB is not initialized. Please connect first.'));
        return;
      }

      const myId = this.myProfile.id;
      console.log(`[WebRTC] Initiating P2P connection to submit file for room ${roomId}`);

      onProgress(0, 'connecting');

      const sessionRef = ref(this.db, `signaling/${roomId}/${myId}`);
      await remove(sessionRef);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      const dc = pc.createDataChannel('file-transfer', { ordered: true });
      
      const timeoutId = setTimeout(() => {
        if (dc.readyState !== 'open') {
          console.error('[WebRTC] Connection timeout waiting for receiver.');
          pc.close();
          reject(new Error('timeout'));
        }
      }, 12000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candRef = ref(this.db!, `signaling/${roomId}/${myId}/offerCandidates`);
          push(candRef, event.candidate.toJSON());
        }
      };

      dc.onopen = async () => {
        clearTimeout(timeoutId);
        onProgress(0, 'sending');
        console.log('[WebRTC] P2P channel established. Starting file transfer...');
        
        dc.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size }));
        dc.bufferedAmountLowThreshold = 262144; // 256KB

        const chunkSize = 65536; // 64KB chunks
        let offset = 0;
        const reader = new FileReader();

        const sendNextChunk = () => {
          if (dc.readyState !== 'open') return;

          if (dc.bufferedAmount > 1048576) {
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              sendNextChunk();
            };
            return;
          }

          const slice = file.slice(offset, offset + chunkSize);
          reader.readAsArrayBuffer(slice);
        };

        reader.onload = (event) => {
          if (!event.target || !event.target.result) return;
          const buffer = event.target.result as ArrayBuffer;
          dc.send(buffer);
          offset += buffer.byteLength;

          const progress = Math.min(100, Math.round((offset / file.size) * 100));
          onProgress(progress, 'sending');

          if (offset < file.size) {
            sendNextChunk();
          } else {
            setTimeout(() => {
              dc.send(JSON.stringify({ type: 'eof' }));
              console.log('[WebRTC] Sent EOF. File transfer completed successfully.');
              onProgress(100, 'completed');
              resolve(true);
              
              setTimeout(() => {
                dc.close();
                pc.close();
              }, 1000);
            }, 200);
          }
        };

        reader.onerror = (err) => {
          reject(err);
        };

        sendNextChunk();
      };

      dc.onerror = (err) => {
        console.error('[WebRTC] Data channel error:', err);
        reject(err);
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const offerRef = ref(this.db, `signaling/${roomId}/${myId}/offer`);
        await set(offerRef, { type: offer.type, sdp: offer.sdp });

        const answerRef = ref(this.db, `signaling/${roomId}/${myId}/answer`);
        onValue(answerRef, async (snapshot) => {
          const answerVal = snapshot.val();
          if (answerVal && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(answerVal));
            console.log('[WebRTC] Received remote answer description.');
          }
        });

        const answerCandidatesRef = ref(this.db, `signaling/${roomId}/${myId}/answerCandidates`);
        onChildAdded(answerCandidatesRef, (cSnap) => {
          const candidateData = cSnap.val();
          pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => {
            console.error('[WebRTC] Failed to add remote answer candidate:', e);
          });
        });

      } catch (err) {
        console.error('[WebRTC] Failed to initialize connection sender:', err);
        pc.close();
        reject(err);
      }
    });
  }

  // 5) Room CRUD Operations
  public async createCollectionRoom(title: string, folderPath: string, targetTeacherIds: string[], creatorName: string = '나') {
    if (!this.db) {
      alert('데이터베이스 연결이 비활성화되어 있습니다.');
      return null;
    }

    const roomId = 'room_' + Date.now();
    const roomRef = ref(this.db, `rooms/${roomId}`);

    const newRoom: CollectionRoom = {
      id: roomId,
      title,
      folderPath,
      targetTeacherIds: targetTeacherIds || [],
      submittedTeacherIds: [],
      creatorName,
      creatorId: this.myProfile ? this.myProfile.id : 'unknown',
      createdAt: Date.now()
    };

    await set(roomRef, newRoom);
    return newRoom;
  }

  public async deleteCollectionRoom(roomId: string) {
    if (!this.db) return;
    const roomRef = ref(this.db, `rooms/${roomId}`);
    await remove(roomRef);

    const signalingRef = ref(this.db, `signaling/${roomId}`);
    await remove(signalingRef);
  }

  // 6) Local Groups Storage (Preserved in browser per school/user)
  public loadGroups() {
    const saved = localStorage.getItem('sb_custom_groups');
    if (saved) {
      this.groups = JSON.parse(saved);
    } else {
      this.groups = [];
      localStorage.setItem('sb_custom_groups', JSON.stringify(this.groups));
    }
  }

  public addGroup(name: string, memberIds: string[]): CustomGroup {
    const newGroup: CustomGroup = {
      id: 'group_' + Date.now(),
      name,
      memberIds
    };
    this.groups.push(newGroup);
    localStorage.setItem('sb_custom_groups', JSON.stringify(this.groups));
    return newGroup;
  }

  public deleteGroup(groupId: string) {
    this.groups = this.groups.filter(g => g.id !== groupId);
    localStorage.setItem('sb_custom_groups', JSON.stringify(this.groups));
  }

  public async deleteTeacher(teacherId: string) {
    if (!this.db) return;
    const teacherRef = ref(this.db, `teachers/${teacherId}`);
    await remove(teacherRef);
  }
}

export const collatorService = new CollatorService();
