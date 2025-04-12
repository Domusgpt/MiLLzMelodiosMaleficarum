/**
 * AudioEngine.js - Core audio context and master output management
 * 
 * Central coordinator for the Melodious Maleficarum sound engine.
 * Manages Web Audio API context, master outputs, analyzers, and global state.
 */

import { ParameterBridge } from './ParameterBridge.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { AnalysisModule } from './modules/AnalysisModule.js';

export class AudioEngine {
    /**
     * Creates a new AudioEngine instance.
     * @param {Object} options - Configuration options
     * @param {Boolean} options.autoInit - Whether to initialize immediately (default: false)
     * @param {String} options.defaultPreset - Name of default preset to load (default: 'init')
     */
    constructor(options = {}) {
        this.options = {
            autoInit: false,
            defaultPreset: 'init',
            ...options
        };

        // Core audio state
        this.state = {
            isInitialized: false,
            isInitializing: false,
            audioContext: null,
            masterGain: null,
            masterCompressor: null,
            masterAnalyser: null,
            currentTime: 0
        };

        // Create registry and parameter systems
        this.registry = new ModuleRegistry(this);
        this.parameters = new ParameterBridge(this);
        
        // Analysis module for visualization (specially handled for direct access)
        this.analysis = null;
        
        // Promise interface for initialization
        this.initPromise = null;
        this.resolveInit = null;
        
        // Auto-initialize if requested
        if (this.options.autoInit) {
            this.initialize();
        } else {
            // Set up deferred initialization promise
            this.initPromise = new Promise(resolve => {
                this.resolveInit = resolve;
            });
            this._setupInteractionListeners();
        }
    }
    
