import React, { Component } from "react";

import Main from "./main";
import './App.css';

const randomFractalParams = (): number[] =>
  Array.from({ length: 6 }, () => Math.random() * 3 - 1.5);

const INITIAL_FRACTAL_PARAMS = randomFractalParams();

class EscapeFractal extends Component {
  state = {
    params: [...INITIAL_FRACTAL_PARAMS],
    color_scheme: 0,
    isPlaying: false,
    isMuted: false,
  };

  instance: Main;
  audioElement: HTMLAudioElement | null = null;
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  dataArray: Uint8Array | null = null;
  targetParams: number[] = [...INITIAL_FRACTAL_PARAMS];
  animationFrameId: number | null = null;
  prevBass = 0;
  beatEnvelope = 0;

  // ============ LIFECYCLE ============
  
  componentDidMount() {
    this.targetParams = [...this.state.params];
    this.instance = new Main(this.state);

    // Initialize audio
    this.initAudio();
    this.startAudioAnimation();
  }

  componentWillUnmount() {
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

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext = audioContext;
      
      const source = audioContext.createMediaElementSource(this.audioElement);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      
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
        const newTargetParams: number[] = [];

        for (let i = 0; i < 6; i++) {
          let sum = 0;
          for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
            sum += this.dataArray[j];
          }
          const avg = sum / bandSize / 255;
          const wobble = (energy + bass * 0.5) * 0.35;
          newTargetParams.push(avg * (3.6 + wobble) - (1.8 + wobble * 0.25));
        }

        this.targetParams = newTargetParams;
      } else {
        this.targetParams = [...this.state.params];
        this.beatEnvelope *= 0.9;
        this.prevBass *= 0.92;
      }

      const smoothingFactor = this.state.isPlaying ? 0.26 : 0.05;
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
    if (!this.audioElement) return;
    
    const newMutedState = !this.state.isMuted;
    this.audioElement.muted = newMutedState;
    this.setState({isMuted: newMutedState});
  }

  render() {
    const { isPlaying, isMuted } = this.state;

    return (
      <>
        <div
          className="canvas-wrapper"
          id="canvas"
          style={{
            filter: 'brightness(0.6) contrast(1.8) drop-shadow(3px 3px 6px rgba(0,0,0,0.7)) sepia(0.2)',
          }}
        />
        
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '2rem',
          display: 'flex',
          gap: '1rem',
          zIndex: 100,
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
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 15px rgba(67, 62, 82, 0.8)';
              e.currentTarget.style.backgroundColor = '#5a525e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 rgba(67, 62, 82, 0)';
              e.currentTarget.style.backgroundColor = '#433E52';
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
