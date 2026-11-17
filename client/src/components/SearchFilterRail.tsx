import React from 'react';
import { useTranslation } from 'react-i18next';

export interface LanguageStat {
  iso: string;
  name: string;
  count: number;
}

export type DurationFilter = 'all' | 'under5' | '5to15' | 'over15';

interface SearchFilterRailProps {
  languageStats: LanguageStat[];
  selectedLanguages: string[]; // empty array means all
  onToggleLanguage: (iso: string) => void;
  onSelectAllLanguages: () => void;
  selectedDuration: DurationFilter;
  onChangeDuration: (duration: DurationFilter) => void;
  totalHits: number;
}

export function SearchFilterRail({
  languageStats,
  selectedLanguages,
  onToggleLanguage,
  onSelectAllLanguages,
  selectedDuration,
  onChangeDuration,
  totalHits,
}: SearchFilterRailProps) {
  const { t } = useTranslation();

  const isAllLanguagesSelected = selectedLanguages.length === 0;

  const sectionLabel = 'm-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]';
  const optionClass = (selected: boolean) =>
    `w-full h-8 px-2.5 rounded-[8px] flex items-center gap-1.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100] ${
      selected ? 'bg-[#2A2A2E] text-white' : 'bg-transparent text-[#D1D5DB] hover:bg-white/[0.04] hover:text-white'
    }`;

  const durations: { id: DurationFilter; label: string }[] = [
    { id: 'all', label: t('search.allLengths', 'All lengths') },
    { id: 'under5', label: `< 5 ${t('search.hours')}` },
    { id: '5to15', label: `5–15 ${t('search.hours')}` },
    { id: 'over15', label: `> 15 ${t('search.hours')}` },
  ];

  return (
    <aside
      aria-label={t('search.filters', 'Filters')}
      className="flex-[0_0_188px] max-h-full box-border pt-4 pb-4 pl-6 pr-3 flex flex-col gap-5 overflow-y-auto custom-scrollbar select-none"
    >
      {/* 1. Language Section */}
      <div>
        <h2 className={sectionLabel}>{t('search.filterByLanguage', 'Language')}</h2>
        <div className="flex flex-col gap-0.5">
          {languageStats.map((stat) => {
            const isSelected = selectedLanguages.includes(stat.iso.toLowerCase());
            return (
              <button
                key={stat.iso}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleLanguage(stat.iso)}
                className={optionClass(isSelected)}
              >
                <span className="truncate">{stat.name}</span>
                <span className="text-[#9CA3AF] flex-shrink-0">{stat.count}</span>
              </button>
            );
          })}
          {/* 'All' row: clears the language selection */}
          <button
            type="button"
            aria-pressed={isAllLanguagesSelected}
            onClick={onSelectAllLanguages}
            className={optionClass(isAllLanguagesSelected)}
          >
            <span className="truncate">{t('search.allLanguages', 'All')}</span>
            <span className="text-[#9CA3AF] flex-shrink-0">{totalHits}</span>
          </button>
        </div>
      </div>

      {/* 2. Length Section */}
      <div>
        <h2 className={sectionLabel}>{t('search.filterByLength', 'Length')}</h2>
        <div className="flex flex-col gap-0.5">
          {durations.map((dur) => {
            const isSelected = selectedDuration === dur.id;
            return (
              <button
                key={dur.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChangeDuration(dur.id)}
                className={optionClass(isSelected)}
              >
                <span className="truncate">{dur.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export default SearchFilterRail;
