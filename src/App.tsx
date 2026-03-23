import React, { Component } from "react";

import Main from "./main";
import ArabicPoemBanner from "./ArabicPoemBanner";
import SeraphimOverlay from "./SeraphimOverlay";
import ScanlineInvertLayer from "./ScanlineInvertLayer";
import './App.css';

const randomFractalParams = (): number[] =>
  Array.from({ length: 6 }, () => Math.random() * 3 - 1.5);

const INITIAL_FRACTAL_PARAMS = randomFractalParams();

/** Per-coefficient procedural motion: unique rates so the shape keeps evolving. */
const driftPhase = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
const driftW1 = Array.from({ length: 6 }, () => 0.022 + Math.random() * 0.09);
const driftW2 = Array.from({ length: 6 }, () => 0.031 + Math.random() * 0.11);
const driftW3 = Array.from({ length: 6 }, () => 0.011 + Math.random() * 0.05);
const driftAmp = Array.from({ length: 6 }, () => 0.42 + Math.random() * 0.48);
/** Spreads spectrum-derived pushes so six bands don’t collapse to one value. */
const bandDetune = [1.22, 0.78, 1.08, 0.92, 1.15, 0.86] as const;

function computeProceduralParams(centers: number[], tMs: number): number[] {
  const tk = tMs * 0.001;
  return centers.map((c, i) => {
    const ph = driftPhase[i];
    const a = driftAmp[i];
    const o =
      Math.sin(tk * driftW1[i] + ph) * 0.5 +
      Math.cos(tk * driftW2[i] * 1.27 + ph * 2.03) * 0.32 +
      Math.sin(tk * driftW3[i] + i * 0.9) * 0.18;
    return c + a * o;
  });
}

function clampParam(x: number): number {
  return Math.max(-2.15, Math.min(2.15, x));
}

class EscapeFractal extends Component {
  state = {
    params: [...INITIAL_FRACTAL_PARAMS],
    color_scheme: 1,
    isPlaying: false,
    isMuted: false,
  };

  instance: Main;
  audioElement: HTMLAudioElement | null = null;
  audioContext: AudioContext | null = null;
  /** Output gain to destination — element.muted does not affect Web Audio graph. */
  masterGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  dataArray: Uint8Array | null = null;
  targetParams: number[] = [...INITIAL_FRACTAL_PARAMS];
  animationFrameId: number | null = null;
  prevBass = 0;
  beatEnvelope = 0;
  /** Slow attractor drift — shape wanders over minutes without running away. */
  proceduralCenters: number[] = [...INITIAL_FRACTAL_PARAMS];

  // ============ LIFECYCLE ============
  
