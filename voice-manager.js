/**
 * VoiceManager.js - Manages voice allocation and note playback
 * 
 * Handles note triggering, voice allocation, and arpeggiator functionality.
 * Acts as the central coordinator for sound generation modules.
 */

import { AudioModuleBase } from '../base/AudioModuleBase.js';

export class VoiceManager extends AudioModuleBase {
    /**
     * Create a new VoiceManager
     * @param {AudioEngine} engine - The audio engine instance
     * @param {String} id - Unique identifier for this module
     * @param {Object} options - Configuration options
     */
    constructor(engine, id, options = {}) {
        super(engine, id, options);
        
        // Voice management
        this.voices = [];
        this.activeVoices = new Map(); // noteId -> voiceIndex
        
        // Note state tracking
        this.state = {
            isPlaying: false,
            activeNote: null,
            activeNoteId: null, // For tracking individual note instances
            activeFrequency: null,
            notesOn: new Set(), // All currently pressed notes
            noteCounter: 0, // For generating unique note IDs
            
            // Arpeggiator
            arp: {
                active: false,
                intervalId: null,
                currentStep: 0,
                baseNote: null,
                baseFrequency: null,
                noteHistory: [], // Recently played notes (for arp patterns)
                lastStepTime: 0
            }
        };
        
        // Note frequency calculation
        this.noteFrequencies = {};
        this.semitoneRatio = Math.pow(2, 1/12);
    }
    
