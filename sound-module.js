/* sound/sound-module.js - v1.3.1 L */

/**
 * Manages Web Audio API for synthesis, effects, analysis, and Arpeggiator.
 * Provides the core sound generation engine for the Maleficarum.
 * v1.3.1: Regenerated for consistency, includes prior enhancements (presets, params).
 */
export default class SoundModule {
    constructor(initialPresetName = 'vaporwave') {
        this.audioState = {
            isInitialized: false,
            isInitializing: false, // Prevent race conditions
            isPlaying: false, // Tracks if any note (sustained or arp) is active
            audioContext: null,
            masterGain: null,
            analyser: null,
            // Main Synth Nodes (managed by note/arp handlers)
            currentOscillator: null,
            currentFilter: null,
            currentGainNode: null, // Envelope control
            activeNote: null,      // The base note name being held/arp'd ('C4')
            currentNoteFrequency: null, // Frequency of the last note played (for visuals)
            // Effect Nodes (persistent)
            delayNode: null,
            delayFeedback: null,
            reverbNode: null,
            reverbGain: null,
            // Arpeggiator State
            arp: {
                active: false,
                intervalId: null,
                rate: 8,            // Steps per second
                pattern: [0, 4, 7], // Semitone offsets
                currentStep: 0,
                baseNote: null,     // Base note name for the current arp sequence
            },
            // Parameters (will be updated by external calls & presets)
            parameters: {
                // Structure initialized by preset
                oscillator: {},
                osc2: { type: 'sine', detune: 0, mix: 0 }, // Placeholder
                filter: {},
                envelope: {},
                lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' }, // Placeholder
                effects: {
                    delay: {},
                    reverb: {},
                    arpeggiator: {},
                    glitch: {} // Placeholder
                }
            },
            // Preset Data
            presets: this.getPresetsDefinition(),
            activePresetName: initialPresetName,
        };

        // Note Frequencies Map (C3-C5)
        this.noteFrequencies = this._generateNoteFrequencies(['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5']);
        this.semitoneRatio = Math.pow(2, 1/12);

        this.applyPresetAudio(initialPresetName); // Load initial parameters

        // Defer AudioContext initialization
        this.resolveInit = null;
        this.initPromise = new Promise(resolve => { this.resolveInit = resolve; });
        this._addInteractionListener();
    }

    // --- Note Frequency Generation ---
    _generateNoteFrequencies(notes) {
        const baseNote = 'A4'; const baseFreq = 440.0;
        const noteMap = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
        const baseOctave = parseInt(baseNote.slice(-1), 10);
        const baseSemitone = noteMap[baseNote.slice(0, -1)];
        const frequencies = {};
        notes.forEach(note => {
            const octave = parseInt(note.slice(-1), 10);
            const noteName = note.slice(0, -1);
            const semitone = noteMap[noteName];
            const semitoneDiff = (octave - baseOctave) * 12 + (semitone - baseSemitone);
            frequencies[note] = baseFreq * Math.pow(this.semitoneRatio, semitoneDiff);
        });
        return frequencies;
    }

    // --- Initialization ---
    _addInteractionListener() {
       if (typeof window !== 'undefined' && typeof document !== 'undefined') {
           const initAudio = async () => {
               if (this.audioState && !this.audioState.isInitialized && !this.audioState.isInitializing) {
                   await this._initializeAudio();
               }
               document.removeEventListener('click', initAudio, { capture: true, once: true });
               document.removeEventListener('keydown', initAudio, { capture: true, once: true });
               document.removeEventListener('touchstart', initAudio, { capture: true, once: true });
           };
           document.addEventListener('click', initAudio, { capture: true, once: true });
           document.addEventListener('keydown', initAudio, { capture: true, once: true });
           document.addEventListener('touchstart', initAudio, { capture: true, once: true });
       } else {
           console.warn("SoundModule: Not in a browser environment.");
           if (this.resolveInit) this.resolveInit(false);
       }
   }

