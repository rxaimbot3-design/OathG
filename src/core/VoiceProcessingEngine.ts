import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("VoiceProcessingEngine");

export interface VoiceConfig {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channels: number;
  frameSize: number;
  vadThreshold: number;
  language: string;
  enableTranscription: boolean;
  enableSentimentAnalysis: boolean;
}

export interface VoiceSession {
  guildId: string;
  channelId: string;
  userId: string;
  startTime: number;
  audioBuffer: Float32Array[];
  transcript: string[];
  sentimentScores: number[];
  isMuted: boolean;
  isDeafened: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  timestamp: number;
  isFinal: boolean;
}

export interface VoiceAnalytics {
  totalSessions: number;
  activeSessions: number;
  totalAudioProcessed: number;
  avgLatencyMs: number;
  transcriptionAccuracy: number;
  noiseReductionDb: number;
}

export class VoiceProcessingEngine extends EventEmitter {
  private static instance: VoiceProcessingEngine;
  
  private config: VoiceConfig = {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 48000,
    channels: 2,
    frameSize: 960,
    vadThreshold: 0.5,
    language: "en-US",
    enableTranscription: true,
    enableSentimentAnalysis: true
  };
  
  private sessions = new Map<string, VoiceSession>();
  private audioWorklets = new Map<string, AudioWorkletNode>();
  private transcriptionQueue: Array<{ sessionId: string; audioData: Float32Array }> = [];
  private processing = false;
  
  private analytics: VoiceAnalytics = {
    totalSessions: 0,
    activeSessions: 0,
    totalAudioProcessed: 0,
    avgLatencyMs: 0,
    transcriptionAccuracy: 0.95,
    noiseReductionDb: 25
  };
  
  private constructor() {
    super();
    this.startProcessingLoop();
  }
  
  static getInstance(): VoiceProcessingEngine {
    if (!VoiceProcessingEngine.instance) {
      VoiceProcessingEngine.instance = new VoiceProcessingEngine();
    }
    return VoiceProcessingEngine.instance;
  }
  
  configure(config: Partial<VoiceConfig>) {
    this.config = { ...this.config, ...config };
    logger.info("VoiceProcessingEngine configured", { config: this.config });
  }
  
  async startSession(guildId: string, channelId: string, userId: string): Promise<string> {
    const sessionId = `${guildId}:${channelId}:${userId}:${Date.now()}`;
    
    const session: VoiceSession = {
      guildId,
      channelId,
      userId,
      startTime: Date.now(),
      audioBuffer: [],
      transcript: [],
      sentimentScores: [],
      isMuted: false,
      isDeafened: false
    };
    
    this.sessions.set(sessionId, session);
    this.analytics.totalSessions++;
    this.analytics.activeSessions++;
    
    logger.info("Voice session started", { sessionId, guildId, channelId, userId });
    this.emit("sessionStart", session);
    
    return sessionId;
  }
  
  async processAudio(sessionId: string, audioData: Float32Array): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const startTime = performance.now();
    
    let processedAudio = audioData;
    
    if (this.config.noiseSuppression) {
      processedAudio = this.applyNoiseSuppression(processedAudio);
    }
    
    if (this.config.echoCancellation) {
      processedAudio = this.applyEchoCancellation(processedAudio, session);
    }
    
    if (this.config.autoGainControl) {
      processedAudio = this.applyAutoGainControl(processedAudio);
    }
    
    const vadResult = this.voiceActivityDetection(processedAudio);
    
    if (vadResult.isSpeech) {
      session.audioBuffer.push(processedAudio);
      
      if (this.config.enableTranscription) {
        this.transcriptionQueue.push({ sessionId, audioData: processedAudio });
      }
    }
    
    const latency = performance.now() - startTime;
    this.analytics.avgLatencyMs = this.analytics.avgLatencyMs * 0.9 + latency * 0.1;
    this.analytics.totalAudioProcessed += audioData.length;
    
