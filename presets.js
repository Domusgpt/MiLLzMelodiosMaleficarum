// sound/presets.js

const defaultStructure = {
    oscillator: {type: 'sawtooth', gain: 0.5},
    osc2: { type: 'sine', detune: 0, mix: 0 }, // Default OSC2 off
    filter: {type: 'lowpass', frequency: 1500, Q: 1.0},
    envelope: {attack: 0.05, release: 0.5},
    lfo1: { rate: 1, depth: 0, target: 'none', shape: 'sine' }, // Default LFO off
    effects: {
        delay: {active: false, time: 0.3, feedback: 0.3},
        reverb: {active: false, decay: 1.5, wet: 0.3},
        glitch: {active: false}, // Visual only flag
        arpeggiator: {active: false, rate: 8, pattern: [0, 7, 12]}
    },
    // Add future global params here if needed (e.g., portamento, unison settings for VoiceManager)
    voice: {
        portamento: 0,
        unisonCount: 1,
        unisonDetune: 0.1
    }
};

const presets = {
    'default': defaultStructure,
    'vaporwave': {
        oscillator: {type: 'sine', gain: 0.4},
        filter: {frequency: 800, Q: 2.0},
        envelope: {attack: 0.8, release: 2.0},
        effects: { delay: {active: true, time: 0.55, feedback: 0.45}, reverb: {active: true, decay: 3.5, wet: 0.65} },
    },
    'ambient_drone': {
        oscillator: {type: 'sine', gain: 0.4}, osc2: { type: 'triangle', detune: 5, mix: 0.3 },
        filter: {frequency: 600, Q: 1.5}, envelope: {attack: 3.0, release: 5.0},
        effects: { delay: {active: true, time: 0.8, feedback: 0.6}, reverb: {active: true, decay: 6.0, wet: 0.8} },
    },
    'synthwave_lead': {
        oscillator: {type: 'sawtooth', gain: 0.6}, osc2: { type: 'square', detune: -7, mix: 0.2 },
        filter: {frequency: 1200, Q: 5.0}, envelope: {attack: 0.02, release: 0.4},
        effects: { delay: {active: true, time: 0.25, feedback: 0.3}, reverb: {active: true, decay: 1.5, wet: 0.4}, arpeggiator: {active: true, rate: 12, pattern: [0, 7, 12, 16]} },
        voice: { portamento: 0.05 }
    },
    'grimoire_pulse': {
        oscillator: {type: 'square', gain: 0.4},
        filter: {type: 'bandpass', frequency: 900, Q: 6.0}, envelope: {attack: 0.01, release: 0.2},
        effects: { delay: {active: true, time: 0.15, feedback: 0.65}, glitch: {active: true}, arpeggiator: {active: true, rate: 10, pattern: [0, 3, 7, 10]} },
    },
    'dark_ritual': {
        oscillator: { type: 'sawtooth', gain: 0.5 }, osc2: { type: 'sawtooth', detune: 15, mix: 0.4 },
        filter: { type: 'lowpass', frequency: 450, Q: 3.0 }, envelope: { attack: 1.5, release: 3.0 },
        effects: { delay: { active: true, time: 0.666, feedback: 0.6 }, reverb: { active: true, decay: 4.5, wet: 0.5 }, glitch: { active: true } },
        voice: { unisonCount: 2, unisonDetune: 0.2 }
    },
    'cyber_bass': {
        oscillator: { type: 'square', gain: 0.7 }, osc2: { type: 'sawtooth', detune: -12, mix: 0.5 },
        filter: { type: 'lowpass', frequency: 300, Q: 8.0 }, envelope: { attack: 0.01, release: 0.3 },
        effects: { reverb: { active: true, decay: 0.8, wet: 0.2 }, arpeggiator: { active: true, rate: 16, pattern: [0, 0, 7, 0, 10, 0, 7, 0] } },
    },
    'crystal_pad': {
        oscillator: { type: 'triangle', gain: 0.4 }, osc2: { type: 'sine', detune: 7, mix: 0.6 },
        filter: { type: 'highpass', frequency: 500, Q: 2.0 }, envelope: { attack: 1.8, release: 3.5 },
        effects: { delay: { active: true, time: 0.4, feedback: 0.5 }, reverb: { active: true, decay: 5.0, wet: 0.7 } },
    },
    'pulsar_wind': { // Placeholder LFO
        oscillator: { type: 'sawtooth', gain: 0.3 }, // Needs noise eventually
        filter: { type: 'bandpass', frequency: 2500, Q: 15.0 }, envelope: { attack: 0.1, release: 1.5 },
        lfo1: { rate: 0.2, depth: 4000, target: 'filterFreq', shape: 'sawtooth' }, // LFO affects filter
        effects: { delay: { active: true, time: 1.2, feedback: 0.7 }, reverb: { active: true, decay: 6.0, wet: 0.4 } },
    }
    // Add more presets...
};

// Function to get preset names easily
export const getPresetNames = () => Object.keys(presets).filter(name => name !== 'default');

// Function to get a specific preset's data (merged with default)
export const getPresetData = (presetName) => {
    const preset = presets[presetName];
    if (!preset) {
        console.warn(`Preset '${presetName}' not found. Returning default.`);
        return JSON.parse(JSON.stringify(presets['default']));
    }

    const defaultPreset = JSON.parse(JSON.stringify(presets['default']));

    // Simple deep merge (adjust if more complex structure arises)
    const mergeDeep = (target, source) => {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                const targetValue = target[key];
                const sourceValue = source[key];
                if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                    if (!targetValue || typeof targetValue !== 'object') { target[key] = {}; }
                    mergeDeep(target[key], sourceValue);
                } else {
                    target[key] = sourceValue;
                }
            }
        }
    };

    mergeDeep(defaultPreset, preset);
    return defaultPreset;
};

export default presets; // Export the raw presets object if needed elsewhere