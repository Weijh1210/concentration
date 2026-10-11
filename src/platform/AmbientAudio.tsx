import { useEffect } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { selectActiveSession, useAppStore } from '../application/store';

export function AmbientAudio() {
  const player = useAudioPlayer(require('../../assets/audio/soft-noise.wav'));
  const enabled = useAppStore((state) => state.soundEnabled);
  const volume = useAppStore((state) => state.soundVolume);
  const sessions = useAppStore((state) => state.sessions);
  const active = selectActiveSession(sessions);
  const shouldPlay = enabled && !!active && (active.status === 'start_mode' || active.status === 'focusing') && active.activeSegmentStartedAt !== null;

  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }); }, []);
  useEffect(() => { player.loop = true; player.volume = volume; }, [player, volume]);
  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay]);
  return null;
}
