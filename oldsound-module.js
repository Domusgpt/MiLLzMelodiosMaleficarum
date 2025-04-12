/* sound/sound-module.js - v1.3 L */

/**
 * Manages Web Audio API for synthesis, effects, analysis, and Arpeggiator.
 * Provides the core sound generation engine for the Maleficarum.
 * v1.3: Added more presets, placeholder params for expansion, fixed init promise logic.
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
                // Placeholder for future expansion
                osc2: { type: 'sine', detune: 0, mix: 0 }, // Mix 0 means off by default
                filter: {},
                envelope: {},
                // Placeholder for future LFO
                lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' }, // Depth 0 means off
                effects: {
                    delay: {},
                    reverb: {},
                    arpeggiator: {},
                    glitch: {} // Placeholder for glitch toggle state
                }
            },
            // Preset Data
            presets: this.getPresetsDefinition(),
            activePresetName: initialPresetName,
        };

        // Note Frequencies Map (Extended Range slightly)
        // Covers C3-C5 for potential dual keyboard octaves
        this.noteFrequencies = this._generateNoteFrequencies(['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5']);
        this.semitoneRatio = Math.pow(2, 1/12);

        // Load initial parameters but defer AudioContext creation
        this.applyPresetAudio(initialPresetName);

        // Defer actual AudioContext initialization until user interaction
        this.resolveInit = null; // Will hold the resolver function
        this.initPromise = new Promise(resolve => { this.resolveInit = resolve; });
        this._addInteractionListener();
    }

    // --- Note Frequency Generation ---
    _generateNoteFrequencies(notes) {
        const baseNote = 'A4';
        const baseFreq = 440.0;
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
               // Check state again inside the handler to be safe
               if (this.audioState && !this.audioState.isInitialized && !this.audioState.isInitializing) {
                   await this._initializeAudio();
               }
               // Cleanup listeners regardless
                document.removeEventListener('click', initAudio, { capture: true, once: true });
                document.removeEventListener('keydown', initAudio, { capture: true, once: true });
                document.removeEventListener('touchstart', initAudio, { capture: true, once: true });
           };
           document.addEventListener('click', initAudio, { capture: true, once: true });
           document.addEventListener('keydown', initAudio, { capture: true, once: true });
           document.addEventListener('touchstart', initAudio, { capture: true, once: true });
       } else {
           console.warn("SoundModule: Not in a browser environment, audio might not initialize.");
           if (this.resolveInit) this.resolveInit(false); // Assume failure if not in browser
       }
   }

   async _initializeAudio() {
        // Return existing promise if already initialized or initializing
        if (this.audioState?.isInitialized || this.audioState?.isInitializing) return this.initPromise;
        if (!this.audioState) {
            console.error("SoundModule: audioState is null during initialization attempt.");
             // Ensure promise is rejected if state is lost before init
             if(this.resolveInit) this.resolveInit(false);
             return Promise.resolve(false); // Return a resolved promise indicating failure
        }

        this.audioState.isInitializing = true;
        console.log("SoundModule: Attempting AudioContext initialization...");

       try {
           const AudioContext = window.AudioContext || window.webkitAudioContext;
           if (!AudioContext) throw new Error("Web Audio API not supported.");

           this.audioState.audioContext = new AudioContext();

           // Handle suspended state
           if (this.audioState.audioContext.state === 'suspended') {
                console.log("SoundModule: AudioContext suspended, attempting resume...");
                await this.audioState.audioContext.resume();
                console.log("SoundModule: AudioContext resumed. State:", this.audioState.audioContext.state);
           }
            // Check if running AFTER attempting resume
           if (this.audioState.audioContext.state !== 'running') {
               throw new Error(`AudioContext failed to start or resume. State: ${this.audioState.audioContext.state}`);
           }

           // Setup Nodes
           this.audioState.masterGain = this.audioState.audioContext.createGain();
           this.audioState.masterGain.gain.value = 0.7; // Master volume
           this.audioState.masterGain.connect(this.audioState.audioContext.destination);

           this.audioState.analyser = this.audioState.audioContext.createAnalyser();
           this.audioState.analyser.fftSize = 512;
           this.audioState.analyser.smoothingTimeConstant = 0.8;
           this.audioState.masterGain.connect(this.audioState.analyser); // Analyze final output

           this._createAudioEffects(); // Create persistent effect nodes

           this.audioState.isInitialized = true;
           console.log('Sound Module: Audio Initialized Successfully.');
           this._applyCurrentToggleStates(); // Apply preset toggles now

           if(this.resolveInit) this.resolveInit(true); // Resolve the promise
           return true;

       } catch (error) {
           console.error('Sound Module: Error initializing audio:', error);
           if (this.audioState) this.audioState.isInitialized = false;
           if(this.resolveInit) this.resolveInit(false); // Reject the promise
           return false;
       } finally {
            // Ensure initializing flag is reset even on error
           if (this.audioState) this.audioState.isInitializing = false;
       }
   }

    // --- Effects Setup ---
    _createAudioEffects() {
        const ac = this.audioState.audioContext;
        if (!ac || !this.audioState.parameters?.effects) return;
        const params = this.audioState.parameters.effects;

        // Delay
        try {
            this.audioState.delayNode = ac.createDelay(2.0); // Max delay time 2s
            this.audioState.delayFeedback = ac.createGain();
            this.audioState.delayNode.delayTime.setValueAtTime(params.delay?.time ?? 0.5, ac.currentTime);
            this.audioState.delayFeedback.gain.setValueAtTime(params.delay?.feedback ?? 0.4, ac.currentTime);

            // Connections: Source -> Delay -> Feedback -> Delay ...
            //              Source also goes direct to master (dry)
            //              Feedback output goes to master (wet)
            this.audioState.delayNode.connect(this.audioState.delayFeedback);
            this.audioState.delayFeedback.connect(this.audioState.delayNode); // Feedback loop
            // Connect the output of the feedback gain (the wet signal) to the master gain
            this.audioState.delayFeedback.connect(this.audioState.masterGain);

        } catch (e) { console.error("Error creating Delay nodes:", e); }

        // Reverb
        try {
            this.audioState.reverbNode = ac.createConvolver();
            this.audioState.reverbGain = ac.createGain(); // Wet control for reverb
            this._updateReverbImpulse(); // Generate initial impulse
            this.audioState.reverbGain.gain.setValueAtTime(params.reverb?.wet ?? 0.5, ac.currentTime);

            // Connections: Source -> Reverb Node -> Reverb Gain (Wet) -> Master Gain
            this.audioState.reverbNode.connect(this.audioState.reverbGain);
            this.audioState.reverbGain.connect(this.audioState.masterGain);
        } catch (e) { console.error("Error creating Reverb nodes:", e); }
    }

    _updateReverbImpulse() {
        if (!this.audioState?.isInitialized || !this.audioState.reverbNode || !this.audioState.audioContext || !this.audioState.parameters?.effects?.reverb) {
            return;
        }
        const ac = this.audioState.audioContext;
        const decay = this.audioState.parameters.effects.reverb.decay;
        const sampleRate = ac.sampleRate;
        const validDecay = Math.max(0.01, Math.min(10.0, decay || 2.0)); // Clamp decay 0.01s - 10s
        const length = Math.max(sampleRate * 0.01, Math.min(sampleRate * 10, validDecay * sampleRate));

        try {
            const impulseLength = Math.ceil(length); // Ensure integer length for buffer
            const impulse = ac.createBuffer(2, impulseLength, sampleRate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);
            for (let i = 0; i < impulseLength; i++) {
                // Exponential decay curve - adjust the divisor for curve shape (larger = slower decay start)
                const env = Math.exp(-i / (sampleRate * validDecay / 5));
                left[i] = (Math.random() * 2 - 1) * env;
                right[i] = (Math.random() * 2 - 1) * env;
            }
            this.audioState.reverbNode.buffer = impulse;
        } catch (e) {
           console.error("Error creating reverb impulse buffer:", e, "Length:", length, "Decay:", validDecay);
           try { this.audioState.reverbNode.buffer = ac.createBuffer(2, sampleRate * 0.01, sampleRate); }
           catch (bufferError) { this.audioState.reverbNode.buffer = null; }
        }
    }

    // --- Note Handling ---
    async startNote(note) {
        // Wait for initialization AND ensure context is running
        const initialized = await this.initPromise;
        if (!this.audioState || !initialized || this.audioState.audioContext.state !== 'running') {
            console.warn(`SoundModule: Cannot start note ${note}. Not ready or context not running (${this.audioState?.audioContext?.state}).`);
            return;
        }
        if (!this.noteFrequencies[note]) {
             console.warn(`SoundModule: Unknown note: ${note}`);
             return;
        }

        const ac = this.audioState.audioContext;
        this.audioState.activeNote = note; // Store the requested note name

        if (this.audioState.arp.active) {
            if (!this.audioState.isPlaying) { // Start arp if not already running
                this.audioState.arp.baseNote = note;
                this.audioState.arp.currentStep = 0;
                this._startArpeggiator(); // This will set isPlaying=true internally
            } else { // Arp running, just update base note
                this.audioState.arp.baseNote = note;
                // Option: Reset step? Current logic lets sequence continue with new base.
                // this.audioState.arp.currentStep = 0;
            }
        } else {
            // Sustained Note Mode
            this._stopSustainedNote(false); // Stop previous abruptly
            const played = this._playSustainedNote(note); // Play new sustained note
             if (played) {
                 this.audioState.isPlaying = true; // Mark playing only if successful
             } else {
                 this.audioState.isPlaying = false; // Ensure stopped if play failed
                 this.audioState.activeNote = null; // Clear note if failed
             }
        }
    }

    stopNote(useRelease = true) {
        // No need to await promise here, just check if playing
        if (!this.audioState || !this.audioState.isPlaying) return;

        if (this.audioState.arp.active && this.audioState.arp.intervalId) {
            this._stopArpeggiator(); // Stops arp sequence and last arp note
        } else if (!this.audioState.arp.active && this.audioState.currentOscillator) {
            // Only stop sustained note if arp is OFF
            this._stopSustainedNote(useRelease); // Stops sustained note
        }

        this.audioState.isPlaying = false; // Mark main state as stopped
        this.audioState.activeNote = null; // Clear the held note name
        // Keep last frequency for visuals: this.audioState.currentNoteFrequency
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
            // Use exponential ramp for filter freq for smoother sweeps potentially
            filter.frequency.setValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, params.filter.frequency || 1000)), now);
            filter.Q.setValueAtTime(Math.max(0.0001, params.filter.Q || 1), now);

            // Envelope Attack
            gainNode.gain.setValueAtTime(0, now); // Start at zero
            const attackTime = Math.max(0.001, params.envelope.attack || 0.01);
            const targetGain = Math.max(0, Math.min(1, params.oscillator.gain || 0.5));
            gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);

            // Connections
            osc.connect(filter).connect(gainNode); // Chain connections
            // Connect gainNode BOTH directly to master (dry) AND to effects inputs
            gainNode.connect(this.audioState.masterGain);
            this._connectEffectsToNode(gainNode); // Connect to active effects inputs

            // Store References & State
            this.audioState.currentOscillator = osc;
            this.audioState.currentFilter = filter;
            this.audioState.currentGainNode = gainNode;
            this.audioState.currentNoteFrequency = frequency; // Update last played frequency

            osc.start(now);
            return true; // Indicate success

        } catch (e) {
            console.error(`SoundModule: Error creating sustained note ${note}:`, e);
            this._cleanupCurrentNoteNodes(); // Clean up on failure
            this.audioState.currentNoteFrequency = null;
            return false; // Indicate failure
        }
    }

    _stopSustainedNote(useRelease = true) {
        // Don't stop if nodes are already gone
        if (!this.audioState?.currentOscillator || !this.audioState.currentGainNode || !this.audioState.audioContext) {
            return;
        }

        const ac = this.audioState.audioContext;
        const params = this.audioState.parameters;
        const now = ac.currentTime;
        const gainParam = this.audioState.currentGainNode.gain;
        const currentOsc = this.audioState.currentOscillator; // Reference before cleanup
        const releaseTime = Math.max(0.005, params.envelope?.release || 0.5); // Ensure minimum release

        try {
            gainParam.cancelScheduledValues(now); // Stop any ongoing ramps (like attack)
            gainParam.setValueAtTime(gainParam.value, now); // Set current value before starting release

            let stopTime;
            if (useRelease && releaseTime > 0.005) {
                gainParam.linearRampToValueAtTime(0, now + releaseTime);
                stopTime = now + releaseTime + 0.05; // Schedule stop slightly after release ends
            } else {
                gainParam.linearRampToValueAtTime(0, now + 0.005); // Very quick fade
                stopTime = now + 0.01; // Stop very soon after quick fade
            }
            currentOsc.stop(stopTime);

             // Schedule cleanup slightly after the oscillator is supposed to stop
             const cleanupDelayMs = Math.max(50, (stopTime - now) * 1000 + 50);
             setTimeout(() => {
                  // Check if these are still the nodes we intended to clean up
                  if (this.audioState?.currentOscillator === currentOsc) {
                      this._cleanupCurrentNoteNodes();
                  }
              }, cleanupDelayMs);

        } catch (e) {
            console.error("Error scheduling note stop/release:", e);
            // Attempt immediate stop as fallback
            try { currentOsc.stop(now); } catch(stopErr) { /* Ignore */ }
             // Still try to schedule cleanup
             setTimeout(() => {
                 if (this.audioState?.currentOscillator === currentOsc) { this._cleanupCurrentNoteNodes(); }
             }, 100);
        }
    }

    _playArpNote(frequency) {
        const ac = this.audioState.audioContext;
        const params = this.audioState.parameters;
        if (!this.audioState || !frequency || !ac || !params?.oscillator || !params?.filter || !params?.envelope) return;

        const now = ac.currentTime;

        // Timing
        const rate = Math.max(0.1, this.audioState.arp.rate || 8);
        const stepDuration = 1.0 / rate;
        // Ensure note duration is positive and slightly less than step duration for separation
        const noteDuration = Math.max(0.01, stepDuration * 0.8);
        // Short release within the note's duration
        const arpReleaseTime = Math.min(0.05, Math.max(0.005, stepDuration * 0.1));
        const attackTime = Math.min(0.01, stepDuration * 0.1); // Very short attack
        const targetGain = Math.max(0, Math.min(1, params.oscillator.gain || 0.5));

        // Stop Previous Arp Note Cleanly
        if (this.audioState.currentOscillator) {
            try {
                // Use a quick fade instead of immediate stop for less clickiness
                this.audioState.currentGainNode?.gain.cancelScheduledValues(now);
                this.audioState.currentGainNode?.gain.linearRampToValueAtTime(0, now + 0.01);
                this.audioState.currentOscillator.stop(now + 0.02);
                // Don't call cleanup here, let the new note creation overwrite refs
            } catch(e) { /* ignore errors stopping already stopped osc */ }
        }

        try {
            // --- Create New Nodes ---
            const osc = ac.createOscillator();
            const filter = ac.createBiquadFilter();
            const gainNode = ac.createGain(); // Envelope for THIS arp note

            osc.type = params.oscillator.type || 'sine';
            osc.frequency.setValueAtTime(frequency, now);

            filter.type = params.filter.type || 'lowpass';
            filter.frequency.setValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, params.filter.frequency || 1000)), now);
            filter.Q.setValueAtTime(Math.max(0.0001, params.filter.Q || 1), now);

            // --- Short Envelope ---
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
            // Hold gain until release starts
            const releaseStartTime = Math.max(now + attackTime, now + noteDuration - arpReleaseTime);
            gainNode.gain.setValueAtTime(targetGain, releaseStartTime);
            // Release ramp to zero at the end of noteDuration
            gainNode.gain.linearRampToValueAtTime(0, now + noteDuration);

            // --- Connections ---
            osc.connect(filter).connect(gainNode);
             // Connect gainNode BOTH directly to master (dry) AND to effects inputs
            gainNode.connect(this.audioState.masterGain);
            this._connectEffectsToNode(gainNode);

            // --- Store Refs & State ---
            this.audioState.currentOscillator = osc;
            this.audioState.currentFilter = filter;
            this.audioState.currentGainNode = gainNode;
            this.audioState.currentNoteFrequency = frequency; // Update last played frequency

            osc.start(now);
            // Schedule stop slightly after envelope finishes to ensure sound cuts off
            osc.stop(now + noteDuration + 0.05);

            // Note: Auto-cleanup is handled implicitly by the next arp step or stopArpeggiator

        } catch (e) {
            console.error(`SoundModule: Error playing arp note (${frequency.toFixed(2)} Hz):`, e);
            this._cleanupCurrentNoteNodes(); // Clean up failed attempt
            this.audioState.currentNoteFrequency = null;
        }
    }

    _cleanupCurrentNoteNodes() {
        if (!this.audioState) return;
        // Use try/catch for disconnect errors on potentially already disconnected nodes
        try { this.audioState.currentOscillator?.disconnect(); } catch(e){}
        try { this.audioState.currentFilter?.disconnect(); } catch(e){}
        try { this.audioState.currentGainNode?.disconnect(); } catch(e){}
        // Don't stop oscillator here, it should be scheduled by release logic
        this.audioState.currentOscillator = null;
        this.audioState.currentFilter = null;
        this.audioState.currentGainNode = null;
    }

    // --- Arpeggiator Control ---
    _startArpeggiator() {
        if (!this.audioState?.isInitialized || this.audioState.arp.intervalId || !this.audioState.arp.active) return;

        const rate = Math.max(0.1, this.audioState.arp.rate || 8);
        const stepTimeMs = 1000.0 / rate;

        this._arpStep(); // Immediately play the first note
        this.audioState.arp.intervalId = setInterval(this._arpStep.bind(this), stepTimeMs);
        this.audioState.isPlaying = true; // Mark as playing
    }

    _stopArpeggiator() {
        if (!this.audioState?.arp.intervalId) return;

        clearInterval(this.audioState.arp.intervalId);
        this.audioState.arp.intervalId = null;

        // Stop the currently sounding arp note using a quick release
        // Use the standard stop mechanism with no release
        this._stopSustainedNote(false);

        // isPlaying state is handled by the calling stopNote() function generally
    }

    _arpStep() {
        // Check essential state
        if (!this.audioState?.arp.active || !this.audioState.arp.pattern?.length || !this.audioState.arp.baseNote || !this.noteFrequencies[this.audioState.arp.baseNote]) {
            console.warn("Arp step failed: Invalid state or parameters.");
            this._stopArpeggiator(); // Stop if state is invalid
            return;
        }

        const arp = this.audioState.arp;
        const baseFrequency = this.noteFrequencies[arp.baseNote];
        const semitoneOffset = arp.pattern[arp.currentStep % arp.pattern.length];
        const stepFrequency = baseFrequency * Math.pow(this.semitoneRatio, semitoneOffset);

        this._playArpNote(stepFrequency); // Play the calculated note

        arp.currentStep++; // Move to the next step
    }


    // --- Parameter Setting ---
    // Simplified setParameter - assumes path is valid and exists in the default structure
    setParameter(type, name, value) {
        if (!this.audioState?.parameters) return;

        let paramGroup = this.audioState.parameters;
        const path = type.split('.'); // e.g., 'effects.delay'
        try {
            for(let i = 0; i < path.length; ++i) {
                 if (paramGroup && paramGroup.hasOwnProperty(path[i])) {
                     paramGroup = paramGroup[path[i]];
                 } else { throw new Error(`Invalid path segment: ${path[i]}`); }
             }
            if (typeof paramGroup !== 'object' || paramGroup === null) {
                throw new Error("Target is not an object");
            }
             // Update stored value (even if not in default, allows dynamic additions)
             paramGroup[name] = value;
        } catch (e) {
             console.warn(`SoundModule: Error resolving parameter path ${type}.${name}:`, e.message);
             return; // Don't proceed if path invalid
        }


        // Apply Change to Active Audio Nodes (if initialized and running)
        if (!this.audioState.isInitialized || !this.audioState.audioContext || this.audioState.audioContext.state !== 'running') return;
        const ac = this.audioState.audioContext;
        const now = ac.currentTime;
        const rampTime = 0.02; // Short ramp for smooth changes

        try {
            const fullParamName = `${type}.${name}`;
            switch (fullParamName) {
                // Oscillator gain affects current note's gain node (target gain)
                case 'oscillator.gain':
                    // No immediate audio change, applied on next note or ramp end
                    break;
                // Filter params affect current filter node
                case 'filter.frequency':
                     if (this.audioState.currentFilter) this.audioState.currentFilter.frequency.exponentialRampToValueAtTime(Math.max(10, Math.min(ac.sampleRate / 2, value)), now + rampTime);
                    break;
                case 'filter.Q':
                     if (this.audioState.currentFilter) this.audioState.currentFilter.Q.linearRampToValueAtTime(Math.max(0.0001, value), now + rampTime);
                     break;
                // Envelope times affect next note trigger/release
                case 'envelope.attack': case 'envelope.release': break;

                // Effect Parameters
                case 'effects.delay.time':
                    if(this.audioState.delayNode) this.audioState.delayNode.delayTime.linearRampToValueAtTime(Math.max(0, Math.min(2.0, value)), now + rampTime);
                    break;
                case 'effects.delay.feedback':
                    if(this.audioState.delayFeedback) this.audioState.delayFeedback.gain.linearRampToValueAtTime(Math.max(0, Math.min(0.98, value)), now + rampTime); // Clamp feedback < 1
                    break;
                 case 'effects.reverb.decay': this._updateReverbImpulse(); break; // Re-generate impulse
                case 'effects.reverb.wet':
                    if(this.audioState.reverbGain) this.audioState.reverbGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1.0, value)), now + rampTime);
                    break;

                // Arpeggiator parameters (require restart if rate changes while active)
                case 'effects.arpeggiator.rate':
                     this.audioState.arp.rate = value;
                     if (this.audioState.arp.active && this.audioState.arp.intervalId) {
                         this._stopArpeggiator();
                         // Restart only if a note is supposed to be playing (key held)
                         if (this.audioState.activeNote) { this._startArpeggiator(); }
                     }
                     break;
                case 'effects.arpeggiator.pattern':
                     this.audioState.arp.pattern = value;
                     // Optional: Reset step count?
                     // this.audioState.arp.currentStep = 0;
                     break;
                 // Placeholders - No audio effect yet
                case 'osc2.type': case 'osc2.detune': case 'osc2.mix':
                case 'lfo1.rate': case 'lfo1.depth': case 'lfo1.target': case 'lfo1.shape':
                    // console.log(`Placeholder param updated: ${fullParamName}`);
                    break;
                 default:
                    // console.log(`Parameter updated internally: ${fullParamName}`);
                    break; // Parameter updated internally, no specific audio action needed now
            }
        } catch (e) {
            console.error(`SoundModule: Error applying parameter ${type}.${name} = ${value}:`, e);
        }
    }

    // Use setParameter internally for consistency
    setOscillatorType(type) {
        const validTypes = ['sine', 'square', 'sawtooth', 'triangle'];
        if (validTypes.includes(type)) {
            this.setParameter('oscillator', 'type', type);
            if (this.audioState.isPlaying && this.audioState.currentOscillator) {
                try { this.audioState.currentOscillator.type = type; } catch(e) {}
            }
        } else { console.warn(`SoundModule: Invalid oscillator type ${type}`); }
    }

    setFilterType(type) {
        const validTypes = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking', 'allpass'];
        if (validTypes.includes(type)) {
             this.setParameter('filter', 'type', type);
             if (this.audioState.isPlaying && this.audioState.currentFilter) {
                 try { this.audioState.currentFilter.type = type; } catch(e) {}
             }
         } else { console.warn(`SoundModule: Invalid filter type ${type}`); }
    }

    toggleEffect(effectName, isActive) {
        if (!this.audioState?.parameters?.effects) return;

        // Ensure effect exists in parameters before toggling
        if (!this.audioState.parameters.effects[effectName]) {
            // Attempt to initialize from default if missing
            const defaultEffectParams = this.getPresetsDefinition()['default'].effects[effectName];
            if (defaultEffectParams) {
                 this.audioState.parameters.effects[effectName] = JSON.parse(JSON.stringify(defaultEffectParams));
                 console.log(`Initialized missing effect params for '${effectName}' from default.`);
            } else {
                console.warn(`SoundModule: Cannot toggle unknown effect '${effectName}' (not in defaults).`);
                return;
            }
        }

        const effectParams = this.audioState.parameters.effects[effectName];
        const newState = !!isActive; // Ensure boolean
        if (effectParams.active === newState) return; // No change

        effectParams.active = newState;
        // console.log(`SoundModule: Toggled ${effectName} to ${newState}`);

        // Handle specific effect logic
        if (effectName === 'arpeggiator') {
            this.audioState.arp.active = newState; // Sync internal state flag
            if (newState) {
                // If a note is currently held (activeNote), start the arp
                if (this.audioState.activeNote && !this.audioState.arp.intervalId) {
                    this._stopSustainedNote(false); // Stop sustained if it was playing
                    this.audioState.arp.baseNote = this.audioState.activeNote;
                    this.audioState.arp.currentStep = 0;
                    this._startArpeggiator();
                    // isPlaying state is set within _startArpeggiator
                }
            } else {
                // Turning Arp OFF
                if (this.audioState.arp.intervalId) {
                    this._stopArpeggiator();
                    // If the base note key is still held, transition back to sustained
                    if (this.audioState.activeNote) {
                        this._playSustainedNote(this.audioState.activeNote);
                         // isPlaying state should be set by _playSustainedNote
                    } else {
                       this.audioState.isPlaying = false; // No note held, just ensure stopped
                    }
                }
            }
        } else if (effectName !== 'glitch') {
            // For Delay, Reverb, re-evaluate connections IF a note is playing
            if (this.audioState.isPlaying && this.audioState.currentGainNode) {
                this._connectEffectsToNode(this.audioState.currentGainNode);
            }
        }
        // Glitch toggle is handled by visualizer/UI reading the parameter state
    }

    // Helper to connect/disconnect effects based on their 'active' state
    _connectEffectsToNode(sourceNode) {
        if (!sourceNode || !this.audioState?.isInitialized || !this.audioState.parameters?.effects) return;
        const effects = this.audioState.parameters.effects;

        // Delay: Connect source -> delayNode if active
        try { sourceNode.disconnect(this.audioState.delayNode); } catch(e){} // Try disconnect always
        if (effects.delay?.active && this.audioState.delayNode) {
            try { sourceNode.connect(this.audioState.delayNode); } catch(e) { console.error("Error connecting to delay:", e); }
        }

        // Reverb: Connect source -> reverbNode if active
        try { sourceNode.disconnect(this.audioState.reverbNode); } catch(e){} // Try disconnect always
        if (effects.reverb?.active && this.audioState.reverbNode) {
             try { sourceNode.connect(this.audioState.reverbNode); } catch(e) { console.error("Error connecting to reverb:", e); }
        }
    }

     // Applies the current toggle states from parameters (used during init)
     _applyCurrentToggleStates() {
         if (!this.audioState?.parameters?.effects || !this.audioState.isInitialized) return;
         const effects = this.audioState.parameters.effects;
         // Iterate over defined effects in the DEFAULT structure to ensure order/existence
         const defaultEffects = this.getPresetsDefinition()['default'].effects;
         for (const effectName in defaultEffects) {
             if (effects[effectName]?.hasOwnProperty('active')) {
                 // Use internal state to toggle, ensuring connections are handled correctly
                 this.toggleEffect(effectName, effects[effectName].active);
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
            const bassEndFreq = 250;
            const midEndFreq = 2500; // Increased mid range slightly
            const highEndFreq = 8000; // Increased high range slightly
            const bassEndIndex = Math.min(bufferLength - 1, Math.floor(bassEndFreq / nyquist * bufferLength));
            const midStartIndex = bassEndIndex + 1;
            const midEndIndex = Math.min(bufferLength - 1, Math.floor(midEndFreq / nyquist * bufferLength));
            const highStartIndex = midEndIndex + 1;
            const highEndIndex = Math.min(bufferLength - 1, Math.floor(highEndFreq / nyquist * bufferLength));

            let bassSum = 0, midSum = 0, highSum = 0;
            let bassCount = 0, midCount = 0, highCount = 0;

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

            // Tweaked curves for potentially more dynamic response
            return {
                bass: Math.min(1.0, Math.max(0.0, Math.pow(bassAvg, 0.7) * 2.0)), // More responsive bass
                mid:  Math.min(1.0, Math.max(0.0, Math.pow(midAvg, 0.8) * 1.5)),
                high: Math.min(1.0, Math.max(0.0, Math.pow(highAvg, 0.6) * 2.5)), // More responsive highs
                frequency: this.audioState.currentNoteFrequency // Include last played frequency
            };

        } catch (e) {
            console.error("SoundModule: Error getting audio levels:", e);
            return defaultLevels;
        }
    }

    // --- Presets ---
    applyPresetAudio(presetName) {
        if (!this.audioState) return;
        const preset = this.audioState.presets[presetName];
        if (!preset) { console.warn(`SoundModule: Preset '${presetName}' not found.`); return; }
        console.log(`SoundModule: Applying audio preset '${presetName}'`);
        this.audioState.activePresetName = presetName;

        // Deep Copy & Merge with Defaults for robustness
        const defaultPreset = this.getPresetsDefinition()['default'];
        const mergedParams = JSON.parse(JSON.stringify(defaultPreset)); // Start with default

        // Recursive merge function
        const mergeDeep = (target, source) => {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        // If target doesn't have the object, create it
                        if (!target[key] || typeof target[key] !== 'object') {
                            target[key] = {};
                        }
                        mergeDeep(target[key], source[key]); // Recurse
                    } else {
                        target[key] = source[key]; // Copy primitive value or array
                    }
                }
            }
        };

        mergeDeep(mergedParams, preset); // Merge the selected preset into the default structure
        this.audioState.parameters = mergedParams;

        // Sync Internal Arp State from the newly merged parameters
        const arpParams = this.audioState.parameters.effects.arpeggiator;
        this.audioState.arp.rate = arpParams.rate;
        this.audioState.arp.pattern = arpParams.pattern;
        // Active state is handled by _applyCurrentToggleStates below

        // Apply Parameters to Audio Nodes (if initialized)
        if (this.audioState.isInitialized) {
           // Use setParameter for consistency and applying ramps where needed
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

           // Apply toggle states AFTER params are set, respecting preset values
            this._applyCurrentToggleStates();
        }
    }

    getPresetsDefinition() {
        const defaultStructure = {
             oscillator: {type: 'sawtooth', gain: 0.5},
             osc2: { type: 'sine', detune: 0, mix: 0 }, // Default OSC2 off
             filter: {type: 'lowpass', frequency: 1500, Q: 1.0},
             envelope: {attack: 0.05, release: 0.5},
             lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' }, // Default LFO off
             effects: {
                 delay: {active: false, time: 0.3, feedback: 0.3},
                 reverb: {active: false, decay: 1.5, wet: 0.3},
                 glitch: {active: false}, // Visual only, state stored here
                 arpeggiator: {active: false, rate: 8, pattern: [0, 7, 12]} // Major chord arp
             },
        };
        return {
            'default': defaultStructure,
            'vaporwave': {
                oscillator: {type: 'sine', gain: 0.4},
                filter: {frequency: 800, Q: 2.0}, // Slightly more Q
                envelope: {attack: 0.8, release: 2.0},
                effects: {
                    delay: {active: true, time: 0.55, feedback: 0.45}, // More pronounced delay
                    reverb: {active: true, decay: 3.5, wet: 0.65}, // Longer reverb
                    arpeggiator: {active: false}
                },
            },
             'ambient_drone': {
                oscillator: {type: 'sine', gain: 0.4},
                 osc2: { type: 'triangle', detune: 5, mix: 0.3 }, // Add subtle detuned OSC2
                filter: {frequency: 600, Q: 1.5},
                envelope: {attack: 3.0, release: 5.0}, // Even Longer A/R
                effects: {
                    delay: {active: true, time: 0.8, feedback: 0.6},
                    reverb: {active: true, decay: 6.0, wet: 0.8},
                    arpeggiator: {active: false}
                },
             },
            'synthwave_lead': {
                oscillator: {type: 'sawtooth', gain: 0.6},
                osc2: { type: 'square', detune: -7, mix: 0.2 }, // Detuned square sub
                filter: {frequency: 1200, Q: 5.0},
                envelope: {attack: 0.02, release: 0.4},
                effects: {
                    delay: {active: true, time: 0.25, feedback: 0.3},
                    reverb: {active: true, decay: 1.5, wet: 0.4},
                    arpeggiator: {active: true, rate: 12, pattern: [0, 7, 12, 16]} // Faster arp with higher note
                },
             },
             'grimoire_pulse': {
                oscillator: {type: 'square', gain: 0.4},
                filter: {type: 'bandpass', frequency: 900, Q: 6.0},
                envelope: {attack: 0.01, release: 0.2},
                effects: {
                    delay: {active: true, time: 0.15, feedback: 0.65}, // More feedback
                    reverb: {active: false},
                    glitch: {active: true},
                    arpeggiator: {active: true, rate: 10, pattern: [0, 3, 7, 10]} // Minor chord arp
                },
             },
             'dark_ritual': {
                 oscillator: { type: 'sawtooth', gain: 0.5 },
                 osc2: { type: 'sawtooth', detune: 15, mix: 0.4 }, // Thick detuned saw
                 filter: { type: 'lowpass', frequency: 450, Q: 3.0 },
                 envelope: { attack: 1.5, release: 3.0 },
                 effects: {
                     delay: { active: true, time: 0.666, feedback: 0.6 },
                     reverb: { active: true, decay: 4.5, wet: 0.5 },
                     glitch: { active: true },
                     arpeggiator: { active: false }
                 },
             },
             'cyber_bass': {
                 oscillator: { type: 'square', gain: 0.7 },
                 osc2: { type: 'sawtooth', detune: -12, mix: 0.5 }, // Octave down saw
                 filter: { type: 'lowpass', frequency: 300, Q: 8.0 }, // Resonant low filter
                 envelope: { attack: 0.01, release: 0.3 },
                 effects: {
                     delay: { active: false },
                     reverb: { active: true, decay: 0.8, wet: 0.2 }, // Short metallic reverb
                     glitch: { active: false },
                     arpeggiator: { active: true, rate: 16, pattern: [0, 0, 7, 0, 10, 0, 7, 0] } // Fast rhythmic arp
                 },
             },
             'crystal_pad': {
                 oscillator: { type: 'triangle', gain: 0.4 },
                 osc2: { type: 'sine', detune: 7, mix: 0.6 }, // Perfect 5th sine
                 filter: { type: 'highpass', frequency: 500, Q: 2.0 }, // High pass for shimmer
                 envelope: { attack: 1.8, release: 3.5 },
                 effects: {
                     delay: { active: true, time: 0.4, feedback: 0.5 }, // Ping-pong like
                     reverb: { active: true, decay: 5.0, wet: 0.7 },
                     glitch: { active: false },
                     arpeggiator: { active: false }
                 },
             },
             'pulsar_wind': {
                 oscillator: { type: 'sawtooth', gain: 0.3 }, // Noise source alternative needed
                 filter: { type: 'bandpass', frequency: 2500, Q: 15.0 }, // Highly resonant filter sweep needed (LFO)
                 envelope: { attack: 0.1, release: 1.5 },
                 lfo1: { rate: 0.2, depth: 4000, target: 'filterFreq', shape: 'sawtooth' }, // Slow LFO on filter (requires implementation)
                 effects: {
                     delay: { active: true, time: 1.2, feedback: 0.7 },
                     reverb: { active: true, decay: 6.0, wet: 0.4 },
                     glitch: { active: false },
                     arpeggiator: { active: false }
                 },
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
        this.stopNote(false); // Force stop immediately

        if (this.audioState.isInitialized && this.audioState.audioContext) {
            const ac = this.audioState.audioContext;
            console.log("SoundModule: Disconnecting nodes and closing context...");
             try {
                 if (this.audioState.masterGain) this.audioState.masterGain.disconnect();
                 if (this.audioState.analyser) this.audioState.analyser.disconnect();
                 if (this.audioState.delayNode) this.audioState.delayNode.disconnect();
                 if (this.audioState.delayFeedback) this.audioState.delayFeedback.disconnect();
                 if (this.audioState.reverbNode) this.audioState.reverbNode.disconnect();
                 if (this.audioState.reverbGain) this.audioState.reverbGain.disconnect();
                 this._cleanupCurrentNoteNodes(); // Final cleanup
             } catch(e) { console.warn("SoundModule: Error during node disconnection:", e); }

             if (ac.state !== 'closed') {
                ac.close().then(() => console.log("SoundModule: AudioContext closed."))
                          .catch(e => console.error("SoundModule: Error closing AudioContext:", e));
             }
        }
        this.audioState = null; // Help GC
        this.initPromise = null;
        this.resolveInit = null;
        console.log("SoundModule: Disposed.");
    }
}