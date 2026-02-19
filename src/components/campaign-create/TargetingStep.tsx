'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import { WinnerChip } from './WinnerChip';

const SUGGESTED_INTERESTS = [
  'E-commerce',
  'Online Shopping',
  'Fashion',
  'Technology',
  'Fitness',
  'Travel',
  'Food & Dining',
  'Beauty',
  'Home Decor',
  'Sports',
  'Gaming',
  'Music',
];

export function TargetingStep() {
  const { targeting, setTargeting, winnerChips } = useCampaignCreateStore();
  const winner = winnerChips.audience;
  const [locationInput, setLocationInput] = useState('');
  const [interestInput, setInterestInput] = useState('');

  const handleLocationKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && locationInput.trim()) {
      e.preventDefault();
      if (!targeting.locations.includes(locationInput.trim())) {
        setTargeting({ locations: [...targeting.locations, locationInput.trim()] });
      }
      setLocationInput('');
    }
  };

  const removeLocation = (location: string) => {
    setTargeting({ locations: targeting.locations.filter((l) => l !== location) });
  };

  const handleInterestKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && interestInput.trim()) {
      e.preventDefault();
      if (!targeting.interests.includes(interestInput.trim())) {
        setTargeting({ interests: [...targeting.interests, interestInput.trim()] });
      }
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setTargeting({ interests: targeting.interests.filter((i) => i !== interest) });
  };

  const addSuggestedInterest = (interest: string) => {
    if (!targeting.interests.includes(interest)) {
      setTargeting({ interests: [...targeting.interests, interest] });
    }
  };

  const handleGenderSelect = (gender: string) => {
    if (gender === 'all') {
      setTargeting({ genders: ['all'] });
    } else {
      const current = targeting.genders.filter((g) => g !== 'all');
      if (current.includes(gender)) {
        const next = current.filter((g) => g !== gender);
        setTargeting({ genders: next.length === 0 ? ['all'] : next });
      } else {
        setTargeting({ genders: [...current, gender] });
      }
    }
  };

  // Calculate audience breadth (0-100) based on targeting
  const calculateAudienceSize = () => {
    let score = 50;

    // Age range contribution
    const ageRange = targeting.ageMax - targeting.ageMin;
    score += (ageRange / 47) * 20; // max range is 65-18=47

    // Gender contribution
    if (targeting.genders.includes('all')) {
      score += 10;
    }

    // Locations contribution
    score += Math.min(targeting.locations.length * 5, 15);

    // Interests narrow the audience
    score -= Math.min(targeting.interests.length * 3, 20);

    return Math.max(5, Math.min(100, score));
  };

  const audienceSize = calculateAudienceSize();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Define your audience</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose who you want to see your ads.
        </p>
        {winner && (
          <div className="mt-3">
            <WinnerChip title={winner.title} value={winner.value} />
          </div>
        )}
      </div>

      {/* Age Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Age Range</label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Min Age</label>
            <input
              type="number"
              min={13}
              max={targeting.ageMax}
              value={targeting.ageMin}
              onChange={(e) => setTargeting({ ageMin: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <span className="text-gray-400 mt-5">-</span>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Max Age</label>
            <input
              type="number"
              min={targeting.ageMin}
              max={65}
              value={targeting.ageMax}
              onChange={(e) => setTargeting({ ageMax: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Gender */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
        <div className="flex gap-2">
          {(['all', 'male', 'female'] as const).map((gender) => (
            <button
              key={gender}
              onClick={() => handleGenderSelect(gender)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg border transition-colors capitalize',
                targeting.genders.includes(gender)
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
              )}
            >
              {gender}
            </button>
          ))}
        </div>
      </div>

      {/* Locations */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Locations</label>
        <input
          type="text"
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          onKeyDown={handleLocationKeyDown}
          placeholder="Type a location and press Enter"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {targeting.locations.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {targeting.locations.map((location) => (
              <span
                key={location}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full"
              >
                {location}
                <button
                  onClick={() => removeLocation(location)}
                  className="text-blue-500 hover:text-blue-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Interests */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
        <input
          type="text"
          value={interestInput}
          onChange={(e) => setInterestInput(e.target.value)}
          onKeyDown={handleInterestKeyDown}
          placeholder="Type an interest and press Enter"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {targeting.interests.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {targeting.interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full"
              >
                {interest}
                <button
                  onClick={() => removeInterest(interest)}
                  className="text-blue-500 hover:text-blue-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">Suggested interests:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_INTERESTS.filter((i) => !targeting.interests.includes(i)).map(
              (interest) => (
                <button
                  key={interest}
                  onClick={() => addSuggestedInterest(interest)}
                  className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                >
                  + {interest}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Audience Size Estimator */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Estimated Audience Size</span>
          <span className="text-sm text-gray-500">
            {audienceSize < 30 ? 'Narrow' : audienceSize < 70 ? 'Moderate' : 'Broad'}
          </span>
        </div>
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              audienceSize < 30
                ? 'bg-orange-500'
                : audienceSize < 70
                  ? 'bg-blue-500'
                  : 'bg-green-500'
            )}
            style={{ width: `${audienceSize}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">Specific</span>
          <span className="text-xs text-gray-400">Broad</span>
        </div>
      </div>
    </div>
  );
}
