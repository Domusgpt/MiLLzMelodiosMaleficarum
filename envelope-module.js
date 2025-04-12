/**
 * EnvelopeModule.js - ADSR envelope generator with visual parameter mapping
 * 
 * Creates envelope curves to control amplitude, filter, and other
 * parameters over time. Includes visualization mappings for interactive feedback.
 */

import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class EnvelopeModule extends AudioModuleBase {
    /**
     * Create a new EnvelopeModule
     * @param {AudioEngine} engine - The audio engine instance
     * @param {String} id - Unique identifier for this module
     * @param {Object} options - Configuration options
     */
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        
        // Module state
        this.state = {
            isActive: false,
            startTime: 0,
            releaseTime: 0,
            currentStage: 'idle', // idle, attack, decay, sustain, release
            targetNodes: new Map(), // Map of nodes to control with this envelope
            lastValue: 0, // Last computed envelope value
            velocityValue: 1.0, // Current velocity value (0-1)
            gate: false, // Gate state (on/off)
            modulations: new Map() // External modulators affecting envelope parameters
        };
    }
    
    /**
     * Get default options for this module
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {
            type: 'amplitude', // amplitude, filter, pitch, etc.
            shape: 'exponential', // linear, exponential
            createGainNode: true, // Whether to create an internal gain node for amplitude control
            customOutputRange: null // Custom output range [min, max] (optional)
        };
    }
    
    /**
     * Get initial parameter values
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {
            attack: 0.05, // seconds
            decay: 0.1, // seconds
            sustain: 0.7, // 0-1 level
            release: 0.5, // seconds
            velocitySensitivity: 0.5, // 0-1 amount
            velocityCurve: 0.5, // 0-1 (0 = more linear, 1 = more exponential)
            attackCurve: 0.5, // 0-1 (0 = more linear, 1 = more exponential)
            releaseCurve: 0.5, // 0-1 (0 = more linear, 1 = more exponential)
            amount: 1.0, // 0-1 total envelope amount
            inverted: false, // Whether envelope is inverted
            loopEnabled: false, // Whether envelope should loop
            loopStart: 0, // Loop start point (0 = attack, 1 = end of decay)
            loopEnd: 3, // Loop end point (2 = end of sustain, 3 = end of release)
            outputMin: 0.0, // Minimum output value
            outputMax: 1.0, // Maximum output value
            bipolar: false // Whether envelope is bipolar (-1 to 1) instead of unipolar (0 to 1)
        };
    }
    
    /**
     * Get parameter metadata including ranges, defaults, and visual mappings
     * @returns {Object} Parameter metadata
     */
    getParameterMetadata() {
        return {
            attack: {
                type: 'float',
                min: 0.001,
                max: 10.0,
                step: 0.001,
                default: 0.05,
                description: 'Attack time in seconds',
                visualMappings: [
                    { 
                        visualParam: 'rotationSpeed', 
                        transform: (val) => {
                            // Slower attack = faster rotation
                            return 0.05 + (1.0 - Math.min(1.0, val / 2.0)) * 0.7;
                        }
                    }
                ]
            },
            decay: {
                type: 'float',
                min: 0.001,
                max: 10.0,
                step: 0.001,
                default: 0.1,
                description: 'Decay time in seconds'
            },
            sustain: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.7,
                description: 'Sustain level (0-1)',
                visualMappings: [
                    {
                        visualParam: 'patternIntensity',
                        transform: (val) => 0.5 + val * 0.5
                    }
                ]
            },
            release: {
                type: 'float',
                min: 0.001,
                max: 20.0,
                step: 0.001,
                default: 0.5,
                description: 'Release time in seconds',
                visualMappings: [
                    {
                        visualParam: 'universeModifier',
                        transform: (val) => {
                            // Longer release = more universe expansion
                            return 0.9 + Math.min(0.6, val / 10.0);
                        }
                    }
                ]
            },
            velocitySensitivity: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.5,
                description: 'Velocity sensitivity (0-1)'
            },
            velocityCurve: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.5,
                description: 'Velocity response curve (0 = linear, 1 = exponential)'
            },
            attackCurve: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.5,
                description: 'Attack curve shape (0 = linear, 1 = exponential)'
            },
            releaseCurve: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 0.5,
                description: 'Release curve shape (0 = linear, 1 = exponential)'
            },
            amount: {
                type: 'float',
                min: 0.0,
                max: 1.0,
                step: 0.01,
                default: 1.0,
                description: 'Overall envelope amount (0-1)'
            },
            inverted: {
                type: 'boolean',
                default: false,
                description: 'Whether envelope is inverted (1->0 instead of 0->1)'
            },
            loopEnabled: {
                type: 'boolean',
                default: false,
                description: 'Enable envelope looping'
            },
            loopStart: {
                type: 'float',
                min: 0.0,
                max: 3.0,
                step: 0.01,
                default: 0.0,
                description: 'Loop start point (0 = attack, 1 = decay, 2 = sustain, 3 = release)'
            },
            loopEnd: {
                type: 'float',
                min: 0.0,
                max: 3.0,
                step: 0.01,
                default: 3.0,
                description: 'Loop end point (0 = attack, 1 = decay, 2 = sustain, 3 = release)'
            },
            outputMin: {
                type: 'float',
                min: -10.0,
                max: 10.0,
                step: 0.01,
                default: 0.0,
                description: 'Minimum output value'
            },
            outputMax: {
                type: 'float',
                min: -10.0,
                max: 10.0,
                step: 0.01,
                default: 1.0,
                description: 'Maximum output value'
            },
            bipolar: {
                type: 'boolean',
                default: false,
                description: 'Whether envelope is bipolar (-1 to 1) instead of unipolar (0 to 1)'
            }
        };
    }
    
    /**
     * Initialize the envelope module
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        try {
            // Create module nodes if needed
            if (this.options.createGainNode) {
                this._createModuleNodes();
            }
            
            // Define outputs if we created nodes
            if (this.nodes.has('outputNode')) {
                this.defineInput('input', 'inputNode');
                this.defineOutput('output', 'outputNode');
            }
            
            // Set custom output range if provided
            if (this.options.customOutputRange) {
                const [min, max] = this.options.customOutputRange;
                this.setParameter('outputMin', min);
                this.setParameter('outputMax', max);
            }
            
            // Set up looping if enabled
            if (this.getParameter('loopEnabled')) {
                this._setupLooping();
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`EnvelopeModule(${this.id}): Initialization error:`, error);
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
        
        // Envelope-controlled gain node
        const envelopeNode = this.createNode('envelopeNode', 'Gain', { gain: 0.0 });
        
        // Output gain node
        const outputNode = this.createNode('outputNode', 'Gain', { gain: 1.0 });
        
        // Connect nodes
        inputNode.connect(envelopeNode);
        envelopeNode.connect(outputNode);
        
        // Add envelope gain node to target nodes
        this.state.targetNodes.set('default', {
            node: envelopeNode,
            param: 'gain',
            baseValue: 0.0,
            currentValue: 0.0
        });
    }
    
    /**
     * Trigger the envelope from the beginning (note on)
     * @param {Number} velocity - Velocity value (0-1)
     * @param {Number} time - Start time (defaults to current time)
     */
    trigger(velocity = 1.0, time = null) {
        if (!this.isInitialized) return;
        
        const ac = this.engine.state.audioContext;
        const startTime = time !== null ? time : ac.currentTime;
        
        // Store velocity for modulation
        this.state.velocityValue = Math.max(0.0, Math.min(1.0, velocity));
        
        // Clear any ongoing envelope
        this._cancelScheduledEnvelopes();
        
        // Set gate state
        this.state.gate = true;
        this.state.isActive = true;
        this.state.startTime = startTime;
        this.state.releaseTime = 0; // Reset release time
        this.state.currentStage = 'attack';
        
        // Schedule attack and decay phases
        this._scheduleAttackDecay(startTime, velocity);
    }
    
    /**
     * Release the envelope (note off)
     * @param {Number} time - Release time (defaults to current time)
     */
    release(time = null) {
        if (!this.isInitialized || !this.state.isActive) return;
        
        const ac = this.engine.state.audioContext;
        const releaseTime = time !== null ? time : ac.currentTime;
        
        // Set gate state
        this.state.gate = false;
        this.state.releaseTime = releaseTime;
        
        // If envelope is still in attack/decay phase
        if (this.state.currentStage === 'attack' || this.state.currentStage === 'decay') {
            // Get current envelope value at this time
            const currentValue = this._getEnvelopeValueAtTime(releaseTime);
            
            // Cancel scheduled ramps
            this._cancelScheduledEnvelopes();
            
            // Set current value
            this._setEnvelopeValue(currentValue, releaseTime);
        }
        
        // Schedule release phase
        this._scheduleRelease(releaseTime);
    }
    
    /**
     * Force stop the envelope (immediate silent)
     */
    stop() {
        if (!this.isInitialized) return;
        
        this._cancelScheduledEnvelopes();
        
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        // Immediately set envelope to zero
        this._setEnvelopeValue(0, now);
        
        // Reset state
        this.state.isActive = false;
        this.state.gate = false;
        this.state.currentStage = 'idle';
        this.state.lastValue = 0;
    }
    
    /**
     * Schedule the attack and decay phases of the envelope
     * @param {Number} startTime - Start time in seconds
     * @param {Number} velocity - Velocity value (0-1)
     * @private
     */
    _scheduleAttackDecay(startTime, velocity) {
        const ac = this.engine.state.audioContext;
        
        // Get parameters
        const attackTime = Math.max(0.001, this._getModulatedParam('attack'));
        const decayTime = Math.max(0.001, this._getModulatedParam('decay'));
        const sustainLevel = Math.max(0, Math.min(1, this._getModulatedParam('sustain')));
        const amount = this._getModulatedParam('amount');
        const velocitySensitivity = this._getModulatedParam('velocitySensitivity');
        const attackCurve = this._getModulatedParam('attackCurve');
        const inverted = this.getParameter('inverted');
        
        // Calculate velocity influence
        const velocityCurve = this._getModulatedParam('velocityCurve');
        const curvedVelocity = velocityCurve <= 0 ? 
            velocity : 
            Math.pow(velocity, 1 + velocityCurve * 4); // Range from linear (exponent=1) to exponential (exponent=5)
        
        // Calculate velocity-affected peak level
        let peakLevel = 1.0 - (1.0 - curvedVelocity) * velocitySensitivity;
        peakLevel = Math.max(0.0, Math.min(1.0, peakLevel)) * amount;
        
        // Calculate sustain level with velocity influence
        const finalSustainLevel = sustainLevel * peakLevel;
        
        // Calculate attack curve (from linear to exponential)
        const attackTarget = inverted ? (1.0 - peakLevel) : peakLevel;
        const attackStart = inverted ? 1.0 : 0.0;
        
        // Calculate decay target (sustain level)
        const decayTarget = inverted ? (1.0 - finalSustainLevel) : finalSustainLevel;
        
        // Schedule attack phase
        for (const [id, target] of this.state.targetNodes.entries()) {
            const { node, param, baseValue } = target;
            if (!node || !node[param]) continue;
            
            // Scale the output based on outputMin/outputMax
            const outputMin = this.getParameter('outputMin');
            const outputMax = this.getParameter('outputMax');
            const outputRange = outputMax - outputMin;
            
            // Calculate actual values to set based on output range
            const scaledAttackStart = baseValue + (attackStart * outputRange + outputMin);
            const scaledAttackTarget = baseValue + (attackTarget * outputRange + outputMin);
            const scaledDecayTarget = baseValue + (decayTarget * outputRange + outputMin);
            
            try {
                // Start at zero or one (depending on inverted)
                node[param].cancelScheduledValues(startTime);
                node[param].setValueAtTime(scaledAttackStart, startTime);
                
                // Attack phase - use curve based on attackCurve parameter
                if (attackTime < 0.01) {
                    // For very short attacks, just set the value
                    node[param].setValueAtTime(scaledAttackTarget, startTime + 0.001);
                } else if (attackCurve < 0.1) {
                    // Linear attack
                    node[param].linearRampToValueAtTime(scaledAttackTarget, startTime + attackTime);
                } else {
                    // Exponential-ish attack (setTargetAtTime)
                    const timeConstant = attackTime / (3 + attackCurve * 7); // 3-10 time constants
                    node[param].setTargetAtTime(scaledAttackTarget, startTime, timeConstant);
                }
                
                // Decay phase - use setTargetAtTime for natural exponential decay
                const decayTimeConstant = decayTime / 5; // Decay over 5 time constants
                node[param].setTargetAtTime(scaledDecayTarget, startTime + attackTime, decayTimeConstant);
                
                // Update target's current value
                target.currentValue = finalSustainLevel;
            } catch (error) {
                console.error(`EnvelopeModule(${this.id}): Error scheduling attack/decay:`, error);
            }
        }
        
        // Set current stage
        this.state.currentStage = 'attack';
        
        // Schedule transition to decay after attack completes
        setTimeout(() => {
            if (this.state.currentStage === 'attack') {
                this.state.currentStage = 'decay';
                
                // Schedule transition to sustain after decay completes
                setTimeout(() => {
                    if (this.state.currentStage === 'decay') {
                        this.state.currentStage = 'sustain';
                    }
                }, decayTime * 1000);
            }
        }, attackTime * 1000);
    }
    
    /**
     * Schedule the release phase of the envelope
     * @param {Number} releaseTime - Release start time in seconds
     * @private
     */
    _scheduleRelease(releaseTime) {
        if (!this.isInitialized) return;
        
        const ac = this.engine.state.audioContext;
        
        // Get release parameters
        const releaseDuration = Math.max(0.001, this._getModulatedParam('release'));
        const releaseCurve = this._getModulatedParam('releaseCurve');
        const inverted = this.getParameter('inverted');
        
        // Calculate release target
        const releaseTarget = inverted ? 1.0 : 0.0;
        
        // Get current envelope value
        const currentValue = this._getEnvelopeValueAtTime(releaseTime);
        this.state.lastValue = currentValue;
        
        // Schedule release phase for all target nodes
        for (const [id, target] of this.state.targetNodes.entries()) {
            const { node, param, baseValue } = target;
            if (!node || !node[param]) continue;
            
            // Scale the output based on outputMin/outputMax
            const outputMin = this.getParameter('outputMin');
            const outputMax = this.getParameter('outputMax');
            const outputRange = outputMax - outputMin;
            
            // Calculate actual value to set based on output range
            const scaledReleaseTarget = baseValue + (releaseTarget * outputRange + outputMin);
            
            try {
                // Start release from current value
                node[param].cancelScheduledValues(releaseTime);
                node[param].setValueAtTime(node[param].value, releaseTime);
                
                // Apply release curve
                if (releaseDuration < 0.01) {
                    // For very short releases, just set the value
                    node[param].setValueAtTime(scaledReleaseTarget, releaseTime + 0.001);
                } else if (releaseCurve < 0.1) {
                    // Linear release
                    node[param].linearRampToValueAtTime(scaledReleaseTarget, releaseTime + releaseDuration);
                } else {
                    // Exponential-ish release
                    const timeConstant = releaseDuration / (5 + releaseCurve * 7); // 5-12 time constants
                    node[param].setTargetAtTime(scaledReleaseTarget, releaseTime, timeConstant);
                }
                
                // Update target's current value
                target.currentValue = releaseTarget;
            } catch (error) {
                console.error(`EnvelopeModule(${this.id}): Error scheduling release:`, error);
            }
        }
        
        // Set current stage
        this.state.currentStage = 'release';
        
        // Set envelope inactive after release completes
        setTimeout(() => {
            if (this.state.currentStage === 'release') {
                this.state.currentStage = 'idle';
                this.state.isActive = false;
                this.state.lastValue = releaseTarget;
            }
        }, releaseDuration * 1000);
    }
    
    /**
     * Cancel all scheduled envelope changes
     * @private
     */
    _cancelScheduledEnvelopes() {
        if (!this.isInitialized) return;
        
        const ac = this.engine.state.audioContext;
        const now = ac.currentTime;
        
        for (const [id, target] of this.state.targetNodes.entries()) {
            const { node, param } = target;
            if (!node || !node[param]) continue;
            
            try {
                node[param].cancelScheduledValues(now);
            } catch (error) {
                console.error(`EnvelopeModule(${this.id}): Error cancelling scheduled values:`, error);
            }
        }
    }
    
    /**
     * Get envelope value at a specific time
     * @param {Number} time - Time in seconds
     * @returns {Number} Envelope value at specified time (0-1)
     * @private
     */
    _getEnvelopeValueAtTime(time) {
        if (!this.isInitialized || !this.state.isActive) return 0;
        
        const attackTime = this._getModulatedParam('attack');
        const decayTime = this._getModulatedParam('decay');
        const sustainLevel = this._getModulatedParam('sustain');
        const attackEndTime = this.state.startTime + attackTime;
        const decayEndTime = attackEndTime + decayTime;
        
        // Calculate elapsed time since stage start
        const elapsedSinceStart = time - this.state.startTime;
        
        // Determine current value based on envelope stage
        let value = 0;
        
        if (time < attackEndTime) {
            // Attack phase
            value = elapsedSinceStart / attackTime;
        } else if (time < decayEndTime) {
            // Decay phase
            const decayProgress = (time - attackEndTime) / decayTime;
            value = 1.0 - (1.0 - sustainLevel) * decayProgress;
        } else {
            // Sustain phase
            value = sustainLevel;
        }
        
        // Apply inversion if needed
        if (this.getParameter('inverted')) {
            value = 1.0 - value;
        }
        
        return value;
    }
    
    /**
     * Set envelope value for all target nodes
     * @param {Number} value - Envelope value (0-1)
     * @param {Number} time - Time to set the value
     * @private
     */
    _setEnvelopeValue(value, time) {
        if (!this.isInitialized) return;
        
        const ac = this.engine.state.audioContext;
        const now = time || ac.currentTime;
        
        // Store for reference
        this.state.lastValue = value;
        
        // Calculate the actual value based on output range
        const outputMin = this.getParameter('outputMin');
        const outputMax = this.getParameter('outputMax');
        const outputRange = outputMax - outputMin;
        
        for (const [id, target] of this.state.targetNodes.entries()) {
            const { node, param, baseValue } = target;
            if (!node || !node[param]) continue;
            
            // Scale value based on output range
            const scaledValue = baseValue + (value * outputRange + outputMin);
            
            try {
                node[param].setValueAtTime(scaledValue, now);
                target.currentValue = value;
            } catch (error) {
                console.error(`EnvelopeModule(${this.id}): Error setting envelope value:`, error);
            }
        }
    }
    
    /**
     * Get a parameter value with modulation applied
     * @param {String} paramName - Parameter name
     * @returns {Number} Modulated parameter value
     * @private
     */
    _getModulatedParam(paramName) {
        const baseValue = this.getParameter(paramName);
        
        // Apply modulation if any
        if (this.state.modulations.has(paramName)) {
            const modSources = this.state.modulations.get(paramName);
            let totalMod = 0;
            
            for (const source of modSources) {
                totalMod += source.value * source.amount;
            }
            
            return baseValue + totalMod;
        }
        
        return baseValue;
    }
    
    /**
     * Setup looping behavior if enabled
     * @private
     */
    _setupLooping() {
        if (!this.getParameter('loopEnabled')) return;
        
        // TODO: Implement envelope looping logic
        // This requires more complex scheduling and cancellation
    }
    
    /**
     * Add a node to be controlled by this envelope
     * @param {String} id - Identifier for this target
     * @param {AudioNode} node - Web Audio node to control
     * @param {String} paramName - Parameter name on the node
     * @param {Number} baseValue - Base value for the parameter
     * @returns {Boolean} Success state
     */
    addTarget(id, node, paramName, baseValue = 0) {
        if (!this.isInitialized || !node || !node[paramName] || typeof node[paramName].setValueAtTime !== 'function') {
            console.warn(`EnvelopeModule(${this.id}): Invalid target node/parameter`);
            return false;
        }
        
        this.state.targetNodes.set(id, {
            node,
            param: paramName,
            baseValue,
            currentValue: 0
        });
        
        // Set initial value
        if (!this.state.isActive) {
            const inverted = this.getParameter('inverted');
            const initialValue = inverted ? 1.0 : 0.0;
            this._setEnvelopeValue(initialValue, this.engine.state.audioContext.currentTime);
        }
        
        return true;
    }
    
    /**
     * Remove a target from this envelope
     * @param {String} id - Target identifier
     * @returns {Boolean} Success state
     */
    removeTarget(id) {
        if (!this.state.targetNodes.has(id)) {
            return false;
        }
        
        this.state.targetNodes.delete(id);
        return true;
    }
    
    /**
     * Add a modulation source for a parameter
     * @param {String} paramName - Parameter name to modulate
     * @param {Object} source - Modulation source {id, value, amount}
     * @returns {Function} Function to remove the modulation
     */
    addModulation(paramName, source) {
        if (!source || !source.id) {
            console.warn(`EnvelopeModule(${this.id}): Invalid modulation source`);
            return () => {};
        }
        
        // Initialize modulation array for this parameter if needed
        if (!this.state.modulations.has(paramName)) {
            this.state.modulations.set(paramName, []);
        }
        
        const modSources = this.state.modulations.get(paramName);
        
        // Check if this source already exists
        const existingIndex = modSources.findIndex(s => s.id === source.id);
        if (existingIndex >= 0) {
            // Update existing source
            modSources[existingIndex] = source;
        } else {
            // Add new source
            modSources.push(source);
        }
        
        // Return function to remove this modulation
        return () => {
            if (this.state.modulations.has(paramName)) {
                const sources = this.state.modulations.get(paramName);
                const index = sources.findIndex(s => s.id === source.id);
                if (index >= 0) {
                    sources.splice(index, 1);
                    if (sources.length === 0) {
                        this.state.modulations.delete(paramName);
                    }
                }
            }
        };
    }
    
    /**
     * Get the current envelope value
     * @returns {Number} Current envelope value (0-1)
     */
    getCurrentValue() {
        if (!this.isInitialized) return 0;
        
        // If active, calculate actual current value
        if (this.state.isActive) {
            const now = this.engine.state.audioContext.currentTime;
            
            if (this.state.currentStage === 'release' && this.state.releaseTime > 0) {
                // During release phase
                const releaseParam = this._getModulatedParam('release');
                const releaseDuration = Math.max(0.001, releaseParam);
                const releaseProgress = Math.min(1.0, (now - this.state.releaseTime) / releaseDuration);
                const initialValue = this.state.lastValue;
                
                return initialValue * (1.0 - releaseProgress);
            } else {
                // During attack/decay/sustain
                return this._getEnvelopeValueAtTime(now);
            }
        }
        
        // Return last computed value if not active
        return this.state.lastValue;
    }
    
    /**
     * Get the current envelope stage
     * @returns {String} Current stage (idle, attack, decay, sustain, release)
     */
    getCurrentStage() {
        return this.state.currentStage;
    }
    
    /**
     * Check if the envelope is currently active
     * @returns {Boolean} Whether the envelope is active
     */
    isActive() {
        return this.state.isActive;
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Stop any active envelope
        this.stop();
        
        // Clear targets and modulations
        this.state.targetNodes.clear();
        this.state.modulations.clear();
        
        super.dispose();
    }
}
