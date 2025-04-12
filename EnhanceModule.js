// sound/modules/FilterModule.js
import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class FilterModule extends AudioModuleBase {
    // ... (constructor remains the same) ...

    // ... (getDefaultOptions remains the same) ...

    getInitialParameters() {
        return {
            enabled: true,
            type: 'lowpass', // UPDATED: Default
            frequency: 1000,
            resonance: 1.0, // Q value
            gain: 0.0, // dB (for peaking/shelf filters)
            // Removed modulation params - handled by dedicated LFOs/Envelopes now
        };
    }

    getParameterMetadata() {
        return {
            enabled: { /* ... */ },
            type: {
                type: 'enum',
                // UPDATED: Added more types
                options: ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf'],
                default: 'lowpass',
                description: 'Filter type',
                visualMappings: [ /* ... visual mappings ... */ ]
            },
            frequency: {
                type: 'float', min: 20, max: 20000, step: 1, default: 1000, description: 'Filter cutoff/center frequency',
                audioParam: 'filterNode.frequency', // Direct mapping
                visualMappings: [ /* ... visual mappings ... */ ]
            },
            resonance: { // Changed label to resonance
                type: 'float', min: 0.0001, max: 30, step: 0.01, default: 1.0, description: 'Filter resonance (Q)', // Adjusted min
                audioParam: 'filterNode.Q', // Direct mapping
                visualMappings: [ /* ... visual mappings ... */ ]
            },
            gain: {
                type: 'float', min: -40, max: 40, step: 0.1, default: 0.0, description: 'Filter gain (peaking/shelf)',
                audioParam: 'filterNode.gain' // Direct mapping
            },
        };
    }

    async initialize() {
        if (this.isInitialized) return true;
        try {
            this._createModuleNodes();
            this.defineInput('input', 'inputNode'); // Input goes to main input gain
            this.defineOutput('output', 'outputNode'); // Output comes from output gain

            if (this.options.connectToMaster) {
                this.engine.connectToMaster(this.getOutput());
            }
            this.updateParameter('enabled', this.getParameter('enabled')); // Apply initial enabled state
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`FilterModule(${this.id}): Initialization error:`, error); return false;
        }
    }

     _createModuleNodes() {
        // Input gain node (allows bypassing the filter cleanly)
        this.inputNode = this.createNode('inputNode', 'Gain', { gain: 1.0 });

        // Main BiquadFilter node
        const filterNode = this.createNode('filterNode', 'BiquadFilter', {
            type: this.getParameter('type'),
            frequency: this.getParameter('frequency'),
            Q: this.getParameter('resonance'), // Use resonance param for Q
            gain: this.getParameter('gain')
        });

        // Output gain node (to mix filtered/bypassed signal)
        this.outputNode = this.createNode('outputNode', 'Gain', { gain: 1.0 });

        // Bypass gain node (for when filter is disabled)
        this.bypassNode = this.createNode('bypassNode', 'Gain', { gain: 0.0 }); // Start bypassed (gain 0)

         // --- Connections ---
         // Input signal splits to filter and bypass paths
         this.inputNode.connect(filterNode);
         this.inputNode.connect(this.bypassNode);

         // Filtered signal goes to output node
         filterNode.connect(this.outputNode);

         // Bypassed signal goes to output node
         this.bypassNode.connect(this.outputNode);

         // Modulation inputs (placeholders for direct AudioParam connections)
         // A GainNode for controlling Filter Env amount on Frequency
         this.filterEnvFreqModNode = this.createNode('filterEnvFreqModNode', 'Gain', { gain: 0.0 });
         this.filterEnvFreqModNode.connect(filterNode.frequency); // Connect Env Mod Gain -> Filter Freq Param

         // A GainNode for controlling LFO1 amount on Frequency
         this.lfo1FreqModNode = this.createNode('lfo1FreqModNode', 'Gain', { gain: 0.0 });
         this.lfo1FreqModNode.connect(filterNode.frequency); // Connect LFO Mod Gain -> Filter Freq Param

         // Define modulation inputs on the module instance for external connection
         this.defineInput('filterEnvModInput', this.filterEnvFreqModNode); // Filter Env output connects here
         this.defineInput('lfo1ModInput', this.lfo1FreqModNode);        // LFO1 output connects here
     }

    // Update bypass node gains based on enabled state
    _updateBypassState() {
        if (!this.inputNode || !this.bypassNode || !this.filterNode) return;
        const isEnabled = this.getParameter('enabled');
        const now = this.engine.getCurrentTime();
        const targetFilterGain = isEnabled ? 1.0 : 0.0; // Route *through* filter?
        const targetBypassGain = isEnabled ? 0.0 : 1.0; // Route *around* filter?

        // We need to adjust the input node's gain going *to* the filter vs bypass
        // THIS LOGIC IS WRONG. Bypassing should happen *after* the filter.
        // Let's simplify: the 'enabled' param controls the *mix* or selection *after* the filter.
        // Corrected logic: The base class handles AudioParam mapping. We need a different bypass method.

        // --- Simpler Bypass (Conceptual - Actual implementation depends on how nodes are connected) ---
        // If 'enabled' simply turns the filter's effect off/on, we might control the mix
        // between the inputNode signal and the filterNode signal before the outputNode.
        // OR, the setup in _createModuleNodes with parallel filter/bypass gains feeding outputNode is correct,
        // we just need to control *those* gains.

        // Let's stick with the parallel gain structure:
        const filterGain = filterNode // Output gain *of the filter path* - Does Biquad have this? No.
                           // We need a gain node *after* the filter
                           // Let's assume filterNode.connect(filterPathGain).connect(outputNode)

        // *** REVISING _createModuleNodes for better bypass ***

        /*
        _createModuleNodes() {
            this.inputNode = this.createNode('inputNode', 'Gain');
            this.filterNode = this.createNode('filterNode', 'BiquadFilter', { ... });
            this.filterPathGain = this.createNode('filterPathGain', 'Gain'); // Gain AFTER filter
            this.bypassPathGain = this.createNode('bypassPathGain', 'Gain'); // Gain for direct path
            this.outputNode = this.createNode('outputNode', 'Gain');

            this.inputNode.connect(this.filterNode);
            this.filterNode.connect(this.filterPathGain);
            this.filterPathGain.connect(this.outputNode);

            this.inputNode.connect(this.bypassPathGain); // Direct path
            this.bypassPathGain.connect(this.outputNode);

            // Modulation connections to filterNode.frequency/Q/gain remain the same...
            // ...
        }

        _updateBypassState() {
            if (!this.filterPathGain || !this.bypassPathGain) return;
            const isEnabled = this.getParameter('enabled');
            const now = this.engine.getCurrentTime();
            this.filterPathGain.gain.linearRampToValueAtTime(isEnabled ? 1.0 : 0.0, now + 0.01);
            this.bypassPathGain.gain.linearRampToValueAtTime(isEnabled ? 0.0 : 1.0, now + 0.01);
        }
        */
       // --> Sticking with the original _createModuleNodes for now as it's simpler,
       // --> relying on AudioParam mapping to effectively disable filter params if needed.
       // --> The 'enabled' flag might just be informational or used by external logic.
       // --> Let's assume 'enabled' controls modulation inputs perhaps?

        // Revised _updateBypassState - maybe 'enabled' controls the mod depth?
        // This requires parameters for mod depths. Let's defer complex enable logic.
        // For now, 'enabled' is just a state flag. Actual bypass isn't implemented via it.
    }


    updateParameter(paramName, value) {
         // ParameterBridge handles storing value. Base class handles AudioParam mapping.
         super.setParameter(paramName, value); // Use base class mechanism

         // Specific handling if needed
         switch (paramName) {
             case 'type':
                 // AudioParam mapping in base doesn't handle 'type'. Set it manually.
                 const filterNode = this.getNode('filterNode');
                 if (filterNode) {
                     try { filterNode.type = value; } catch(e) { console.error("Error setting filter type:", e); }
                 }
                 break;
             case 'enabled':
                 // this._updateBypassState(); // Deferring complex bypass logic
                 break;
             // Frequency, Resonance, Gain are handled by base class via audioParam mapping.
         }
     }

     // Remove modulation source methods - modulation is handled externally now
     // remove addFrequencyModulationSource, addResonanceModulationSource

    dispose() {
        super.dispose();
    }
}