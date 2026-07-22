import React from 'react';
import { TeacherProfile } from '../utils/collatorService';
import { Check } from 'lucide-react';

interface CollatorTeacherGridProps {
  teachers: TeacherProfile[];
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  isSelectable?: boolean;
}

export function CollatorTeacherGrid({ 
  teachers, 
  selectedIds = [], 
  onSelectionChange, 
  isSelectable = true 
}: CollatorTeacherGridProps) {
  
  const handleCardClick = (teacherId: string) => {
    if (!isSelectable || !onSelectionChange) return;
    
    if (selectedIds.includes(teacherId)) {
      onSelectionChange(selectedIds.filter(id => id !== teacherId));
    } else {
      onSelectionChange([...selectedIds, teacherId]);
    }
  };

  const selectPreset = (preset: 'all' | 'grade4' | 'special' | 'none') => {
    if (!onSelectionChange) return;
    if (preset === 'all') {
      onSelectionChange(teachers.map(t => t.id));
    } else if (preset === 'grade4') {
      const ids = teachers
        .filter(t => t.role.includes('4-') || t.grade === 4)
        .map(t => t.id);
      onSelectionChange(ids);
    } else if (preset === 'special') {
      const ids = teachers.filter(t => t.isSpecial).map(t => t.id);
      onSelectionChange(ids);
    } else {
      onSelectionChange([]);
    }
  };

  if (teachers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-[#f2f4f6] rounded-2xl border border-dashed border-[#e5e8eb] text-center text-[#8b95a1]">
        <p className="text-[13px]">현재 접속 중인 선생님이 없습니다.</p>
        <p className="text-[11.5px] mt-0.5">다른 사용자가 로그인하면 실시간으로 감지됩니다.</p>
      </div>
    );
  }

  // Sort online teachers first
  const sortedTeachers = [...teachers].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));

  return (
    <div className="space-y-3">
      {/* Preset Chips (Only when selectable mode) */}
      {isSelectable && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => selectPreset('all')}
            className="px-3 py-1 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] font-semibold rounded-lg text-[12px] transition-colors"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={() => selectPreset('grade4')}
            className="px-3 py-1 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] font-semibold rounded-lg text-[12px] transition-colors"
          >
            4학년 담임
          </button>
          <button
            type="button"
            onClick={() => selectPreset('special')}
            className="px-3 py-1 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] font-semibold rounded-lg text-[12px] transition-colors"
          >
            교과 전담
          </button>
          <button
            type="button"
            onClick={() => selectPreset('none')}
            className="px-3 py-1 bg-[#f2f4f6] hover:bg-[#e5e8eb] active:bg-[#d1d6db] text-[#4e5968] font-semibold rounded-lg text-[12px] transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Compact Grid List */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[260px] overflow-y-auto pr-1">
        {sortedTeachers.map(teacher => {
          const isSelected = isSelectable && selectedIds.includes(teacher.id);
          return (
            <div
              key={teacher.id}
              onClick={() => handleCardClick(teacher.id)}
              className={`px-3 py-2.5 rounded-xl border select-none transition-all flex items-center justify-between gap-2 ${
                isSelectable ? 'cursor-pointer' : 'cursor-default'
              } ${
                isSelected
                  ? 'bg-[#e8f7f2] border-[#10b981] shadow-xs'
                  : teacher.online 
                    ? 'bg-white border-[#e5e8eb] hover:border-[#10b981]/50' 
                    : 'bg-[#f8faf9] border-[#f2f4f6] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Presence indicator dot */}
                <span 
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    teacher.online ? 'bg-[#10b981] ring-2 ring-[#e8f7f2]' : 'bg-[#b0b8c1]'
                  }`}
                  title={teacher.online ? '접속 중' : '미접속'}
                />

                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[#191f28] truncate leading-tight">
                    {teacher.name}
                  </div>
                  <div className="text-[11px] text-[#8b95a1] truncate">
                    {teacher.role}
                  </div>
                </div>
              </div>

              {/* Selection Checkmark */}
              {isSelectable && isSelected && (
                <div className="w-4.5 h-4.5 bg-[#10b981] text-white rounded-full flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