   async _initializeAudio() {
        if (this.audioState?.isInitialized || this.audioState?.isInitializing) return this.initPromise;
        if (!this.audioState) { if(this.resolveInit) this.resolveInit(false); return Promise.resolve(false); }

        this.audioState.isInitializing = true;
        console.log("SoundModule: Attempting AudioContext initialization...");

       try {
           const AudioContext = window.AudioContext || window.webkitAudioContext;
           if (!AudioContext) throw new Error("Web Audio API not supported.");
           this.audioState.audioContext = new AudioContext();

           if (this.audioState.audioContext.state === 'suspended') {
                await this.audioState.audioContext.resume();
           }
           if (this.audioState.audioContext.state !== 'running') {
               throw new Error(`AudioContext failed to start. State: ${this.audioState.audioContext.state}`);
           }

           this.audioState.masterGain = this.audioState.audioContext.createGain();
           this.audioState.masterGain.gain.value = 0.7;
           this.audioState.masterGain.connect(this.audioState.audioContext.destination);

           this.audioState.analyser = this.audioState.audioContext.createAnalyser();
           this.audioState.analyser.fftSize = 512;
           this.audioState.analyser.smoothingTimeConstant = 0.8;
           this.audioState.masterGain.connect(this.audioState.analyser);

           this._createAudioEffects();

           this.audioState.isInitialized = true;
           console.log('Sound Module: Audio Initialized Successfully.');
           this._applyCurrentToggleStates();
           if(this.resolveInit) this.resolveInit(true);
           return true;

       } catch (error) {
           console.error('Sound Module: Error initializing audio:', error);
           if (this.audioState) this.audioState.isInitialized = false;
           if(this.resolveInit) this.resolveInit(false);
           return false;
       } finally {
           if (this.audioState) this.audioState.isInitializing = false;
       }
   }

    // --- Effects Setup ---
    _createAudioEffects() {
        const ac = this.audioState.audioContext;
        if (!ac || !this.audioState.parameters?.effects) return;
        const params = this.audioState.parameters.effects;
        const now = ac.currentTime; // Get current time once

        // Delay
        try {
            this.audioState.delayNode = ac.createDelay(2.0);
            this.audioState.delayFeedback = ac.createGain();
            this.audioState.delayNode.delayTime.setValueAtTime(params.delay?.time ?? 0.5, now);
            this.audioState.delayFeedback.gain.setValueAtTime(params.delay?.feedback ?? 0.4, now);
            this.audioState.delayNode.connect(this.audioState.delayFeedback).connect(this.audioState.delayNode);
            this.audioState.delayFeedback.connect(this.audioState.masterGain);
        } catch (e) { console.error("Error creating Delay nodes:", e); }

        // Reverb
        try {
            this.audioState.reverbNode = ac.createConvolver();
            this.audioState.reverbGain = ac.createGain();
            this._updateReverbImpulse();
            this.audioState.reverbGain.gain.setValueAtTime(params.reverb?.wet ?? 0.5, now);
            this.audioState.reverbNode.connect(this.audioState.reverbGain);
            this.audioState.reverbGain.connect(this.audioState.masterGain);
        } catch (e) { console.error("Error creating Reverb nodes:", e); }
    }

    _updateReverbImpulse() {
        if (!this.audioState?.isInitialized || !this.audioState.reverbNode || !this.audioState.audioContext || !this.audioState.parameters?.effects?.reverb) return;
        const ac = this.audioState.audioContext;
        const decay = this.audioState.parameters.effects.reverb.decay;
        const sampleRate = ac.sampleRate;
        const validDecay = Math.max(0.01, Math.min(10.0, decay || 2.0));
        const length = Math.max(sampleRate * 0.01, Math.min(sampleRate * 10, validDecay * sampleRate));
        try {
            const impulseLength = Math.ceil(length);
            const impulse = ac.createBuffer(2, impulseLength, sampleRate);
            const left = impulse.getChannelData(0); const right = impulse.getChannelData(1);
            for (let i = 0; i < impulseLength; i++) {
                const env = Math.exp(-i / (sampleRate * validDecay / 5));
                left[i] = (Math.random() * 2 - 1) * env; right[i] = (Math.random() * 2 - 1) * env;
            }
            this.audioState.reverbNode.buffer = impulse;
        } catch (e) {
           console.error("Error creating reverb impulse buffer:", e);
           try { this.audioState.reverbNode.buffer = ac.createBuffer(2, Math.max(1, sampleRate * 0.01), sampleRate); } // Fallback buffer
           catch (bufferError) { this.audioState.reverbNode.buffer = null; }
        }
    }

    // --- Note Handling ---
    async startNote(note) {
        const initialized = await this.initPromise; // Wait for initialization
        if (!this.audioState || !initialized || this.audioState.audioContext.state !== 'running') {
            console.warn(`SoundModule: Cannot start note ${note}. Not ready or context not running (${this.audioState?.audioContext?.state}).`);
            return;
        }
        if (!this.noteFrequencies[note]) { console.warn(`SoundModule: Unknown note: ${note}`); return; }

        this.audioState.activeNote = note;

        if (this.audioState.arp.active) {
            if (!this.audioState.isPlaying) { // Start arp if not already running
                this.audioState.arp.baseNote = note;
                this.audioState.arp.currentStep = 0;
                this._startArpeggiator();
            } else { this.audioState.arp.baseNote = note; } // Update base note if arp running
        } else { // Sustained Note Mode
            this._stopSustainedNote(false); // Stop previous abruptly
            const played = this._playSustainedNote(note);
            if (played) { this.audioState.isPlaying = true; }
            else { this.audioState.isPlaying = false; this.audioState.activeNote = null; }
        }
    }

