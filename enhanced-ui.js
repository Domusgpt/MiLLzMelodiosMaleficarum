/**
 * MELODIOUS MALEFICARUM - Enhanced UI v1.3 L
 * Adds extra features like particle system, advanced module/sidebar focus,
 * visualizer controller (XY Pad #2), enhanced preset wheel, improved input switch.
 * Relies on global instances and core setup from ui-interactions.js.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("Enhanced UI v1.3 L Initializing...");

    // --- Wait for Core Modules & UI State ---
    function waitForCoreModules(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                // Check for core modules AND core UI state/functions being ready
                if (window.soundModule && window.mainVisualizerCore && window.shaderManager &&
                    window.coreUiState && window.updateUIFromSoundModuleState && window.stopCurrentlyActiveSource) {
                    clearInterval(interval);
                    console.log("Enhanced UI: Core modules & UI state/functions ready.");
                    resolve({
                        soundModule: window.soundModule,
                        mainVisualizerCore: window.mainVisualizerCore,
                        coreUiState: window.coreUiState,
                        updateUIState: window.updateUIFromSoundModuleState,
                        stopActiveSource: window.stopCurrentlyActiveSource // Get ref to stop function
                    });
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    console.error("Enhanced UI: Core modules/state/functions not found on window after timeout.");
                    reject(new Error("Core modules/state/functions timed out."));
                }
            }, 100);
        });
    }

    // --- Initialize Enhancements after Core Modules & UI are Ready ---
    waitForCoreModules().then(({ soundModule, mainVisualizerCore, coreUiState, updateUIState, stopActiveSource }) => {
        console.log("Enhanced UI: Setting up enhancements...");

        // Run enhancement setups (pass necessary modules/state/functions)
        try { setupParticleSystem(); } catch (e) { console.error("Error setting up particles:", e); }
        try { setupEnhancedModuleFocus(coreUiState); } catch (e) { console.error("Error setting up module focus:", e); }
        try { setupVisualizerAsController(soundModule, mainVisualizerCore, coreUiState, stopActiveSource); } catch (e) { console.error("Error setting up viz controller:", e); }
        try { improveInputModeSwitch(soundModule, coreUiState, 'left', stopActiveSource); } catch (e) { console.error("Error setting up left mode switch:", e); }
        try { improveInputModeSwitch(soundModule, coreUiState, 'right', stopActiveSource); } catch (e) { console.error("Error setting up right mode switch:", e); }
        try { setupEnhancedPresetSelector(soundModule, updateUIState); } catch (e) { console.error("Error setting up presets:", e); }

        setTimeout(() => {
            showTooltip("Enhanced Maleficarum v1.3 L Initialized", 3000);
        }, 500);

        console.log("Enhanced UI Setup Complete.");

    }).catch(error => {
        console.error("Failed to initialize Enhanced UI:", error);
        showTooltip("Error: Failed to load UI enhancements.", 5000);
    });


    // --- Enhancement Setup Functions ---

    function setupParticleSystem() {
        const particleContainer = document.createElement('div');
        particleContainer.className = 'particle-container';
        document.body.appendChild(particleContainer);

        const particles = [];
        const maxParticles = 30;

        window.createParticle = (x, y, size = null, color = null, durationMult = 1.0) => {
            if (particles.length >= maxParticles) {
                particles.shift()?.remove();
            }

            const particle = document.createElement('div');
            particle.className = 'particle';

            const particleSize = size ?? 8 + Math.random() * 15;
            const duration = (1.2 + Math.random() * 2.0) * durationMult;
            let particleColor = color ?? `hsla(${250 + Math.random() * 40}, 100%, 75%, 0.7)`; // Vary hue slightly around accent

            particle.style.cssText = `
                position: absolute; left: ${x}px; top: ${y}px;
                width: ${particleSize}px; height: ${particleSize}px;
                background: radial-gradient(circle, ${particleColor} 0%, transparent 70%);
                border-radius: 50%; pointer-events: none; opacity: 0;
                transform: translate(-50%, -50%);
            `;

            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 100;
            const moveX = Math.cos(angle) * distance;
            const moveY = Math.sin(angle) * distance;

            particle.animate([
                { opacity: 0, transform: 'translate(-50%, -50%) scale(0.1)' },
                { opacity: 0.8, transform: 'translate(-50%, -50%) scale(1)', offset: 0.1 },
                { opacity: 0, transform: `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px)) scale(0.5)` }
            ], { duration: duration * 1000, easing: 'ease-out', fill: 'forwards' });

            particleContainer.appendChild(particle);
            particles.push(particle);

            setTimeout(() => {
                particle.remove();
                const index = particles.indexOf(particle);
                if (index > -1) particles.splice(index, 1);
            }, duration * 1000);
        };

        window.createParticleBurst = (x, y, count = 5, color = null) => {
            for (let i = 0; i < count; i++) {
                const offsetX = x + (Math.random() - 0.5) * 30;
                const offsetY = y + (Math.random() - 0.5) * 30;
                setTimeout(() => window.createParticle?.(offsetX, offsetY, null, color, 0.8), i * 30);
            }
        };
        console.log("Enhanced UI: Particle system setup.");
    }


    function setupEnhancedModuleFocus(coreUiState) {
        const sidebars = document.querySelectorAll('.sidebar');
        const mainFrame = document.querySelector('.main-frame');
        if (!sidebars.length || !mainFrame) { console.warn("Sidebar or main frame not found for focus setup."); return; }

        sidebars.forEach(sidebar => {
             sidebar.addEventListener('focusin', (e) => {
                 // When focus enters the sidebar (or its children)
                 const targetModule = e.target.closest('.control-module, .sub-module');

                 // Remove focus state from the other sidebar
                 const otherSide = sidebar.id.startsWith('left') ? 'right' : 'left';
                 document.getElementById(`${otherSide}-controls`)?.classList.remove('focused');

                 // Add focus state to this sidebar
                 sidebar.classList.add('focused');
                 mainFrame.classList.add('has-focus');
                 coreUiState.sidebarFocus = sidebar.id.startsWith('left') ? 'left' : 'right';

                 // Add focus to the specific module if focus landed there
                  document.querySelectorAll('.control-module.focused').forEach(m => m.classList.remove('focused'));
                 targetModule?.classList.add('focused');

                 // console.log(`Focus entered sidebar: ${sidebar.id}, Module: ${targetModule?.id}`);
             });

             sidebar.addEventListener('focusout', (e) => {
                 // When focus leaves the sidebar, check if it moved outside the main frame
                 // relatedTarget is where focus is going next
                 if (!mainFrame.contains(e.relatedTarget)) {
                    // console.log(`Focus left sidebar ${sidebar.id} to outside main frame.`);
                      sidebar.classList.remove('focused');
                      sidebar.querySelectorAll('.control-module.focused').forEach(m => m.classList.remove('focused'));
                      // Only remove main-frame focus if the other sidebar also lost focus
                      const otherSide = sidebar.id.startsWith('left') ? 'right' : 'left';
                      if (!document.getElementById(`${otherSide}-controls`)?.classList.contains('focused')) {
                           mainFrame.classList.remove('has-focus');
                           coreUiState.sidebarFocus = null;
                      }
                 } else {
                    // console.log(`Focus left sidebar ${sidebar.id}, but remains within main frame.`);
                 }
             });

              // Handle clicks for focus (similar logic to focusin)
             sidebar.addEventListener('click', (e) => {
                 const clickedModule = e.target.closest('.control-module:not(.input-module-container), .sub-module');
                  const isDirectSidebarClick = e.target === sidebar || e.target.classList.contains('sidebar-content');

                 if (clickedModule && clickedModule.offsetParent !== null) { // Clicked visible module
                      document.querySelectorAll('.control-module.focused').forEach(m => m.classList.remove('focused'));
                      clickedModule.classList.add('focused');

                      sidebars.forEach(s => s.classList.remove('focused'));
                      sidebar.classList.add('focused');
                      mainFrame.classList.add('has-focus');
                      coreUiState.sidebarFocus = sidebar.id.startsWith('left') ? 'left' : 'right';

                       if (window.createParticleBurst) {
                           const rect = clickedModule.getBoundingClientRect();
                           createParticleBurst(rect.left + rect.width/2, rect.top + rect.height/2, 8);
                       }
                 } else if (isDirectSidebarClick) { // Clicked sidebar background
                     // Remove focus from modules within this sidebar
                      sidebar.querySelectorAll('.control-module.focused').forEach(m => m.classList.remove('focused'));
                      // Keep sidebar focus? Or remove all focus? Let's keep sidebar focused on bg click.
                      sidebars.forEach(s => s.classList.remove('focused'));
                      sidebar.classList.add('focused');
                      mainFrame.classList.add('has-focus');
                      coreUiState.sidebarFocus = sidebar.id.startsWith('left') ? 'left' : 'right';
                 }
                 e.stopPropagation();
             });
        });

        // Clear all focus if clicking outside the main frame
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.main-frame')) {
                 document.querySelectorAll('.control-module.focused').forEach(m => m.classList.remove('focused'));
                 document.querySelectorAll('.sidebar.focused').forEach(s => s.classList.remove('focused'));
                 mainFrame?.classList.remove('has-focus');
                 coreUiState.sidebarFocus = null;
            }
        });
        console.log("Enhanced UI: Enhanced module/sidebar focus setup.");
    }


    function setupVisualizerAsController(soundModule, mainVisualizerCore, coreUiState, stopActiveSource) {
        const visualizerArea = document.querySelector('.visualizer-area');
        if (!visualizerArea) { console.warn("Visualizer area not found for controller setup."); return; }

        let isActive = false;
        let controlMode = 'off'; // 'off', 'xy-fx', 'note'
        let visualizerNoteActive = false; // Tracks if visualizer is currently playing a note
        let visualizerOctave = 4;

        let indicator = visualizerArea.querySelector('.visualizer-xy-indicator');
        if (!indicator) { /* Create indicator - as before */
            indicator = document.createElement('div');
            indicator.className = 'visualizer-xy-indicator';
            visualizerArea.appendChild(indicator);
        }
        let modeToggle = visualizerArea.querySelector('.visualizer-mode-toggle');
         if (!modeToggle) { /* Create toggle button - as before */
            modeToggle = document.createElement('button');
            modeToggle.className = 'visualizer-mode-toggle';
            visualizerArea.appendChild(modeToggle);
         }
        modeToggle.textContent = 'VIZ: OFF';


        modeToggle.addEventListener('click', async (e) => { // Made async for stopActiveSource
            e.stopPropagation();
            // Determine next mode
            let nextMode = 'off';
            if (controlMode === 'off') nextMode = 'xy-fx';
            else if (controlMode === 'xy-fx') nextMode = 'note';

            // Stop any sound from the visualizer if mode is changing or turning off
            if (isActive) {
                 if (controlMode === 'note' && visualizerNoteActive) {
                     await stopActiveSource(true); // Stop visualizer note
                     visualizerNoteActive = false;
                 }
                 // If switching *while active*, reset interaction state
                 isActive = false;
                 visualizerArea.classList.remove('active');
                 indicator.style.opacity = '0';
                 if(coreUiState.activeNoteSource === 'visualizer'){
                     coreUiState.activeNoteSource = null;
                     coreUiState.activeNoteValue = null;
                 }
            }

            controlMode = nextMode; // Set the new mode

            // Update UI
            modeToggle.textContent = `VIZ: ${controlMode === 'xy-fx' ? 'XY FX' : controlMode === 'note' ? 'NOTE' : 'OFF'}`;
            visualizerArea.classList.toggle('interactive', controlMode !== 'off');
            showTooltip(`Visualizer Mode: ${controlMode === 'xy-fx' ? 'XY Effects' : controlMode === 'note' ? 'Note Play' : 'Off'}`);
            if (window.createParticleBurst) createParticleBurst(e.clientX, e.clientY, 5);
        });

        const handleInteraction = async (e, type) => {
             e.preventDefault();
             if (controlMode === 'off') return;

             const isStart = type === 'start';
             const isEnd = type === 'end';
             const touch = e.touches ? e.changedTouches[0] : null;
             const clientX = touch ? touch.clientX : e.clientX;
             const clientY = touch ? touch.clientY : e.clientY;

            if (isStart) {
                 // Ensure audio is ready before starting interaction
                 const audioReady = await soundModule.initPromise;
                 if (!audioReady) {
                     console.warn("Audio not ready for visualizer interaction.");
                      if(window.showTooltip) window.showTooltip("Click/Tap interaction needed to enable audio!", 2500);
                     return; // Don't start interaction if audio isn't ready
                 }

                isActive = true;
                visualizerArea.classList.add('active');
                indicator.style.opacity = '1';
                if (window.createParticleBurst) createParticleBurst(clientX, clientY, 5);

                 // Stop other sources only if visualizer is starting note mode
                 if (controlMode === 'note') {
                     if (coreUiState.activeNoteSource && coreUiState.activeNoteSource !== 'visualizer') {
                         await stopActiveSource(false);
                     }
                     coreUiState.activeNoteSource = 'visualizer';
                     coreUiState.activeControlSide = null;
                 }
            }

            if(isActive) { // Process move or start event
                 const rect = visualizerArea.getBoundingClientRect();
                 const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                 const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

                 indicator.style.left = `${x * 100}%`;
                 indicator.style.top = `${y * 100}%`;

                 // Apply Control based on Mode
                 if (controlMode === 'xy-fx' && soundModule) {
                      const delayTime = mapRange(x, 0, 1, 0.01, 1.5);
                      const delayFeedback = mapRange(1 - y, 0, 1, 0.0, 0.9);
                      soundModule.setParameter('effects.delay', 'time', delayTime);
                      soundModule.setParameter('effects.delay', 'feedback', delayFeedback);
                      if (mainVisualizerCore) mainVisualizerCore.updateParameters({ morphFactor: x, universeModifier: 0.8 + (1-y)*0.4 });
                 } else if (controlMode === 'note' && soundModule) {
                     const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                     const noteIndex = Math.floor(x * 12) % 12;
                     const note = `${notes[noteIndex]}${visualizerOctave}`;

                     // Start note on initial press OR if dragging to a new note
                     if(isStart || coreUiState.activeNoteValue !== note) {
                         soundModule.startNote(note); // Await not strictly needed after initial check
                         visualizerNoteActive = true;
                         coreUiState.activeNoteValue = note;
                     }
                 }
                  if (!isStart && !isEnd && window.createParticle && Math.random() < 0.3) {
                      createParticle(clientX, clientY, 8 + Math.random()*8);
                  }
            }

            if (isEnd) {
                 isActive = false;
                 visualizerArea.classList.remove('active');
                 indicator.style.opacity = '0';
                 if (controlMode === 'note' && visualizerNoteActive && soundModule) {
                     await stopActiveSource(true); // Ensure visualizer note stops correctly
                     visualizerNoteActive = false;
                 }
                  // Clear source tracking if it was the visualizer
                  if(coreUiState.activeNoteSource === 'visualizer'){
                      coreUiState.activeNoteSource = null;
                      coreUiState.activeNoteValue = null;
                  }
            }
        };

         // Attach Listeners
         visualizerArea.addEventListener('mousedown', (e) => handleInteraction(e, 'start'));
         document.addEventListener('mousemove', (e) => { if(isActive) handleInteraction(e, 'move'); });
         document.addEventListener('mouseup', (e) => { if(isActive) handleInteraction(e, 'end'); });
         visualizerArea.addEventListener('touchstart', (e) => handleInteraction(e, 'start'), { passive: false });
         visualizerArea.addEventListener('touchmove', (e) => handleInteraction(e, 'move'), { passive: false });
         visualizerArea.addEventListener('touchend', (e) => handleInteraction(e, 'end'));
         visualizerArea.addEventListener('touchcancel', (e) => handleInteraction(e, 'end'));

         // Octave change via wheel
         visualizerArea.addEventListener('wheel', (e) => { /* ... as before ... */
             if (controlMode !== 'note') return;
             e.preventDefault();
             visualizerOctave += e.deltaY < 0 ? 1 : -1;
             visualizerOctave = Math.max(2, Math.min(6, visualizerOctave)); // Clamp octave C2-C6
             showTooltip(`Visualizer Octave: ${visualizerOctave}`);
              if (window.createParticleBurst) createParticleBurst(e.clientX, e.clientY, 10, '#ffddaa');
         }, { passive: false });

        console.log("Enhanced UI: Visualizer controller setup.");
    }


    function improveInputModeSwitch(soundModule, coreUiState, side, stopActiveSource) { // Accept side and stop function
        const swapButton = document.getElementById(`input-swap-button-${side}`);
        const inputContainer = document.getElementById(`input-container-${side}`);
        if (!swapButton || !inputContainer) { console.warn(`Input swap elements not found for side: ${side}`); return; }

        // Apply enhanced button style if needed
        if (!swapButton.classList.contains('mode-switch-button')) {
             swapButton.classList.add('mode-switch-button');
             swapButton.innerHTML = `
               <span class="mode-indicator">MODE: KYBD</span>
               <div class="switch-track"> <div class="switch-handle"></div> </div>
             `;
        }

        const updateSwitchVisual = (mode) => {
            swapButton.classList.toggle('xy', mode === 'xy');
            swapButton.querySelector('.mode-indicator').textContent = `MODE: ${mode === 'keyboard' ? 'KYBD' : 'XY'}`;
        };

        // Clone/replace to ensure only one listener
        const newButton = swapButton.cloneNode(true);
        swapButton.parentNode.replaceChild(newButton, swapButton);

        newButton.addEventListener('click', async () => { // Make async
            const currentMode = inputContainer.dataset.activeInput || 'keyboard';
            const nextMode = currentMode === 'keyboard' ? 'xy' : 'keyboard';

            // Stop sound if the active source is the one being switched away from *on this side*
             const sourceToStop = currentMode === 'keyboard' ? `keyboard-${side}` : `xy-pad-${side}`;
             if (coreUiState.activeNoteSource === sourceToStop) {
                 await stopActiveSource(false); // Use the passed stop function
             }

            // Update state and visual
            inputContainer.dataset.activeInput = nextMode;
            updateSwitchVisual(nextMode);

            inputContainer.classList.add('switching');
            setTimeout(() => inputContainer.classList.remove('switching'), 500);

            if (window.createParticleBurst) {
                 const rect = newButton.getBoundingClientRect();
                 createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
            }
            showTooltip(`${side.toUpperCase()} Mode: ${nextMode === 'keyboard' ? 'Keyboard' : 'XY Pad'}`);
        });

        updateSwitchVisual(inputContainer.dataset.activeInput || 'keyboard');
        // console.log(`Enhanced UI: Input mode switch enhanced for side: ${side}`);
    }


     function setupEnhancedPresetSelector(soundModule, updateUIState) {
         const presetContainer = document.getElementById('preset-area');
         if (!presetContainer) { console.error("Preset area container (#preset-area) not found."); return; }

         let presetNames = [];
         let currentPresetValue = 'default';
         try {
             presetNames = soundModule.getPresetNames();
             currentPresetValue = soundModule.audioState?.activePresetName || presetNames[0] || 'default';
             if (!presetNames?.length) throw new Error("No presets returned");
         } catch (e) {
             console.error("Error getting presets from soundModule:", e);
             presetContainer.innerHTML = `<span class="error-message">Preset Load Error</span>`;
             return;
         }

         // Create Wheel UI
         presetContainer.innerHTML = '';
         const wheelContainer = document.createElement('div');
         wheelContainer.className = 'preset-wheel-container';
         const wheel = document.createElement('div');
         wheel.className = 'preset-wheel';
         wheel.innerHTML = '<span class="preset-label">SCROLLS:</span>';

         const options = presetNames.map(name => ({ value: name, text: name.replace(/_/g, ' ').toUpperCase() }));

         options.forEach(option => {
             const item = document.createElement('div');
             item.className = 'preset-wheel-item';
             item.textContent = option.text;
             item.dataset.value = option.value;
             if (option.value === currentPresetValue) item.classList.add('active');

             item.addEventListener('click', () => {
                 const selectedValue = item.dataset.value;
                 if (selectedValue === soundModule.audioState.activePresetName) return;

                 wheel.querySelectorAll('.preset-wheel-item').forEach(el => el.classList.remove('active'));
                 item.classList.add('active');

                 console.log(`Applying preset via Enhanced UI: ${selectedValue}`);
                 try {
                     soundModule.applyPresetAudio(selectedValue);
                     // Use the passed function to update UI controls on both sides
                     if (updateUIState) { updateUIState(); }
                     else { console.warn("updateUIFromSoundModuleState function not available for preset load."); }
                 } catch (e) {
                     console.error(`Error applying preset '${selectedValue}':`, e);
                     showTooltip(`Error loading preset: ${option.text}`, 3000);
                 }

                 showTooltip(`Preset: ${option.text}`);
                 if (window.createParticleBurst) {
                      const rect = item.getBoundingClientRect();
                      createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 10, '#aaffaa');
                 }
                 item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
             });
             wheel.appendChild(item);
         });

         wheelContainer.appendChild(wheel);
         presetContainer.appendChild(wheelContainer);

         setTimeout(() => { // Scroll active into view after layout
             wheel.querySelector('.preset-wheel-item.active')?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
         }, 50);

         console.log("Enhanced UI: Enhanced preset selector setup complete.");
     }

    // --- Utility Functions (Copied or rely on global scope) ---
    function mapRange(value, inMin, inMax, outMin, outMax) {
        const clampedValue = Math.max(inMin, Math.min(value, inMax));
        if (inMax === inMin) return outMin;
        return outMin + (clampedValue - inMin) * (outMax - outMin) / (inMax - inMin);
    }
    function mapRangeExp(value, inMin, inMax, outMin, outMax, exponent = 2) {
        const clampedValue = Math.max(inMin, Math.min(value, inMax));
         if (inMax === inMin) return outMin;
        const normalized = (clampedValue - inMin) / (inMax - inMin);
        const curved = Math.pow(normalized, exponent);
        return outMin + curved * (outMax - outMin);
    }

     let tooltipTimeout;
     function showTooltip(message, duration = 2000) {
         let tooltip = document.querySelector('.maleficarum-tooltip');
         if (tooltip) tooltip.remove();
         clearTimeout(tooltipTimeout);

         tooltip = document.createElement('div');
         tooltip.className = 'maleficarum-tooltip';
         tooltip.textContent = message;
         document.body.appendChild(tooltip);

         requestAnimationFrame(() => { tooltip.style.opacity = '1'; });

         tooltipTimeout = setTimeout(() => {
             tooltip.style.opacity = '0';
             tooltip.addEventListener('transitionend', () => tooltip.remove(), { once: true });
         }, duration);
     }
    // Expose tooltip globally if needed by other parts
    window.showTooltip = showTooltip;

}); // End DOMContentLoaded wrapper for enhanced-ui.js