  componentDidMount() {
    this.proceduralCenters = [...this.state.params];
    this.targetParams = [...this.state.params];
    this.instance = new Main(this.state);
    this.instance.updateColors(this.state.color_scheme);

    window.addEventListener('keydown', this.onKeyDown);

    // Initialize audio
    this.initAudio();
    this.startAudioAnimation();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  initAudio = () => {
    try {
      this.audioElement = new Audio();
      this.audioElement.src = require('./assets/yabujin.mp3');
      this.audioElement.crossOrigin = "anonymous";
      this.audioElement.volume = 1;
      this.audioElement.loop = true;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext = audioContext;
      
      const source = audioContext.createMediaElementSource(this.audioElement);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;

      const masterGain = audioContext.createGain();
      masterGain.gain.value = this.state.isMuted ? 0 : 1;
      this.masterGain = masterGain;

      source.connect(analyser);
      analyser.connect(masterGain);
      masterGain.connect(audioContext.destination);
      
      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      console.error("Audio initialization failed:", e);
    }
  }

  startAudioAnimation = () => {
    const animate = () => {
      let bass = 0;
      let energy = 0;
      let beatEnv = 0;
      const tMs = performance.now();

      for (let i = 0; i < 6; i++) {
        this.proceduralCenters[i] +=
          Math.sin(tMs * 0.00011 + driftPhase[i] * 3.1) * 0.00055 +
          Math.cos(tMs * 0.00007 + i * 1.4) * 0.00038;
        this.proceduralCenters[i] = Math.max(-1.35, Math.min(1.35, this.proceduralCenters[i]));
      }

      const procedural = computeProceduralParams(this.proceduralCenters, tMs);

      if (this.analyser && this.dataArray && this.state.isPlaying) {
        this.analyser.getByteFrequencyData(this.dataArray);

        const bassBins = 16;
        let bassSum = 0;
        for (let j = 0; j < bassBins; j++) {
          bassSum += this.dataArray[j];
        }
        bass = bassSum / (bassBins * 255);

        let total = 0;
        for (let j = 0; j < this.dataArray.length; j++) {
          total += this.dataArray[j];
        }
        energy = total / (this.dataArray.length * 255);

        const kick = bass > 0.14 && bass > this.prevBass * 1.2 ? 1 : 0;
        this.prevBass = this.prevBass * 0.85 + bass * 0.15;
        this.beatEnvelope = Math.min(1, this.beatEnvelope * 0.84 + kick * 0.62);
        beatEnv = this.beatEnvelope;

        const bandSize = Math.floor(this.dataArray.length / 6);
        const tk = tMs * 0.001;
        const newTargetParams: number[] = [];

        for (let i = 0; i < 6; i++) {
          let sum = 0;
          for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
            sum += this.dataArray[j];
          }
          const avg = sum / bandSize / 255;
          const centered = (avg - 0.36) * 2.5;
          const bandPulse =
            centered * bandDetune[i] * (0.62 + energy * 0.35) +
            Math.sin(tk * 0.85 + i * 1.33) * 0.11 * energy +
            Math.sin(tk * 2.1 + bass * 8 + i) * 0.07 * (0.4 + bass);
          newTargetParams.push(clampParam(procedural[i] + bandPulse));
        }

        this.targetParams = newTargetParams;
      } else {
        this.targetParams = procedural.map(clampParam);
        this.beatEnvelope *= 0.9;
        this.prevBass *= 0.92;
      }

      const smoothingFactor = this.state.isPlaying ? 0.22 : 0.06;
      const updatedParams = this.state.params.map((param, i) => {
        return param + (this.targetParams[i] - param) * smoothingFactor;
      });

      this.setState({ params: updatedParams });
      this.instance.update(updatedParams);
      this.instance.updateAudioReactive(bass, beatEnv, energy);
      this.instance.render();

      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  togglePlayPause = () => {
    if (!this.audioElement || !this.audioContext) return;

    if (this.state.isPlaying) {
      this.audioElement.pause();
      this.setState({isPlaying: false});
    } else {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.audioElement.play();
      this.setState({isPlaying: true});
    }
  }

  toggleMute = () => {
    if (!this.masterGain || !this.audioContext) return;

    const newMutedState = !this.state.isMuted;
    const g = this.masterGain.gain;
    const t = this.audioContext.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(newMutedState ? 0 : 1, t);
    this.setState({ isMuted: newMutedState });
  }

  onKeyDown = (e: KeyboardEvent) => {
    const keyNum = Number(e.key);
    if (!Number.isInteger(keyNum) || keyNum < 1 || keyNum > 8) return;

    if (this.state.color_scheme === keyNum) return;

    this.setState({ color_scheme: keyNum }, () => {
      if (this.instance) {
        this.instance.updateColors(keyNum);
        this.instance.render();
      }
    });
  }

  render() {
    const { isPlaying, isMuted } = this.state;

    return (
      <>
        <div
          className="canvas-wrapper"
          id="canvas"
          style={{
            filter: 'brightness(1.0) contrast(2.5) drop-shadow(3px 3px 6px rgba(0,0,0,0.7)) sepia(0.2)',
          }}
        />
        {/* <ArabicPoemBanner /> */}
        {/* <ScanlineInvertLayer /> */}
        {/* <SeraphimOverlay /> */}
        
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '2rem',
          display: 'flex',
          gap: '1rem',
          zIndex: 160,
        }}>
          {/* Play/Pause Button */}
          <button
            onClick={this.togglePlayPause}
            style={{
              backgroundColor: '#433E52',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.8rem 1.2rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: 'white',
              transition: 'all 0.3s ease',
              boxShadow: '0 0 0 rgba(67, 62, 82, 0)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 15px rgba(67, 62, 82, 0.8)';
              e.currentTarget.style.backgroundColor = '#5a525e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 rgba(67, 62, 82, 0)';
              e.currentTarget.style.backgroundColor = '#433E52';
            }}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>

          {/* Mute Button */}
          <button
            onClick={this.toggleMute}
            style={{
              backgroundColor: '#433E52',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.8rem 1.2rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: 'white',
              transition: 'all 0.3s ease',
              boxShadow: '0 0 0 rgba(67, 62, 82, 0)',
            }}
          >
            {isMuted ? 'UNMUTE' : 'MUTE'}
          </button>

        </div>
      </>
    );
  }
}

export default EscapeFractal;
