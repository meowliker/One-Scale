'use client';

import { useState, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduledCreative } from '@/types/creativeSchedule';

interface CreativeCalendarProps {
  creatives: ScheduledCreative[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CreativeCalendar({ creatives }: CreativeCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, ScheduledCreative[]>();
    for (const creative of creatives) {
      const dateKey = creative.launchDate;
      const existing = map.get(dateKey) ?? [];
      existing.push(creative);
      map.set(dateKey, existing);
    }
    return map;
  }, [creatives]);

  const selectedCreatives = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return scheduledByDate.get(key) ?? [];
  }, [selectedDate, scheduledByDate]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-sm font-semibold text-gray-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-gray-500 py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayCreatives = scheduledByDate.get(dateKey) ?? [];
            const hasEvents = dayCreatives.length > 0;
            const inMonth = isSameMonth(day, currentMonth);
            const selected = selectedDate && isSameDay(day, selectedDate);
            const today = isToday(day);

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-md py-2 text-sm transition-colors',
                  inMonth ? 'text-gray-900' : 'text-gray-300',
                  selected && 'bg-blue-100 text-blue-700 font-medium',
                  !selected && inMonth && 'hover:bg-gray-100',
                  today && !selected && 'font-bold'
                )}
              >
                <span>{format(day, 'd')}</span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayCreatives.slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1 w-1 rounded-full',
                          selected ? 'bg-blue-600' : 'bg-blue-400'
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date details */}
      {selectedDate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </h4>
          {selectedCreatives.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-4 w-4" />
              <span>No launches scheduled for this date</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {selectedCreatives.map((creative) => (
                <li
                  key={creative.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{creative.name}</p>
                    <p className="text-xs text-gray-500">{creative.targetCampaignName}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-600">
                    ${creative.dailyBudget}/day
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
