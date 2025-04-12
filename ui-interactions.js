/**
 * MELODIOUS MALEFICARUM - Core UI Interactions v1.3 L
 * Sets up base UI event listeners for duplicated controls in sidebars,
 * initializes core modules, handles sidebar view toggling, manages active sound source,
 * and provides global instances/state.
 */
import SoundModule from '../sound/sound-module.js';
import HypercubeCore from '../core/HypercubeCore.js';
import ShaderManager from '../core/ShaderManager.js';
import GeometryManager from '../core/GeometryManager.js';
import ProjectionManager from '../core/ProjectionManager.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Core UI Interactions v1.3 L Initializing...");

    // --- Global Instances ---
    window.soundModule = null;
    window.mainVisualizerCore = null;
    window.shaderManager = null;
    window.geometryManager = null;
    window.projectionManager = null;

    // --- DOM Element References ---
    const canvas = document.getElementById('hypercube-canvas');
    const keyboards = {
        left: document.getElementById('keyboard-left'),
        right: document.getElementById('keyboard-right')
    };
    const xyPads = {
        left: document.getElementById('xy-pad-left'),
        right: document.getElementById('xy-pad-right')
    };
    const xyCursors = {
        left: document.getElementById('xy-cursor-left'),
        right: document.getElementById('xy-cursor-right')
    };
    // Select all sliders & toggles - specific handlers will check side
    const sliders = document.querySelectorAll('.styled-slider');
    const toggles = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
    const inputContainers = {
        left: document.getElementById('input-container-left'),
        right: document.getElementById('input-container-right')
    };
    const sidebarViewToggles = document.querySelectorAll('.sidebar-view-toggle');
    const sidebars = {
        left: document.getElementById('left-controls'),
        right: document.getElementById('right-controls')
    }

    // --- Core UI State (Accessible Globally) ---
    window.coreUiState = {
        activeNoteSource: null, // Format: 'type-side' (e.g., 'keyboard-left', 'xy-pad-right', 'visualizer')
        activeNoteValue: null, // The actual note playing (e.g., 'C4')
        activeControlSide: null, // 'left', 'right', or null if visualizer
        xyPadActive: { left: false, right: false },
        currentPreset: 'vaporwave', // Default preset on load
        sidebarFocus: null, // Managed by enhanced-ui
        isAudioInitialized: false // Track explicit initialization success
    };

    // --- Initialization ---
    async function initializeApp() {
        if (!canvas) { console.error("Canvas element #hypercube-canvas not found!"); return; }

        // 1. Initialize Sound Module (Defer AudioContext)
        try {
            window.soundModule = new SoundModule(coreUiState.currentPreset);
            // Wait for the initialization promise *here* if needed before setting up UI depending on it
            // However, individual listeners will await the promise before making sound.
             window.soundModule.initPromise.then(success => {
                 if(success) {
                     coreUiState.isAudioInitialized = true;
                     console.log("SoundModule reports successful initialization via promise.");
                     // Now safe to update UI based on the loaded preset state
                     updateUIFromSoundModuleState();
                 } else {
                     console.error("SoundModule initialization failed (promise resolved false).");
                     // Show error message to user?
                 }
             }).catch(error => {
                  console.error("Error during SoundModule initialization promise:", error);
             });
            console.log("SoundModule instance created. Initialization promise pending user interaction.");
        } catch (error) { console.error("Failed to instantiate SoundModule:", error); return; }

        // 2. Initialize WebGL and Visualizer
        try {
            const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl', { antialias: true });
            if (!gl) throw new Error("WebGL not supported or context creation failed.");
            console.log("WebGL context obtained.");

            window.geometryManager = new GeometryManager();
            window.projectionManager = new ProjectionManager();
            window.shaderManager = new ShaderManager(gl, window.geometryManager, window.projectionManager);
            console.log("Core Managers instantiated.");

            window.mainVisualizerCore = new HypercubeCore(canvas, window.shaderManager, {
                 geometryType: 'hypercube', projectionMethod: 'perspective',
                 // Initial state can be tied to the default preset later if desired
            });
            console.log("HypercubeCore instance created.");
            window.mainVisualizerCore.start();
            console.log("Visualizer rendering loop started.");

            requestAnimationFrame(mainUpdateLoop); // Start audio analysis -> visual sync

        } catch (error) {
            console.error("Failed to initialize WebGL/Visualizer:", error);
            canvas.outerHTML = `<div class="error-message">Error initializing WebGL Visualizer: ${error.message}</div>`;
        }

        // 3. Setup Base UI Event Listeners
        setupKeyboardListeners('left');
        setupKeyboardListeners('right');
        setupXYPadListeners('left');
        setupXYPadListeners('right');
        setupSliderListeners();
        setupToggleListeners();
        setupSidebarToggleListeners();
        // Input mode swap buttons are handled separately by enhanced-ui.js

        // 4. Apply initial preset to UI elements (will run again once audio init promise resolves)
        // updateUIFromSoundModuleState(); // Initial update based on possibly uninitialized state

        console.log("Core UI Interactions Initialized Successfully.");
    }

    // --- Event Listener Setup Functions ---

    function setupKeyboardListeners(side) {
        const kb = keyboards[side];
        const sidebarContent = sidebars[side]?.querySelector('.sidebar-content');
        if (!kb || !sidebarContent) { console.warn(`Keyboard or sidebar content missing for side: ${side}`); return; }
        const keys = kb.querySelectorAll('.keyboard-key');

        keys.forEach(key => {
            const note = key.dataset.note;
            if (!note) return;

            const startHandler = async (e) => {
                e.preventDefault();
                // Check if the correct input mode AND sidebar view are active
                if (inputContainers[side]?.dataset.activeInput !== 'keyboard') return;
                if (!sidebarContent.classList.contains('show-input')) return;

                // Ensure audio is ready before proceeding
                const audioReady = await window.soundModule.initPromise;
                if (!audioReady || !window.soundModule) {
                    console.warn(`Audio not ready, cannot play note ${note} from keyboard-${side}`);
                    // Maybe show a transient warning to the user?
                    if(window.showTooltip) window.showTooltip("Click/Tap interaction needed to enable audio!", 2500);
                    return;
                }

                // Stop other sound sources first
                const sourceId = `keyboard-${side}`;
                if (coreUiState.activeNoteSource && coreUiState.activeNoteSource !== sourceId) {
                    await stopCurrentlyActiveSource(false);
                }

                // Don't re-trigger if this key is already the active source/note
                if (coreUiState.activeNoteSource === sourceId && coreUiState.activeNoteValue === note) return;

                // Play Note
                window.soundModule.startNote(note);
                coreUiState.activeNoteSource = sourceId;
                coreUiState.activeNoteValue = note;
                coreUiState.activeControlSide = side;

                // Update UI
                document.querySelectorAll('.keyboard-key.active').forEach(k => k.classList.remove('active', 'key-pressed', 'key-released'));
                key.classList.add('active', 'key-pressed');
                key.classList.remove('key-released');

                if (window.createParticle) {
                    const rect = key.getBoundingClientRect();
                    window.createParticle(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            };

            const endHandler = (e) => {
                e.preventDefault();
                // Only release if this specific key on this side was the active source
                 if (coreUiState.activeNoteSource === `keyboard-${side}` && coreUiState.activeNoteValue === note) {
                    if (window.soundModule) {
                        window.soundModule.stopNote(true); // Use release envelope
                    }
                    key.classList.remove('active', 'key-pressed');
                    key.classList.add('key-released');
                    coreUiState.activeNoteSource = null;
                    coreUiState.activeNoteValue = null;
                    coreUiState.activeControlSide = null;
                 }
            };

            // Add Listeners
            key.addEventListener('mousedown', startHandler);
            key.addEventListener('mouseup', endHandler);
            key.addEventListener('mouseleave', (e) => { if (e.buttons !== 1) { endHandler(e); }});
            key.addEventListener('touchstart', startHandler, { passive: false });
            key.addEventListener('touchend', endHandler);
            key.addEventListener('touchcancel', endHandler);
        });
        // console.log(`Keyboard listeners attached for side: ${side}`);
    }

    function setupXYPadListeners(side) {
        const pad = xyPads[side];
        const cursor = xyCursors[side];
        const sidebarContent = sidebars[side]?.querySelector('.sidebar-content');
        if (!pad || !cursor || !sidebarContent) { console.warn(`XY Pad elements or sidebar content missing for side: ${side}`); return; }

        let isDragging = false;

        const updateXY = (clientX, clientY) => {
            const rect = pad.getBoundingClientRect();
            let x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            let y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

            cursor.style.left = `${x * 100}%`;
            cursor.style.top = `${y * 100}%`;

            if (!window.soundModule) return;

            // XY Pad #1 (Sidebars) controls Filter Freq/Res
            const filterFreq = mapRangeExp(x, 0, 1, 100, 12000);
            const filterRes = mapRange(1 - y, 0, 1, 0.1, 25);
            soundModule.setParameter('filter', 'frequency', filterFreq);
            soundModule.setParameter('filter', 'Q', filterRes);

            // Optional: Map XY to visuals only if this side is active
             if (window.mainVisualizerCore && coreUiState.activeControlSide === side) {
                 window.mainVisualizerCore.updateParameters({ morphFactor: x });
             }
        };

        const startInteraction = async (clientX, clientY) => {
            // Check if the correct input mode AND sidebar view are active
            if (inputContainers[side]?.dataset.activeInput !== 'xy') return;
            if (!sidebarContent.classList.contains('show-input')) return;

            // Ensure audio is ready
             const audioReady = await window.soundModule.initPromise;
             if (!audioReady || !window.soundModule) {
                 console.warn(`Audio not ready, cannot start XY pad ${side}`);
                  if(window.showTooltip) window.showTooltip("Click/Tap interaction needed to enable audio!", 2500);
                 return;
             }

            // Stop other sound sources first
            const sourceId = `xy-pad-${side}`;
            if (coreUiState.activeNoteSource && coreUiState.activeNoteSource !== sourceId) {
                await stopCurrentlyActiveSource(false);
            }

            isDragging = true;
            coreUiState.xyPadActive[side] = true;
            pad.classList.add('active', 'touched');
            coreUiState.activeNoteSource = sourceId;
            coreUiState.activeControlSide = side;

            // Start Drone Note
            const droneNote = side === 'left' ? 'A3' : 'G3'; // Example side-specific note
            window.soundModule.startNote(droneNote);
            coreUiState.activeNoteValue = droneNote; // Track the drone note value

            updateXY(clientX, clientY); // Set initial param values

            if (window.createParticleBurst) window.createParticleBurst(clientX, clientY);
        };

        const endInteraction = () => {
            // Only end if this specific pad was the active source
            if (!isDragging || coreUiState.activeNoteSource !== `xy-pad-${side}`) return;
            isDragging = false;
            coreUiState.xyPadActive[side] = false;
            pad.classList.remove('active', 'touched');

            if (window.soundModule) {
                window.soundModule.stopNote(true); // Use release
            }
            coreUiState.activeNoteSource = null;
            coreUiState.activeNoteValue = null;
            coreUiState.activeControlSide = null;
        };

        // Add Listeners
        pad.addEventListener('mousedown', (e) => startInteraction(e.clientX, e.clientY));
        document.addEventListener('mousemove', (e) => { if (isDragging && coreUiState.activeControlSide === side) updateXY(e.clientX, e.clientY); });
        document.addEventListener('mouseup', () => { if (isDragging && coreUiState.activeControlSide === side) endInteraction(); });
        pad.addEventListener('touchstart', (e) => { e.preventDefault(); startInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (isDragging && coreUiState.activeControlSide === side) { e.preventDefault(); updateXY(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }}, { passive: false });
        // Listen on document for touchend/cancel to catch dragging off the element
        document.addEventListener('touchend', (e) => { if (isDragging && coreUiState.activeControlSide === side) { endInteraction(); }});
        document.addEventListener('touchcancel', (e) => { if (isDragging && coreUiState.activeControlSide === side) { endInteraction(); }});

        // console.log(`XY Pad listeners attached for side: ${side}`);
    }

    // Helper to stop whatever input source is currently making sound
    async function stopCurrentlyActiveSource(useRelease = false) {
        const source = coreUiState.activeNoteSource;
        if (!source || !window.soundModule) return;

        // console.log("Stopping active source:", source);
        // Ensure audio context is ready before trying to stop a note
        const audioReady = await window.soundModule.initPromise;
        if (!audioReady) {
            console.warn("Cannot stop source, audio not ready.");
            // Reset state anyway
            coreUiState.activeNoteSource = null;
            coreUiState.activeNoteValue = null;
            coreUiState.activeControlSide = null;
            return;
        }

        window.soundModule.stopNote(useRelease); // Central stop call

        // Clear UI states for the stopped source
        if (source.startsWith('keyboard-')) {
            const side = source.split('-')[1];
            keyboards[side]?.querySelectorAll('.keyboard-key.active').forEach(k => k.classList.remove('active', 'key-pressed', 'key-released'));
        } else if (source.startsWith('xy-pad-')) {
            const side = source.split('-')[1];
            xyPads[side]?.classList.remove('active', 'touched');
            coreUiState.xyPadActive[side] = false;
        } else if (source === 'visualizer') {
            // Visualizer cleanup handled in enhanced-ui endInteraction
        }

        // Reset core state tracking
        coreUiState.activeNoteSource = null;
        coreUiState.activeNoteValue = null;
        coreUiState.activeControlSide = null;
    }
    // Make stop function globally available if needed by enhanced UI
    window.stopCurrentlyActiveSource = stopCurrentlyActiveSource;


    function setupSliderListeners() {
        sliders.forEach(slider => {
            updateSliderVisualFill(slider); // Initialize visual state

            slider.addEventListener('input', (e) => {
                const sliderId = e.target.id;
                const side = sliderId.endsWith('-left') ? 'left' : sliderId.endsWith('-right') ? 'right' : null;
                const value = parseFloat(e.target.value);

                 // Check if the correct sidebar view is active
                 if (side && !sidebars[side]?.querySelector('.sidebar-content')?.classList.contains('show-params')) {
                      // console.log(`Slider ${sliderId} ignored: Params view not active on side ${side}`);
                      // Optionally revert the slider position if interaction is blocked?
                      // e.target.value = window.soundModule.audioState.parameters[type][name]; // Revert (needs param mapping logic)
                      return;
                  }

                updateSliderVisualFill(e.target);

                if (!window.soundModule) return;

                // Map slider ID to sound parameter type/name
                try {
                    let type, name;
                    if (sliderId.startsWith('slider-filter')) { type = 'filter'; name = sliderId.includes('resonance') ? 'Q' : 'frequency'; }
                    else if (sliderId.startsWith('slider-attack')) { type = 'envelope'; name = 'attack'; }
                    else if (sliderId.startsWith('slider-release')) { type = 'envelope'; name = 'release'; }
                    else { /* console.warn(`Unhandled slider ID structure: ${sliderId}`); */ return; }

                    soundModule.setParameter(type, name, value);

                    // Sync the other side's slider
                    const otherSide = side === 'left' ? 'right' : 'left';
                    const otherSliderId = sliderId.replace(`-${side}`, `-${otherSide}`);
                    updateSliderValueAndVisual(otherSliderId, value); // Update value and visual

                } catch (error) { console.error(`Error setting parameter for slider ${sliderId}:`, error); }
            });
        });
        // console.log("Slider listeners attached for all sliders.");
    }

    function setupToggleListeners() {
        toggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const toggleId = e.target.id;
                const side = toggleId.endsWith('-left') ? 'left' : toggleId.endsWith('-right') ? 'right' : null;
                const effectName = toggleId.replace('-left', '').replace('-right', '').split('-')[1];
                const isActive = e.target.checked;

                // Check if the correct sidebar view is active
                 if (side && !sidebars[side]?.querySelector('.sidebar-content')?.classList.contains('show-params')) {
                    // console.log(`Toggle ${toggleId} ignored: Params view not active on side ${side}`);
                    // Revert the checkbox state
                     e.target.checked = !isActive;
                     return;
                 }

                if (!window.soundModule || !effectName) return;

                try {
                    if (effectName === 'glitch') { // Glitch is visual only - update visualizer
                         if (window.mainVisualizerCore) {
                             window.mainVisualizerCore.updateParameters({ glitchIntensity: isActive ? 0.5 : 0.0 });
                             console.log(`Visualizer Glitch set to ${isActive}`);
                         }
                         // Store state in soundModule parameters anyway for consistency
                         soundModule.setParameter('effects.glitch', 'active', isActive);
                    } else {
                        // Toggle the actual audio effect
                         soundModule.toggleEffect(effectName, isActive);
                    }

                    // Sync the other side's toggle
                    const otherSide = side === 'left' ? 'right' : 'left';
                    const otherToggleId = toggleId.replace(`-${side}`, `-${otherSide}`);
                    updateToggleState(otherToggleId, isActive); // Update checked state

                    // Particle effect
                    if (window.createParticle) {
                         const label = toggle.closest('.toggle-unit')?.querySelector('.toggle-label');
                         if(label) {
                             const rect = label.getBoundingClientRect();
                             window.createParticle(rect.left + rect.width / 2, rect.top + rect.height / 2, null, isActive ? '#8aff8a' : '#ff8a8a');
                         }
                    }

                } catch (error) { console.error(`Error toggling effect ${effectName}:`, error); }
            });
        });
        // console.log("Toggle listeners attached for all toggles.");
    }

    function setupSidebarToggleListeners() {
        sidebarViewToggles.forEach(button => {
            button.addEventListener('click', () => {
                const targetSidebarId = button.dataset.targetSidebar; // e.g., "left-controls"
                const sidebarContent = document.querySelector(`#${targetSidebarId} .sidebar-content`);
                if (sidebarContent) {
                    const showingInput = sidebarContent.classList.toggle('show-input');
                    sidebarContent.classList.toggle('show-params', !showingInput);
                    button.textContent = showingInput ? 'Show Params' : 'Show Input';

                    // Stop sound if switching away from the active input view
                    const side = targetSidebarId.startsWith('left') ? 'left' : 'right';
                    if (!showingInput && coreUiState.activeControlSide === side && coreUiState.activeNoteSource?.startsWith('keyboard') || coreUiState.activeNoteSource?.startsWith('xy-pad')) {
                        stopCurrentlyActiveSource(false); // Stop immediately when switching view
                    }
                }
            });
        });
         console.log("Sidebar view toggle listeners attached.");
    }


     // --- UI Update Functions ---

     // Updates ALL controls on BOTH sides based on the central soundModule state
     window.updateUIFromSoundModuleState = function() {
        if (!window.soundModule?.audioState?.parameters) { /* console.warn("Cannot update UI: SoundModule state not available."); */ return; }
        const params = window.soundModule.audioState.parameters;
        // console.log("Updating UI from state:", JSON.stringify(params));

        // Update Sliders (Both Sides)
        updateSliderValueAndVisual('slider-filter-left', params.filter?.frequency);
        updateSliderValueAndVisual('slider-resonance-left', params.filter?.Q);
        updateSliderValueAndVisual('slider-attack-left', params.envelope?.attack);
        updateSliderValueAndVisual('slider-release-left', params.envelope?.release);
        updateSliderValueAndVisual('slider-filter-right', params.filter?.frequency);
        updateSliderValueAndVisual('slider-resonance-right', params.filter?.Q);
        updateSliderValueAndVisual('slider-attack-right', params.envelope?.attack);
        updateSliderValueAndVisual('slider-release-right', params.envelope?.release);

        // Update Toggles (Both Sides)
        updateToggleState('toggle-delay-left', params.effects?.delay?.active);
        updateToggleState('toggle-reverb-left', params.effects?.reverb?.active);
        updateToggleState('toggle-arpeggiator-left', params.effects?.arpeggiator?.active);
        updateToggleState('toggle-glitch-left', params.effects?.glitch?.active);
        updateToggleState('toggle-delay-right', params.effects?.delay?.active);
        updateToggleState('toggle-reverb-right', params.effects?.reverb?.active);
        updateToggleState('toggle-arpeggiator-right', params.effects?.arpeggiator?.active);
        updateToggleState('toggle-glitch-right', params.effects?.glitch?.active);

        // console.log("UI updated from SoundModule state.");
    }

     // Updates a single slider's value and its visual fill
     function updateSliderValueAndVisual(sliderId, value) {
        const slider = document.getElementById(sliderId);
        if (slider && value !== undefined && value !== null) {
            // Check if the value actually needs changing to prevent recursive loops if connected via observers
            if (parseFloat(slider.value) !== parseFloat(value)) {
                 slider.value = value;
            }
            updateSliderVisualFill(slider); // Update visual regardless
        }
    }
     // Updates a single toggle's checked state
     function updateToggleState(toggleId, isActive) {
        const toggle = document.getElementById(toggleId);
        if (toggle && isActive !== undefined && isActive !== null) {
            // Check if state needs changing
            if(toggle.checked !== !!isActive) {
                toggle.checked = !!isActive;
            }
        }
    }

    // Helper to update slider fill CSS variable
    function updateSliderVisualFill(sliderElement) {
        if (!sliderElement) return;
        try {
            const min = parseFloat(sliderElement.min);
            const max = parseFloat(sliderElement.max);
            const value = parseFloat(sliderElement.value);
            if (isNaN(min) || isNaN(max) || isNaN(value)) return;
            const progress = (max === min) ? 0 : (value - min) / (max - min); // Avoid div by zero
            const wrapper = sliderElement.closest('.slider-wrapper');
            wrapper?.style.setProperty('--slider-progress', Math.max(0, Math.min(1, progress)).toFixed(3));
        } catch(e) { console.error("Error updating slider visual fill:", e, sliderElement); }
    }

    // --- Main Update Loop (Audio Analysis -> Visuals) ---
    function mainUpdateLoop() {
        if (window.soundModule?.audioState?.isInitialized && window.mainVisualizerCore?.state?.isRendering) {
            try {
                const audioLevels = window.soundModule.getAudioLevels();
                const soundParams = window.soundModule.audioState.parameters;

                // Mapping audio/synth state to visual parameters
                const visualParams = {
                    audioBass: audioLevels.bass,
                    audioMid: audioLevels.mid,
                    audioHigh: audioLevels.high,
                    currentNoteFrequency: audioLevels.frequency,

                    // Combine mappings - audio reactivity + parameter influence
                    morphFactor: mapRange(soundParams.filter?.frequency ?? 1500, 20, 15000, 0, 1) * (0.8 + audioLevels.mid * 0.4), // Filter freq + mid level
                    rotationSpeed: 0.1 + (soundParams.envelope?.attack ?? 0.1) * 0.5 + audioLevels.mid * 0.3, // Attack + mid speed
                    gridDensity: 4 + (soundParams.filter?.Q ?? 1) * 0.5 + audioLevels.bass * 6, // Resonance + strong bass influence
                    glitchIntensity: soundParams.effects?.glitch?.active ? (0.1 + audioLevels.high * 0.8) : 0.0, // Glitch toggle + high freq trigger
                    universeModifier: 1.0 + (audioLevels.bass - 0.4) * 0.5, // Bass pulses space expansion/contraction
                    patternIntensity: 0.7 + audioLevels.mid * 0.6 // Mid affects overall brightness more strongly
                 };

                // Ensure values are within reasonable bounds if necessary
                 visualParams.morphFactor = Math.max(0, Math.min(1, visualParams.morphFactor));
                 visualParams.gridDensity = Math.max(1, Math.min(25, visualParams.gridDensity));
                 visualParams.universeModifier = Math.max(0.5, Math.min(1.5, visualParams.universeModifier));
                 visualParams.patternIntensity = Math.max(0, Math.min(1.5, visualParams.patternIntensity));


                window.mainVisualizerCore.updateParameters(visualParams);

            } catch (error) {
                console.error("Error in mainUpdateLoop:", error);
            }
        }
        requestAnimationFrame(mainUpdateLoop); // Continue the loop
    }

    // --- Utility Functions ---
    function mapRange(value, inMin, inMax, outMin, outMax) {
        const clampedValue = Math.max(inMin, Math.min(value, inMax));
        if (inMax === inMin) return outMin; // Avoid division by zero
        return outMin + (clampedValue - inMin) * (outMax - outMin) / (inMax - inMin);
    }
    function mapRangeExp(value, inMin, inMax, outMin, outMax, exponent = 2) {
        const clampedValue = Math.max(inMin, Math.min(value, inMax));
        if (inMax === inMin) return outMin; // Avoid division by zero
        const normalized = (clampedValue - inMin) / (inMax - inMin);
        const curved = Math.pow(normalized, exponent);
        return outMin + curved * (outMax - outMin);
    }


    // --- Start Application ---
    initializeApp();

}); // End DOMContentLoaded