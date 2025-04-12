/**
 * BackwardCompatibilityAdapter.js
 * 
 * Provides compatibility with the original SoundModule interface,
 * allowing existing visualization code to work with the new architecture.
 */

export class BackwardCompatibilityAdapter {
    /**
     * Creates a new BackwardCompatibilityAdapter
     * @param {AudioEngine} engine - Reference to the audio engine
     * @param {Object} options - Configuration options
     */
    constructor(engine, options = {}) {
        this.engine = engine;
        this.options = options;
        
        // Legacy state structure (mimics original SoundModule.audioState)
        this.audioState = {
            isInitialized: false,
            isInitializing: false,
            isPlaying: false,
            audioContext: null,
            masterGain: null,
            analyser: null,
            currentOscillator: null,
            currentFilter: null,
            currentGainNode: null,
            activeNote: null,
            currentNoteFrequency: null,
            delayNode: null,
            delayFeedback: null,
            reverbNode: null,
            reverbGain: null,
            arp: {
                active: false,
                intervalId: null,
                rate: 8,
                pattern: [0, 4, 7],
                currentStep: 0,
                baseNote: null,
            },
            parameters: {
                oscillator: { type: 'sawtooth', gain: 0.5 },
                osc2: { type: 'sine', detune: 0, mix: 0 },
                filter: { type: 'lowpass', frequency: 1500, Q: 1.0 },
                envelope: { attack: 0.05, release: 0.5 },
                lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' },
                effects: {
                    delay: { active: false, time: 0.3, feedback: 0.3 },
                    reverb: { active: false, decay: 1.5, wet: 0.3 },
                    glitch: { active: false },
                    arpeggiator: { active: false, rate: 8, pattern: [0, 7, 12] }
                }
            },
            presets: this._getPresetsDefinition(),
            activePresetName: options.initialPreset || 'default'
        };
        
        // Map legacy parameter paths to new module parameters
        this.parameterMappings = new Map();
        
        // Note frequency map (preserved from original SoundModule)
        this.noteFrequencies = {}; // Will be populated in initialize()
        this.semitoneRatio = Math.pow(2, 1/12);
        
        // Legacy method bindings 
        this.getAudioLevels = this.getAudioLevels.bind(this);
        this.startNote = this.startNote.bind(this);
        this.stopNote = this.stopNote.bind(this);
        this.setParameter = this.setParameter.bind(this);
        this.toggleEffect = this.toggleEffect.bind(this);
        this.applyPresetAudio = this.applyPresetAudio.bind(this);
        
        // Set up initialization promise to mimic original SoundModule behavior
        this.resolveInit = null;
        this.initPromise = new Promise(resolve => {
            this.resolveInit = resolve;
        });
    }
    
    /**
     * Initialize the adapter
     * @returns {Promise<Boolean>} Promise that resolves when initialized
     */
    async initialize() {
        console.log("BackwardCompatibilityAdapter: Initializing...");
        
        // Wait for engine to be initialized
        const engineReady = await this.engine.initPromise;
        if (!engineReady) {
            console.error("BackwardCompatibilityAdapter: Engine initialization failed");
            if (this.resolveInit) this.resolveInit(false);
            return false;
        }
        
        // Set up cross-references to engine components
        this.audioState.audioContext = this.engine.state.audioContext;
        this.audioState.masterGain = this.engine.state.masterGain;
        this.audioState.analyser = this.engine.state.masterAnalyser;
        
        // Generate note frequencies map (preserved from original)
        this._generateNoteFrequencies();
        
        // Set up parameter mappings between legacy and new architecture
        this._setupParameterMappings();
        
        // Set up update listeners to keep legacy state in sync
        this._setupUpdateListeners();
        
        // Mark as initialized
        this.audioState.isInitialized = true;
        
        // Resolve initialization promise
        if (this.resolveInit) this.resolveInit(true);
        
        console.log("BackwardCompatibilityAdapter: Initialized");
        return true;
    }
    