    /**
     * Get default options for this module
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {
            polyphonyEnabled: false, // Whether multiple notes can play simultaneously
            maxVoices: 8, // Maximum number of simultaneous voices
            voiceStealing: true, // Whether to steal voices when maxVoices is reached
            createVoices: true, // Whether to automatically create internal voices
            connectToMaster: true, // Whether to connect voices to master output
            legacyCompatMode: true, // Whether to maintain compatibility with original SoundModule
        };
    }
    
    /**
     * Get initial parameter values
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {
            enabled: true,
            portamento: 0, // Glide time in seconds
            polyphony: 1, // Number of simultaneous notes (1 = mono)
            voiceMode: 'mono', // mono, poly, legato, unison
            unisonCount: 1, // Number of unison voices (1 = no unison)
            unisonDetune: 0.1, // Detune amount for unison voices (0-1)
            unisonSpread: 0.5, // Stereo spread for unison voices (0-1)
            glideMode: 'always', // always, legato, off
            keyPriority: 'last', // last, first, highest, lowest
            retrigger: true, // Whether to retrigger envelopes when changing notes
            
            // Arpeggiator parameters
            arpeggiatorEnabled: false,
            arpRate: 8, // Steps per second
            arpPattern: [0, 4, 7], // Semitones from base note
            arpOctaves: 1, // Number of octaves to span
            arpDirection: 'up', // up, down, up-down, random
            arpMode: 'semitones', // semitones, played-notes
            arpSyncToTempo: false, // Whether to sync to tempo
            arpTempoMultiplier: 1, // Note value multiplier for tempo sync
            
            // Current state parameters (for visualization/UI)
            isPlaying: false, // Whether any note is currently playing
            activeNote: null, // Currently playing note name (e.g., 'C4')
            activeFrequency: null, // Currently playing frequency
            activeVoiceCount: 0 // Number of currently active voices
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
                description: 'Enable/disable the voice manager'
            },
            portamento: {
                type: 'float',
                min: 0,
                max: 10,
                step: 0.01,
                default: 0,
                description: 'Portamento/glide time in seconds',
                visualMappings: [
                    {
                        visualParam: 'universeModifier',
                        transform: (val) => {
                            // Longer portamento = more universe expansion
                            return 1.0 + Math.min(0.5, val / 5.0);
                        }
                    }
                ]
            },
            polyphony: {
                type: 'integer',
                min: 1,
                max: 16,
                step: 1,
                default: 1,
                description: 'Number of simultaneous notes (1 = mono)',
                visualMappings: [
                    {
                        visualParam: 'gridDensity',
                        transform: (val) => {
                            // More polyphony = denser grid
                            return 4 + val * 1.5;
                        }
                    }
                ]
            },
            voiceMode: {
                type: 'enum',
                options: ['mono', 'poly', 'legato', 'unison'],
                default: 'mono',
                description: 'Voice mode (mono, poly, legato, unison)'
            },
            unisonCount: {
                type: 'integer',
                min: 1,
                max: 8,
                step: 1,
                default: 1,
                description: 'Number of unison voices (1 = no unison)'
            },
            unisonDetune: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.1,
                description: 'Detune amount for unison voices (0-1)'
            },
            unisonSpread: {
                type: 'float',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.5,
                description: 'Stereo spread for unison voices (0-1)'
            },
            glideMode: {
                type: 'enum',
                options: ['always', 'legato', 'off'],
                default: 'always',
                description: 'Glide mode (always, legato, off)'
            },
            keyPriority: {
                type: 'enum',
                options: ['last', 'first', 'highest', 'lowest'],
                default: 'last',
                description: 'Key priority for monophonic modes'
            },
            retrigger: {
                type: 'boolean',
                default: true,
                description: 'Whether to retrigger envelopes when changing notes'
            },
            
            // Arpeggiator parameters
            arpeggiatorEnabled: {
                type: 'boolean',
                default: false,
                description: 'Enable/disable the arpeggiator'
            },
            arpRate: {
                type: 'float',
                min: 0.1,
                max: 30,
                step: 0.1,
                default: 8,
                description: 'Arpeggiator rate in steps per second',
                visualMappings: [
                    {
                        visualParam: 'rotationSpeed',
                        transform: (val) => {
                            // Map arp rate to rotation speed (faster arp = faster rotation)
                            return 0.05 + Math.min(1.5, val / 20);
                        }
                    }
                ]
            },
            arpPattern: {
                type: 'integer[]',
                default: [0, 4, 7],
                description: 'Arpeggiator pattern as semitone offsets',
                visualMappings: [
                    {
                        visualParam: 'patternComplexity',
                        transform: (val) => {
                            // More complex patterns = higher value
                            return Math.min(1.0, val.length / 8);
                        }
                    }
                ]
            },
            arpOctaves: {
                type: 'integer',
                min: 1,
                max: 4,
                step: 1,
                default: 1,
                description: 'Number of octaves for arpeggiator'
            },
            arpDirection: {
                type: 'enum',
                options: ['up', 'down', 'up-down', 'random'],
                default: 'up',
                description: 'Arpeggiator direction'
            },
            arpMode: {
                type: 'enum',
                options: ['semitones', 'played-notes'],
                default: 'semitones',
                description: 'Arpeggiator mode (semitones or played notes)'
            },
            arpSyncToTempo: {
                type: 'boolean',
                default: false,
                description: 'Whether to sync arpeggiator to tempo'
            },
            arpTempoMultiplier: {
                type: 'float',
                min: 0.25,
                max: 4,
                step: 0.25,
                default: 1,
                description: 'Arpeggiator tempo multiplier'
            },
            
            // Current state parameters (read-only)
            isPlaying: {
                type: 'boolean',
                default: false,
                description: 'Whether any note is currently playing',
                readOnly: true
            },
            activeNote: {
                type: 'string',
                default: null,
                description: 'Currently playing note name',
                readOnly: true
            },
            activeFrequency: {
                type: 'float',
                default: null,
                description: 'Currently playing frequency',
                readOnly: true,
                visualMappings: [
                    {
                        visualParam: 'frequencyReference',
                        transform: (val) => val || 0
                    }
                ]
            },
            activeVoiceCount: {
                type: 'integer',
                default: 0,
                description: 'Number of currently active voices',
                readOnly: true
            }
        };
    }
    
    /**
     * Initialize the voice manager
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }
        
        try {
            // Initialize note frequency map
            this._initializeNoteFrequencies();
            
            // Create voices if option is enabled
            if (this.options.createVoices) {
                await this._createVoices();
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error(`VoiceManager(${this.id}): Initialization error:`, error);
            return false;
        }
    }
    
    /**
     * Initialize note frequency map
     * @private
     */
    _initializeNoteFrequencies() {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const baseNote = 'A4';
        const baseFreq = 440.0;
        const noteMap = {};
        
        // Create mapping for note names to indices
        notes.forEach((note, index) => {
            noteMap[note] = index;
        });
        
        // Parse base note
        const baseOctave = parseInt(baseNote.slice(-1), 10);
        const baseSemitone = noteMap[baseNote.slice(0, -1)];
        
        // Generate frequencies for octaves 0-9
        for (let octave = 0; octave <= 9; octave++) {
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i] + octave;
                const semitoneDiff = (octave - baseOctave) * 12 + (i - baseSemitone);
                this.noteFrequencies[note] = baseFreq * Math.pow(this.semitoneRatio, semitoneDiff);
            }
        }
    }
    
    /**
     * Create internal voice modules
     * @private
     */
    async _createVoices() {
        // Get registry to create modules
        const registry = this.engine.registry;
        
        // Calculate how many voices to create
        const polyphony = this.getParameter('polyphony');
        const unisonCount = this.getParameter('unisonCount');
        const maxVoices = this.options.maxVoices;
        const totalVoices = Math.min(maxVoices, polyphony * unisonCount);
        
        // Create voices
        for (let i = 0; i < totalVoices; i++) {
            try {
                // Create voice components
                const voiceId = `${this.id}_voice${i}`;
                
                // Create oscillator
                const oscillator = await registry.createModule('OscillatorModule', `${voiceId}_osc1`, {
                    isMaster: true,
                    connectToMaster: false
                });
                
                // Create second oscillator (initially disabled)
                const oscillator2 = await registry.createModule('OscillatorModule', `${voiceId}_osc2`, {
                    isMaster: false,
                    connectToMaster: false
                });
                oscillator2.setParameter('enabled', false);
                oscillator2.setParameter('mix', 0);
                
                // Create filter
                const filter = await registry.createModule('FilterModule', `${voiceId}_filter`, {
                    connectToMaster: false
                });
                
                // Create amplitude envelope
                const ampEnv = await registry.createModule('EnvelopeModule', `${voiceId}_ampEnv`, {
                    type: 'amplitude',
                    createGainNode: true,
                    connectToMaster: false
                });
                
                // Create filter envelope
                const filterEnv = await registry.createModule('EnvelopeModule', `${voiceId}_filterEnv`, {
                    type: 'filter',
                    createGainNode: false,
                    customOutputRange: [-10000, 10000]
                });
                
                // Initialize all modules
                await oscillator.initialize();
                await oscillator2.initialize();
                await filter.initialize();
                await ampEnv.initialize();
                await filterEnv.initialize();
                
                // Connect modules
                oscillator.connect(filter);
                oscillator2.connect(filter);
                filter.connect(ampEnv);
                
                // Connect filter envelope to filter
                filterEnv.addTarget('filterFreq', filter.getNode('filterNode'), 'frequency', filter.getParameter('frequency'));
                
                // Connect to master if option enabled
                if (this.options.connectToMaster) {
                    ampEnv.connect(this.engine.state.masterGain);
                }
                
                // Store voice
                this.voices.push({
                    index: i,
                    id: voiceId,
                    modules: {
                        oscillator,
                        oscillator2,
                        filter,
                        ampEnv,
                        filterEnv
                    },
                    state: {
                        noteId: null,
                        note: null,
                        frequency: null,
                        startTime: 0,
                        active: false,
                        stealing: false
                    }
                });
                
                console.log(`VoiceManager(${this.id}): Created voice ${i}`);
            } catch (error) {
                console.error(`VoiceManager(${this.id}): Error creating voice ${i}:`, error);
            }
        }
        
        // Update active voice count
        this.setParameter('activeVoiceCount', 0);
        
        return this.voices.length > 0;
    }
    
    /**
     * Start playing a note
     * @param {String} note - Note name (e.g., 'C4')
     * @param {Number} [velocity=1] - Note velocity (0-1)
     * @returns {String|null} Note ID if successful, null if failed
     */
    async startNote(note, velocity = 1.0) {
        if (!this.isInitialized || !this.getParameter('enabled')) {
            return null;
        }
        
        // Calculate frequency for this note
        const frequency = this.getNoteFrequency(note);
        if (!frequency) {
            console.warn(`VoiceManager(${this.id}): Unknown note: ${note}`);
            return null;
        }
        
        // Generate a unique ID for this note instance
        const noteId = `${note}_${++this.state.noteCounter}`;
        
        // Add to pressed notes
        this.state.notesOn.add(note);
        
        // Handle arpeggiator if active
        if (this.getParameter('arpeggiatorEnabled')) {
            // Update arpeggiator state
            this.state.arp.baseNote = note;
            this.state.arp.baseFrequency = frequency;
            
            // Add to note history if using played-notes mode
            if (this.getParameter('arpMode') === 'played-notes') {
                this._updateArpNoteHistory(note);
            }
            
            // Start arpeggiator if not already running
            if (!this.state.arp.active) {
                await this._startArpeggiator();
            }
            
            return noteId;
        }
        
        // Get voice mode
        const voiceMode = this.getParameter('voiceMode');
        
        // Handle monophonic modes
        if (voiceMode === 'mono' || voiceMode === 'legato') {
            return this._startMonophonicNote(note, frequency, velocity, voiceMode === 'legato');
        }
        
        // Handle polyphonic mode
        if (voiceMode === 'poly') {
            return this._startPolyphonicNote(note, frequency, velocity);
        }
        
        // Handle unison mode
        if (voiceMode === 'unison') {
            return this._startUnisonNote(note, frequency, velocity);
        }
        
        return null;
    }
    
    /**
     * Start a monophonic note
     * @param {String} note - Note name
     * @param {Number} frequency - Note frequency
     * @param {Number} velocity - Note velocity
     * @param {Boolean} legato - Whether to use legato mode
     * @returns {String|null} Note ID if successful, null if failed
     * @private
     */
    _startMonophonicNote(note, frequency, velocity, legato) {
        // Get portamento time and glide mode
        const portamento = this.getParameter('portamento');
        const glideMode = this.getParameter('glideMode');
        const retrigger = this.getParameter('retrigger');
        
        // Generate note ID
        const noteId = `${note}_${++this.state.noteCounter}`;
        
        // Check if we're already playing a note
        const isNoteChange = this.state.activeNote !== null && this.state.activeNote !== note;
        const shouldGlide = isNoteChange && (
            glideMode === 'always' || (glideMode === 'legato' && this.state.notesOn.size > 1)
        );
        const shouldRetrigger = !legato || (retrigger && isNoteChange);
        
        // Get the first voice
        if (this.voices.length === 0) {
            return null;
        }
        
        const voice = this.voices[0];
        
        // If already playing the same note and not retriggering, just return
        if (this.state.activeNote === note && !shouldRetrigger) {
            return noteId;
        }
        
        // Start the voice with appropriate parameters
        this._startVoice(voice, note, frequency, velocity, {
            portamento: shouldGlide ? portamento : 0,
            retrigger: shouldRetrigger
        });
        
        // Update state
        this.state.activeNote = note;
        this.state.activeNoteId = noteId;
        this.state.activeFrequency = frequency;
        this.state.isPlaying = true;
        
        // Update active voice count
        this.setParameter('activeVoiceCount', 1);
        
        // Update visual parameters
        this.setParameter('activeNote', note);
        this.setParameter('activeFrequency', frequency);
        this.setParameter('isPlaying', true);
        
        // Add to active voices map
        this.activeVoices.set(noteId, voice.index);
        
        return noteId;
    }
    
    /**
     * Start a polyphonic note
     * @param {String} note - Note name
     * @param {Number} frequency - Note frequency
     * @param {Number} velocity - Note velocity
     * @returns {String|null} Note ID if successful, null if failed
     * @private
     */
    _startPolyphonicNote(note, frequency, velocity) {
        // Generate note ID
        const noteId = `${note}_${++this.state.noteCounter}`;
        
        // Find a free voice or steal if needed
        const voice = this._findFreeVoice();
        if (!voice) {
            return null;
        }
        
        // Start the voice
        this._startVoice(voice, note, frequency, velocity, {
            portamento: 0, // No portamento in poly mode
            retrigger: true // Always retrigger in poly mode
        });
        
        // Update state
        this.state.isPlaying = true;
        
        // For visualization, set active note to the most recent one
        this.state.activeNote = note;
        this.state.activeNoteId = noteId;
        this.state.activeFrequency = frequency;
        
        // Update active voice count
        this.setParameter('activeVoiceCount', this._countActiveVoices());
        
        // Update visual parameters
        this.setParameter('activeNote', note);
        this.setParameter('activeFrequency', frequency);
        this.setParameter('isPlaying', true);
        
        // Add to active voices map
        this.activeVoices.set(noteId, voice.index);
        
        return noteId;
    }
    
    /**
     * Start a unison note (multiple detuned voices for one note)
     * @param {String} note - Note name
     * @param {Number} frequency - Note frequency
     * @param {Number} velocity - Note velocity
     * @returns {String|null} Note ID if successful, null if failed
     * @private
     */
    _startUnisonNote(note, frequency, velocity) {
        // Get unison parameters
        const unisonCount = this.getParameter('unisonCount');
        const unisonDetune = this.getParameter('unisonDetune');
        const unisonSpread = this.getParameter('unisonSpread');
        const portamento = this.getParameter('portamento');
        
        // Generate note ID
        const noteId = `${note}_${++this.state.noteCounter}`;
        
        // Stop any currently playing notes
        this._releaseAllVoices();
        
        // Calculate how many voices to use
        const availableVoices = Math.min(unisonCount, this.voices.length);
        
        // Exit if no voices
        if (availableVoices === 0) {
            return null;
        }
        
        // Start each unison voice
        for (let i = 0; i < availableVoices; i++) {
            const voice = this.voices[i];
            
            // Calculate detune and pan for this voice
            const detuneRange = 100 * unisonDetune; // 100 cents = 1 semitone
            const spreadRange = unisonSpread;
            
            let detune = 0;
            let pan = 0;
            
            if (availableVoices > 1) {
                // Distribute detune and pan across voices
                const normalizedIndex = i / (availableVoices - 1); // 0 to 1
                const spreadPos = normalizedIndex * 2 - 1; // -1 to 1
                
                // Center voice has no detune, others are detuned
                if (availableVoices === 1) {
                    detune = 0;
                } else if (availableVoices === 2) {
                    detune = (i === 0) ? -detuneRange/2 : detuneRange/2;
                } else {
                    // Alternate negative and positive detune
                    if (i === Math.floor(availableVoices / 2)) {
                        detune = 0; // Center voice is not detuned
                    } else if (i < Math.floor(availableVoices / 2)) {
                        detune = -detuneRange * (1 - normalizedIndex * 2);
                    } else {
                        detune = detuneRange * (normalizedIndex * 2 - 1);
                    }
                }
                
                // Pan is distributed across the stereo field
                pan = spreadPos * spreadRange;
            }
            
            // Apply detune and pan to the voice
            voice.modules.oscillator.setParameter('detune', detune);
            voice.modules.oscillator2.setParameter('detune', detune);
            
            // TODO: Add panning when we have a panner node in the architecture
            
            // Start the voice
            this._startVoice(voice, note, frequency, velocity, {
                portamento,
                retrigger: true
            });
            
            // Add to active voices map
            this.activeVoices.set(`${noteId}_unison${i}`, voice.index);
        }
        
        // Update state
        this.state.activeNote = note;
        this.state.activeNoteId = noteId;
        this.state.activeFrequency = frequency;
        this.state.isPlaying = true;
        
        // Update active voice count
        this.setParameter('activeVoiceCount', availableVoices);
        
        // Update visual parameters
        this.setParameter('activeNote', note);
        this.setParameter('activeFrequency', frequency);
        this.setParameter('isPlaying', true);
        
        return noteId;
    }
    
    /**
     * Start a single voice
     * @param {Object} voice - Voice object
     * @param {String} note - Note name
     * @param {Number} frequency - Note frequency
     * @param {Number} velocity - Note velocity
     * @param {Object} options - Additional options
     * @param {Number} options.portamento - Portamento time in seconds
     * @param {Boolean} options.retrigger - Whether to retrigger envelopes
     * @private
     */
    _startVoice(voice, note, frequency, velocity, options = {}) {
        const { portamento = 0, retrigger = true } = options;
        
        // Get current time
        const now = this.engine.getCurrentTime();
        
        // Mark voice as active
        voice.state.note = note;
        voice.state.frequency = frequency;
        voice.state.startTime = now;
        voice.state.active = true;
        
        // Start oscillators
        const { oscillator, oscillator2, filter, ampEnv, filterEnv } = voice.modules;
        
        // Set oscillator frequency with portamento if needed
        if (portamento > 0 && voice.state.frequency !== null) {
            // Glide from previous frequency
            oscillator.startOscillator(voice.state.frequency);
            oscillator2.startOscillator(voice.state.frequency);
            
            // Schedule frequency change
            const ac = this.engine.state.audioContext;
            const osc1 = oscillator.getNode('oscillator');
            const osc2 = oscillator2.getNode('oscillator');
            
            if (osc1) {
                osc1.frequency.cancelScheduledValues(now);
                osc1.frequency.setValueAtTime(osc1.frequency.value, now);
                osc1.frequency.exponentialRampToValueAtTime(frequency, now + portamento);
            }
            
            if (osc2) {
                osc2.frequency.cancelScheduledValues(now);
                osc2.frequency.setValueAtTime(osc2.frequency.value, now);
                osc2.frequency.exponentialRampToValueAtTime(frequency, now + portamento);
            }
        } else {
            // Start at target frequency immediately
            oscillator.startOscillator(frequency);
            oscillator2.startOscillator(frequency);
        }
        
        // Trigger envelopes if retriggering or first note
        if (retrigger || !ampEnv.isActive()) {
            ampEnv.trigger(velocity);
            filterEnv.trigger(velocity);
        }
    }
    
    /**
     * Stop playing a note
     * @param {String} note - Note name or note ID
     * @param {Boolean} [useRelease=true] - Whether to use release envelope
     * @returns {Boolean} Success state
     */
    stopNote(note, useRelease = true) {
        if (!this.isInitialized || !this.state.isPlaying) {
            return false;
        }
        
        // Handle ID-based note stop
        if (note && note.includes('_')) {
            return this._releaseVoiceById(note, useRelease);
        }
        
        // Remove from pressed notes
        this.state.notesOn.delete(note);
        
        // Handle arpeggiator mode
        if (this.getParameter('arpeggiatorEnabled')) {
            // If no more notes are pressed, stop arpeggiator
            if (this.state.notesOn.size === 0) {
                this._stopArpeggiator();
                this._releaseAllVoices(useRelease);
                
                // Update state
                this.state.activeNote = null;
                this.state.activeNoteId = null;
                this.state.activeFrequency = null;
                this.state.isPlaying = false;
                
                // Update UI parameters
                this.setParameter('activeNote', null);
                this.setParameter('activeFrequency', null);
                this.setParameter('isPlaying', false);
                this.setParameter('activeVoiceCount', 0);
            } else if (this.state.arp.baseNote === note) {
                // If the base note was released, switch to a new base note
                this._updateArpBaseNote();
            }
            
            return true;
        }
        
        // Get voice mode
        const voiceMode = this.getParameter('voiceMode');
        
        // Handle different voice modes
        if (voiceMode === 'poly') {
            return this._releasePolyphonicNote(note, useRelease);
        } else if (voiceMode === 'mono' || voiceMode === 'legato' || voiceMode === 'unison') {
            return this._releaseMonophonicNote(note, useRelease);
        }
        
        return false;
    }
    
    /**
     * Release a voice by note ID
     * @param {String} noteId - Note ID
     * @param {Boolean} useRelease - Whether to use release envelope
     * @returns {Boolean} Success state
     * @private
     */
    _releaseVoiceById(noteId, useRelease) {
        // Check if this note ID is in active voices
        const voiceIndex = this.activeVoices.get(noteId);
        
        if (voiceIndex === undefined) {
            // Handle unison voices (they have _unisonX suffix)
            const unisonMatches = [];
            
            for (const [id, index] of this.activeVoices.entries()) {
                if (id.startsWith(noteId + '_unison')) {
                    unisonMatches.push(id);
                }
            }
            
            if (unisonMatches.length > 0) {
                // Release all matching unison voices
                for (const id of unisonMatches) {
                    const index = this.activeVoices.get(id);
                    const voice = this.voices[index];
                    
                    if (voice) {
                        this._releaseVoice(voice, useRelease);
                        this.activeVoices.delete(id);
                    }
                }
                
                // Update active voice count
                this.setParameter('activeVoiceCount', this._countActiveVoices());
                
                // Update state if no more voices are active
                if (this._countActiveVoices() === 0) {
                    this.state.activeNote = null;
                    this.state.activeNoteId = null;
                    this.state.activeFrequency = null;
                    this.state.isPlaying = false;
                    
                    // Update UI parameters
                    this.setParameter('activeNote', null);
                    this.setParameter('activeFrequency', null);
                    this.setParameter('isPlaying', false);
                }
                
                return true;
            }
            
            return false;
        }
        
        // Get the voice
        const voice = this.voices[voiceIndex];
        
        if (!voice) {
            return false;
        }
        
        // Release the voice
        this._releaseVoice(voice, useRelease);
        
        // Remove from active voices
        this.activeVoices.delete(noteId);
        
        // Update active voice count
        this.setParameter('activeVoiceCount', this._countActiveVoices());
        
        // Update state if this was the active note
        if (this.state.activeNoteId === noteId) {
            this.state.activeNote = null;
            this.state.activeNoteId = null;
            this.state.activeFrequency = null;
            
            // Update UI parameters
            this.setParameter('activeNote', null);
            this.setParameter('activeFrequency', null);
            
            // Only update isPlaying if no voices are active
            if (this._countActiveVoices() === 0) {
                this.state.isPlaying = false;
                this.setParameter('isPlaying', false);
            }
        }
        
        return true;
    }
    
    /**
     * Release a polyphonic note
     * @param {String} note - Note name
     * @param {Boolean} useRelease - Whether to use release envelope
     * @returns {Boolean} Success state
     * @private
     */
    _releasePolyphonicNote(note, useRelease) {
        let success = false;
        
        // Find all voices playing this note
        for (const voice of this.voices) {
            if (voice.state.active && voice.state.note === note) {
                // Release the voice
                this._releaseVoice(voice, useRelease);
                
                // Remove from active voices
                for (const [id, index] of this.activeVoices.entries()) {
                    if (index === voice.index) {
                        this.activeVoices.delete(id);
                    }
                }
                
                success = true;
            }
        }
        
        // Update active voice count
        this.setParameter('activeVoiceCount', this._countActiveVoices());
        
        // Check if any voices are still active
        if (this._countActiveVoices() === 0) {
            // No more active voices
            this.state.isPlaying = false;
            this.state.activeNote = null;
            this.state.activeNoteId = null;
            this.state.activeFrequency = null;
            
            // Update UI parameters
            this.setParameter('isPlaying', false);
            this.setParameter('activeNote', null);
            this.setParameter('activeFrequency', null);
        } else if (this.state.activeNote === note) {
            // Current display note was released, pick another active voice for display
            for (const voice of this.voices) {
                if (voice.state.active) {
                    this.state.activeNote = voice.state.note;
                    this.state.activeFrequency = voice.state.frequency;
                    
                    // Update UI parameters
                    this.setParameter('activeNote', voice.state.note);
                    this.setParameter('activeFrequency', voice.state.frequency);
                    break;
                }
            }
        }
        
        return success;
    }
    
    /**
     * Release a monophonic/unison note
     * @param {String} note - Note name
     * @param {Boolean} useRelease - Whether to use release envelope
     * @returns {Boolean} Success state
     * @private
     */
    _releaseMonophonicNote(note, useRelease) {
        // Only release if this is the active note
        if (this.state.activeNote !== note) {
            return false;
        }
        
        // See if any other notes are still held
        if (this.state.notesOn.size > 1) {
            // Get the note to switch to based on key priority
            const keyPriority = this.getParameter('keyPriority');
            const heldNotes = Array.from(this.state.notesOn).filter(n => n !== note);
            let nextNote;
            
            switch (keyPriority) {
                case 'last':
                    // Last pressed note (most recent in array)
                    nextNote = heldNotes[heldNotes.length - 1];
                    break;
                    
                case 'first':
                    // First pressed note
                    nextNote = heldNotes[0];
                    break;
                    
                case 'highest':
                    // Highest pitch
                    nextNote = heldNotes.reduce((highest, current) => {
                        return this.getNoteFrequency(current) > this.getNoteFrequency(highest) ? current : highest;
                    });
                    break;
                    
                case 'lowest':
                    // Lowest pitch
                    nextNote = heldNotes.reduce((lowest, current) => {
                        return this.getNoteFrequency(current) < this.getNoteFrequency(lowest) ? current : lowest;
                    });
                    break;
                    
                default:
                    nextNote = heldNotes[0];
            }
            
            // Start the next note with legato
            return this.startNote(nextNote, 1.0); // Use full velocity for note change
        }
        
        // No other notes held, release all voices
        this._releaseAllVoices(useRelease);
        
        // Update state
        this.state.activeNote = null;
        this.state.activeNoteId = null;
        this.state.activeFrequency = null;
        this.state.isPlaying = false;
        
        // Clear active voices
        this.activeVoices.clear();
        
        // Update UI parameters
        this.setParameter('activeNote', null);
        this.setParameter('activeFrequency', null);
        this.setParameter('isPlaying', false);
        this.setParameter('activeVoiceCount', 0);
        
        return true;
    }
    
    /**
     * Release a single voice
     * @param {Object} voice - Voice object
     * @param {Boolean} useRelease - Whether to use release envelope
     * @private
     */
    _releaseVoice(voice, useRelease) {
        // Release envelopes
        voice.modules.ampEnv.release();
        voice.modules.filterEnv.release();
        
        // Update voice state
        voice.state.active = false;
    }
    
    /**
     * Release all active voices
     * @param {Boolean} useRelease - Whether to use release envelope
     * @private
     */
    _releaseAllVoices(useRelease) {
        for (const voice of this.voices) {
            if (voice.state.active) {
                this._releaseVoice(voice, useRelease);
            }
        }
    }
    
    /**
     * Stop all notes immediately (no release)
     */
    stopAllNotes() {
        // Stop arpeggiator if active
        if (this.state.arp.active) {
            this._stopArpeggiator();
        }
        
        // Stop all voices
        for (const voice of this.voices) {
            if (voice.state.active) {
                voice.modules.ampEnv.stop();
                voice.modules.filterEnv.stop();
                voice.state.active = false;
            }
        }
        
        // Clear state
        this.state.notesOn.clear();
        this.state.activeNote = null;
        this.state.activeNoteId = null;
        this.state.activeFrequency = null;
        this.state.isPlaying = false;
        this.activeVoices.clear();
        
        // Update UI parameters
        this.setParameter('activeNote', null);
        this.setParameter('activeFrequency', null);
        this.setParameter('isPlaying', false);
        this.setParameter('activeVoiceCount', 0);
    }
    
    /**
     * Find an available voice or steal one if needed
     * @returns {Object|null} Available voice or null if none available
     * @private
     */
    _findFreeVoice() {
        // Calculate how many voices to use
        const polyphony = this.getParameter('polyphony');
        const maxVoices = Math.min(this.voices.length, polyphony);
        
        // First, look for an inactive voice
        for (const voice of this.voices.slice(0, maxVoices)) {
            if (!voice.state.active) {
                return voice;
            }
        }
        
        // If voice stealing is enabled and we've reached max voices, steal the oldest voice
        if (this.options.voiceStealing && this._countActiveVoices() >= maxVoices) {
            return this._findVoiceToSteal();
        }
        
        return null;
    }
    
    /**
     * Find a voice to steal based on note start time
     * @returns {Object|null} Voice to steal or null if none available
     * @private
     */
    _findVoiceToSteal() {
        let oldestVoice = null;
        let oldestTime = Infinity;
        
        // Find the oldest voice
        for (const voice of this.voices) {
            if (voice.state.active && voice.state.startTime < oldestTime) {
                oldestVoice = voice;
                oldestTime = voice.state.startTime;
            }
        }
        
        if (oldestVoice) {
            // Release the voice immediately
            oldestVoice.modules.ampEnv.stop();
            oldestVoice.modules.filterEnv.stop();
            oldestVoice.state.active = false;
            oldestVoice.state.stealing = true; // Mark as stealing
            
            // Remove from active voices
            for (const [id, index] of this.activeVoices.entries()) {
                if (index === oldestVoice.index) {
                    this.activeVoices.delete(id);
                }
            }
        }
        
        return oldestVoice;
    }
    
    /**
     * Start the arpeggiator
     * @private
     */
    async _startArpeggiator() {
        if (!this.isInitialized || this.state.arp.active) {
            return;
        }
        
        // Update state
        this.state.arp.active = true;
        this.state.arp.currentStep = 0;
        this.state.arp.lastStepTime = performance.now();
        
        // Generate initial note sequence
        this._generateArpSequence();
        
        // Take first step immediately
        this._arpStep();
        
        // Calculate step interval
        const rate = this.getParameter('arpRate');
        const stepTimeMs = 1000.0 / rate;
        
        // Start interval
        this.state.arp.intervalId = setInterval(() => this._arpStep(), stepTimeMs);
        
        // Update UI
        this.setParameter('isPlaying', true);
    }
    
    /**
     * Stop the arpeggiator
     * @private
     */
    _stopArpeggiator() {
        if (!this.state.arp.active) {
            return;
        }
        
        // Clear interval
        if (this.state.arp.intervalId) {
            clearInterval(this.state.arp.intervalId);
            this.state.arp.intervalId = null;
        }
        
        // Release all voices
        this._releaseAllVoices(true);
        
        // Reset state
        this.state.arp.active = false;
        this.state.arp.currentStep = 0;
        this.state.arp.baseNote = null;
        this.state.arp.baseFrequency = null;
        
        // Update UI
        if (this.state.notesOn.size === 0) {
            this.setParameter('isPlaying', false);
        }
    }
    
    /**
     * Process one arpeggiator step
     * @private
     */
    _arpStep() {
        if (!this.state.arp.active || !this.state.arp.baseNote) {
            return;
        }
        
        // Get parameters
        const pattern = this.getParameter('arpPattern');
        const mode = this.getParameter('arpMode');
        
        // Get current step
        const step = this.state.arp.currentStep;
        
        // Get the note for this step
        let note, frequency;
        
        if (mode === 'semitones') {
            // Semitone pattern mode
            if (pattern.length === 0) {
                // If pattern is empty, just use the base note
                note = this.state.arp.baseNote;
                frequency = this.state.arp.baseFrequency;
            } else {
                // Calculate semitone offset
                const semitoneOffset = pattern[step % pattern.length];
                
                // Calculate frequency based on semitone offset
                frequency = this.state.arp.baseFrequency * Math.pow(this.semitoneRatio, semitoneOffset);
                
                // Try to find a note name for this frequency
                const baseNoteName = this.state.arp.baseNote.slice(0, -1); // e.g., "C" from "C4"
                const baseOctave = parseInt(this.state.arp.baseNote.slice(-1));
                
                // Rough approximation of note name based on semitone offset
                // This doesn't handle enharmonics correctly but is good enough for display
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const baseNoteIndex = noteNames.indexOf(baseNoteName);
                
                if (baseNoteIndex !== -1) {
                    const totalSemitones = baseNoteIndex + semitoneOffset;
                    const octaveOffset = Math.floor(totalSemitones / 12);
                    const noteIndex = (totalSemitones % 12 + 12) % 12; // Ensure positive index
                    
                    note = noteNames[noteIndex] + (baseOctave + octaveOffset);
                } else {
                    // Fallback if note name parsing fails
                    note = this.state.arp.baseNote + "+" + semitoneOffset;
                }
            }
        } else {
            // Played notes mode (use notes from history)
            if (this.state.arp.noteHistory.length === 0) {
                // If no notes in history, use base note
                note = this.state.arp.baseNote;
                frequency = this.state.arp.baseFrequency;
            } else {
                // Get note from history based on step
                const noteIndex = step % this.state.arp.noteHistory.length;
                note = this.state.arp.noteHistory[noteIndex];
                frequency = this.getNoteFrequency(note);
            }
        }
        
        // Stop previous note
        this._releaseAllVoices(false);
        
        // Start new note
        if (frequency) {
            // Use the first voice for arpeggiator
            if (this.voices.length > 0) {
                const voice = this.voices[0];
                
                // Start the voice
                this._startVoice(voice, note, frequency, 1.0, {
                    portamento: 0, // No portamento for arp
                    retrigger: true // Always retrigger for arp
                });
                
                // Update state
                this.state.activeNote = note;
                this.state.activeFrequency = frequency;
                
                // Update UI parameters
                this.setParameter('activeNote', note);
                this.setParameter('activeFrequency', frequency);
                this.setParameter('activeVoiceCount', 1);
                
                // Update last step time
                this.state.arp.lastStepTime = performance.now();
            }
        }
        
        // Increment step counter
        this.state.arp.currentStep++;
    }
    
    /**
     * Update the arpeggiator note history based on pressed notes
     * @param {String} note - Note being added
     * @private
     */
    _updateArpNoteHistory(note) {
        // Initialize history if needed
        if (!this.state.arp.noteHistory) {
            this.state.arp.noteHistory = [];
        }
        
        // Check if note is already in history
        const index = this.state.arp.noteHistory.indexOf(note);
        
        if (index !== -1) {
            // Move note to end if already in history
            this.state.arp.noteHistory.splice(index, 1);
        }
        
        // Add note to end of history
        this.state.arp.noteHistory.push(note);
    }
    
    /**
     * Generate arpeggiator note sequence
     * @private
     */
    _generateArpSequence() {
        if (!this.state.arp.baseNote) {
            return;
        }
        
        // Get parameters
        const mode = this.getParameter('arpMode');
        const direction = this.getParameter('arpDirection');
        const octaves = this.getParameter('arpOctaves');
        
        // Generate note sequence based on mode
        if (mode === 'played-notes') {
            // Use played notes
            if (this.state.notesOn.size === 0) {
                // No notes pressed, use note history
                if (this.state.arp.noteHistory.length === 0) {
                    // No history, just use base note
                    this.state.arp.noteHistory = [this.state.arp.baseNote];
                }
            } else {
                // Use current notes
                this.state.arp.noteHistory = Array.from(this.state.notesOn);
            }
            
            // Apply direction
            if (direction === 'up') {
                // Sort by frequency (low to high)
                this.state.arp.noteHistory.sort((a, b) => {
                    return this.getNoteFrequency(a) - this.getNoteFrequency(b);
                });
            } else if (direction === 'down') {
                // Sort by frequency (high to low)
                this.state.arp.noteHistory.sort((a, b) => {
                    return this.getNoteFrequency(b) - this.getNoteFrequency(a);
                });
            } else if (direction === 'up-down') {
                // Sort by frequency (low to high)
                this.state.arp.noteHistory.sort((a, b) => {
                    return this.getNoteFrequency(a) - this.getNoteFrequency(b);
                });
                
                // Add reverse sequence (excluding duplicates at ends)
                if (this.state.arp.noteHistory.length > 1) {
                    const reversedHistory = [...this.state.arp.noteHistory].slice(1, -1).reverse();
                    this.state.arp.noteHistory = [...this.state.arp.noteHistory, ...reversedHistory];
                }
            } else if (direction === 'random') {
                // Shuffle the array
                for (let i = this.state.arp.noteHistory.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [this.state.arp.noteHistory[i], this.state.arp.noteHistory[j]] = [this.state.arp.noteHistory[j], this.state.arp.noteHistory[i]];
                }
            }
            
            // Apply octaves
            if (octaves > 1) {
                const baseHistory = [...this.state.arp.noteHistory];
                
                for (let i = 1; i < octaves; i++) {
                    // Add each note an octave higher
                    for (const note of baseHistory) {
                        const noteName = note.slice(0, -1);
                        const octave = parseInt(note.slice(-1)) + i;
                        this.state.arp.noteHistory.push(noteName + octave);
                    }
                }
                
                // Re-sort if needed
                if (direction === 'up') {
                    this.state.arp.noteHistory.sort((a, b) => {
                        return this.getNoteFrequency(a) - this.getNoteFrequency(b);
                    });
                } else if (direction === 'down') {
                    this.state.arp.noteHistory.sort((a, b) => {
                        return this.getNoteFrequency(b) - this.getNoteFrequency(a);
                    });
                } else if (direction === 'up-down') {
                    // Sort by frequency (low to high)
                    this.state.arp.noteHistory.sort((a, b) => {
                        return this.getNoteFrequency(a) - this.getNoteFrequency(b);
                    });
                    
                    // Add reverse sequence (excluding duplicates at ends)
                    if (this.state.arp.noteHistory.length > 1) {
                        const reversedHistory = [...this.state.arp.noteHistory].slice(1, -1).reverse();
                        this.state.arp.noteHistory = [...this.state.arp.noteHistory, ...reversedHistory];
                    }
                } else if (direction === 'random') {
                    // Shuffle the array again
                    for (let i = this.state.arp.noteHistory.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [this.state.arp.noteHistory[i], this.state.arp.noteHistory[j]] = [this.state.arp.noteHistory[j], this.state.arp.noteHistory[i]];
                    }
                }
            }
        }
    }
    
    /**
     * Update the base note for the arpeggiator
     * @private
     */
    _updateArpBaseNote() {
        // Get a note from the held notes
        if (this.state.notesOn.size === 0) {
            this.state.arp.baseNote = null;
            this.state.arp.baseFrequency = null;
            return;
        }
        
        // Use first note in notesOn
        const note = Array.from(this.state.notesOn)[0];
        this.state.arp.baseNote = note;
        this.state.arp.baseFrequency = this.getNoteFrequency(note);
        
        // Update arp sequence
        this._generateArpSequence();
    }
    
    /**
     * Count the number of currently active voices
     * @returns {Number} Number of active voices
     * @private
     */
    _countActiveVoices() {
        return this.voices.reduce((count, voice) => {
            return count + (voice.state.active ? 1 : 0);
        }, 0);
    }
    
    /**
     * Get the frequency for a note name
     * @param {String} note - Note name (e.g., 'C4')
     * @returns {Number|null} Frequency in Hz or null if not found
     */
    getNoteFrequency(note) {
        return this.noteFrequencies[note] || null;
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Stop all notes and arpeggiator
        this.stopAllNotes();
        
        // Clear voices
        for (const voice of this.voices) {
            for (const module of Object.values(voice.modules)) {
                module.dispose();
            }
        }
        
        this.voices = [];
        this.activeVoices.clear();
        
        super.dispose();
    }
}
