import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { cueAt, formatClock, type SrtCue } from '@/shared/app-workspace-narration';

interface NarrationPlayerProps {
  src: string;
  cues: SrtCue[];
  /** Playback speed. A preview is recorded at 1.0 and sped up here; chapter audio already carries its pace. */
  rate?: number;
  autoPlay?: boolean;
}

/**
 * Plays one narration and follows it through its .srt: the cue being spoken is
 * highlighted, clicking a cue seeks to it. Times are shown as heard, so at a rate
 * other than 1.0 they are the media's own times divided by it.
 */
export function NarrationPlayer({ src, cues, rate = 1, autoPlay = false }: NarrationPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const activeRow = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const current = cueAt(cues, time);
  const heard = (seconds: number) => formatClock(seconds / rate);
  const pct = duration > 0 ? (time / duration) * 100 : 0;

  // The element forgets its rate when a new source loads, so it is set again on every load.
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, src]);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [current?.idx]);

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  const seek = (seconds: number) => {
    if (audio.current) audio.current.currentTime = seconds;
  };

  const seekOnBar = (event: MouseEvent<HTMLDivElement>) => {
    const bar = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - bar.left) / bar.width) * duration);
  };

  return (
    <>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        autoPlay={autoPlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          event.currentTarget.playbackRate = rate;
        }}
      />

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, padding: '0 20.4px 13.6px', borderBottom: '1px solid var(--color-divider)' }}>
        <button type="button" className="btn btn-primary btn-icon" style={{ width: 40, height: 40, flex: 'none' }} onClick={toggle} title={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon width={17} height={17} /> : <PlayIcon width={17} height={17} />}
        </button>
        <span className="text-muted" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{heard(time)}</span>
        <div className="progress-track" style={{ flex: 1, height: 5, position: 'relative', cursor: 'pointer' }} onClick={seekOnBar}>
          <div className="progress-fill" style={{ height: 5, width: `${pct}%` }} />
          <span style={{ position: 'absolute', left: `${pct}%`, top: -3.5, width: 12, height: 12, marginLeft: -6, background: 'var(--color-bg)', border: '1.5px solid var(--color-accent)' }} />
        </div>
        <span className="text-muted" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{heard(duration)}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20.4, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Transcript · follows the .srt timeline</div>
          {cues.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>This narration has no .srt beside it, so there is nothing to follow.</div>}
          {cues.map((cue) => {
            const active = cue.idx === current?.idx;
            return (
              <div
                key={cue.idx}
                ref={active ? activeRow : undefined}
                onClick={() => seek(cue.start)}
                style={{ display: 'flex', gap: 13.6, padding: '8px 10px', cursor: 'pointer', background: active ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : undefined }}
              >
                <span className="text-muted" style={{ fontSize: 11.5, flex: 'none', width: 46, fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}>{heard(cue.start)}</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.6, color: active ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text) 72%, transparent)' }}>{cue.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