    /**
     * Generate note frequency map (matches original SoundModule implementation)
     * @private
     */
    _generateNoteFrequencies() {
        const notes = ['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 
                        'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];
        
        const baseNote = 'A4';
        const baseFreq = 440.0;
        const noteMap = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
        const baseOctave = parseInt(baseNote.slice(-1), 10);
        const baseSemitone = noteMap[baseNote.slice(0, -1)];
        
        this.noteFrequencies = {};
        notes.forEach(note => {
            const octave = parseInt(note.slice(-1), 10);
            const noteName = note.slice(0, -1);
            const semitone = noteMap[noteName];
            const semitoneDiff = (octave - baseOctave) * 12 + (semitone - baseSemitone);
            this.noteFrequencies[note] = baseFreq * Math.pow(this.semitoneRatio, semitoneDiff);
        });
    }
    
    /**
     * Set up parameter mappings between legacy and new module architecture
     * @private
     */
    _setupParameterMappings() {
        // Map legacy parameter paths to new module parameters
        // Format: 'legacy.path' -> { moduleId, paramId, transform? }
        
        // Oscillator parameters
        this.parameterMappings.set('oscillator.type', { 
            moduleId: 'oscillator1', 
            paramId: 'waveform'
        });
        
        this.parameterMappings.set('oscillator.gain', { 
            moduleId: 'oscillator1', 
            paramId: 'gain'
        });
        
        // Filter parameters
        this.parameterMappings.set('filter.type', { 
            moduleId: 'filter1', 
            paramId: 'type'
        });
        
        this.parameterMappings.set('filter.frequency', { 
            moduleId: 'filter1', 
            paramId: 'frequency'
        });
        
        this.parameterMappings.set('filter.Q', { 
            moduleId: 'filter1', 
            paramId: 'resonance'
        });
        
        // Envelope parameters
        this.parameterMappings.set('envelope.attack', { 
            moduleId: 'envelope1', 
            paramId: 'attack'
        });
        
        this.parameterMappings.set('envelope.release', { 
            moduleId: 'envelope1', 
            paramId: 'release'
        });
        
        // Effect parameters
        this.parameterMappings.set('effects.delay.active', { 
            moduleId: 'delay1', 
            paramId: 'enabled'
        });
        
        this.parameterMappings.set('effects.delay.time', { 
            moduleId: 'delay1', 
            paramId: 'time'
        });
        
        this.parameterMappings.set('effects.delay.feedback', { 
            moduleId: 'delay1', 
            paramId: 'feedback'
        });
        
        this.parameterMappings.set('effects.reverb.active', { 
            moduleId: 'reverb1', 
            paramId: 'enabled'
        });
        
        this.parameterMappings.set('effects.reverb.decay', { 
            moduleId: 'reverb1', 
            paramId: 'decayTime'
        });
        
        this.parameterMappings.set('effects.reverb.wet', { 
            moduleId: 'reverb1', 
            paramId: 'mix'
        });
        
        // Arpeggiator parameters
        this.parameterMappings.set('effects.arpeggiator.active', { 
            moduleId: 'arpeggiator1', 
            paramId: 'enabled'
        });
        
        this.parameterMappings.set('effects.arpeggiator.rate', { 
            moduleId: 'arpeggiator1', 
            paramId: 'rate'
        });
        
        this.parameterMappings.set('effects.arpeggiator.pattern', { 
            moduleId: 'arpeggiator1', 
            paramId: 'pattern'
        });
        
        // Additional parameters for new modules
        this.parameterMappings.set('osc2.type', { 
            moduleId: 'oscillator2', 
            paramId: 'waveform'
        });
        
        this.parameterMappings.set('osc2.detune', { 
            moduleId: 'oscillator2', 
            paramId: 'detune'
        });
        
        this.parameterMappings.set('osc2.mix', { 
            moduleId: 'oscillator2', 
            paramId: 'mix'
        });
        
        this.parameterMappings.set('lfo1.rate', { 
            moduleId: 'lfo1', 
            paramId: 'rate'
        });
        
        this.parameterMappings.set('lfo1.depth', { 
            moduleId: 'lfo1', 
            paramId: 'depth'
        });
        
        this.parameterMappings.set('lfo1.target', { 
            moduleId: 'lfo1', 
            paramId: 'target'
        });
        
        this.parameterMappings.set('lfo1.shape', { 
            moduleId: 'lfo1', 
            paramId: 'waveform'
        });
        
        this.parameterMappings.set('effects.glitch.active', { 
            moduleId: 'visualizer1', 
            paramId: 'glitchEnabled'
        });
        
        // Register these mappings with the engine for use elsewhere
        for (const [legacyPath, mapping] of this.parameterMappings.entries()) {
            this.engine.registry.registerBackwardCompatMapping(legacyPath, mapping);
        }
    }
    
    /**
     * Set up update listeners to keep legacy state in sync with new architecture
     * @private
     */
    _setupUpdateListeners() {
        // Listen for parameter changes in the new architecture
        for (const [legacyPath, mapping] of this.parameterMappings.entries()) {
            const { moduleId, paramId } = mapping;
            
            this.engine.parameters.addParameterListener(moduleId, paramId, (value) => {
                // Update legacy state
                this._updateLegacyState(legacyPath, value);
            });
        }
        
        // Listen for active note changes
        // (assuming a 'voiceManager' module with 'activeNote' parameter)
        this.engine.parameters.addParameterListener('voiceManager', 'activeNote', (value) => {
            this.audioState.activeNote = value;
        });
        
        this.engine.parameters.addParameterListener('voiceManager', 'activeFrequency', (value) => {
            this.audioState.currentNoteFrequency = value;
        });
        
        this.engine.parameters.addParameterListener('voiceManager', 'isPlaying', (value) => {
            this.audioState.isPlaying = value;
        });
    }
    
    /**
     * Update legacy state based on new parameter values
     * @param {String} legacyPath - Legacy parameter path (dot notation)
     * @param {*} value - New parameter value
     * @private
     */
    _updateLegacyState(legacyPath, value) {
        const path = legacyPath.split('.');
        let current = this.audioState.parameters;
        
        // Navigate to the parent object
        for (let i = 0; i < path.length - 1; i++) {
            if (!current[path[i]]) {
                current[path[i]] = {};
            }
            current = current[path[i]];
        }
        
        // Update the value
        current[path[path.length - 1]] = value;
    }
    
    /**
     * Start playing a note (legacy interface method)
     * @param {String} note - Note name (e.g., 'C4')
     */
    async startNote(note) {
        // Ensure adapter is initialized
        const adapterReady = await this.initPromise;
        if (!adapterReady) {
            console.warn(`BackwardCompatibilityAdapter: Cannot start note ${note}. Not initialized.`);
            return;
        }
        
        // Get frequency for this note
        const frequency = this.noteFrequencies[note];
        if (!frequency) {
            console.warn(`BackwardCompatibilityAdapter: Unknown note: ${note}`);
            return;
        }
        
        // Update legacy state
        this.audioState.activeNote = note;
        this.audioState.currentNoteFrequency = frequency;
        
        // Forward to the voice manager module
        try {
            const voiceManager = this.engine.registry.getModule('voiceManager');
            await voiceManager.startNote(note, frequency);
        } catch (error) {
            console.error("BackwardCompatibilityAdapter: Error starting note:", error);
        }
    }
    
    /**
     * Stop playing the current note (legacy interface method)
     * @param {Boolean} useRelease - Whether to use release envelope
     */
    async stopNote(useRelease = true) {
        // Ensure adapter is initialized
        const adapterReady = await this.initPromise;
        if (!adapterReady || !this.audioState.isPlaying) {
            return;
        }
        
        // Forward to the voice manager module
        try {
            const voiceManager = this.engine.registry.getModule('voiceManager');
            await voiceManager.stopNote(useRelease);
            
            // Update legacy state
            this.audioState.activeNote = null;
            this.audioState.isPlaying = false;
        } catch (error) {
            console.error("BackwardCompatibilityAdapter: Error stopping note:", error);
        }
    }
    
    /**
     * Set a parameter value (legacy interface method)
     * @param {String} type - Parameter type (e.g., 'oscillator', 'filter')
     * @param {String} name - Parameter name (e.g., 'type', 'frequency')
     * @param {*} value - Parameter value
     */
    setParameter(type, name, value) {
        const legacyPath = `${type}.${name}`;
        const mapping = this.parameterMappings.get(legacyPath);
        
        if (!mapping) {
            console.warn(`BackwardCompatibilityAdapter: No mapping for legacy parameter ${legacyPath}`);
            
            // Still update legacy state even if no mapping exists
            this._updateLegacyState(legacyPath, value);
            return;
        }
        
        const { moduleId, paramId, transform } = mapping;
        const transformedValue = transform ? transform(value) : value;
        
        // Set the parameter in the new architecture
        this.engine.parameters.setParameter(moduleId, paramId, transformedValue);
    }
    
    /**
     * Toggle an effect on/off (legacy interface method)
     * @param {String} effectName - Name of the effect (e.g., 'delay', 'reverb')
     * @param {Boolean} isActive - Whether the effect should be active
     */
    toggleEffect(effectName, isActive) {
        const legacyPath = `effects.${effectName}.active`;
        const mapping = this.parameterMappings.get(legacyPath);
        
        if (!mapping) {
            console.warn(`BackwardCompatibilityAdapter: No mapping for legacy effect ${effectName}`);
            
            // Still update legacy state
            this._updateLegacyState(legacyPath, isActive);
            return;
        }
        
        const { moduleId, paramId } = mapping;
        
        // Set the parameter in the new architecture
        this.engine.parameters.setParameter(moduleId, paramId, isActive);
        
        // Special case for arpeggiator
        if (effectName === 'arpeggiator') {
            this.audioState.arp.active = isActive;
            
            // If turning on arpeggiator and a note is active, restart with arp
            if (isActive && this.audioState.activeNote) {
                this.audioState.arp.baseNote = this.audioState.activeNote;
                // Actual arpeggiator control is handled by the arpeggiator module
            }
        }
    }
    
    /**
     * Apply a preset (legacy interface method)
     * @param {String} presetName - Name of the preset to apply
     */
    applyPresetAudio(presetName) {
        // Get the preset data
        const preset = this.audioState.presets[presetName];
        if (!preset) {
            console.warn(`BackwardCompatibilityAdapter: Preset '${presetName}' not found.`);
            return;
        }
        
        console.log(`BackwardCompatibilityAdapter: Applying preset '${presetName}'`);
        
        // Update legacy state
        this.audioState.activePresetName = presetName;
        
        // Apply the preset using batch update
        this.engine.parameters.beginBatchUpdate();
        
        // Merge with default preset for complete parameter set
        const defaultPreset = this.audioState.presets['default'];
        const mergedParams = this._deepMerge({}, defaultPreset, preset);
        
        // Update the parameter values
        this._applyPresetParameters(mergedParams);
        
        // End batch update to apply all changes at once
        this.engine.parameters.endBatchUpdate();
    }
    
    /**
     * Recursively apply preset parameters
     * @param {Object} params - Parameter object to apply
     * @param {String} basePath - Base path for recursive calls
     * @private
     */
    _applyPresetParameters(params, basePath = '') {
        for (const [key, value] of Object.entries(params)) {
            const path = basePath ? `${basePath}.${key}` : key;
            
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Recurse into nested objects
                this._applyPresetParameters(value, path);
            } else {
                // Apply leaf value
                const mapping = this.parameterMappings.get(path);
                
                if (mapping) {
                    const { moduleId, paramId, transform } = mapping;
                    const transformedValue = transform ? transform(value) : value;
                    
                    // Set the parameter in the new architecture
                    this.engine.parameters.setParameter(moduleId, paramId, transformedValue, {
                        notifyListeners: true,
                        applyVisualMappings: true
                    });
                } else {
                    // Update legacy state even without mapping
                    this._updateLegacyState(path, value);
                }
            }
        }
    }
    
