import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  isMine?: boolean;
  isFromMe?: boolean;
  initialDuration?: number;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Cache global em memória para durações já calculadas (chave = src)
const durationCache = new Map<string, number>();

// Singleton seguro de AudioContext para decodificação
let sharedAudioContext: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        sharedAudioContext = new AudioCtx();
      }
    }
    return sharedAudioContext;
  } catch (_e) {
    return null;
  }
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  isMine = false,
  isFromMe,
  initialDuration = 0,
}) => {
  const isSent = Boolean(isFromMe ?? isMine);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => {
    if (initialDuration > 0) return initialDuration;
    if (src && durationCache.has(src)) return durationCache.get(src)!;
    return 0;
  });
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let isSubscribed = true;
    setHasError(false);
    setErrorMessage(null);

    // Se já tiver no cache, aplicar imediatamente
    if (durationCache.has(src)) {
      setDuration(durationCache.get(src)!);
    } else if (initialDuration > 0) {
      setDuration(initialDuration);
    }

    const fetchAudioDuration = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        const ctx = getSharedAudioContext();
        if (!ctx) return;

        // decodeAudioData lê os cabeçalhos de todos os containers (OGG Opus, MP3, AAC, WebM)
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (audioBuffer && audioBuffer.duration && isFinite(audioBuffer.duration)) {
          durationCache.set(url, audioBuffer.duration);
          if (isSubscribed) {
            setDuration(audioBuffer.duration);
          }
        }
      } catch (_err) {
        // Silencioso em caso de erro de decode
      }
    };

    const checkAndSetDuration = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        if (isSubscribed) {
          setDuration(audio.duration);
          durationCache.set(src, audio.duration);
        }
      } else if (!durationCache.has(src)) {
        fetchAudioDuration(src);
      }
    };

    const setAudioTime = () => {
      if (isSubscribed) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      if (isSubscribed) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
      if (audio) {
        audio.currentTime = 0;
      }
    };

    const handleError = () => {
      const mediaError = audio.error;
      let msg = 'Erro ao carregar o áudio';
      if (mediaError) {
        switch (mediaError.code) {
          case 1: // MEDIA_ERR_ABORTED
            msg = 'Carregamento do áudio cancelado';
            break;
          case 2: // MEDIA_ERR_NETWORK
            msg = 'Falha de rede ao transferir áudio';
            break;
          case 3: // MEDIA_ERR_DECODE
            msg = 'Erro ao decodificar arquivo de áudio';
            break;
          case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
            msg = 'Origem ou formato não suportado/bloqueado por CSP';
            break;
          default:
            msg = mediaError.message || msg;
        }
      }
      console.warn(`[AudioPlayer] Falha no elemento de áudio (${src}): ${msg}`);
      if (isSubscribed) {
        setHasError(true);
        setErrorMessage(msg);
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', checkAndSetDuration);
    audio.addEventListener('durationchange', checkAndSetDuration);
    audio.addEventListener('canplay', checkAndSetDuration);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Carregar elemento
    audio.load();

    if (audio.readyState >= 1) {
      checkAndSetDuration();
    } else {
      fetchAudioDuration(src);
    }

    return () => {
      isSubscribed = false;
      audio.removeEventListener('loadedmetadata', checkAndSetDuration);
      audio.removeEventListener('durationchange', checkAndSetDuration);
      audio.removeEventListener('canplay', checkAndSetDuration);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [src, initialDuration]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Despertar AudioContext se estiver suspenso
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setHasError(false);
      setErrorMessage(null);

      if (audio.error) {
        audio.load();
      }

      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[AudioPlayer] Falha na reprodução de áudio:', err);
          setIsPlaying(false);
          setHasError(true);
          setErrorMessage(err?.message || 'Falha na reprodução');
        });
    }
  };

  const handleSpeedChange = () => {
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Number(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className={`flex items-center gap-2.5 p-2 rounded-2xl w-full max-w-[280px] sm:max-w-[320px] transition-colors border shadow-sm select-none ${
        isSent
          ? 'bg-emerald-800/85 border-emerald-500/70 text-white'
          : 'bg-slate-100 border-slate-300/80 text-slate-800'
      }`}
    >
      <audio ref={audioRef} src={src} preload="auto" />

      {/* Botão Play / Pause com Alto Contraste */}
      <button
        type="button"
        onClick={togglePlayPause}
        className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-full transition-all cursor-pointer shadow-md focus:outline-hidden ${
          isSent
            ? 'bg-white text-emerald-800 hover:bg-emerald-50 hover:scale-105 active:scale-95'
            : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105 active:scale-95'
        }`}
        title={hasError ? (errorMessage || 'Erro ao reproduzir áudio - clique para tentar novamente') : (isPlaying ? 'Pausar' : 'Reproduzir')}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Trilha de Progresso de Alto Contraste e Tempo */}
      <div className="flex-1 min-w-[90px] flex flex-col justify-center gap-1.5">
        <div
          className={`relative h-2 w-full rounded-full overflow-hidden flex items-center group cursor-pointer transition-colors ${
            isSent
              ? 'bg-emerald-950/70 ring-1 ring-white/30'
              : 'bg-slate-300 ring-1 ring-slate-400/30'
          }`}
        >
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step="0.05"
            value={currentTime}
            onChange={handleProgressChange}
            className="absolute z-20 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-75 ease-linear ${
              isSent ? 'bg-white shadow-xs' : 'bg-emerald-600 shadow-xs'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div
          className={`flex items-center justify-between text-[11px] font-mono leading-none ${
            isSent ? 'text-emerald-100 font-medium' : 'text-slate-600 font-medium'
          }`}
        >
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '0:00'}</span>
        </div>
      </div>

      {/* Botão de Velocidade (1x / 1.5x / 2x) */}
      <button
        type="button"
        onClick={handleSpeedChange}
        className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider transition-colors cursor-pointer shrink-0 ${
          isSent
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
        }`}
        title="Alternar velocidade de reprodução"
      >
        {playbackRate}x
      </button>

      {/* Mute */}
      <button
        type="button"
        onClick={toggleMute}
        className={`p-1 shrink-0 rounded-lg transition-colors cursor-pointer ${
          isSent
            ? 'text-emerald-200 hover:text-white hover:bg-white/10'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'
        }`}
        title={isMuted ? 'Ativar som' : 'Silenciar'}
      >
        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
