import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Gerenciador de Sons e Notificações ─────────────────────────────────────────
export interface SoundConfig {
  enabled: boolean;
  volume: number; // 0 a 1
  soundType: 'bell' | 'chime' | 'digital' | 'pop';
}

export const SOUND_OPTIONS = [
  {
    id: 'bell',
    name: 'Sino Tradicional',
    url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  },
  {
    id: 'chime',
    name: 'Campainha Suave (Chime)',
    url: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3',
  },
  {
    id: 'digital',
    name: 'Alerta Digital (Bip)',
    url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  },
  {
    id: 'pop',
    name: 'Pop / Mensagem',
    url: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  },
];

export function getSoundConfig(): SoundConfig {
  try {
    const enabled = localStorage.getItem('pdv_sound_enabled') !== 'false';
    const volume = parseFloat(localStorage.getItem('pdv_sound_volume') || '0.8');
    const soundType = (localStorage.getItem('pdv_sound_type') as any) || 'bell';
    return {
      enabled,
      volume: isNaN(volume) ? 0.8 : Math.max(0, Math.min(1, volume)),
      soundType,
    };
  } catch {
    return { enabled: true, volume: 0.8, soundType: 'bell' };
  }
}

export function saveSoundConfig(config: Partial<SoundConfig>) {
  try {
    if (config.enabled !== undefined) {
      localStorage.setItem('pdv_sound_enabled', config.enabled.toString());
    }
    if (config.volume !== undefined) {
      localStorage.setItem('pdv_sound_volume', config.volume.toString());
    }
    if (config.soundType !== undefined) {
      localStorage.setItem('pdv_sound_type', config.soundType);
    }
  } catch (e) {
    console.error('Erro ao salvar configuração de som:', e);
  }
}

export async function playNotificationSound(customSoundType?: string, customVolume?: number): Promise<boolean> {
  const config = getSoundConfig();
  
  if (!config.enabled && customVolume === undefined) {
    return false; // Silenciado
  }

  const soundType = customSoundType || config.soundType;
  const volume = customVolume !== undefined ? customVolume : config.volume;
  const soundItem = SOUND_OPTIONS.find((s) => s.id === soundType) || SOUND_OPTIONS[0];

  try {
    const audio = new Audio(soundItem.url);
    audio.volume = Math.max(0, Math.min(1, volume));
    await audio.play();
    return true;
  } catch (err) {
    console.warn('Áudio não reproduzido (bloqueio do navegador ou sem interação):', err);
    return false;
  }
}
