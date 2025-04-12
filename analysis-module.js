/**
 * AnalysisModule.js - Audio analysis for visualization integration
 * 
 * Analyzes audio output to extract features for visualization.
 * Provides frequency band data, transient detection, and spectral information
 * to drive the visual rendering system.
 */

import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class AnalysisModule extends AudioModuleBase {
    /**
     * Create a new AnalysisModule
     * @param {AudioEngine} engine - The audio engine instance
     * @param {String} id - Unique identifier for this module (optional, defaults to 'analyzer')
     * @param {Object} options - Configuration options
     */
    constructor(engine, id = 'analyzer', options = {}) {
        super(engine, id, options);
        
        // Analysis data buffers
        this.analyserData = {
            fftSize: 2048,
            timeData: null, // Time domain data (waveform)
            freqData: null, // Frequency domain data (spectrum)
            freqByBand: { // Analyzed frequency bands
                bass: 0,
                lowMid: 0,
                highMid: 0,
                high: 0
            },
            transients: { // Transient detection
                count: 0,
                lastTime: 0,
                energy: 0,
                threshold: 0.1,
                cooldown: 100 // ms
            },
            spectralFeatures: { // Advanced spectral features
                centroid: 0,
                flatness: 0,
                rolloff: 0,
                spread: 0
            }
        };
        
        // Analysis timing
        this.timing = {
            lastUpdate: 0,
            updateInterval: 20, // ms between updates
            frameCount: 0
        };
        
        // Animation frame reference for update loop
        this.animationFrame = null;
    }
    
    /**
     * Get default options for this module
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {
            fftSize: 2048,
            smoothingTimeConstant: 0.8,
            useExistingAnalyser: true, // Use the engine's main analyser if available
            createExtraAnalysers: false // Create dedicated analyzers for special features
        };
    }
    
    /**
     * Get initial parameter values
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {
            bassRange: [20, 250], // Hz
            lowMidRange: [250, 500], // Hz
            highMidRange: [500, 2000], // Hz
            highRange: [2000, 8000], // Hz
            bassSensitivity: 1.0,
            midSensitivity: 1.0,
            highSensitivity: 1.0,
            transientThreshold: 0.1,
            transientCooldown: 100, // ms
            updateInterval: 20, // ms
            smoothing: 0.8, // 0-1
            enableTransientDetection: true,
            enableSpectralFeatures: true
        };
    }
    
    /**
     * Get parameter metadata including ranges, defaults, and visual mappings
     * @returns {Object} Parameter metadata
     */
    getParameterMetadata() {
        return {
            bassRange: {
                type: 'float[]',
                min: [20, 20],
                max: [500, 500],
                step: [1, 1],
                default: [20, 250],
                description: 'Bass frequency range (Hz)'
            },
            lowMidRange: {
                type: 'float[]',
                min: [100, 100],
                max: [1000, 1000],
                step: [1, 1],
                default: [250, 500],
                description: 'Low mid frequency range (Hz)'
            },
            highMidRange: {
                type: 'float[]',
                min: [200, 200],
                max: [5000, 5000],
                step: [1, 1],
                default: [500, 2000],
                description: 'High mid frequency range (Hz)'
            },
            highRange: {
                type: 'float[]',
                min: [1000, 1000],
                max: [20000, 20000],
                step: [1, 1],
                default: [2000, 8000],
                description: 'High frequency range (Hz)'
            },
            bassSensitivity: {
                type: 'float',
                min: 0.1,
                max: 5.0,
                step: 0.1,
                default: 1.0,
                description: 'Bass sensitivity multiplier'
            },
            midSensitivity: {
                type: 'float',
                min: 0.1,
                max: 5.0,
                step: 0.1,
                default: 1.0,
                description: 'Mid sensitivity multiplier'
            },
            highSensitivity: {
                type: 'float',
                min: 0.1,
                max: 5.0,
                step: 0.1,
                default: 1.0,
                description: 'High sensitivity multiplier'
            },
            transientThreshold: {
                type: 'float',
                min: 0.01,
                max: 1.0,
                step: 0.01,
                default: 0.1,
                description: 'Transient detection threshold'
            },
            transientCooldown: {
                type: 'float',
                min: 10,
                max: 500,
                step: 1,
                default: 100,
                description: 'Minimum time between transient detections (ms)'
            },
            updateInterval: {
                type: 'float',
                min: 10,
                max: 100,
                step: 1,
                default: 20,
                description: 'Analysis update interval (ms)'
            },
            smoothing: {
                type: 'float',
                min: 0.0,
                max: 0.99,
                step: 0.01,
                default: 0.8,
                description: 'Analyzer smoothing time constant'
            },
            enableTransientDetection: {
                type: 'boolean',
                default: true,
                description: 'Enable transient detection'
            },
            enableSpectralFeatures: {
                type: 'boolean',
                default: true,
                description: 'Enable spectral feature analysis'
            }
        };
    }
    
    /**
     * Initialize the analysis module
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        try {
            // Create module nodes
            this._createModuleNodes();
            
            // Set FFT size and smoothing
            this._configureAnalysers();
            
            // Initialize data buffers
            this._initializeDataBuffers();
            
            // Start analysis loop
            this._startAnalysisLoop();
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`AnalysisModule(${this.id}): Initialization error:`, error);
            return false;
        }
    }
    
    /**
     * Create audio nodes for the module
     * @private
     */
    _createModuleNodes() {
        const ac = this.engine.state.audioContext;
        
        // Use existing main analyzer if available and option is enabled
        if (this.options.useExistingAnalyser && this.engine.state.masterAnalyser) {
            this.registerNode('mainAnalyser', this.engine.state.masterAnalyser);
        } else {
            // Create a new analyzer node
            const analyser = this.createNode('mainAnalyser', 'Analyser');
            
            // Connect to master output
            this.engine.state.masterGain.connect(analyser);
        }
        
        // Create additional specialized analyzers if needed
        if (this.options.createExtraAnalysers) {
            // Create a transient-focused analyzer (small FFT, less smoothing)
            const transientAnalyser = this.createNode('transientAnalyser', 'Analyser');
            transientAnalyser.fftSize = 512; // Smaller for faster response
            transientAnalyser.smoothingTimeConstant = 0.2; // Less smoothing
            
            // Connect to master output
            this.engine.state.masterGain.connect(transientAnalyser);
            
            // Create a spectral-focused analyzer (large FFT for better resolution)
            const spectralAnalyser = this.createNode('spectralAnalyser', 'Analyser');
            spectralAnalyser.fftSize = 4096; // Larger for better frequency resolution
            spectralAnalyser.smoothingTimeConstant = 0.9; // More smoothing
            
            // Connect to master output
            this.engine.state.masterGain.connect(spectralAnalyser);
        }
    }
    
    /**
     * Configure analyzers with current parameters
     * @private
     */
    _configureAnalysers() {
        // Get parameters
        const fftSize = this.options.fftSize;
        const smoothing = this.getParameter('smoothing');
        
        // Configure main analyzer
        const mainAnalyser = this.getNode('mainAnalyser');
        if (mainAnalyser) {
            mainAnalyser.fftSize = fftSize;
            mainAnalyser.smoothingTimeConstant = smoothing;
        }
        
        // Configure specialized analyzers if they exist
        if (this.options.createExtraAnalysers) {
            const transientAnalyser = this.getNode('transientAnalyser');
            if (transientAnalyser) {
                transientAnalyser.smoothingTimeConstant = Math.max(0.1, smoothing - 0.3);
            }
            
            const spectralAnalyser = this.getNode('spectralAnalyser');
            if (spectralAnalyser) {
                spectralAnalyser.smoothingTimeConstant = Math.min(0.95, smoothing + 0.1);
            }
        }
        
        // Update timing interval
        this.timing.updateInterval = this.getParameter('updateInterval');
        
        // Update transient detection parameters
        this.analyserData.transients.threshold = this.getParameter('transientThreshold');
        this.analyserData.transients.cooldown = this.getParameter('transientCooldown');
    }
    
    /**
     * Initialize data buffers based on FFT size
     * @private
     */
    _initializeDataBuffers() {
        const mainAnalyser = this.getNode('mainAnalyser');
        if (!mainAnalyser) return;
        
        const bufferLength = mainAnalyser.frequencyBinCount;
        
        // Create data buffers
        this.analyserData.timeData = new Uint8Array(bufferLength);
        this.analyserData.freqData = new Uint8Array(bufferLength);
        
        // Create specialized buffers if needed
        if (this.options.createExtraAnalysers) {
            const transientAnalyser = this.getNode('transientAnalyser');
            if (transientAnalyser) {
                this.analyserData.transientTimeData = new Uint8Array(transientAnalyser.frequencyBinCount);
            }
            
            const spectralAnalyser = this.getNode('spectralAnalyser');
            if (spectralAnalyser) {
                this.analyserData.spectralFreqData = new Float32Array(spectralAnalyser.frequencyBinCount);
            }
        }
    }
    
    /**
     * Start the continuous analysis loop
     * @private
     */
    _startAnalysisLoop() {
        // Stop existing loop if running
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Set update timing
        this.timing.lastUpdate = performance.now();
        
        // Start the loop
        const updateLoop = () => {
            const now = performance.now();
            const elapsed = now - this.timing.lastUpdate;
            
            // Update analysis at the specified interval
            if (elapsed >= this.timing.updateInterval) {
                this._updateAnalysis();
                this.timing.lastUpdate = now;
            }
            
            // Continue the loop
            this.animationFrame = requestAnimationFrame(updateLoop);
        };
        
        // Start the loop
        this.animationFrame = requestAnimationFrame(updateLoop);
    }
    
    /**
     * Update all analysis data
     * @private
     */
    _updateAnalysis() {
        const mainAnalyser = this.getNode('mainAnalyser');
        if (!mainAnalyser) return;
        
        // Get time and frequency data
        mainAnalyser.getByteTimeDomainData(this.analyserData.timeData);
        mainAnalyser.getByteFrequencyData(this.analyserData.freqData);
        
        // Analyze frequency bands
        this._analyzeFrequencyBands();
        
        // Detect transients if enabled
        if (this.getParameter('enableTransientDetection')) {
            this._detectTransients();
        }
        
        // Calculate spectral features if enabled
        if (this.getParameter('enableSpectralFeatures')) {
            this._calculateSpectralFeatures();
        }
        
        // Update frame counter
        this.timing.frameCount++;
    }
    
    /**
     * Analyze frequency bands (bass, low-mid, high-mid, high)
     * @private
     */
    _analyzeFrequencyBands() {
        const mainAnalyser = this.getNode('mainAnalyser');
        if (!mainAnalyser || !this.analyserData.freqData) return;
        
        const freqData = this.analyserData.freqData;
        const bufferLength = freqData.length;
        
        // Get frequency ranges from parameters
        const bassRange = this.getParameter('bassRange');
        const lowMidRange = this.getParameter('lowMidRange');
        const highMidRange = this.getParameter('highMidRange');
        const highRange = this.getParameter('highRange');
        
        // Get sensitivity multipliers
        const bassSensitivity = this.getParameter('bassSensitivity');
        const midSensitivity = this.getParameter('midSensitivity');
        const highSensitivity = this.getParameter('highSensitivity');
        
        // Calculate frequency resolution
        const ac = this.engine.state.audioContext;
        const nyquist = ac.sampleRate / 2;
        const freqPerBin = nyquist / bufferLength;
        
        // Calculate indices for each frequency range
        const bassStartIndex = Math.max(0, Math.floor(bassRange[0] / freqPerBin));
        const bassEndIndex = Math.min(bufferLength - 1, Math.floor(bassRange[1] / freqPerBin));
        
        const lowMidStartIndex = Math.max(0, Math.floor(lowMidRange[0] / freqPerBin));
        const lowMidEndIndex = Math.min(bufferLength - 1, Math.floor(lowMidRange[1] / freqPerBin));
        
        const highMidStartIndex = Math.max(0, Math.floor(highMidRange[0] / freqPerBin));
        const highMidEndIndex = Math.min(bufferLength - 1, Math.floor(highMidRange[1] / freqPerBin));
        
        const highStartIndex = Math.max(0, Math.floor(highRange[0] / freqPerBin));
        const highEndIndex = Math.min(bufferLength - 1, Math.floor(highRange[1] / freqPerBin));
        
        // Calculate average energy in each band
        let bassSum = 0, bassCount = 0;
        let lowMidSum = 0, lowMidCount = 0;
        let highMidSum = 0, highMidCount = 0;
        let highSum = 0, highCount = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const value = freqData[i];
            
            if (i >= bassStartIndex && i <= bassEndIndex) {
                bassSum += value;
                bassCount++;
            }
            
            if (i >= lowMidStartIndex && i <= lowMidEndIndex) {
                lowMidSum += value;
                lowMidCount++;
            }
            
            if (i >= highMidStartIndex && i <= highMidEndIndex) {
                highMidSum += value;
                highMidCount++;
            }
            
            if (i >= highStartIndex && i <= highEndIndex) {
                highSum += value;
                highCount++;
            }
        }
        
        // Calculate normalized band values (0-1)
        const epsilon = 1e-6; // Avoid division by zero
        const bassAvg = (bassSum / (bassCount + epsilon)) / 255.0;
        const lowMidAvg = (lowMidSum / (lowMidCount + epsilon)) / 255.0;
        const highMidAvg = (highMidSum / (highMidCount + epsilon)) / 255.0;
        const highAvg = (highSum / (highCount + epsilon)) / 255.0;
        
        // Apply sensitivity curves and clamp to 0-1 range
        const bass = Math.min(1.0, Math.max(0.0, Math.pow(bassAvg, 0.7) * bassSensitivity));
        const lowMid = Math.min(1.0, Math.max(0.0, Math.pow(lowMidAvg, 0.7) * midSensitivity));
        const highMid = Math.min(1.0, Math.max(0.0, Math.pow(highMidAvg, 0.7) * midSensitivity));
        const high = Math.min(1.0, Math.max(0.0, Math.pow(highAvg, 0.7) * highSensitivity));
        
        // Calculate simplified mid band (for compatibility)
        const mid = (lowMid * 0.6 + highMid * 0.4);
        
        // Update analysis data
        this.analyserData.freqByBand.bass = bass;
        this.analyserData.freqByBand.lowMid = lowMid;
        this.analyserData.freqByBand.highMid = highMid;
        this.analyserData.freqByBand.high = high;
        this.analyserData.freqByBand.mid = mid; // For backward compatibility
    }
    
    /**
     * Detect audio transients (sudden energy changes)
     * @private
     */
    _detectTransients() {
        // Use transient-focused analyzer if available, otherwise use main analyzer
        const analyser = this.getNode('transientAnalyser') || this.getNode('mainAnalyser');
        if (!analyser) return;
        
        const timeData = this.options.createExtraAnalysers && this.analyserData.transientTimeData ?
            this.analyserData.transientTimeData : this.analyserData.timeData;
        
        if (!timeData) return;
        
        // Get fresh time domain data
        analyser.getByteTimeDomainData(timeData);
        
        // Calculate RMS energy
        let sum = 0;
        const length = timeData.length;
        
        for (let i = 0; i < length; i++) {
            // Convert 0-255 to -1 to 1
            const amplitude = (timeData[i] / 128.0) - 1.0;
            sum += amplitude * amplitude;
        }
        
        const rms = Math.sqrt(sum / length);
        
        // Get parameters
        const threshold = this.getParameter('transientThreshold');
        const cooldown = this.getParameter('transientCooldown');
        
        // Compare with previous energy level to detect transients
        const energyDelta = rms - this.analyserData.transients.energy;
        const now = performance.now();
        const timeSinceLastTransient = now - this.analyserData.transients.lastTime;
        
        // Update current energy level with some smoothing
        this.analyserData.transients.energy = rms * 0.3 + this.analyserData.transients.energy * 0.7;
        
        // Detect transient if:
        // 1. Energy increased significantly (above threshold)
        // 2. Enough time passed since last transient (cooldown)
        if (energyDelta > threshold && timeSinceLastTransient > cooldown) {
            this.analyserData.transients.count++;
            this.analyserData.transients.lastTime = now;
            
            // Trigger transient event for visualization
            this._triggerTransientEvent(rms);
        }
    }
    
    /**
     * Trigger a transient event for visualization
     * @param {Number} energy - Energy level of the transient
     * @private
     */
    _triggerTransientEvent(energy) {
        // Create transient event
        const transientEvent = {
            time: performance.now(),
            energy: energy,
            bands: { ...this.analyserData.freqByBand }, // Copy current frequency bands
            count: this.analyserData.transients.count
        };
        
        // Dispatch custom event if in browser
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            const event = new CustomEvent('audio-transient', { detail: transientEvent });
            window.dispatchEvent(event);
        }
        
        // Also update a module parameter for visualization access
        this.setParameter('lastTransient', transientEvent);
    }
    
    /**
     * Calculate advanced spectral features
     * @private
     */
    _calculateSpectralFeatures() {
        // Use spectral-focused analyzer if available, otherwise use main analyzer
        const analyser = this.getNode('spectralAnalyser') || this.getNode('mainAnalyser');
        if (!analyser) return;
        
        // Use float data if available for more precision
        let freqData;
        if (this.options.createExtraAnalysers && this.analyserData.spectralFreqData) {
            freqData = this.analyserData.spectralFreqData;
            analyser.getFloatFrequencyData(freqData);
            
            // Convert dB to linear amplitude (approximate)
            for (let i = 0; i < freqData.length; i++) {
                // dB to linear conversion
                freqData[i] = Math.pow(10, freqData[i] / 20);
            }
        } else {
            // Use the regular byte data and convert
            freqData = this.analyserData.freqData;
            // Already filled by the main analysis
        }
        
        if (!freqData) return;
        
        // Calculate frequency resolution
        const ac = this.engine.state.audioContext;
        const nyquist = ac.sampleRate / 2;
        const bufferLength = freqData.length;
        const freqPerBin = nyquist / bufferLength;
        
        // Calculate spectral centroid
        let sumAmplitude = 0;
        let sumWeightedAmplitude = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const frequency = i * freqPerBin;
            const amplitude = this.options.createExtraAnalysers ? freqData[i] : freqData[i] / 255.0;
            
            sumAmplitude += amplitude;
            sumWeightedAmplitude += amplitude * frequency;
        }
        
        // Avoid division by zero
        const centroid = sumAmplitude > 0 ? sumWeightedAmplitude / sumAmplitude : 0;
        
        // Normalize centroid to 0-1 range (assuming max is nyquist)
        const normalizedCentroid = centroid / nyquist;
        
        // Calculate spectral flatness (approximation)
        // Geometric mean / arithmetic mean
        let geometricSum = 0;
        let arithmeticSum = 0;
        let nonZeroCount = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const amplitude = this.options.createExtraAnalysers ? freqData[i] : freqData[i] / 255.0;
            
            // Only consider non-zero values for geometric mean
            if (amplitude > 0.0001) {
                geometricSum += Math.log(amplitude);
                arithmeticSum += amplitude;
                nonZeroCount++;
            }
        }
        
        // Calculate flatness
        let flatness = 0;
        if (nonZeroCount > 0 && arithmeticSum > 0) {
            const geometricMean = Math.exp(geometricSum / nonZeroCount);
            const arithmeticMean = arithmeticSum / nonZeroCount;
            flatness = geometricMean / arithmeticMean;
        }
        
        // Calculate spectral rolloff (frequency below which 85% of energy is contained)
        const rolloffEnergy = 0.85;
        let totalEnergy = 0;
        
        // First calculate total energy
        for (let i = 0; i < bufferLength; i++) {
            const amplitude = this.options.createExtraAnalysers ? freqData[i] : freqData[i] / 255.0;
            totalEnergy += amplitude * amplitude; // Energy is amplitude squared
        }
        
        // Then find rolloff point
        let cumulativeEnergy = 0;
        let rolloffIndex = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const amplitude = this.options.createExtraAnalysers ? freqData[i] : freqData[i] / 255.0;
            cumulativeEnergy += amplitude * amplitude;
            
            if (cumulativeEnergy >= totalEnergy * rolloffEnergy) {
                rolloffIndex = i;
                break;
            }
        }
        
        const rolloffFrequency = rolloffIndex * freqPerBin;
        const normalizedRolloff = rolloffFrequency / nyquist;
        
        // Calculate spectral spread (variance around centroid)
        let sumSquaredDeviation = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const frequency = i * freqPerBin;
            const amplitude = this.options.createExtraAnalysers ? freqData[i] : freqData[i] / 255.0;
            const deviation = frequency - centroid;
            sumSquaredDeviation += amplitude * deviation * deviation;
        }
        
        const spread = sumAmplitude > 0 ? Math.sqrt(sumSquaredDeviation / sumAmplitude) : 0;
        const normalizedSpread = spread / nyquist;
        
        // Update spectral features
        this.analyserData.spectralFeatures.centroid = normalizedCentroid;
        this.analyserData.spectralFeatures.flatness = flatness;
        this.analyserData.spectralFeatures.rolloff = normalizedRolloff;
        this.analyserData.spectralFeatures.spread = normalizedSpread;
    }
    
    /**
     * Get the current audio levels for visualization
     * @returns {Object} Object with frequency band values and active frequency
     */
    getAudioLevels() {
        if (!this.isInitialized) {
            return {
                bass: 0,
                mid: 0,
                high: 0,
                frequency: null
            };
        }
        
        // Get current frequency from the active voice if available
        let currentFrequency = null;
        try {
            const voiceManager = this.engine.registry.getModule('voiceManager');
            if (voiceManager) {
                currentFrequency = voiceManager.getParameter('activeFrequency');
            }
        } catch (e) {
            // Ignore errors if voice manager isn't available
        }
        
        // Return simplified audio levels (for backward compatibility)
        return {
            bass: this.analyserData.freqByBand.bass || 0,
            mid: this.analyserData.freqByBand.mid || 0,
            high: this.analyserData.freqByBand.high || 0,
            frequency: currentFrequency
        };
    }
    
    /**
     * Get detailed frequency band data
     * @returns {Object} Object with all frequency band values
     */
    getFrequencyBands() {
        if (!this.isInitialized) {
            return {
                bass: 0,
                lowMid: 0,
                highMid: 0,
                high: 0,
                mid: 0
            };
        }
        
        return { ...this.analyserData.freqByBand };
    }
    
    /**
     * Get transient detection data
     * @returns {Object} Object with transient detection information
     */
    getTransients() {
        if (!this.isInitialized) {
            return {
                count: 0,
                lastTime: 0,
                energy: 0
            };
        }
        
        return {
            count: this.analyserData.transients.count,
            lastTime: this.analyserData.transients.lastTime,
            energy: this.analyserData.transients.energy
        };
    }
    
    /**
     * Get spectral features
     * @returns {Object} Object with spectral feature values
     */
    getSpectralFeatures() {
        if (!this.isInitialized) {
            return {
                centroid: 0,
                flatness: 0,
                rolloff: 0,
                spread: 0
            };
        }
        
        return { ...this.analyserData.spectralFeatures };
    }
    
    /**
     * Get raw frequency data
     * @returns {Uint8Array} Raw frequency data array
     */
    getFrequencyData() {
        if (!this.isInitialized) {
            return new Uint8Array(0);
        }
        
        return this.analyserData.freqData;
    }
    
    /**
     * Get raw time domain data
     * @returns {Uint8Array} Raw time domain data array
     */
    getTimeData() {
        if (!this.isInitialized) {
            return new Uint8Array(0);
        }
        
        return this.analyserData.timeData;
    }
    
    /**
     * Get all analysis data in a single object
     * @returns {Object} All analysis data
     */
    getAllAnalysisData() {
        if (!this.isInitialized) {
            return {
                frequencyBands: {
                    bass: 0,
                    lowMid: 0,
                    highMid: 0,
                    high: 0,
                    mid: 0
                },
                transients: {
                    count: 0,
                    lastTime: 0,
                    energy: 0
                },
                spectralFeatures: {
                    centroid: 0,
                    flatness: 0,
                    rolloff: 0,
                    spread: 0
                },
                frequency: null
            };
        }
        
        // Get current frequency from the active voice if available
        let currentFrequency = null;
        try {
            const voiceManager = this.engine.registry.getModule('voiceManager');
            if (voiceManager) {
                currentFrequency = voiceManager.getParameter('activeFrequency');
            }
        } catch (e) {
            // Ignore errors if voice manager isn't available
        }
        
        return {
            frequencyBands: { ...this.analyserData.freqByBand },
            transients: {
                count: this.analyserData.transients.count,
                lastTime: this.analyserData.transients.lastTime,
                energy: this.analyserData.transients.energy
            },
            spectralFeatures: { ...this.analyserData.spectralFeatures },
            frequency: currentFrequency
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
        
        // Handle special cases
        switch (paramName) {
            case 'smoothing':
                // Update analyzer smoothing
                this._configureAnalysers();
                break;
                
            case 'updateInterval':
                // Update timing
                this.timing.updateInterval = value;
                break;
                
            case 'transientThreshold':
            case 'transientCooldown':
                // Update transient detection parameters
                this.analyserData.transients.threshold = this.getParameter('transientThreshold');
                this.analyserData.transients.cooldown = this.getParameter('transientCooldown');
                break;
        }
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Stop analysis loop
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Clear data buffers
        this.analyserData.timeData = null;
        this.analyserData.freqData = null;
        this.analyserData.spectralFreqData = null;
        this.analyserData.transientTimeData = null;
        
        super.dispose();
    }
}
