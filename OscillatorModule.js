// sound/modules/OscillatorModule.js
import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class OscillatorModule extends AudioModuleBase {
    constructor(engine, id, options = {}) {
        // Options: isMaster (bool, controls overall gain), waveform, gain, detune, mix (for Osc2)
        super(engine, id, {
            isMaster: true, // Default to being the main oscillator
            waveform: 'sawtooth',
            gain: 0.5,
            detune: 0, // In cents
            mix: 1.0, // Relevant for Osc2, ignored if isMaster
            enabled: true, // Added enabled flag
            ...options
        });

        this.oscillatorNode = null;
        this.gainNode = null; // Controls the output level of this specific oscillator
    }

    getDefaultOptions() {
        return {
            isMaster: true,
            connectToMaster: false, // Usually connected elsewhere (filter/mixer)
            waveform: 'sawtooth',
            gain: 0.5,
            detune: 0,
            mix: 1.0,
            enabled: true,
        };
    }

    getInitialParameters() {
        return {
            enabled: this.options.enabled,
            waveform: this.options.waveform,
            gain: this.options.gain, // Use initial gain from options
            detune: this.options.detune, // Detune in cents
            mix: this.options.mix, // Only relevant if NOT isMaster
            octave: 0, // Octave shift (+/- semitones / 12)
            // Removed 'isMaster' - should be set via options only
        };
    }

    getParameterMetadata() {
        return {
            enabled: { type: 'boolean', default: this.options.enabled, description: 'Enable/disable oscillator' },
            waveform: { type: 'enum', options: ['sine', 'square', 'sawtooth', 'triangle'], default: this.options.waveform, description: 'Oscillator waveform' },
            gain: { type: 'float', min: 0.0, max: 1.0, default: this.options.gain, description: 'Oscillator level', /* audioParam: 'gainNode.gain' - Applied based on mix/master status */ },
            detune: { type: 'float', min: -1200, max: 1200, step: 1, default: this.options.detune, description: 'Fine detune (cents)', audioParam: { nodeName: 'oscillatorNode', paramName: 'detune' } },
            mix: { type: 'float', min: 0.0, max: 1.0, default: this.options.mix, description: 'Mix level (for secondary osc)' },
            octave: { type: 'integer', min: -2, max: 2, step: 1, default: 0, description: 'Octave shift' },
        };
    }

    async initialize() {
        if (this.isInitialized) return true;
        this._createModuleNodes();
        // Define output - gainNode controls this oscillator's level
        this.defineOutput('output', this.gainNode);
        this.isInitialized = true;
        this.updateParameter('enabled', this.getParameter('enabled')); // Apply initial enabled state
        return true;
    }

    _createModuleNodes() {
        // Gain node controls this specific oscillator's output level
        this.gainNode = this.createNode('gainNode', 'Gain');
        this.applyGain(); // Set initial gain based on options/params

        // Oscillator node will be created/destroyed on start/stop
        this.oscillatorNode = null;
    }

    // New method to apply gain based on state
    applyGain() {
        if (!this.gainNode) return;
        const now = this.engine.getCurrentTime();
        let finalGain = 0;
        if (this.getParameter('enabled')) {
            finalGain = this.options.isMaster
                ? this.getParameter('gain') // Master Osc uses its own gain directly
                : this.getParameter('mix'); // Secondary Osc uses mix param for level
        }
        this.gainNode.gain.linearRampToValueAtTime(finalGain, now + 0.01);
    }

    startOscillator(frequency, time = null) {
        if (!this.isInitialized || !this.getParameter('enabled')) {
             this.stopOscillator(time); // Ensure stopped if disabled
             return;
        }
        const ac = this.engine.state.audioContext;
        const startTime = time !== null ? time : ac.currentTime;

        this.stopOscillator(startTime); // Stop previous instance first

        try {
            this.oscillatorNode = this.createNode('oscillatorNode', 'Oscillator'); // Create new node instance
            this.oscillatorNode.type = this.getParameter('waveform');

            // Apply detune (already handled by audioParam mapping)
            // this.oscillatorNode.detune.setValueAtTime(this.getParameter('detune'), startTime);

            // Calculate frequency with octave shift
            const octaveShift = this.getParameter('octave');
            const finalFrequency = frequency * Math.pow(2, octaveShift);
            this.oscillatorNode.frequency.setValueAtTime(finalFrequency, startTime);

            // Connect oscillator to its gain node
            this.oscillatorNode.connect(this.gainNode);

            this.oscillatorNode.start(startTime);
        } catch (e) {
            console.error(`OscillatorModule (${this.id}): Error starting oscillator`, e);
            this.oscillatorNode = null;
        }
    }

    stopOscillator(time = null) {
        if (!this.oscillatorNode) return;

        const ac = this.engine.state.audioContext;
        const stopTime = time !== null ? time : ac.currentTime;
        try {
            this.oscillatorNode.stop(stopTime);
             // Delay disconnect slightly to avoid potential clicks if stopping exactly now
             setTimeout(() => {
                 try { this.oscillatorNode?.disconnect(); } catch(e) {}
                 // Don't nullify oscillatorNode here, let startOscillator handle replacement
             }, 50);

        } catch (e) {
            // May error if already stopped or context closed
        }
        // Nullify immediately? No, allow startOscillator to replace.
        // this.oscillatorNode = null;
    }

     // Set frequency *while playing* (for portamento/LFO)
     setFrequency(frequency, time = null) {
         if (!this.oscillatorNode || !this.getParameter('enabled')) return;
         const ac = this.engine.state.audioContext;
         const setTime = time !== null ? time : ac.currentTime;
         const octaveShift = this.getParameter('octave');
         const finalFrequency = frequency * Math.pow(2, octaveShift);

         // Use a ramp for smoothness, especially for portamento handled externally
         this.oscillatorNode.frequency.linearRampToValueAtTime(finalFrequency, setTime + 0.01);
     }

     // Override updateParameter to handle specific cases
     updateParameter(paramName, value) {
         super.setParameter(paramName, value); // Use base class to store value and notify ParameterBridge

         // Handle specific actions
         switch (paramName) {
             case 'enabled':
             case 'gain': // Master gain
             case 'mix': // Secondary mix
                 this.applyGain(); // Update the gainNode level
                 // If disabling, also stop the oscillator
                 if (paramName === 'enabled' && !value) {
                     this.stopOscillator();
                 }
                 break;
             case 'waveform':
                 if (this.oscillatorNode) {
                     this.oscillatorNode.type = value;
                 }
                 break;
             case 'octave':
                 // If playing, update frequency immediately
                 if (this.oscillatorNode && this.oscillatorNode.frequency) {
                      const baseFreq = this.oscillatorNode.frequency.value / Math.pow(2, this.getParameter('octave', { ignoreUpdate: true })); // Get base freq without current octave shift
                      this.setFrequency(baseFreq); // Re-apply with new octave shift
                 }
                 break;
             // Detune is handled automatically via audioParam mapping in base class
             case 'detune':
                 break;
         }
     }

    dispose() {
        this.stopOscillator();
        super.dispose(); // Disconnects nodes managed by base class (gainNode)
    }
}