// js/ui-interactions.js (Updates)

// --- Mapping Helper (Update with new modules/params) ---
const paramMap = {
    // Sliders
    'slider-filter-frequency': { moduleId: 'filter1', paramId: 'frequency' },
    'slider-resonance': { moduleId: 'filter1', paramId: 'resonance' }, // Use 'resonance'
    'slider-attack': { moduleId: 'ampEnv1', paramId: 'attack' },
    'slider-release': { moduleId: 'ampEnv1', paramId: 'release' },
    // NEW Mappings (Add UI elements for these later)
    'slider-osc2-mix': { moduleId: 'oscillator2', paramId: 'mix' },
    'slider-osc2-detune': { moduleId: 'oscillator2', paramId: 'detune' },
    'slider-lfo1-rate': { moduleId: 'voiceManager', paramId: 'lfo1Rate' }, // Global LFO control on VoiceManager
    'slider-lfo1-depth': { moduleId: 'voiceManager', paramId: 'lfo1Depth' },
    'slider-noise-level': { moduleId: 'voiceManager', paramId: 'noiseLevel' },
    'slider-filter-env-amount': {moduleId: 'voiceManager', paramId: 'filterEnvAmount'},
    'slider-lfo1-filter-mod': {moduleId: 'voiceManager', paramId: 'lfo1FilterModDepth'},
    'slider-portamento': {moduleId: 'voiceManager', paramId: 'portamento'},
    'slider-unison-detune': {moduleId: 'voiceManager', paramId: 'unisonDetune'},


    // Toggles
    'toggle-delay': { moduleId: 'delay1', paramId: 'enabled' },
    'toggle-reverb': { moduleId: 'reverb1', paramId: 'enabled' },
    'toggle-arpeggiator': { moduleId: 'voiceManager', paramId: 'arpeggiatorEnabled' },
    'toggle-glitch': { moduleId: 'visualizer', paramId: 'glitchEnabled' }, // Keep as visualizer state trigger
     // Add toggles for Osc2 enable? (Or just use mix slider)
     // 'toggle-osc2-enable': { moduleId: 'oscillator2', paramId: 'enabled'},
     // 'toggle-noise-enable': { moduleId: 'voiceManager', paramId: 'noiseEnabled'}, // Might control via noiseLevel slider instead
};

// ... inside initializeApp() or globally ...
window.applyPreset = applyPreset; // Expose globally

