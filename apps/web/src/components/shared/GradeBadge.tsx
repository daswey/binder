import React from 'react';

const COMPANY_COLORS: Record<string, { bg: string; text: string }> = {
  PSA: { bg: '#E8131A', text: '#fff' },
  CGC: { bg: '#F5A623', text: '#3d1800' },
  BGS: { bg: '#1A56DB', text: '#fff' },
  ACE: { bg: '#0F6E56', text: '#fff' },
  SGC: { bg: '#444441', text: '#fff' },
  TAG: { bg: '#534AB7', text: '#fff' },
};

const GRADE_COLORS: Record<string, string> = {
  '10': '#FFD700',
  '10 GEM': '#FFD700',
  '10 PRISTINE': '#FFD700',
  '10 BLACK LABEL': '#FFD700',
  '9.5': '#C0C0C0',
  '9': '#C0C0C0',
};

export function GradeBadge({ company, grade, size = 'sm' }: {
  company: string;
  grade: string;
  size?: 'sm' | 'md';
}) {
  const colors = COMPANY_COLORS[company] ?? COMPANY_COLORS.PSA;
  const gradeColor = GRADE_COLORS[grade] ?? 'inherit';
  const padding = size === 'md' ? '3px 10px' : '2px 8px';
  const fontSize = size === 'md' ? 13 : 11;

  return (
    <span
      style={{
        background: colors.bg,
        color: colors.text,
        padding,
        borderRadius: 20,
        fontSize,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {company}
      <span style={{ color: gradeColor }}>{grade}</span>
    </span>
  );
}