    /**
     * Get audio analysis data (legacy interface method)
     * @returns {Object} Audio level data
     */
    getAudioLevels() {
        const defaultLevels = { 
            bass: 0, 
            mid: 0, 
            high: 0, 
            frequency: this.audioState.currentNoteFrequency || null 
        };
        
        if (!this.audioState.isInitialized || !this.engine.analysis) {
            return defaultLevels;
        }
        
        // Forward to analysis module
        try {
            return this.engine.analysis.getAudioLevels();
        } catch (error) {
            console.error("BackwardCompatibilityAdapter: Error getting audio levels:", error);
            return defaultLevels;
        }
    }
    
    /**
     * Get the list of available preset names (legacy interface method)
     * @returns {Array<String>} List of preset names
     */
    getPresetNames() {
        if (!this.audioState.presets) return [];
        return Object.keys(this.audioState.presets).filter(name => name !== 'default');
    }
    
    /**
     * Get preset definitions (legacy implementation)
     * @returns {Object} Preset definitions
     * @private
     */
    _getPresetsDefinition() {
        const defaultStructure = {
            oscillator: {type: 'sawtooth', gain: 0.5},
            osc2: { type: 'sine', detune: 0, mix: 0 },
            filter: {type: 'lowpass', frequency: 1500, Q: 1.0},
            envelope: {attack: 0.05, release: 0.5},
            lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' },
            effects: {
                delay: {active: false, time: 0.3, feedback: 0.3},
                reverb: {active: false, decay: 1.5, wet: 0.3},
                glitch: {active: false},
                arpeggiator: {active: false, rate: 8, pattern: [0, 7, 12]}
            },
        };
        
        return {
            'default': defaultStructure,
            'vaporwave': {
                oscillator: {type: 'sine', gain: 0.4},
                filter: {frequency: 800, Q: 2.0},
                envelope: {attack: 0.8, release: 2.0},
                effects: { 
                    delay: {active: true, time: 0.55, feedback: 0.45}, 
                    reverb: {active: true, decay: 3.5, wet: 0.65}, 
                    arpeggiator: {active: false} 
                },
            },
            'ambient_drone': {
                oscillator: {type: 'sine', gain: 0.4}, 
                osc2: { type: 'triangle', detune: 5, mix: 0.3 },
                filter: {frequency: 600, Q: 1.5}, 
                envelope: {attack: 3.0, release: 5.0},
                effects: { 
                    delay: {active: true, time: 0.8, feedback: 0.6}, 
                    reverb: {active: true, decay: 6.0, wet: 0.8}, 
                    arpeggiator: {active: false} 
                },
            },
            'synthwave_lead': {
                oscillator: {type: 'sawtooth', gain: 0.6}, 
                osc2: { type: 'square', detune: -7, mix: 0.2 },
                filter: {frequency: 1200, Q: 5.0}, 
                envelope: {attack: 0.02, release: 0.4},
                effects: { 
                    delay: {active: true, time: 0.25, feedback: 0.3}, 
                    reverb: {active: true, decay: 1.5, wet: 0.4}, 
                    arpeggiator: {active: true, rate: 12, pattern: [0, 7, 12, 16]} 
                },
            },
            'grimoire_pulse': {
                oscillator: {type: 'square', gain: 0.4},
                filter: {type: 'bandpass', frequency: 900, Q: 6.0}, 
                envelope: {attack: 0.01, release: 0.2},
                effects: { 
                    delay: {active: true, time: 0.15, feedback: 0.65}, 
                    reverb: {active: false}, 
                    glitch: {active: true}, 
                    arpeggiator: {active: true, rate: 10, pattern: [0, 3, 7, 10]} 
                },
            },
            'dark_ritual': {
                oscillator: { type: 'sawtooth', gain: 0.5 }, 
                osc2: { type: 'sawtooth', detune: 15, mix: 0.4 },
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
                osc2: { type: 'sawtooth', detune: -12, mix: 0.5 },
                filter: { type: 'lowpass', frequency: 300, Q: 8.0 }, 
                envelope: { attack: 0.01, release: 0.3 },
                effects: { 
                    delay: { active: false }, 
                    reverb: { active: true, decay: 0.8, wet: 0.2 }, 
                    glitch: { active: false }, 
                    arpeggiator: { active: true, rate: 16, pattern: [0, 0, 7, 0, 10, 0, 7, 0] } 
                },
            },
            'crystal_pad': {
                oscillator: { type: 'triangle', gain: 0.4 }, 
                osc2: { type: 'sine', detune: 7, mix: 0.6 },
                filter: { type: 'highpass', frequency: 500, Q: 2.0 }, 
                envelope: { attack: 1.8, release: 3.5 },
                effects: { 
                    delay: { active: true, time: 0.4, feedback: 0.5 }, 
                    reverb: { active: true, decay: 5.0, wet: 0.7 }, 
                    glitch: { active: false }, 
                    arpeggiator: { active: false } 
                },
            },
            'pulsar_wind': {
                oscillator: { type: 'sawtooth', gain: 0.3 },
                filter: { type: 'bandpass', frequency: 2500, Q: 15.0 }, 
                envelope: { attack: 0.1, release: 1.5 },
                lfo1: { rate: 0.2, depth: 4000, target: 'filterFreq', shape: 'sawtooth' },
                effects: { 
                    delay: { active: true, time: 1.2, feedback: 0.7 }, 
                    reverb: { active: true, decay: 6.0, wet: 0.4 }, 
                    glitch: { active: false }, 
                    arpeggiator: { active: false } 
                },
            }
        };
    }
    
    /**
     * Deep merge objects (helper method)
     * @returns {Object} Merged result
     * @private
     */
    _deepMerge(target, ...sources) {
        for (const source of sources) {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    const targetValue = target[key];
                    const sourceValue = source[key];
                    
                    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                        if (!targetValue || typeof targetValue !== 'object') { 
                            target[key] = {}; 
                        }
                        this._deepMerge(target[key], sourceValue);
                    } else { 
                        target[key] = sourceValue; 
                    }
                }
            }
        }
        return target;
    }
    
    /**
     * Dispose of the adapter and clean up resources
     */
    dispose() {
        // No audio resources to clean up directly, just clear references
        this.engine = null;
        this.audioState = null;
        this.parameterMappings.clear();
        this.resolveInit = null;
        this.initPromise = null;
        
        console.log("BackwardCompatibilityAdapter: Disposed");
    }
}
