import { AudioPresetId, ScheduleItem } from '../types/schedule';

let audioCtx: AudioContext | null = null;
let currentHtmlAudio: HTMLAudioElement | null = null;
let emergencyInterval: number | null = null;
let activeNodes: AudioNode[] = [];

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export async function unlockAudioContext(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Play a silent 1-sample buffer to unlock iOS/Safari/Chrome autoplay
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return audioCtx !== null && audioCtx.state === 'running';
}

export function stopAllAudio(): void {
  if (emergencyInterval !== null) {
    window.clearInterval(emergencyInterval);
    emergencyInterval = null;
  }
  if (currentHtmlAudio) {
    currentHtmlAudio.pause();
    currentHtmlAudio.currentTime = 0;
    currentHtmlAudio = null;
  }
  activeNodes.forEach((node) => {
    try {
      if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {
      // Ignore already stopped nodes
    }
  });
  activeNodes = [];
}

function playToneSequence(
  notes: Array<{ freq: number; duration: number; delay: number; type?: OscillatorType }>,
  onEnded?: () => void
): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  let maxEnd = 0;
  notes.forEach(({ freq, duration, delay, type = 'triangle' }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.02);
    activeNodes.push(osc, gain);

    if (delay + duration > maxEnd) {
      maxEnd = delay + duration;
    }
  });

  if (onEnded) {
    window.setTimeout(onEnded, (maxEnd + 0.1) * 1000);
  }
}

export function playPresetSound(preset: AudioPresetId, onEnded?: () => void): void {
  stopAllAudio();
  switch (preset) {
    case 'reveille':
      // Classic military bugle reveille pattern
      playToneSequence(
        [
          { freq: 523.25, duration: 0.18, delay: 0.0, type: 'sawtooth' },
          { freq: 659.25, duration: 0.18, delay: 0.2, type: 'sawtooth' },
          { freq: 783.99, duration: 0.18, delay: 0.4, type: 'sawtooth' },
          { freq: 1046.5, duration: 0.45, delay: 0.6, type: 'sawtooth' },
          { freq: 783.99, duration: 0.2, delay: 1.1, type: 'sawtooth' },
          { freq: 1046.5, duration: 0.6, delay: 1.35, type: 'sawtooth' },
        ],
        onEnded
      );
      break;
    case 'exercise':
      // Upbeat marching cadence
      playToneSequence(
        [
          { freq: 587.33, duration: 0.15, delay: 0.0, type: 'square' },
          { freq: 587.33, duration: 0.15, delay: 0.2, type: 'square' },
          { freq: 783.99, duration: 0.3, delay: 0.4, type: 'square' },
          { freq: 659.25, duration: 0.15, delay: 0.75, type: 'square' },
          { freq: 783.99, duration: 0.45, delay: 0.95, type: 'square' },
        ],
        onEnded
      );
      break;
    case 'bell_class':
      // Crisp 3-chime school/unit bell
      playToneSequence(
        [
          { freq: 880, duration: 0.45, delay: 0.0, type: 'sine' },
          { freq: 880, duration: 0.45, delay: 0.55, type: 'sine' },
          { freq: 1174.66, duration: 0.75, delay: 1.1, type: 'sine' },
        ],
        onEnded
      );
      break;
    case 'bell_meal':
      // Warm metallic mess bell
      playToneSequence(
        [
          { freq: 659.25, duration: 0.4, delay: 0.0, type: 'triangle' },
          { freq: 783.99, duration: 0.4, delay: 0.45, type: 'triangle' },
          { freq: 987.77, duration: 0.7, delay: 0.9, type: 'triangle' },
        ],
        onEnded
      );
      break;
    case 'whistle_check':
      // Sharp command whistle
      playToneSequence(
        [
          { freq: 2400, duration: 0.25, delay: 0.0, type: 'sine' },
          { freq: 2600, duration: 0.45, delay: 0.35, type: 'sine' },
        ],
        onEnded
      );
      break;
    case 'taps':
      // Calm evening lights-out chime
      playToneSequence(
        [
          { freq: 392.0, duration: 0.5, delay: 0.0, type: 'sine' },
          { freq: 392.0, duration: 0.5, delay: 0.6, type: 'sine' },
          { freq: 523.25, duration: 1.1, delay: 1.2, type: 'sine' },
        ],
        onEnded
      );
      break;
  }
}

export function playScheduleAudio(item: ScheduleItem, onEnded?: () => void): void {
  stopAllAudio();
  if (item.audioType === 'preset') {
    playPresetSound(item.audioPreset || 'bell_class', onEnded);
    return;
  }

  if ((item.audioType === 'url' || item.audioType === 'file') && item.audioUrl) {
    const audio = new Audio(item.audioUrl);
    currentHtmlAudio = audio;
    audio.onended = () => {
      currentHtmlAudio = null;
      if (onEnded) onEnded();
    };
    audio.onerror = () => {
      currentHtmlAudio = null;
      // Fallback to preset bell if external URL fails
      playPresetSound('bell_class', onEnded);
    };
    audio.play().catch(() => {
      playPresetSound('bell_class', onEnded);
    });
    return;
  }

  playPresetSound('bell_class', onEnded);
}

export function startEmergencyAlarm(): void {
  stopAllAudio();
  const triggerSirenCycle = () => {
    playToneSequence([
      { freq: 880, duration: 0.35, delay: 0.0, type: 'sawtooth' },
      { freq: 622.25, duration: 0.35, delay: 0.38, type: 'sawtooth' },
    ]);
  };
  triggerSirenCycle();
  emergencyInterval = window.setInterval(triggerSirenCycle, 800);
}
