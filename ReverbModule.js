/**
 * ReverbModule.js - Spatial reverberation effect
 * 
 * Creates both algorithmic and convolution-based reverb
 * with visualization integration for spatial representation.
 */

import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class ReverbModule extends AudioModuleBase {
    /**
     * Create a new ReverbModule
     * @param {AudioEngine} engine - The audio engine instance
     * @param {String} id - Unique identifier for this module
     * @param {Object} options - Configuration options
     */
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        
        // Module state
        this.state = {
            type: 'algorithmic', // algorithmic or convolution
            impulseBuffer: null, // Buffer for convolution reverb
            loadingImpulse: false,
            presets: {}, // IR presets
            modulations: new Map() // External modulators
        };
    }
    
    /**
     * Get default options for this module
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {
            type: 'algorithmic', // algorithmic or convolution
            forceOfflineRendering: false, // Whether to force offline rendering for impulse generation
            connectToMaster: false, // Whether to connect directly to master output
            useExistingReverb: false, // Whether to use an existing reverb node (for backcompat)
            maxRenderDuration: 10 // Maximum duration in seconds for impulse rendering
        };
    }
    
    /**
     * Get initial parameter values
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {
            enabled: false, // Whether the reverb is active
            mix: 0.3, // Wet/dry mix (0 = dry, 1 = wet)
            preDelay: 0.01, // Pre-delay in seconds
            decayTime: 2.0, // Reverb decay time in seconds
            diffusion: 0.7, // Diffusion amount (0-1)
            damping: 0.3, // High-frequency damping (0-1)
            brightness: 0.5, // High-frequency content (0-1)
            modulation: 0.1, // Modulation amount (0-1)
            stereoWidth: 0.8, // Stereo width (0-1)
            lowCut: 80, // Low cut frequency in Hz
            highCut: 8000, // High cut frequency in Hz
            irFile: null, // Impulse response file (for convolution)
            irPreset: 'hall', // Preset name for built-in impulse responses
            freeze: false // Whether to freeze current reverb tail
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
                default: false,
                description: 'Enable/disable the reverb effect'
            },
            mix: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.3,
                description: 'Wet/dry mix (0 = dry, 1 = wet)',
                audioParam: { 
                    nodeName: 'wetGain', 
                    paramName: 'gain' 
                }
            },
            preDelay: {
                type: 'float',
                min: 0.0,
                max: 0.5,
                step: 0.001,
                default: 0.01,
                description: 'Pre-delay in seconds',
                audioParam: { 
                    nodeName: 'preDelayNode', 
                    paramName: 'delayTime' 
                }
            },
            decayTime: {
                type: 'float',
                min: 0.1,
                max: 20.0,
                step: 0.1,
                default: 2.0,
                description: 'Reverb decay time in seconds',
                visualMappings: [
                    {
                        visualParam: 'universeModifier',
                        transform: (val) => {
                            // Longer decay = more universe expansion
                            return 0.8 + Math.min(1.0, val / 10.0);
                        }
                    }
                ]
            },
            diffusion: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.7,
                description: 'Diffusion amount'
            },
            damping: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.3,
                description: 'High-frequency damping'
            },
            brightness: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.5,
                description: 'High-frequency content',
                visualMappings: [
                    {
                        visualParam: 'patternIntensity',
                        transform: (val) => 0.6 + val * 0.8
                    }
                ]
            },
            modulation: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.1,
                description: 'Modulation amount'
            },
            stereoWidth: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.8,
                description: 'Stereo width',
                visualMappings: [
                    {
                        visualParam: 'spatialWidth',
                        transform: (val) => val
                    }
                ]
            },
            lowCut: {
                type: 'float',
                min: 20,
                max: 1000,
                step: 1,
                default: 80,
                description: 'Low cut frequency in Hz',
                audioParam: { 
                    nodeName: 'lowCutFilter', 
                    paramName: 'frequency' 
                }
            },
            highCut: {
                type: 'float',
                min: 200,
                max: 20000,
                step: 1,
                default: 8000,
                description: 'High cut frequency in Hz',
                audioParam: { 
                    nodeName: 'highCutFilter', 
                    paramName: 'frequency' 
                }
            },
            irFile: {
                type: 'string',
                default: null,
                description: 'Impulse response file (for convolution)'
            },
            irPreset: {
                type: 'enum',
                options: ['hall', 'room', 'plate', 'chamber', 'spring', 'cave', 'ambience'],
                default: 'hall',
                description: 'Preset name for built-in impulse responses'
            },
            freeze: {
                type: 'boolean',
                default: false,
                description: 'Freeze current reverb tail'
            }
        };
    }
    
    /**
     * Initialize the reverb module
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        try {
            // Store reverb type
            this.state.type = this.options.type || this.getParameter('type') || 'algorithmic';
            
            // Create module nodes
            this._createModuleNodes();
            
            // Define inputs/outputs
            this.defineInput('input', 'inputNode');
            this.defineOutput('output', 'outputNode');
            
            // Initialize the selected reverb type
            if (this.state.type === 'convolution') {
                await this._initializeConvolutionReverb();
            } else {
                await this._initializeAlgorithmicReverb();
            }
            
            // Handle direct master connection if specified
            if (this.options.connectToMaster) {
                this.engine.connectToMaster(this.getOutput());
            }
            
            // Apply initial parameter state
            this._updateBypassState();
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`ReverbModule(${this.id}): Initialization error:`, error);
            return false;
        }
    }
    
    /**
     * Create audio nodes for the module
     * @private
     */
    _createModuleNodes() {
        // Create input and output nodes
        const inputNode = this.createNode('inputNode', 'Gain', { gain: 1.0 });
        const outputNode = this.createNode('outputNode', 'Gain', { gain: 1.0 });
        
        // Create wet/dry mix nodes
        const dryGain = this.createNode('dryGain', 'Gain', { gain: 1.0 - this.getParameter('mix') });
        const wetGain = this.createNode('wetGain', 'Gain', { gain: this.getParameter('mix') });
        
        // Create pre-delay node
        const preDelayNode = this.createNode('preDelayNode', 'Delay', { 
            maxDelayTime: 0.5,
            delayTime: this.getParameter('preDelay')
        });
        
        // Create filters
        const lowCutFilter = this.createNode('lowCutFilter', 'BiquadFilter', {
            type: 'highpass',
            frequency: this.getParameter('lowCut'),
            Q: 0.7
        });
        
        const highCutFilter = this.createNode('highCutFilter', 'BiquadFilter', {
            type: 'lowpass',
            frequency: this.getParameter('highCut'),
            Q: 0.7
        });
        
        // Connect dry path
        inputNode.connect(dryGain);
        dryGain.connect(outputNode);
        
        // Connect wet path input section (filters applied after reverb)
        inputNode.connect(preDelayNode);
        
        // The actual reverb node will be connected in the type-specific initialization methods
    }
    
    /**
     * Initialize algorithmic reverb
     * @returns {Promise<Boolean>} Promise resolving to success state
     * @private
     */
    async _initializeAlgorithmicReverb() {
        const ac = this.engine.state.audioContext;
        
        // Create a network of interconnected delay lines and feedback nodes
        // This is a simplified Freeverb-inspired algorithmic reverb
        
        // Create parallel delay lines (feedback comb filters)
        const numCombs = 8;
        const combDelayTimes = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map(x => x / 44100); // in seconds
        const combNodes = [];
        const combFeedbacks = [];
        
        for (let i = 0; i < numCombs; i++) {
            const delay = this.createNode(`combDelay${i}`, 'Delay', { 
                maxDelayTime: combDelayTimes[i] * 1.5,
                delayTime: combDelayTimes[i]
            });
            
            const feedback = this.createNode(`combFeedback${i}`, 'Gain', { 
                gain: 0.84 // Initial feedback gain
            });
            
            const damping = this.createNode(`combDamping${i}`, 'BiquadFilter', {
                type: 'lowpass',
                frequency: 2000,
                Q: 0.7
            });
            
            // Connect the feedback loop
            delay.connect(damping);
            damping.connect(feedback);
            feedback.connect(delay);
            
            // Connect the pre-delay to each comb input
            this.getNode('preDelayNode').connect(delay);
            
            combNodes.push(delay);
            combFeedbacks.push(feedback);
        }
        
        // Create all-pass filters for diffusion
        const numAllPasses = 4;
        const allPassDelayTimes = [225, 556, 441, 341].map(x => x / 44100); // in seconds
        const allPasses = [];
        
        // Create mixer for combining comb outputs
        const combMixer = this.createNode('combMixer', 'Gain', { gain: 1.0 / numCombs });
        
        // Connect all combs to the mixer
        for (let i = 0; i < numCombs; i++) {
            combNodes[i].connect(combMixer);
        }
        
        let lastNode = combMixer;
        
        // Create and connect the all-pass filters in series
        for (let i = 0; i < numAllPasses; i++) {
            const allPass = ac.createIIRFilter(
                // Feedforward coefficients: [1, 0, -g]
                [1, 0, -0.5],
                // Feedback coefficients: [g, 0, 1]
                [0.5, 0, 1]
            );
            
            // Create a wrapper gain node for connecting
            const allPassWrapper = this.createNode(`allPass${i}`, 'Gain', { gain: 1.0 });
            this.registerNode(`allPassFilter${i}`, allPass);
            
            // Create delay for the all-pass
            const allPassDelay = this.createNode(`allPassDelay${i}`, 'Delay', {
                maxDelayTime: allPassDelayTimes[i] * 1.5,
                delayTime: allPassDelayTimes[i]
            });
            
            // Connect to previous stage
            lastNode.connect(allPassWrapper);
            allPassWrapper.connect(allPass);
            allPass.connect(allPassDelay);
            
            lastNode = allPassDelay;
            allPasses.push(allPass);
        }
        
        // Connect to final processing chain
        lastNode.connect(this.getNode('lowCutFilter'));
        this.getNode('lowCutFilter').connect(this.getNode('highCutFilter'));
        this.getNode('highCutFilter').connect(this.getNode('wetGain'));
        this.getNode('wetGain').connect(this.getNode('outputNode'));
        
        // Store node references for parameter updates
        this.registerNode('algorithmicReverb', lastNode);
        this.state.combFeedbacks = combFeedbacks;
        this.state.combDelays = combNodes;
        this.state.allPasses = allPasses;
        
        // Update parameters to match initial values
        this._updateAlgorithmicReverbParams();
        
        return true;
    }
    
    /**
     * Initialize convolution reverb
     * @returns {Promise<Boolean>} Promise resolving to success state
     * @private
     */
    async _initializeConvolutionReverb() {
        const ac = this.engine.state.audioContext;
        
        // Check if using an existing reverb node
        if (this.options.useExistingReverb && this.options.reverbNode) {
            this.registerNode('convolver', this.options.reverbNode);
        } else {
            // Create new convolver node
            const convolver = this.createNode('convolver', 'Convolver');
            
            // Connect convolver to filter chain
            this.getNode('preDelayNode').connect(convolver);
            convolver.connect(this.getNode('lowCutFilter'));
        }
        
        // Complete the signal chain
        this.getNode('lowCutFilter').connect(this.getNode('highCutFilter'));
        this.getNode('highCutFilter').connect(this.getNode('wetGain'));
        this.getNode('wetGain').connect(this.getNode('outputNode'));
        
        // Load the initial impulse response
        const irPreset = this.getParameter('irPreset');
        const irFile = this.getParameter('irFile');
        
        if (irFile) {
            // External IR file takes precedence
            await this.loadImpulseResponseFile(irFile);
        } else {
            // Otherwise load the selected preset
            await this.loadImpulseResponsePreset(irPreset);
        }
        
        return true;
    }
    
    /**
     * Update bypass routing based on enabled state
     * @private
     */
    _updateBypassState() {
        const isEnabled = this.getParameter('enabled');
        const dryGain = this.getNode('dryGain');
        const wetGain = this.getNode('wetGain');
        
        if (!dryGain || !wetGain) return;
        
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        if (isEnabled) {
            // Apply wet/dry mix
            const mix = this.getParameter('mix');
            dryGain.gain.setValueAtTime(1.0 - mix, now);
            wetGain.gain.setValueAtTime(mix, now);
        } else {
            // Bypass effect (all dry, no wet)
            dryGain.gain.setValueAtTime(1.0, now);
            wetGain.gain.setValueAtTime(0.0, now);
        }
        
        // Handle freeze state
        this._updateFreezeState();
    }
    
    /**
     * Update algorithm reverb parameters based on current values
     * @private
     */
    _updateAlgorithmicReverbParams() {
        if (this.state.type !== 'algorithmic') return;
        
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        // Get parameters
        const decayTime = this.getParameter('decayTime');
        const diffusion = this.getParameter('diffusion');
        const damping = this.getParameter('damping');
        const brightness = this.getParameter('brightness');
        const modulation = this.getParameter('modulation');
        const stereoWidth = this.getParameter('stereoWidth');
        
        // Update feedback gain for comb filters based on decay time
        // The relationship between decay time and feedback is logarithmic
        for (let i = 0; i < this.state.combFeedbacks.length; i++) {
            const delay = this.state.combDelays[i];
            const feedback = this.state.combFeedbacks[i];
            
            if (!delay || !feedback) continue;
            
            // Calculate feedback gain from decay time (simplified formula)
            // RT60 = -3 * delayTime / log10(feedback)
            const delayTime = delay.delayTime.value;
            const feedbackGain = Math.pow(10, -3.0 * delayTime / decayTime);
            
            // Apply feedback gain (clamped to prevent runaway)
            const safeGain = Math.min(0.98, Math.max(0, feedbackGain));
            feedback.gain.setValueAtTime(safeGain, now);
            
            // Apply damping filter frequency based on damping parameter
            const dampingNode = this.getNode(`combDamping${i}`);
            if (dampingNode) {
                // Map damping parameter to filter frequency (high damping = low frequency)
                const dampingFreq = 20000 * Math.pow(1.0 - damping, 2) + 200;
                dampingNode.frequency.setValueAtTime(dampingFreq, now);
            }
        }
        
        // Update all-pass feedback gain for diffusion
        for (let i = 0; i < this.state.allPasses.length; i++) {
            const allPass = this.state.allPasses[i];
            if (!allPass) continue;
            
            // Currently we can't dynamically change IIR filter coefficients
            // This would require re-creating the all-pass filters
        }
        
        // Update stereo width processing (if applicable)
        // For true stereo width, we'd need more complex matrix processing
        
        // Brightness is handled through the high cut filter
        const highCutFilter = this.getNode('highCutFilter');
        if (highCutFilter) {
            // Map brightness parameter to high cut frequency
            const highCutFreq = 2000 + 18000 * brightness;
            highCutFilter.frequency.setValueAtTime(highCutFreq, now);
        }
    }
    
    /**
     * Update freeze state
     * @private
     */
    _updateFreezeState() {
        const freeze = this.getParameter('freeze');
        
        if (!this.isInitialized) return;
        
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        if (this.state.type === 'algorithmic') {
            // For algorithmic reverb, set feedback to near-infinite
            for (let i = 0; i < this.state.combFeedbacks.length; i++) {
                const feedback = this.state.combFeedbacks[i];
                if (!feedback) continue;
                
                if (freeze) {
                    feedback.gain.setValueAtTime(0.99, now); // Just under unity to prevent runaway
                } else {
                    // Restore normal feedback for current decay time
                    this._updateAlgorithmicReverbParams();
                }
            }
            
            // In freeze mode, disconnect the input to prevent new sound
            const preDelayNode = this.getNode('preDelayNode');
            if (preDelayNode) {
                if (freeze) {
                    // Temporarily reduce gain to near-zero instead of disconnecting
                    // as disconnecting/reconnecting might cause clicks
                    preDelayNode.gain.setValueAtTime(0.0001, now);
                } else {
                    preDelayNode.gain.setValueAtTime(1.0, now);
                }
            }
        } else {
            // For convolution reverb, freezing is more complex
            // One approach is to capture the current impulse response and loop it
            console.warn(`ReverbModule(${this.id}): Freeze not fully implemented for convolution reverb`);
        }
    }
    
    /**
     * Load an impulse response file for convolution reverb
     * @param {String|ArrayBuffer} irFile - URL to impulse response file or ArrayBuffer containing audio data
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async loadImpulseResponseFile(irFile) {
        if (!this.isInitialized || this.state.type !== 'convolution') {
            return false;
        }
        
        // Don't load if already loading
        if (this.state.loadingImpulse) {
            return false;
        }
        
        this.state.loadingImpulse = true;
        
        try {
            const ac = this.engine.state.audioContext;
            const convolver = this.getNode('convolver');
            
            if (!convolver) {
                throw new Error('Convolver node not found');
            }
            
            let buffer;
            
            if (typeof irFile === 'string') {
                // Load from URL
                const response = await fetch(irFile);
                if (!response.ok) {
                    throw new Error(`Failed to fetch impulse response: ${response.status} ${response.statusText}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                buffer = await ac.decodeAudioData(arrayBuffer);
            } else if (irFile instanceof ArrayBuffer) {
                // Use provided ArrayBuffer
                buffer = await ac.decodeAudioData(irFile);
            } else {
                throw new Error('Invalid impulse response file format');
            }
            
            // Store the buffer
            this.state.impulseBuffer = buffer;
            
            // Set the convolver buffer
            convolver.buffer = buffer;
            
            // Update parameter value
            if (typeof irFile === 'string') {
                this.setParameter('irFile', irFile, { notifyListeners: false });
            }
            
            this.state.loadingImpulse = false;
            return true;
        } catch (error) {
            console.error(`ReverbModule(${this.id}): Error loading impulse response:`, error);
            this.state.loadingImpulse = false;
            return false;
        }
    }
    
    /**
     * Load a built-in impulse response preset
     * @param {String} presetName - Name of the preset
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async loadImpulseResponsePreset(presetName) {
        if (!this.isInitialized || this.state.type !== 'convolution') {
            return false;
        }
        
        // Generate algorithmic IR for the preset
        try {
            const buffer = await this._generateImpulseResponse(presetName);
            if (!buffer) {
                throw new Error(`Failed to generate impulse response for preset: ${presetName}`);
            }
            
            // Set the convolver buffer
            const convolver = this.getNode('convolver');
            if (!convolver) {
                throw new Error('Convolver node not found');
            }
            
            convolver.buffer = buffer;
            
            // Store the buffer
            this.state.impulseBuffer = buffer;
            
            // Update parameter value
            this.setParameter('irPreset', presetName, { notifyListeners: false });
            
            return true;
        } catch (error) {
            console.error(`ReverbModule(${this.id}): Error loading impulse response preset:`, error);
            return false;
        }
    }
    
    /**
     * Generate an impulse response algorithmically
     * @param {String} presetName - Name of the preset
     * @returns {Promise<AudioBuffer>} Promise resolving to the generated impulse response
     * @private
     */
    async _generateImpulseResponse(presetName) {
        // Get parameters for the preset
        const presetParams = this._getPresetParameters(presetName);
        
        // Create offline context for rendering
        const duration = presetParams.decayTime + presetParams.preDelay + 0.1;
        const sampleRate = this.engine.state.audioContext.sampleRate;
        
        // Decide whether to use offline rendering or real-time
        const useOffline = this.options.forceOfflineRendering || duration > 1.0;
        
        if (useOffline) {
            // Use OfflineAudioContext for more efficient rendering
            return this._generateImpulseOffline(presetParams, duration, sampleRate);
        } else {
            // Use real-time rendering for short IRs
            return this._generateImpulseRealtime(presetParams, duration, sampleRate);
        }
    }
    
    /**
     * Generate impulse response using OfflineAudioContext
     * @param {Object} params - Reverb parameters
     * @param {Number} duration - Duration in seconds
     * @param {Number} sampleRate - Sample rate in Hz
     * @returns {Promise<AudioBuffer>} Promise resolving to the generated impulse response
     * @private
     */
    async _generateImpulseOffline(params, duration, sampleRate) {
        try {
            // Create offline context
            const offlineContext = new OfflineAudioContext({
                numberOfChannels: 2,
                length: Math.ceil(duration * sampleRate),
                sampleRate: sampleRate
            });
            
            // Create nodes
            const impulseNode = offlineContext.createBufferSource();
            const preDelayNode = offlineContext.createDelay(0.5);
            const reverbNode = offlineContext.createConvolver();
            
            // Create filters
            const lowCutFilter = offlineContext.createBiquadFilter();
            lowCutFilter.type = 'highpass';
            lowCutFilter.frequency.value = params.lowCut;
            lowCutFilter.Q.value = 0.7;
            
            const highCutFilter = offlineContext.createBiquadFilter();
            highCutFilter.type = 'lowpass';
            highCutFilter.frequency.value = params.highCut;
            highCutFilter.Q.value = 0.7;
            
            // Create parallel comb filters and all-pass filters as in algorithmic reverb
            const combNodes = [];
            const combDelayTimes = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map(x => x / 44100);
            const combFeedbackValues = [];
            
            for (let i = 0; i < combDelayTimes.length; i++) {
                const delayTime = combDelayTimes[i];
                const delay = offlineContext.createDelay(delayTime * 1.5);
                delay.delayTime.value = delayTime;
                
                const feedback = offlineContext.createGain();
                
                // Calculate feedback from decay time
                const feedbackGain = Math.pow(10, -3.0 * delayTime / params.decayTime);
                const safeGain = Math.min(0.98, Math.max(0, feedbackGain));
                feedback.gain.value = safeGain;
                combFeedbackValues.push(safeGain);
                
                const damping = offlineContext.createBiquadFilter();
                damping.type = 'lowpass';
                damping.frequency.value = 20000 * Math.pow(1.0 - params.damping, 2) + 200;
                damping.Q.value = 0.7;
                
                // Connect loop
                delay.connect(damping);
                damping.connect(feedback);
                feedback.connect(delay);
                
                combNodes.push(delay);
            }
            
            // Create impulse
            const impulseBuffer = offlineContext.createBuffer(1, 2, sampleRate);
            const impulseData = impulseBuffer.getChannelData(0);
            impulseData[0] = 1; // Single sample impulse
            
            // Set buffer and connect
            impulseNode.buffer = impulseBuffer;
            
            // Connect input chain
            impulseNode.connect(preDelayNode);
            preDelayNode.delayTime.value = params.preDelay;
            
            // Connect each comb filter
            const combMixer = offlineContext.createGain();
            combMixer.gain.value = 1.0 / combNodes.length;
            
            for (let i = 0; i < combNodes.length; i++) {
                preDelayNode.connect(combNodes[i]);
                combNodes[i].connect(combMixer);
            }
            
            // Create all-pass filters for diffusion
            const allPassDelayTimes = [225, 556, 441, 341].map(x => x / 44100);
            let lastNode = combMixer;
            
            for (let i = 0; i < allPassDelayTimes.length; i++) {
                const allPassDelay = offlineContext.createDelay(allPassDelayTimes[i] * 1.5);
                allPassDelay.delayTime.value = allPassDelayTimes[i];
                
                try {
                    // Try to create IIR filter for all-pass
                    const allPass = offlineContext.createIIRFilter(
                        [1, 0, -(0.2 + params.diffusion * 0.5)], // Feedforward
                        [(0.2 + params.diffusion * 0.5), 0, 1]   // Feedback
                    );
                    
                    lastNode.connect(allPass);
                    allPass.connect(allPassDelay);
                    lastNode = allPassDelay;
                } catch (e) {
                    // IIR filter not supported, use simpler alternative
                    lastNode.connect(allPassDelay);
                    lastNode = allPassDelay;
                }
            }
            
            // Connect output chain
            lastNode.connect(lowCutFilter);
            lowCutFilter.connect(highCutFilter);
            highCutFilter.connect(offlineContext.destination);
            
            // Start rendering
            impulseNode.start(0);
            const renderedBuffer = await offlineContext.startRendering();
            
            return renderedBuffer;
        } catch (error) {
            console.error(`ReverbModule(${this.id}): Error generating offline impulse:`, error);
            
            // Fallback to real-time if offline fails
            console.warn(`ReverbModule(${this.id}): Falling back to real-time impulse generation`);
            return this._generateImpulseRealtime(params, duration, sampleRate);
        }
    }
    
    /**
     * Generate impulse response using real-time audio context
     * @param {Object} params - Reverb parameters
     * @param {Number} duration - Duration in seconds
     * @param {Number} sampleRate - Sample rate in Hz
     * @returns {Promise<AudioBuffer>} Promise resolving to the generated impulse response
     * @private
     */
    async _generateImpulseRealtime(params, duration, sampleRate) {
        // For short IRs, we can use a simpler approach with noise burst
        const ac = this.engine.state.audioContext;
        
        // Create a buffer for the IR
        const length = Math.ceil(duration * sampleRate);
        const buffer = ac.createBuffer(2, length, sampleRate);
        
        // Calculate exponential decay
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            
            // Apply pre-delay
            const preDelaySamples = Math.floor(params.preDelay * sampleRate);
            
            // Density of early reflections
            const earlyScale = params.diffusion;
            
            // Generate early reflections
            for (let i = preDelaySamples; i < preDelaySamples + 4000; i++) {
                if (i < length) {
                    // Random early reflections with gradual density
                    const earlyReflection = (Math.random() * 2 - 1) * 
                                           Math.exp(-(i - preDelaySamples) / 1000) * 
                                           earlyScale * 
                                           (1 - params.damping);
                    data[i] = earlyReflection;
                }
            }
            
            // Decay time in samples
            const decaySamples = params.decayTime * sampleRate;
            
            // Modulation (vibrato) parameters
            const modRate = 2 + params.modulation * 10; // Hz
            const modDepth = params.modulation * 0.002; // Seconds
            
            // Apply exponential decay for late reverb
            for (let i = preDelaySamples; i < length; i++) {
                // Calculate time position
                const timeSec = i / sampleRate;
                
                // Calculate modulation
                const vibrato = Math.sin(2 * Math.PI * modRate * timeSec) * modDepth * sampleRate;
                
                // Add stereo spread by offsetting channels
                const offset = channel === 1 ? 
                              Math.floor(params.stereoWidth * 0.5 * sampleRate) : 0;
                
                // Calculate sample position with modulation and offset
                const samplePos = i + Math.floor(vibrato) + offset;
                
                if (samplePos >= 0 && samplePos < length) {
                    // Random noise with exponential decay
                    const noise = (Math.random() * 2 - 1) * 0.1;
                    const decay = Math.exp(-(i - preDelaySamples) / decaySamples);
                    
                    // Add colorization based on brightness (simple EQ)
                    const brightness = params.brightness;
                    const colorFilter = 1.0 - (1.0 - brightness) * (i / length);
                    
                    data[samplePos] += noise * decay * colorFilter;
                }
            }
            
            // Normalize the buffer
            let maxVal = 0;
            for (let i = 0; i < length; i++) {
                maxVal = Math.max(maxVal, Math.abs(data[i]));
            }
            
            if (maxVal > 0) {
                for (let i = 0; i < length; i++) {
                    data[i] = data[i] / maxVal * 0.8; // Scale to avoid clipping
                }
            }
        }
        
        return buffer;
    }
    
    /**
     * Get parameters for a built-in preset
     * @param {String} presetName - Name of the preset
     * @returns {Object} Preset parameters
     * @private
     */
    _getPresetParameters(presetName) {
        const presets = {
            hall: {
                decayTime: 3.0,
                preDelay: 0.02,
                diffusion: 0.7,
                damping: 0.2,
                brightness: 0.6,
                modulation: 0.1,
                stereoWidth: 0.8,
                lowCut: 80,
                highCut: 9000
            },
            room: {
                decayTime: 1.5,
                preDelay: 0.01,
                diffusion: 0.6,
                damping: 0.4,
                brightness: 0.5,
                modulation: 0.05,
                stereoWidth: 0.7,
                lowCut: 100,
                highCut: 8000
            },
            plate: {
                decayTime: 2.0,
                preDelay: 0.0,
                diffusion: 0.9,
                damping: 0.1,
                brightness: 0.75,
                modulation: 0.15,
                stereoWidth: 0.9,
                lowCut: 120,
                highCut: 12000
            },
            chamber: {
                decayTime: 1.2,
                preDelay: 0.01,
                diffusion: 0.8,
                damping: 0.3,
                brightness: 0.4,
                modulation: 0.05,
                stereoWidth: 0.5,
                lowCut: 130,
                highCut: 7000
            },
            spring: {
                decayTime: 2.5,
                preDelay: 0.0,
                diffusion: 0.3,
                damping: 0.6,
                brightness: 0.3,
                modulation: 0.8,
                stereoWidth: 0.5,
                lowCut: 400,
                highCut: 5000
            },
            cave: {
                decayTime: a5.0,
                preDelay: 0.05,
                diffusion: 0.9,
                damping: 0.6,
                brightness: 0.2,
                modulation: 0.3,
                stereoWidth: 0.9,
                lowCut: 60,
                highCut: 4000
            },
            ambience: {
                decayTime: 0.8,
                preDelay: 0.0,
                diffusion: 0.5,
                damping: 0.2,
                brightness: 0.8,
                modulation: 0.05,
                stereoWidth: 0.95,
                lowCut: 200,
                highCut: 16000
            }
        };
        
        return presets[presetName] || presets.hall;
    }
    
    /**
     * Update a parameter and apply special handling if needed
     * @param {String} paramName - Name of the parameter
     * @param {*} value - New value
     */
    updateParameter(paramName, value) {
        // Store original value
        const originalValue = this.getParameter(paramName);
        
        // Set the parameter
        this.setParameter(paramName, value);
        
        // Handle special cases
        switch (paramName) {
            case 'enabled':
                this._updateBypassState();
                break;
                
            case 'mix':
                // Handled by audioParam mapping
                break;
                
            case 'preDelay':
                // Handled by audioParam mapping
                break;
                
            case 'decayTime':
                if (this.state.type === 'algorithmic') {
                    this._updateAlgorithmicReverbParams();
                }
                break;
                
            case 'diffusion':
            case 'damping':
            case 'brightness':
            case 'modulation':
            case 'stereoWidth':
                if (this.state.type === 'algorithmic') {
                    this._updateAlgorithmicReverbParams();
                }
                break;
                
            case 'lowCut':
            case 'highCut':
                // Handled by audioParam mapping
                break;
                
            case 'irFile':
                if (this.state.type === 'convolution' && value !== originalValue) {
                    this.loadImpulseResponseFile(value);
                }
                break;
                
            case 'irPreset':
                if (this.state.type === 'convolution' && value !== originalValue) {
                    this.loadImpulseResponsePreset(value);
                }
                break;
                
            case 'freeze':
                this._updateFreezeState();
                break;
        }
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Clear impulse buffer
        this.state.impulseBuffer = null;
        
        // Clear references
        this.state.combFeedbacks = null;
        this.state.combDelays = null;
        this.state.allPasses = null;
        
        super.dispose();
    }
}