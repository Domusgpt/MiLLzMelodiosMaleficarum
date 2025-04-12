/**
 * FilterModule.js - Audio filtering with visual parameter integration
 * 
 * Handles various filter types, frequency, resonance, and modulation.
 * Includes direct visual parameter mappings for real-time interaction.
 */

import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class FilterModule extends AudioModuleBase {
    /**
     * Create a new FilterModule
     * @param {AudioEngine} engine - The audio engine instance
     * @param {String} id - Unique identifier for this module
     * @param {Object} options - Configuration options
     */
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        
        // Additional module state
        this.state = {
            externalModulation: {
                frequency: {
                    sources: [] // {source, amount}
                },
                resonance: {
                    sources: [] // {source, amount}
                }
            }
        };
    }
    
    /**
     * Get default options for this module
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {
            connectToMaster: false, // Whether to connect directly to master output
            filterNode: null // Allows injecting an existing filter node (for backward compatibility)
        };
    }
    
    /**
     * Get initial parameter values
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {
            enabled: true,
            type: 'lowpass', // lowpass, highpass, bandpass, notch, allpass, peaking, lowshelf, highshelf
            frequency: 1000, // Hz
            resonance: 1.0, // Q value
            gain: 0.0, // dB (for peaking/shelf filters)
            filterEnvAmount: 0.0, // Amount of envelope modulation
            velocitySensitivity: 0.0, // Velocity sensitivity
            keyTracking: 0.0, // Keyboard tracking amount
            frequencyModAmount: 0.0, // Amount of frequency modulation
            resonanceModAmount: 0.0 // Amount of resonance modulation
        };
    }
    
    /**
     * Get parameter metadata including ranges, defaults, and visual mappings
     * @returns {Object} Parameter metadata
     */
    getParameterMetadata() {
        return {
            enabled: {
                type: 'boolean',
                default: true,
                description: 'Enable/disable the filter'
            },
            type: {
                type: 'enum',
                options: ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf'],
                default: 'lowpass',
                description: 'Filter type',
                visualMappings: [
                    { 
                        visualParam: 'geometryMorph', 
                        transform: (val) => {
                            // Map filter type to geometry morphing
                            switch(val) {
                                case 'lowpass': return 0.3;
                                case 'highpass': return 0.7;
                                case 'bandpass': return 0.5;
                                case 'notch': return 0.9;
                                default: return 0.4;
                            }
                        }
                    }
                ]
            },
            frequency: {
                type: 'float',
                min: 20,
                max: 20000,
                step: 1,
                default: 1000,
                description: 'Filter cutoff frequency',
                audioParam: 'filterNode.frequency',
                visualMappings: [
                    { 
                        visualParam: 'gridDensity', 
                        transform: (val) => {
                            // Map frequency to grid density
                            // Use a logarithmic scale since frequency is perceptually logarithmic
                            const normalized = (Math.log(val) - Math.log(20)) / (Math.log(20000) - Math.log(20));
                            return 4 + normalized * 20; // Scale to range 4-24
                        }
                    },
                    { 
                        visualParam: 'universeModifier', 
                        transform: (val) => {
                            // Map frequency to universe modifier (spatial scaling)
                            const normalized = (Math.log(val) - Math.log(20)) / (Math.log(20000) - Math.log(20));
                            return 0.5 + normalized; // Scale to range 0.5-1.5
                        }
                    }
                ]
            },
            resonance: {
                type: 'float',
                min: 0.1,
                max: 30,
                step: 0.1,
                default: 1.0,
                description: 'Filter resonance/Q',
                audioParam: 'filterNode.Q',
                visualMappings: [
                    { 
                        visualParam: 'morphFactor', 
                        transform: (val) => {
                            // Map resonance to morph factor
                            // Normalize to 0-1 range with emphasis on lower values
                            return Math.min(1.0, val / 15);
                        }
                    }
                ]
            },
            gain: {
                type: 'float',
                min: -40,
                max: 40,
                step: 0.1,
                default: 0.0,
                description: 'Filter gain (for peaking/shelf filters)',
                audioParam: 'filterNode.gain'
            },
            filterEnvAmount: {
                type: 'float',
                min: -10000,
                max: 10000,
                step: 1,
                default: 0.0,
                description: 'Filter envelope modulation amount'
            },
            velocitySensitivity: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.0,
                description: 'Velocity to filter cutoff sensitivity'
            },
            keyTracking: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.0,
                description: 'Keyboard tracking amount (0 = none, 1 = 100%)'
            },
            frequencyModAmount: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.0,
                description: 'Amount of frequency modulation',
                visualMappings: [
                    { 
                        visualParam: 'rotationSpeed', 
                        transform: (val) => 0.2 + val * 0.8 // 0.2-1.0 range
                    }
                ]
            },
            resonanceModAmount: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.0,
                description: 'Amount of resonance modulation'
            }
        };
    }
    
    /**
     * Initialize the filter module
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        try {
            // Create module nodes
            this._createModuleNodes();
            
            // Define inputs/outputs
            this.defineInput('input', 'inputNode');
            this.defineOutput('output', 'outputNode');
            
            // Handle direct master connection if specified
            if (this.options.connectToMaster) {
                this.engine.connectToMaster(this.getOutput());
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`FilterModule(${this.id}): Initialization error:`, error);
            return false;
        }
    }
    
    /**
     * Create audio nodes for the module
     * @private
     */
    _createModuleNodes() {
        // Input gain node
        const inputNode = this.createNode('inputNode', 'Gain', { gain: 1.0 });
        
        // Use injected filter or create a new one
        if (this.options.filterNode) {
            this.registerNode('filterNode', this.options.filterNode);
        } else {
            const filterType = this.getParameter('type');
            const frequency = this.getParameter('frequency');
            const resonance = this.getParameter('resonance');
            const gain = this.getParameter('gain');
            
            const filterNode = this.createNode('filterNode', 'BiquadFilter', {
                type: filterType,
                frequency: frequency,
                Q: resonance,
                gain: gain
            });
        }
        
        // Output gain node
        const outputNode = this.createNode('outputNode', 'Gain', { gain: 1.0 });
        
        // Bypass node for when filter is disabled
        const bypassNode = this.createNode('bypassNode', 'Gain', { gain: 0.0 });
        
        // Connect nodes
        inputNode.connect(this.getNode('filterNode'));
        inputNode.connect(bypassNode);
        this.getNode('filterNode').connect(outputNode);
        bypassNode.connect(outputNode);
        
        // Set bypass state based on enabled parameter
        this._updateBypassState();
    }
    
    /**
     * Update bypass node gains based on enabled state
     * @private
     */
    _updateBypassState() {
        const isEnabled = this.getParameter('enabled');
        const filterNode = this.getNode('filterNode');
        const bypassNode = this.getNode('bypassNode');
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        if (isEnabled) {
            // Route through filter, mute bypass
            filterNode.gain?.setValueAtTime(1.0, now);
            bypassNode.gain.setValueAtTime(0.0, now);
        } else {
            // Mute filter, route through bypass
            filterNode.gain?.setValueAtTime(0.0, now);
            bypassNode.gain.setValueAtTime(1.0, now);
        }
    }
    
    /**
     * Set the filter type
     * @param {String} type - Filter type (lowpass, highpass, etc.)
     */
    setFilterType(type) {
        const validTypes = ['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf'];
        
        if (!validTypes.includes(type)) {
            console.warn(`FilterModule(${this.id}): Invalid filter type: ${type}`);
            return;
        }
        
        this.setParameter('type', type);
        
        const filterNode = this.getNode('filterNode');
        if (filterNode) {
            filterNode.type = type;
        }
    }
    
    /**
     * Set filter frequency with optional modulation
     * @param {Number} frequency - Base frequency in Hz
     * @param {Number} envMod - Envelope modulation amount
     * @param {Number} velocity - Note velocity (0-1)
     * @param {Number} noteNumber - MIDI note number for key tracking
     */
    setFilterFrequency(frequency, envMod = 0, velocity = 1, noteNumber = 60) {
        if (!this.isInitialized) return;
        
        // Get modulation parameters
        const envAmount = this.getParameter('filterEnvAmount');
        const velSensitivity = this.getParameter('velocitySensitivity');
        const keyTracking = this.getParameter('keyTracking');
        
        // Calculate modulations
        const envModulation = envMod * envAmount;
        const velocityModulation = (velocity - 0.5) * 2 * velSensitivity * 2000; // +/- 2000 Hz based on velocity
        const keyModulation = (noteNumber - 60) * keyTracking * 50; // 50 Hz per semitone when tracking = 1
        
        // Apply additional modulation sources
        let freqModulation = 0;
        for (const source of this.state.externalModulation.frequency.sources) {
            freqModulation += source.value * source.amount;
        }
        
        // Calculate final frequency
        let finalFreq = frequency + envModulation + velocityModulation + keyModulation + freqModulation;
        finalFreq = Math.max(20, Math.min(20000, finalFreq)); // Clamp to audible range
        
        // Apply to filter
        const filterNode = this.getNode('filterNode');
        if (filterNode && filterNode.frequency) {
            const ac = this.engine.state.audioContext;
            const now = ac.currentTime;
            
            try {
                // Use exponential ramp for more natural frequency changes
                filterNode.frequency.cancelScheduledValues(now);
                
                // Avoid zero crossing issues with exponential ramps
                if (finalFreq <= 0) finalFreq = 20;
                if (filterNode.frequency.value <= 0) filterNode.frequency.value = 20;
                
                filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
                filterNode.frequency.exponentialRampToValueAtTime(finalFreq, now + 0.01);
            } catch (error) {
                // Fallback to direct setting on error
                console.warn(`FilterModule(${this.id}): Error setting frequency, using direct setting:`, error);
                filterNode.frequency.value = finalFreq;
            }
        }
        
        // Update parameter value (without triggering audioParam update again)
        this.setParameter('frequency', frequency, { notifyListeners: false });
        
        return finalFreq;
    }
    
    /**
     * Set filter resonance with optional modulation
     * @param {Number} resonance - Base resonance (Q) value
     */
    setFilterResonance(resonance) {
        if (!this.isInitialized) return;
        
        // Apply additional modulation sources
        let resModulation = 0;
        for (const source of this.state.externalModulation.resonance.sources) {
            resModulation += source.value * source.amount;
        }
        
        // Calculate final resonance
        let finalRes = resonance + resModulation;
        finalRes = Math.max(0.0001, Math.min(30, finalRes)); // Clamp to reasonable range
        
        // Apply to filter
        const filterNode = this.getNode('filterNode');
        if (filterNode && filterNode.Q) {
            const ac = this.engine.state.audioContext;
            const now = ac.currentTime;
            
            try {
                filterNode.Q.cancelScheduledValues(now);
                filterNode.Q.setValueAtTime(filterNode.Q.value, now);
                filterNode.Q.linearRampToValueAtTime(finalRes, now + 0.01);
            } catch (error) {
                // Fallback to direct setting on error
                console.warn(`FilterModule(${this.id}): Error setting resonance, using direct setting:`, error);
                filterNode.Q.value = finalRes;
            }
        }
        
        // Update parameter value (without triggering audioParam update again)
        this.setParameter('resonance', resonance, { notifyListeners: false });
        
        return finalRes;
    }
    
    /**
     * Register an external modulation source for frequency
     * @param {Object} source - Modulation source {id, value, amount}
     * @returns {Function} Function to unregister this source
     */
    addFrequencyModulationSource(source) {
        if (!source || !source.id) {
            console.warn(`FilterModule(${this.id}): Invalid modulation source`);
            return () => {};
        }
        
        // Check if this source already exists
        const existingIndex = this.state.externalModulation.frequency.sources.findIndex(s => s.id === source.id);
        if (existingIndex >= 0) {
            // Update existing source
            this.state.externalModulation.frequency.sources[existingIndex] = source;
        } else {
            // Add new source
            this.state.externalModulation.frequency.sources.push(source);
        }
        
        // Return function to remove this source
        return () => {
            const index = this.state.externalModulation.frequency.sources.findIndex(s => s.id === source.id);
            if (index >= 0) {
                this.state.externalModulation.frequency.sources.splice(index, 1);
            }
        };
    }
    
    /**
     * Register an external modulation source for resonance
     * @param {Object} source - Modulation source {id, value, amount}
     * @returns {Function} Function to unregister this source
     */
    addResonanceModulationSource(source) {
        if (!source || !source.id) {
            console.warn(`FilterModule(${this.id}): Invalid modulation source`);
            return () => {};
        }
        
        // Check if this source already exists
        const existingIndex = this.state.externalModulation.resonance.sources.findIndex(s => s.id === source.id);
        if (existingIndex >= 0) {
            // Update existing source
            this.state.externalModulation.resonance.sources[existingIndex] = source;
        } else {
            // Add new source
            this.state.externalModulation.resonance.sources.push(source);
        }
        
        // Return function to remove this source
        return () => {
            const index = this.state.externalModulation.resonance.sources.findIndex(s => s.id === source.id);
            if (index >= 0) {
                this.state.externalModulation.resonance.sources.splice(index, 1);
            }
        };
    }
    
    /**
     * Update a parameter and apply special handling if needed
     * @param {String} paramName - Name of the parameter
     * @param {*} value - New value
     */
    updateParameter(paramName, value) {
        // Set the parameter
        this.setParameter(paramName, value);
        
        // Handle special parameters
        switch (paramName) {
            case 'enabled':
                this._updateBypassState();
                break;
                
            case 'type':
                const filterNode = this.getNode('filterNode');
                if (filterNode) {
                    filterNode.type = value;
                }
                break;
        }
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Clear modulation sources
        this.state.externalModulation.frequency.sources = [];
        this.state.externalModulation.resonance.sources = [];
        
        super.dispose();
    }
}
