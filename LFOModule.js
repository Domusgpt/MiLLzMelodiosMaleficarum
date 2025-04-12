// sound/modules/LFOModule.js
import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class LFOModule extends AudioModuleBase {
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        this.lfoNode = null;
        this.depthNode = null; // Gain node to control LFO amount
    }

    getDefaultOptions() {
        return {
            rate: 1.0, // Hz
            depth: 0.0, // Modulation amount 0-1 (scaled later)
            waveform: 'sine',
            target: 'none', // Informational, not used for audio connection here
        };
    }

    getInitialParameters() {
        return {
            enabled: true,
            rate: this.options.rate,
            depth: this.options.depth,
            waveform: this.options.waveform,
            target: this.options.target, // Store target info
        };
    }

    getParameterMetadata() {
        return {
            enabled: { type: 'boolean', default: true, description: 'Enable/disable LFO' },
            rate: { type: 'float', min: 0.01, max: 30, default: this.options.rate, description: 'LFO Rate (Hz)', audioParam: 'lfoNode.frequency' },
            depth: { type: 'float', min: 0.0, max: 1.0, default: this.options.depth, description: 'LFO Depth (0-1)', audioParam: 'depthNode.gain' }, // Depth controls gain node
            waveform: { type: 'enum', options: ['sine', 'square', 'sawtooth', 'triangle'], default: this.options.waveform, description: 'LFO Waveform' },
            target: { type: 'string', default: this.options.target, description: 'Modulation Target Info' }, // Informational
        };
    }

    async initialize() {
        if (this.isInitialized) return true;
        this._createModuleNodes();
        // Output of the LFO module IS the depthNode (gain controlled signal)
        this.defineOutput('output', this.depthNode);
        this.updateParameter('enabled', this.getParameter('enabled')); // Apply initial state
        this.isInitialized = true;
        return true;
    }

    _createModuleNodes() {
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;

        // LFO Oscillator - runs continuously
        this.lfoNode = this.createNode('lfoNode', 'Oscillator');
        this.lfoNode.type = this.getParameter('waveform');
        // Rate handled by audioParam mapping
        // this.lfoNode.frequency.setValueAtTime(this.getParameter('rate'), now);
        this.lfoNode.start(now);

        // Depth Control Gain Node
        // LFO output range is -1 to 1. Gain node scales this.
        this.depthNode = this.createNode('depthNode', 'Gain');
        // Depth handled by audioParam mapping
        // this.depthNode.gain.setValueAtTime(this.getParameter('depth'), now);

        // Connect LFO -> Depth Control
        this.lfoNode.connect(this.depthNode);
    }

    updateParameter(paramName, value) {
        super.setParameter(paramName, value); // Store value and handle audioParam if mapped

        switch (paramName) {
            case 'waveform':
                if (this.lfoNode) {
                    this.lfoNode.type = value;
                }
                break;
             case 'enabled':
                 // Control depth gain to enable/disable effect
                 const depth = this.getParameter('depth');
                 this.depthNode?.gain.linearRampToValueAtTime(value ? depth : 0.0, this.engine.getCurrentTime() + 0.01);
                 break;
             case 'depth':
                 // If LFO is disabled, depth change shouldn't turn it on.
                 // AudioParam mapping handles this IF enabled is true.
                 // We need to manually apply if enabled is false (or ensure audioParam mapping handles it)
                 if (!this.getParameter('enabled')) {
                     this.depthNode?.gain.setValueAtTime(0.0, this.engine.getCurrentTime());
                 }
                 // If enabled is true, the audioParam mapping in the base class should handle it.
                 break;
            // Rate is handled by audioParam mapping
            // Target is just informational
        }
    }

    dispose() {
        this.lfoNode?.stop();
        super.dispose(); // Disconnects depthNode output, lfoNode input to depthNode
    }
}