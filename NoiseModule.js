// sound/modules/NoiseModule.js
import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class NoiseModule extends AudioModuleBase {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.noiseNode = null; // BufferSourceNode
        this.gainNode = null;
        this.noiseBuffer = null; // Store the buffer
    }

    getDefaultOptions() {
        return {
            type: 'white', // white or pink
            gain: 0.0,
            enabled: false,
        };
    }

    getInitialParameters() {
        return {
            enabled: this.options.enabled,
            type: this.options.type,
            gain: this.options.gain,
        };
    }

    getParameterMetadata() {
        return {
            enabled: { type: 'boolean', default: this.options.enabled, description: 'Enable/disable noise source' },
            type: { type: 'enum', options: ['white', 'pink'], default: this.options.type, description: 'Noise color' },
            gain: { type: 'float', min: 0.0, max: 1.0, default: this.options.gain, description: 'Noise level', audioParam: 'gainNode.gain' },
        };
    }

    async initialize() {
        if (this.isInitialized) return true;
        this._createNoiseBuffer();
        this._createModuleNodes();
        this.defineOutput('output', this.gainNode);
        this.updateParameter('enabled', this.getParameter('enabled')); // Apply initial state
        this.isInitialized = true;
        return true;
    }

    _createNoiseBuffer() {
        const ac = this.engine.state.audioContext;
        const bufferSize = ac.sampleRate * 2; // 2 seconds of noise
        this.noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);

        const noiseType = this.getParameter('type');

        if (noiseType === 'pink') {
            // Simple pink noise approximation (Voss-McCartney)
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11; // Adjust gain
                b6 = white * 0.115926;
            }
        } else { // White noise
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }
    }

    _createModuleNodes() {
        // Gain node controls output level
        this.gainNode = this.createNode('gainNode', 'Gain');
        // Gain handled by audioParam mapping

        // BufferSourceNode will be created/destroyed on enable/disable
        this.noiseNode = null;
    }

    _startNoise() {
        if (!this.isInitialized || this.noiseNode || !this.noiseBuffer) return; // Don't start if already running or no buffer
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;

        this.noiseNode = this.createNode('noiseNode', 'BufferSource');
        this.noiseNode.buffer = this.noiseBuffer;
        this.noiseNode.loop = true;
        this.noiseNode.connect(this.gainNode); // Connect to gain control
        this.noiseNode.start(now);
    }

    _stopNoise() {
        if (!this.noiseNode) return;
        const now = this.engine.getCurrentTime();
        try {
            this.noiseNode.stop(now);
        } catch (e) {}
        // Disconnect immediately after stopping
        try { this.noiseNode.disconnect(); } catch(e) {}
        this.noiseNode = null; // Allow restarting
    }

    updateParameter(paramName, value) {
        super.setParameter(paramName, value); // Store value and handle audioParam

        switch (paramName) {
            case 'enabled':
                if (value) {
                    this._startNoise();
                } else {
                    this._stopNoise();
                }
                 // Also ensure gain reflects enabled state
                 const gain = this.getParameter('gain');
                 this.gainNode?.gain.linearRampToValueAtTime(value ? gain : 0.0, this.engine.getCurrentTime() + 0.01);
                 break;
             case 'gain':
                 // If enabled is false, gain change shouldn't turn it on.
                 // AudioParam mapping handles this if enabled=true.
                 if (!this.getParameter('enabled')) {
                     this.gainNode?.gain.setValueAtTime(0.0, this.engine.getCurrentTime());
                 }
                 break;
            case 'type':
                // Recreate buffer and restart node if type changes while enabled
                this._createNoiseBuffer();
                if (this.getParameter('enabled')) {
                    this._stopNoise();
                    this._startNoise();
                }
                break;
        }
    }

    dispose() {
        this._stopNoise();
        super.dispose(); // Disconnects gainNode output
    }
}