// --- Preset Application Function (Revised Mapping) ---
function applyPreset(presetName) {
    if (!window.audioEngine || !coreUiState.isAudioInitialized) { /* ... guard ... */ return; }
    console.log(`Applying preset via AudioEngine: ${presetName}`);
    const presetData = getPresetData(presetName); // Get merged preset data
    if (!presetData) { /* ... error ... */ return; }

    try {
        window.audioEngine.parameters.beginBatchUpdate();
        const params = window.audioEngine.parameters; // Shorter ref

        // --- Iterate through preset structure and map to ParameterBridge ---
        // Oscillator 1
        if (presetData.oscillator1) {
            params.setParameter('oscillator1', 'waveform', presetData.oscillator1.waveform);
            params.setParameter('oscillator1', 'gain', presetData.oscillator1.gain);
            params.setParameter('oscillator1', 'detune', presetData.oscillator1.detune ?? 0); // Ensure default
        }
        // Oscillator 2
        if (presetData.oscillator2) {
            params.setParameter('oscillator2', 'waveform', presetData.oscillator2.waveform);
            params.setParameter('oscillator2', 'mix', presetData.oscillator2.mix);
            params.setParameter('oscillator2', 'detune', presetData.oscillator2.detune ?? 0);
             params.setParameter('oscillator2', 'enabled', presetData.oscillator2.enabled ?? (presetData.oscillator2.mix > 0.01)); // Explicit enable flag or infer from mix
        }
        // Filter 1
        if (presetData.filter1) {
            params.setParameter('filter1', 'type', presetData.filter1.type);
            params.setParameter('filter1', 'frequency', presetData.filter1.frequency);
            params.setParameter('filter1', 'resonance', presetData.filter1.resonance);
            params.setParameter('filter1', 'gain', presetData.filter1.gain ?? 0);
        }
        // Amp Env 1
        if (presetData.ampEnv1) {
            params.setParameter('ampEnv1', 'attack', presetData.ampEnv1.attack);
            params.setParameter('ampEnv1', 'decay', presetData.ampEnv1.decay ?? 0.1);
            params.setParameter('ampEnv1', 'sustain', presetData.ampEnv1.sustain ?? 0.7);
            params.setParameter('ampEnv1', 'release', presetData.ampEnv1.release);
        }
         // Filter Env 1
         if (presetData.filterEnv1) {
            params.setParameter('filterEnv1', 'attack', presetData.filterEnv1.attack ?? presetData.ampEnv1?.attack ?? 0.05); // Default from amp env if missing
            params.setParameter('filterEnv1', 'decay', presetData.filterEnv1.decay ?? presetData.ampEnv1?.decay ?? 0.1);
            params.setParameter('filterEnv1', 'sustain', presetData.filterEnv1.sustain ?? presetData.ampEnv1?.sustain ?? 0.7);
            params.setParameter('filterEnv1', 'release', presetData.filterEnv1.release ?? presetData.ampEnv1?.release ?? 0.5);
            // Filter Env Amount is on VoiceManager now
            // params.setParameter('filterEnv1', 'amount', presetData.filterEnv1.amount ?? 0);
        }
        // LFO 1 (Global Controls on VoiceManager)
        if (presetData.lfo1) {
             // These params are now likely on VoiceManager for global control
             params.setParameter('voiceManager', 'lfo1Rate', presetData.lfo1.rate ?? 1.0);
             params.setParameter('voiceManager', 'lfo1Depth', presetData.lfo1.depth ?? 0.0);
             // Set waveform on the actual LFO modules via distribution
             window.audioEngine.registry.getModule('voiceManager')?._distributeParameter('lfo1.waveform', presetData.lfo1.waveform ?? 'sine');
             // LFO Target assignment needs a dedicated system later
        }
        // Delay 1
        if (presetData.delay1) {
            params.setParameter('delay1', 'time', presetData.delay1.time);
            params.setParameter('delay1', 'feedback', presetData.delay1.feedback);
            params.setParameter('delay1', 'mix', presetData.delay1.mix ?? 0.5); // Add mix if missing
            params.setParameter('delay1', 'enabled', presetData.delay1.enabled);
        }
        // Reverb 1
        if (presetData.reverb1) {
            params.setParameter('reverb1', 'decayTime', presetData.reverb1.decayTime);
            params.setParameter('reverb1', 'mix', presetData.reverb1.mix);
            params.setParameter('reverb1', 'preDelay', presetData.reverb1.preDelay ?? 0.01);
            params.setParameter('reverb1', 'enabled', presetData.reverb1.enabled);
        }
        // Voice Manager specific params
        if (presetData.voiceManager) {
            for (const key in presetData.voiceManager) {
                params.setParameter('voiceManager', key, presetData.voiceManager[key]);
            }
        }
         // Global Mod Depths on VoiceManager
         params.setParameter('voiceManager', 'filterEnvAmount', presetData.filterEnv1?.amount ?? 0); // Get amount from filterEnv1 definition
         params.setParameter('voiceManager', 'lfo1FilterModDepth', presetData.lfo1?.target === 'filter1.frequency' ? (presetData.lfo1.depth * 1000) : 0); // Example: Map depth to Hz if target matches
         params.setParameter('voiceManager', 'noiseLevel', presetData.noiseLevel ?? 0.0); // Get global noise level if defined

        // Visualizer Glitch
        if (presetData.visualizer && window.mainVisualizerCore) {
            window.mainVisualizerCore.updateParameters({ glitchIntensity: presetData.visualizer.glitchEnabled ? 0.5 : 0.0 });
        }

        window.audioEngine.parameters.endBatchUpdate();
        window.updateUIFromEngineState(); // Update UI after all changes
        coreUiState.currentPreset = presetName;
    } catch (error) {
        console.error(`Error applying preset '${presetName}' parameters:`, error);
        window.audioEngine.parameters.endBatchUpdate();
    }
}

// --- Ensure necessary global functions are exposed ---
// window.stopCurrentlyActiveSource = stopCurrentlyActiveSource; // Already done
// window.updateUIFromEngineState = updateUIFromEngineState; // Defined above
// window.applyPreset = applyPreset; // Defined above