    /**
     * Set up listeners for user interaction to initialize audio
     * (required by browsers for autoplay policies)
     * @private
     */
    _setupInteractionListeners() {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const initAudio = async () => {
                if (!this.state.isInitialized && !this.state.isInitializing) {
                    await this.initialize();
                }
                document.removeEventListener('click', initAudio, { capture: true, once: true });
                document.removeEventListener('keydown', initAudio, { capture: true, once: true });
                document.removeEventListener('touchstart', initAudio, { capture: true, once: true });
            };
            
            document.addEventListener('click', initAudio, { capture: true, once: true });
            document.addEventListener('keydown', initAudio, { capture: true, once: true });
            document.addEventListener('touchstart', initAudio, { capture: true, once: true });
        } else {
            console.warn("AudioEngine: Not in a browser environment.");
            if (this.resolveInit) this.resolveInit(false);
        }
    }
    
    /**
     * Initialize the audio engine, creating AudioContext and core nodes
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.state.isInitialized || this.state.isInitializing) {
            return this.initPromise;
        }
        
        this.state.isInitializing = true;
        console.log("AudioEngine: Initializing audio context and core nodes");
        
        try {
            // Create initialization promise if it doesn't exist
            if (!this.initPromise) {
                this.initPromise = new Promise(resolve => {
                    this.resolveInit = resolve;
                });
            }
            
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) throw new Error("Web Audio API not supported");
            
            this.state.audioContext = new AudioContext();
            
            // Attempt to resume suspended context
            if (this.state.audioContext.state === 'suspended') {
                await this.state.audioContext.resume();
            }
            
            if (this.state.audioContext.state !== 'running') {
                throw new Error(`AudioContext failed to start. State: ${this.state.audioContext.state}`);
            }
            
            // Create master output chain
            this._createMasterChain();
            
            // Create analysis module (special case, directly managed by engine)
            this.analysis = new AnalysisModule(this);
            await this.analysis.initialize();
            
            // Enable registry to initialize all modules
            await this.registry.initializeModules();
            
            // Set final initialization state
            this.state.isInitialized = true;
            this.state.isInitializing = false;
            
            console.log("AudioEngine: Initialization complete");
            if (this.resolveInit) this.resolveInit(true);
            return true;
            
        } catch (error) {
            console.error("AudioEngine: Initialization failed:", error);
            this.state.isInitialized = false;
            this.state.isInitializing = false;
            if (this.resolveInit) this.resolveInit(false);
            return false;
        }
    }
    
    /**
     * Create the master output chain (gain, compressor, analyzer)
     * @private
     */
    _createMasterChain() {
        const ac = this.state.audioContext;
        
        // Create master gain
        this.state.masterGain = ac.createGain();
        this.state.masterGain.gain.value = 0.7; // Default volume
        
        // Create master compressor to prevent clipping
        this.state.masterCompressor = ac.createDynamicsCompressor();
        this.state.masterCompressor.threshold.value = -15;
        this.state.masterCompressor.knee.value = 10;
        this.state.masterCompressor.ratio.value = 4;
        this.state.masterCompressor.attack.value = 0.005;
        this.state.masterCompressor.release.value = 0.1;
        
        // Create master analyzer for visualization
        this.state.masterAnalyser = ac.createAnalyser();
        this.state.masterAnalyser.fftSize = 2048; // Larger FFT for more detailed analysis
        this.state.masterAnalyser.smoothingTimeConstant = 0.8;
        
        // Connect the master chain
        this.state.masterGain.connect(this.state.masterCompressor);
        this.state.masterCompressor.connect(this.state.masterAnalyser);
        this.state.masterAnalyser.connect(ac.destination);
    }
    
    /**
     * Create a new audio node in the current context
     * @param {String} nodeType - Type of audio node to create (e.g., 'Oscillator', 'Gain', 'Filter')
     * @param {Object} options - Options to pass to the node constructor
     * @returns {AudioNode} The created audio node
     */
    createAudioNode(nodeType, options = {}) {
        if (!this.state.isInitialized) {
            throw new Error("AudioEngine not initialized");
        }
        
        const methodName = `create${nodeType}`;
        if (typeof this.state.audioContext[methodName] !== 'function') {
            throw new Error(`Unknown audio node type: ${nodeType}`);
        }
        
        return this.state.audioContext[methodName](options);
    }
    
    /**
     * Get the audio context's current time
     * @returns {Number} Current audio context time in seconds
     */
    getCurrentTime() {
        return this.state.isInitialized ? this.state.audioContext.currentTime : 0;
    }
    
    /**
     * Connect an audio node to the master output
     * @param {AudioNode} node - The audio node to connect
     */
    connectToMaster(node) {
        if (!this.state.isInitialized) {
            throw new Error("AudioEngine not initialized");
        }
        
        node.connect(this.state.masterGain);
    }
    
    /**
     * Set the master volume
     * @param {Number} value - Volume level (0-1)
     */
    setMasterVolume(value) {
        if (!this.state.isInitialized) return;
        
        const safeValue = Math.max(0, Math.min(1, value));
        const now = this.getCurrentTime();
        
        // Use a slight ramp to avoid clicks
        this.state.masterGain.gain.cancelScheduledValues(now);
        this.state.masterGain.gain.setValueAtTime(this.state.masterGain.gain.value, now);
        this.state.masterGain.gain.linearRampToValueAtTime(safeValue, now + 0.02);
    }
    
    /**
     * Register an update callback to be called on each animation frame
     * Used for synchronizing audio and visual state
     * @param {Function} callback - Function to call on update
     * @returns {Number} ID for the callback (used to unregister)
     */
    registerUpdateCallback(callback) {
        return this.parameters.registerUpdateCallback(callback);
    }
    
    /**
     * Unregister an update callback
     * @param {Number} id - Callback ID to remove
     */
    unregisterUpdateCallback(id) {
        this.parameters.unregisterUpdateCallback(id);
    }
    
    /**
     * Dispose of the engine and all its resources
     */
    dispose() {
        console.log("AudioEngine: Disposing resources");
        
        // Dispose of all modules through registry
        if (this.registry) {
            this.registry.dispose();
        }
        
        // Special handling for analysis module
        if (this.analysis) {
            this.analysis.dispose();
            this.analysis = null;
        }
        
        // Close audio context if initialized
        if (this.state.audioContext && this.state.audioContext.state !== 'closed') {
            try {
                this.state.audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
            } catch (error) {
                console.error("Error disposing AudioEngine:", error);
            }
        }
        
        // Clear state
        this.state.isInitialized = false;
        this.state.isInitializing = false;
        this.state.audioContext = null;
        this.state.masterGain = null;
        this.state.masterCompressor = null;
        this.state.masterAnalyser = null;
        
        // Clear parameter system
        if (this.parameters) {
            this.parameters.dispose();
            this.parameters = null;
        }
        
        console.log("AudioEngine: Disposed");
    }
}