    stopNote(useRelease = true) {
        if (!this.audioState || !this.audioState.isPlaying) return;

        if (this.audioState.arp.active && this.audioState.arp.intervalId) {
            this._stopArpeggiator();
        } else if (!this.audioState.arp.active && this.audioState.currentOscillator) {
            this._stopSustainedNote(useRelease);
        }

        this.audioState.isPlaying = false;
        this.audioState.activeNote = null;
    }

    // --- Internal Note Playing Methods ---
    _playSustainedNote(note) {
        const ac = this.audioState.audioContext;
        const params = this.audioState.parameters;
        const frequency = this.noteFrequencies[note];
        if (!frequency || !ac || !params?.oscillator || !params?.filter || !params?.envelope) return false;
        const now = ac.currentTime;

        try {
            const osc = ac.createOscillator();
            const filter = ac.createBiquadFilter();
            const gainNode = ac.createGain();

            osc.type = params.oscillator.type || 'sine';
            osc.frequency.setValueAtTime(frequency, now);
            filter.type = params.filter.type || 'lowpass';
            filter.frequency.setValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, params.filter.frequency || 1000)), now);
            filter.Q.setValueAtTime(Math.max(0.0001, params.filter.Q || 1), now);

            gainNode.gain.setValueAtTime(0, now);
            const attackTime = Math.max(0.001, params.envelope.attack || 0.01);
            const targetGain = Math.max(0, Math.min(1, params.oscillator.gain || 0.5));
            gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);

            osc.connect(filter).connect(gainNode);
            gainNode.connect(this.audioState.masterGain); // Dry signal
            this._connectEffectsToNode(gainNode); // Send to effects

            this.audioState.currentOscillator = osc;
            this.audioState.currentFilter = filter;
            this.audioState.currentGainNode = gainNode;
            this.audioState.currentNoteFrequency = frequency;

            osc.start(now);
            return true;
        } catch (e) {
            console.error(`SoundModule: Error creating sustained note ${note}:`, e);
            this._cleanupCurrentNoteNodes();
            this.audioState.currentNoteFrequency = null;
            return false;
        }
    }

    _stopSustainedNote(useRelease = true) {
        if (!this.audioState?.currentOscillator || !this.audioState.currentGainNode || !this.audioState.audioContext) return;
        const ac = this.audioState.audioContext;
        const params = this.audioState.parameters;
        const now = ac.currentTime;
        const gainParam = this.audioState.currentGainNode.gain;
        const currentOsc = this.audioState.currentOscillator;
        const releaseTime = Math.max(0.005, params.envelope?.release || 0.5);
        const fadeDuration = useRelease ? releaseTime : 0.005;
        const stopTime = now + fadeDuration + 0.05; // Stop slightly after fade ends

        try {
            gainParam.cancelScheduledValues(now);
            // Set value explicitly before ramp to avoid issues if ramp was interrupted
            // Use a small positive value instead of gainParam.value if it might be exactly 0 to ensure ramp works
            gainParam.setValueAtTime(Math.max(1e-6, gainParam.value), now);
            gainParam.linearRampToValueAtTime(1e-6, now + fadeDuration); // Ramp to near zero
            currentOsc.stop(stopTime);

             const cleanupDelayMs = Math.max(50, (stopTime - now) * 1000 + 50);
             setTimeout(() => {
                  if (this.audioState?.currentOscillator === currentOsc) { this._cleanupCurrentNoteNodes(); }
              }, cleanupDelayMs);
        } catch (e) {
            console.error("Error scheduling note stop/release:", e);
            try { currentOsc.stop(now); } catch(stopErr) {} // Fallback immediate stop
             setTimeout(() => { if (this.audioState?.currentOscillator === currentOsc) { this._cleanupCurrentNoteNodes(); } }, 100);
        }
    }

    _playArpNote(frequency) {
        const ac = this.audioState.audioContext;
        const params = this.audioState.parameters;
        if (!this.audioState || !frequency || !ac || !params?.oscillator || !params?.filter || !params?.envelope) return;
        const now = ac.currentTime;
        const rate = Math.max(0.1, this.audioState.arp.rate || 8);
        const stepDuration = 1.0 / rate;
        const noteDuration = Math.max(0.01, stepDuration * 0.8);
        const arpReleaseTime = Math.min(0.05, Math.max(0.005, stepDuration * 0.1));
        const attackTime = Math.min(0.01, stepDuration * 0.1);
        const targetGain = Math.max(0, Math.min(1, params.oscillator.gain || 0.5));

        // Quick fade out previous arp note
        if (this.audioState.currentOscillator && this.audioState.currentGainNode) {
            try {
                const prevGain = this.audioState.currentGainNode.gain;
                prevGain.cancelScheduledValues(now);
                prevGain.linearRampToValueAtTime(1e-6, now + 0.01);
                this.audioState.currentOscillator.stop(now + 0.02);
            } catch(e) {}
        }

        try {
            const osc = ac.createOscillator();
            const filter = ac.createBiquadFilter();
            const gainNode = ac.createGain();

            osc.type = params.oscillator.type || 'sine';
            osc.frequency.setValueAtTime(frequency, now);
            filter.type = params.filter.type || 'lowpass';
            filter.frequency.setValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, params.filter.frequency || 1000)), now);
            filter.Q.setValueAtTime(Math.max(0.0001, params.filter.Q || 1), now);

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
            const releaseStartTime = Math.max(now + attackTime, now + noteDuration - arpReleaseTime);
            gainNode.gain.setValueAtTime(targetGain, releaseStartTime);
            gainNode.gain.linearRampToValueAtTime(1e-6, now + noteDuration); // Ramp to near zero

            osc.connect(filter).connect(gainNode);
            gainNode.connect(this.audioState.masterGain); // Dry
            this._connectEffectsToNode(gainNode); // Wet

            this.audioState.currentOscillator = osc;
            this.audioState.currentFilter = filter;
            this.audioState.currentGainNode = gainNode;
            this.audioState.currentNoteFrequency = frequency;

            osc.start(now);
            osc.stop(now + noteDuration + 0.05);
        } catch (e) {
            console.error(`SoundModule: Error playing arp note (${frequency.toFixed(2)} Hz):`, e);
            this._cleanupCurrentNoteNodes();
            this.audioState.currentNoteFrequency = null;
        }
    }

    _cleanupCurrentNoteNodes() {
        if (!this.audioState) return;
        try { this.audioState.currentOscillator?.disconnect(); } catch(e){}
        try { this.audioState.currentFilter?.disconnect(); } catch(e){}
        try { this.audioState.currentGainNode?.disconnect(); } catch(e){}
        this.audioState.currentOscillator = null;
        this.audioState.currentFilter = null;
        this.audioState.currentGainNode = null;
    }

    // --- Arpeggiator Control ---
    _startArpeggiator() {
        if (!this.audioState?.isInitialized || this.audioState.arp.intervalId || !this.audioState.arp.active) return;
        const rate = Math.max(0.1, this.audioState.arp.rate || 8);
        const stepTimeMs = 1000.0 / rate;
        this._arpStep();
        this.audioState.arp.intervalId = setInterval(this._arpStep.bind(this), stepTimeMs);
        this.audioState.isPlaying = true;
    }

    _stopArpeggiator() {
        if (!this.audioState?.arp.intervalId) return;
        clearInterval(this.audioState.arp.intervalId);
        this.audioState.arp.intervalId = null;
        this._stopSustainedNote(false); // Stop last arp note quickly
        // isPlaying handled by stopNote()
    }

    _arpStep() {
        if (!this.audioState?.arp.active || !this.audioState.arp.pattern?.length || !this.audioState.arp.baseNote || !this.noteFrequencies[this.audioState.arp.baseNote]) {
            this._stopArpeggiator(); return;
        }
        const arp = this.audioState.arp;
        const baseFrequency = this.noteFrequencies[arp.baseNote];
        const semitoneOffset = arp.pattern[arp.currentStep % arp.pattern.length];
        const stepFrequency = baseFrequency * Math.pow(this.semitoneRatio, semitoneOffset);
        this._playArpNote(stepFrequency);
        arp.currentStep++;
    }

    // --- Parameter Setting ---
    setParameter(type, name, value) {
        if (!this.audioState?.parameters) return;
        let paramGroup = this.audioState.parameters;
        const path = type.split('.');
        try {
            for(let i = 0; i < path.length; ++i) { paramGroup = paramGroup[path[i]]; }
            if (typeof paramGroup !== 'object' || paramGroup === null) throw new Error("Target is not object");
            paramGroup[name] = value; // Update stored value
        } catch (e) {
            console.warn(`SoundModule: Error resolving/setting parameter path ${type}.${name}:`, e.message);
             // Still try to store if possible (for dynamic additions)
             try {
                 let base = this.audioState.parameters;
                 for(let i = 0; i < path.length; ++i) {
                     if (i === path.length - 1) { if (typeof base[path[i]] !== 'object') base[path[i]]={}; base[path[i]][name] = value; }
                     else { if (typeof base[path[i]] !== 'object') base[path[i]]={}; base = base[path[i]]; }
                 }
             } catch (setE) { /* Ignore further errors */ return; }
        }

        // Apply Change to Audio Nodes if ready
        if (!this.audioState.isInitialized || !this.audioState.audioContext || this.audioState.audioContext.state !== 'running') return;
        const ac = this.audioState.audioContext;
        const now = ac.currentTime;
        const rampTime = 0.02; // Short ramp for smooth changes

        try {
            const fullParamName = `${type}.${name}`;
            switch (fullParamName) {
                case 'oscillator.gain': break; // Applied on note start/ramp end
                case 'filter.frequency':
                     if (this.audioState.currentFilter) this.audioState.currentFilter.frequency.exponentialRampToValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, value)), now + rampTime);
                    break;
                case 'filter.Q':
                     if (this.audioState.currentFilter) this.audioState.currentFilter.Q.linearRampToValueAtTime(Math.max(0.0001, value), now + rampTime);
                     break;
                case 'envelope.attack': case 'envelope.release': break; // No immediate audio change
                case 'effects.delay.time':
                    if(this.audioState.delayNode) this.audioState.delayNode.delayTime.linearRampToValueAtTime(Math.max(0, Math.min(2.0, value)), now + rampTime);
                    break;
                case 'effects.delay.feedback':
                    if(this.audioState.delayFeedback) this.audioState.delayFeedback.gain.linearRampToValueAtTime(Math.max(0, Math.min(0.98, value)), now + rampTime);
                    break;
                 case 'effects.reverb.decay': this._updateReverbImpulse(); break;
                case 'effects.reverb.wet':
                    if(this.audioState.reverbGain) this.audioState.reverbGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1.0, value)), now + rampTime);
                    break;
                case 'effects.arpeggiator.rate':
                     this.audioState.arp.rate = value;
                     if (this.audioState.arp.active && this.audioState.arp.intervalId) {
                         this._stopArpeggiator();
                         if (this.audioState.activeNote) { this._startArpeggiator(); }
                     }
                     break;
                case 'effects.arpeggiator.pattern': this.audioState.arp.pattern = value; break;
                // Placeholders - No audio effect yet
                case 'osc2.type': case 'osc2.detune': case 'osc2.mix':
                case 'lfo1.rate': case 'lfo1.depth': case 'lfo1.target': case 'lfo1.shape': break;
                 default: break;
            }
        } catch (e) { console.error(`SoundModule: Error applying parameter ${type}.${name} = ${value}:`, e); }
    }

    setOscillatorType(type) {
        const validTypes = ['sine', 'square', 'sawtooth', 'triangle'];
        if (validTypes.includes(type)) {
            this.setParameter('oscillator', 'type', type);
            if (this.audioState.currentOscillator) { try { this.audioState.currentOscillator.type = type; } catch(e) {} }
        } else { console.warn(`SoundModule: Invalid oscillator type ${type}`); }
    }

    setFilterType(type) {
        const validTypes = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking', 'allpass'];
        if (validTypes.includes(type)) {
             this.setParameter('filter', 'type', type);
             if (this.audioState.currentFilter) { try { this.audioState.currentFilter.type = type; } catch(e) {} }
         } else { console.warn(`SoundModule: Invalid filter type ${type}`); }
    }

    toggleEffect(effectName, isActive) {
        if (!this.audioState?.parameters?.effects) return;
        // Ensure effect params exist, initializing from default if necessary
        if (!this.audioState.parameters.effects[effectName]) {
            const defaultParams = this.getPresetsDefinition()['default'].effects[effectName];
            if (defaultParams) { this.audioState.parameters.effects[effectName] = JSON.parse(JSON.stringify(defaultParams)); }
            else { console.warn(`SoundModule: Cannot toggle unknown effect '${effectName}'.`); return; }
        }

        const effectParams = this.audioState.parameters.effects[effectName];
        const newState = !!isActive;
        if (effectParams.active === newState) return; // No change needed

        effectParams.active = newState;

        if (effectName === 'arpeggiator') {
            this.audioState.arp.active = newState;
            if (newState) { // Turning ON
                if (this.audioState.activeNote && !this.audioState.arp.intervalId) {
                    this._stopSustainedNote(false);
                    this.audioState.arp.baseNote = this.audioState.activeNote;
                    this.audioState.arp.currentStep = 0;
                    this._startArpeggiator();
                }
            } else { // Turning OFF
                if (this.audioState.arp.intervalId) {
                    this._stopArpeggiator();
                    if (this.audioState.activeNote) { this._playSustainedNote(this.audioState.activeNote); } // Resume sustained if key held
                    else { this.audioState.isPlaying = false; } // Ensure stopped if no key held
                }
            }
        } else if (effectName !== 'glitch') { // Delay, Reverb connection check
            if (this.audioState.isPlaying && this.audioState.currentGainNode) {
                this._connectEffectsToNode(this.audioState.currentGainNode);
            }
        }
    }

    // Connects/disconnects the source node to active effects
    _connectEffectsToNode(sourceNode) {
        if (!sourceNode || !this.audioState?.isInitialized || !this.audioState.parameters?.effects) return;
        const effects = this.audioState.parameters.effects;

        // Delay Connection
        try { sourceNode.disconnect(this.audioState.delayNode); } catch(e){} // Disconnect first
        if (effects.delay?.active && this.audioState.delayNode) {
            try { sourceNode.connect(this.audioState.delayNode); } catch(e){ console.error("Connect delay err:", e); }
        }

        // Reverb Connection
        try { sourceNode.disconnect(this.audioState.reverbNode); } catch(e){} // Disconnect first
        if (effects.reverb?.active && this.audioState.reverbNode) {
            try { sourceNode.connect(this.audioState.reverbNode); } catch(e){ console.error("Connect reverb err:", e); }
        }
    }

     // Applies the current toggle states from parameters (used during init)
     _applyCurrentToggleStates() {
         if (!this.audioState?.parameters?.effects || !this.audioState.isInitialized) return;
         const defaultEffects = this.getPresetsDefinition()['default'].effects;
         for (const effectName in defaultEffects) {
             if (this.audioState.parameters.effects[effectName]?.hasOwnProperty('active')) {
                 this.toggleEffect(effectName, this.audioState.parameters.effects[effectName].active);
             }
         }
     }

    // --- Audio Analysis ---
    getAudioLevels() {
        const defaultLevels = { bass: 0, mid: 0, high: 0, frequency: this.audioState?.currentNoteFrequency || null };
        if (!this.audioState?.isInitialized || !this.audioState.analyser || !this.audioState.audioContext || this.audioState.audioContext.state !== 'running') {
            return defaultLevels;
        }
        try {
            const analyser = this.audioState.analyser;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);
            const ac = this.audioState.audioContext;
            const nyquist = ac.sampleRate / 2;
            const bassEndFreq = 250, midEndFreq = 2500, highEndFreq = 8000;
            const bassEndIndex = Math.min(bufferLength - 1, Math.floor(bassEndFreq / nyquist * bufferLength));
            const midStartIndex = bassEndIndex + 1;
            const midEndIndex = Math.min(bufferLength - 1, Math.floor(midEndFreq / nyquist * bufferLength));
            const highStartIndex = midEndIndex + 1;
            const highEndIndex = Math.min(bufferLength - 1, Math.floor(highEndFreq / nyquist * bufferLength));
            let bassSum = 0, midSum = 0, highSum = 0, bassCount = 0, midCount = 0, highCount = 0;
            for (let i = 0; i < bufferLength; i++) {
                const value = dataArray[i];
                if (i <= bassEndIndex) { bassSum += value; bassCount++; }
                else if (i >= midStartIndex && i <= midEndIndex) { midSum += value; midCount++; }
                else if (i >= highStartIndex && i <= highEndIndex) { highSum += value; highCount++; }
            }
            const epsilon = 1e-6;
            const bassAvg = (bassSum / (bassCount + epsilon)) / 255.0;
            const midAvg = (midSum / (midCount + epsilon)) / 255.0;
            const highAvg = (highSum / (highCount + epsilon)) / 255.0;
            return {
                bass: Math.min(1.0, Math.max(0.0, Math.pow(bassAvg, 0.7) * 2.0)),
                mid:  Math.min(1.0, Math.max(0.0, Math.pow(midAvg, 0.8) * 1.5)),
                high: Math.min(1.0, Math.max(0.0, Math.pow(highAvg, 0.6) * 2.5)),
                frequency: this.audioState.currentNoteFrequency
            };
        } catch (e) { console.error("SoundModule: Error getting audio levels:", e); return defaultLevels; }
    }

    // --- Presets ---
    applyPresetAudio(presetName) {
        if (!this.audioState) return;
        const preset = this.audioState.presets[presetName];
        if (!preset) { console.warn(`SoundModule: Preset '${presetName}' not found.`); return; }
        console.log(`SoundModule: Applying audio preset '${presetName}'`);
        this.audioState.activePresetName = presetName;

        const defaultPreset = this.getPresetsDefinition()['default'];
        const mergedParams = JSON.parse(JSON.stringify(defaultPreset));
        const mergeDeep = (target, source) => { /* ... (Recursive merge function as defined previously) ... */
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    const targetValue = target[key];
                    const sourceValue = source[key];
                    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                        if (!targetValue || typeof targetValue !== 'object') { target[key] = {}; }
                        mergeDeep(target[key], sourceValue);
                    } else { target[key] = sourceValue; }
                }
            }
        };
        mergeDeep(mergedParams, preset);
        this.audioState.parameters = mergedParams;

        const arpParams = this.audioState.parameters.effects.arpeggiator;
        this.audioState.arp.rate = arpParams.rate;
        this.audioState.arp.pattern = arpParams.pattern;

        if (this.audioState.isInitialized) { // Apply params immediately if already initialized
            this.setOscillatorType(this.audioState.parameters.oscillator.type);
            this.setParameter('oscillator', 'gain', this.audioState.parameters.oscillator.gain);
            this.setFilterType(this.audioState.parameters.filter.type);
            this.setParameter('filter', 'frequency', this.audioState.parameters.filter.frequency);
            this.setParameter('filter', 'Q', this.audioState.parameters.filter.Q);
            this.setParameter('envelope', 'attack', this.audioState.parameters.envelope.attack);
            this.setParameter('envelope', 'release', this.audioState.parameters.envelope.release);
            this.setParameter('effects.delay', 'time', this.audioState.parameters.effects.delay.time);
            this.setParameter('effects.delay', 'feedback', this.audioState.parameters.effects.delay.feedback);
            this.setParameter('effects.reverb', 'decay', this.audioState.parameters.effects.reverb.decay);
            this.setParameter('effects.reverb', 'wet', this.audioState.parameters.effects.reverb.wet);
            this.setParameter('effects.arpeggiator', 'rate', arpParams.rate);
            this.setParameter('effects.arpeggiator', 'pattern', arpParams.pattern);
            // Apply Placeholder Params (won't affect audio yet)
             this.setParameter('osc2', 'type', this.audioState.parameters.osc2.type);
             this.setParameter('osc2', 'detune', this.audioState.parameters.osc2.detune);
             this.setParameter('osc2', 'mix', this.audioState.parameters.osc2.mix);
             this.setParameter('lfo1', 'rate', this.audioState.parameters.lfo1.rate);
             this.setParameter('lfo1', 'depth', this.audioState.parameters.lfo1.depth);
             this.setParameter('lfo1', 'target', this.audioState.parameters.lfo1.target);
             this.setParameter('lfo1', 'shape', this.audioState.parameters.lfo1.shape);

            this._applyCurrentToggleStates(); // Re-apply toggle states based on loaded preset
        }
    }

    getPresetsDefinition() {
        const defaultStructure = { /* ... (Same default structure as before, including osc2 and lfo1 placeholders) ... */
            oscillator: {type: 'sawtooth', gain: 0.5},
             osc2: { type: 'sine', detune: 0, mix: 0 }, // Default OSC2 off
             filter: {type: 'lowpass', frequency: 1500, Q: 1.0},
             envelope: {attack: 0.05, release: 0.5},
             lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' }, // Default LFO off
             effects: {
                 delay: {active: false, time: 0.3, feedback: 0.3},
                 reverb: {active: false, decay: 1.5, wet: 0.3},
                 glitch: {active: false},
                 arpeggiator: {active: false, rate: 8, pattern: [0, 7, 12]}
             },
        };
        return {
            'default': defaultStructure,
            'vaporwave': { /* ... preset data ... */
                oscillator: {type: 'sine', gain: 0.4},
                filter: {frequency: 800, Q: 2.0},
                envelope: {attack: 0.8, release: 2.0},
                effects: { delay: {active: true, time: 0.55, feedback: 0.45}, reverb: {active: true, decay: 3.5, wet: 0.65}, arpeggiator: {active: false} },
            },
            'ambient_drone': { /* ... preset data ... */
                oscillator: {type: 'sine', gain: 0.4}, osc2: { type: 'triangle', detune: 5, mix: 0.3 },
                filter: {frequency: 600, Q: 1.5}, envelope: {attack: 3.0, release: 5.0},
                effects: { delay: {active: true, time: 0.8, feedback: 0.6}, reverb: {active: true, decay: 6.0, wet: 0.8}, arpeggiator: {active: false} },
            },
            'synthwave_lead': { /* ... preset data ... */
                oscillator: {type: 'sawtooth', gain: 0.6}, osc2: { type: 'square', detune: -7, mix: 0.2 },
                filter: {frequency: 1200, Q: 5.0}, envelope: {attack: 0.02, release: 0.4},
                effects: { delay: {active: true, time: 0.25, feedback: 0.3}, reverb: {active: true, decay: 1.5, wet: 0.4}, arpeggiator: {active: true, rate: 12, pattern: [0, 7, 12, 16]} },
            },
            'grimoire_pulse': { /* ... preset data ... */
                oscillator: {type: 'square', gain: 0.4},
                filter: {type: 'bandpass', frequency: 900, Q: 6.0}, envelope: {attack: 0.01, release: 0.2},
                effects: { delay: {active: true, time: 0.15, feedback: 0.65}, reverb: {active: false}, glitch: {active: true}, arpeggiator: {active: true, rate: 10, pattern: [0, 3, 7, 10]} },
            },
            'dark_ritual': { /* ... preset data ... */
                 oscillator: { type: 'sawtooth', gain: 0.5 }, osc2: { type: 'sawtooth', detune: 15, mix: 0.4 },
                 filter: { type: 'lowpass', frequency: 450, Q: 3.0 }, envelope: { attack: 1.5, release: 3.0 },
                 effects: { delay: { active: true, time: 0.666, feedback: 0.6 }, reverb: { active: true, decay: 4.5, wet: 0.5 }, glitch: { active: true }, arpeggiator: { active: false } },
             },
            'cyber_bass': { /* ... preset data ... */
                 oscillator: { type: 'square', gain: 0.7 }, osc2: { type: 'sawtooth', detune: -12, mix: 0.5 },
                 filter: { type: 'lowpass', frequency: 300, Q: 8.0 }, envelope: { attack: 0.01, release: 0.3 },
                 effects: { delay: { active: false }, reverb: { active: true, decay: 0.8, wet: 0.2 }, glitch: { active: false }, arpeggiator: { active: true, rate: 16, pattern: [0, 0, 7, 0, 10, 0, 7, 0] } },
             },
            'crystal_pad': { /* ... preset data ... */
                 oscillator: { type: 'triangle', gain: 0.4 }, osc2: { type: 'sine', detune: 7, mix: 0.6 }, // Perfect 5th
                 filter: { type: 'highpass', frequency: 500, Q: 2.0 }, envelope: { attack: 1.8, release: 3.5 },
                 effects: { delay: { active: true, time: 0.4, feedback: 0.5 }, reverb: { active: true, decay: 5.0, wet: 0.7 }, glitch: { active: false }, arpeggiator: { active: false } },
             },
            'pulsar_wind': { /* ... preset data ... */
                 oscillator: { type: 'sawtooth', gain: 0.3 }, // Placeholder for noise
                 filter: { type: 'bandpass', frequency: 2500, Q: 15.0 }, envelope: { attack: 0.1, release: 1.5 },
                 lfo1: { rate: 0.2, depth: 4000, target: 'filterFreq', shape: 'sawtooth' }, // LFO Placeholder
                 effects: { delay: { active: true, time: 1.2, feedback: 0.7 }, reverb: { active: true, decay: 6.0, wet: 0.4 }, glitch: { active: false }, arpeggiator: { active: false } },
             }
         };
    }

    getPresetNames() {
        if (!this.audioState?.presets) return [];
        return Object.keys(this.audioState.presets).filter(name => name !== 'default');
    }

    // --- Cleanup ---
    dispose() {
        console.log("SoundModule: Disposing...");
        if (!this.audioState) return;
        this._stopArpeggiator();
        this.stopNote(false);
        if (this.audioState.isInitialized && this.audioState.audioContext) {
            const ac = this.audioState.audioContext;
            console.log("SoundModule: Disconnecting nodes and closing context...");
             try { /* ... disconnect nodes ... */
                 this.audioState.masterGain?.disconnect(); this.audioState.analyser?.disconnect();
                 this.audioState.delayNode?.disconnect(); this.audioState.delayFeedback?.disconnect();
                 this.audioState.reverbNode?.disconnect(); this.audioState.reverbGain?.disconnect();
                 this._cleanupCurrentNoteNodes();
             } catch(e) {}
             if (ac.state !== 'closed') { ac.close().catch(e => {}); }
        }
        this.audioState = null; this.initPromise = null; this.resolveInit = null;
        console.log("SoundModule: Disposed.");
    }
}