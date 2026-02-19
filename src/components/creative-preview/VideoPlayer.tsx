'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  poster?: string;
}

export function VideoPlayer({ src, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || hasError) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => setHasError(true));
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, hasError]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      video.currentTime = fraction * duration;
    },
    [duration]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onError = () => setHasError(true);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  // Placeholder state when video doesn't load
  if (hasError || !src) {
    return (
      <div className="relative flex aspect-video w-full items-center justify-center rounded-lg bg-gray-800">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <Play className="h-8 w-8 text-white ml-1" />
          </div>
          <span className="text-sm font-medium text-gray-300">Video Preview</span>
        </div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="group relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => !isPlaying && setShowControls(true)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        playsInline
        className="h-full w-full object-contain"
      />

      {/* Play/Pause overlay */}
      <button
        onClick={togglePlay}
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity',
          isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-transform hover:scale-110">
          {isPlaying ? (
            <Pause className="h-8 w-8 text-white" />
          ) : (
            <Play className="h-8 w-8 text-white ml-1" />
          )}
        </div>
      </button>

      {/* Bottom controls */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 transition-opacity',
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        {/* Progress bar */}
        <div
          className="mb-2 h-1 w-full cursor-pointer rounded-full bg-white/30"
          onClick={handleProgressClick}
        >
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="text-white transition-colors hover:text-gray-300"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="text-white transition-colors hover:text-gray-300"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          </div>
          <span className="text-xs text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