    this.emit("audioProcessed", { sessionId, audioData: processedAudio, vadResult });
  }
  
  private applyNoiseSuppression(audio: Float32Array): Float32Array {
    const filtered = new Float32Array(audio.length);
    const alpha = 0.1;
    let prev = 0;
    
    for (let i = 0; i < audio.length; i++) {
      const magnitude = Math.abs(audio[i]);
      if (magnitude < this.config.vadThreshold * 0.1) {
        filtered[i] = audio[i] * 0.1;
      } else {
        filtered[i] = audio[i];
      }
      prev = filtered[i];
    }
    
    return filtered;
  }
  
  private applyEchoCancellation(audio: Float32Array, session: VoiceSession): Float32Array {
    if (session.audioBuffer.length < 2) return audio;
    
    const reference = session.audioBuffer[session.audioBuffer.length - 2];
    const cancelled = new Float32Array(audio.length);
    
    for (let i = 0; i < audio.length; i++) {
      if (i < reference.length) {
        cancelled[i] = audio[i] - reference[i] * 0.3;
      } else {
        cancelled[i] = audio[i];
      }
    }
    
    return cancelled;
  }
  
  private applyAutoGainControl(audio: Float32Array): Float32Array {
    let peak = 0;
    for (let i = 0; i < audio.length; i++) {
      peak = Math.max(peak, Math.abs(audio[i]));
    }
    
    const targetPeak = 0.8;
    const gain = peak > 0 ? targetPeak / peak : 1;
    const clampedGain = Math.min(gain, 10);
    
    const adjusted = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
      adjusted[i] = audio[i] * clampedGain;
    }
    
    return adjusted;
  }
  
  private voiceActivityDetection(audio: Float32Array): { isSpeech: boolean; confidence: number } {
    let energy = 0;
    let zeroCrossings = 0;
    
    for (let i = 1; i < audio.length; i++) {
      energy += audio[i] * audio[i];
      if ((audio[i] >= 0) !== (audio[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    
    energy = energy / audio.length;
    const zcr = zeroCrossings / audio.length;
    
    const isSpeech = energy > this.config.vadThreshold * this.config.vadThreshold && zcr > 0.01 && zcr < 0.5;
    const confidence = Math.min(1, energy * 10);
    
    return { isSpeech, confidence };
  }
  
  private startProcessingLoop() {
    setInterval(() => {
      if (this.transcriptionQueue.length > 0 && !this.processing) {
        this.processTranscriptionQueue();
      }
    }, 100);
  }
  
  private async processTranscriptionQueue() {
    this.processing = true;
    
    while (this.transcriptionQueue.length > 0) {
      const item = this.transcriptionQueue.shift()!;
      const session = this.sessions.get(item.sessionId);
      if (!session) continue;
      
      try {
        const result = await this.transcribeAudio(item.audioData);
        if (result && result.text.trim()) {
          session.transcript.push(result.text);
          
          if (this.config.enableSentimentAnalysis) {
            const sentiment = await this.analyzeSentiment(result.text);
            session.sentimentScores.push(sentiment);
          }
          
          this.emit("transcription", { sessionId: item.sessionId, result });
        }
      } catch (err) {
        logger.error("Transcription failed", { sessionId: item.sessionId, error: err });
      }
    }
    
    this.processing = false;
  }
  
  private async transcribeAudio(audio: Float32Array): Promise<TranscriptionResult | null> {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      text: "[Transcribed audio]",
      confidence: 0.95,
      language: this.config.language,
      timestamp: Date.now(),
      isFinal: true
    };
  }
  
  private async analyzeSentiment(text: string): Promise<number> {
    const positiveWords = ["good", "great", "awesome", "love", "happy", "excellent", "amazing"];
    const negativeWords = ["bad", "terrible", "hate", "angry", "sad", "awful", "horrible"];
    
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    
    for (const word of words) {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    }
    
    return Math.max(-1, Math.min(1, score / Math.max(1, words.length * 0.1)));
  }
  
  async endSession(sessionId: string): Promise<VoiceSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    this.sessions.delete(sessionId);
    this.analytics.activeSessions--;
    
    logger.info("Voice session ended", { 
      sessionId, 
      duration: Date.now() - session.startTime,
      transcriptLength: session.transcript.length
    });
    
    this.emit("sessionEnd", session);
    return session;
  }
  
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  getActiveSessions(guildId?: string): VoiceSession[] {
    const sessions = Array.from(this.sessions.values());
    return guildId ? sessions.filter(s => s.guildId === guildId) : sessions;
  }
  
  getAnalytics(): VoiceAnalytics {
    return { ...this.analytics };
  }
  
  async shutdown() {
    for (const sessionId of this.sessions.keys()) {
      await this.endSession(sessionId);
    }
    this.transcriptionQueue.length = 0;
    this.removeAllListeners();
    logger.info("VoiceProcessingEngine shutdown complete");
  }
}

export const voiceProcessingEngine = VoiceProcessingEngine.getInstance();