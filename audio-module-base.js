/**
 * AudioModuleBase.js - Base class for all audio modules
 * 
 * Provides common functionality and interface for audio modules.
 * All specific module implementations should extend this class.
 */

export class AudioModuleBase {
    /**
     * Creates a new AudioModuleBase instance
     * @param {AudioEngine} engine - Reference to the parent audio engine
     * @param {String} id - Unique identifier for this module instance
     * @param {Object} options - Module configuration options
     */
    constructor(engine, id, options = {}) {
        if (!engine) {
            throw new Error("AudioModuleBase requires an AudioEngine instance");
        }
        
        if (!id) {
            throw new Error("AudioModuleBase requires a unique ID");
        }
        
        this.engine = engine;
        this.id = id;
        this.type = this.constructor.name; // Default to class name
        this.options = { ...this.getDefaultOptions(), ...options };
        
        // Initialization state
        this.isInitialized = false;
        
        // Audio nodes managed by this module
        this.nodes = new Map(); // name -> AudioNode
        
        // Input/output node references (default null, to be set by subclasses)
        this.inputs = new Map(); // name -> AudioNode
        this.outputs = new Map(); // name -> AudioNode
        
        // Parameter listeners (for automatically updating audio params)
        this.parameterListeners = new Map(); // paramId -> removeListener function
        
        // Initial parameter registration with engine parameter system
        this._registerParameters();
    }
    
    /**
     * Get default options for this module type
     * Should be overridden by subclasses
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {};
    }
    
    /**
     * Get initial parameter values
     * Should be overridden by subclasses
     * @returns {Object} Initial parameter values
     */
    getInitialParameters() {
        return {};
    }
    
    /**
     * Get parameter metadata including ranges, defaults, and visual mappings
     * Should be overridden by subclasses
     * @returns {Object} Parameter metadata
     */
    getParameterMetadata() {
        return {};
    }
    
    /**
     * Register this module's parameters with the engine parameter system
     * @private
     */
    _registerParameters() {
        const initialParams = this.getInitialParameters();
        const metadata = this.getParameterMetadata();
        
        // Register with the parameter bridge
        this.engine.parameters.registerModuleParameters(
            this.id,
            initialParams,
            metadata
        );
        
        // Setup parameter listeners for audio params
        this._setupParameterListeners();
    }
    
    /**
     * Set up listeners for parameters that should automatically update audio parameters
     * @private
     */
    _setupParameterListeners() {
        const metadata = this.getParameterMetadata();
        
        // Clean up any existing listeners
        for (const removeListener of this.parameterListeners.values()) {
            removeListener();
        }
        this.parameterListeners.clear();
        
        // Setup listeners for each parameter with audioParam mapping
        for (const [paramId, paramMeta] of Object.entries(metadata)) {
            if (paramMeta.audioParam) {
                const removeListener = this.engine.parameters.addParameterListener(
                    this.id,
                    paramId,
                    (value) => this._handleParameterChange(paramId, value, paramMeta)
                );
                
                this.parameterListeners.set(paramId, removeListener);
            }
        }
    }
    
    /**
     * Handle a parameter change, updating audio parameters as needed
     * @param {String} paramId - ID of the changed parameter
     * @param {*} value - New parameter value
     * @param {Object} metadata - Parameter metadata
     * @private
     */
    _handleParameterChange(paramId, value, metadata) {
        // Skip if module is not initialized
        if (!this.isInitialized) {
            return;
        }
        
        // Get audio param mapping
        const { audioParam } = metadata;
        if (!audioParam) {
            return;
        }
        
        // Resolve node and param name
        const { nodeName, paramName, transform } = typeof audioParam === 'string' 
            ? { nodeName: audioParam, paramName: 'value', transform: null }
            : audioParam;
        
        // Get the node
        const node = this.nodes.get(nodeName);
        if (!node) {
            console.warn(`AudioModuleBase: Node '${nodeName}' not found for parameter '${paramId}'`);
            return;
        }
        
        // Get the audio parameter
        const audioParamObj = node[paramName];
        if (!audioParamObj || typeof audioParamObj.setValueAtTime !== 'function') {
            console.warn(`AudioModuleBase: Invalid audio parameter '${paramName}' on node '${nodeName}'`);
            return;
        }
        
        // Apply transform if provided
        const transformedValue = transform ? transform(value) : value;
        
        // Update the audio parameter
        try {
            const now = this.engine.getCurrentTime();
            
            // Use exponential ramp for frequency-like parameters (positive values only)
            if (paramName === 'frequency' && transformedValue > 0 && audioParamObj.value > 0) {
                audioParamObj.cancelScheduledValues(now);
                audioParamObj.setValueAtTime(audioParamObj.value, now);
                audioParamObj.exponentialRampToValueAtTime(transformedValue, now + 0.02);
            } else {
                // Use linear ramp for other parameters
                audioParamObj.cancelScheduledValues(now);
                audioParamObj.setValueAtTime(audioParamObj.value, now);
                audioParamObj.linearRampToValueAtTime(transformedValue, now + 0.02);
            }
        } catch (error) {
            console.error(`AudioModuleBase: Error updating audio parameter:`, error);
            
            // Fallback to direct value setting
            try {
                audioParamObj.value = transformedValue;
            } catch (fallbackError) {
                console.error(`AudioModuleBase: Fallback direct value set also failed:`, fallbackError);
            }
        }
    }
    
    /**
     * Initialize the module
     * Must be implemented by subclasses
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initialize() {
        throw new Error("AudioModuleBase.initialize() must be implemented by subclass");
    }
    
    /**
     * Create an audio node and register it with this module
     * @param {String} nodeName - Name to register the node under
     * @param {String} nodeType - Type of audio node to create
     * @param {Object} options - Options for node creation
     * @returns {AudioNode} The created audio node
     */
    createNode(nodeName, nodeType, options = {}) {
        const node = this.engine.createAudioNode(nodeType, options);
        this.nodes.set(nodeName, node);
        return node;
    }
    
    /**
     * Register an existing node with this module
     * @param {String} nodeName - Name to register the node under
     * @param {AudioNode} node - Node to register
     */
    registerNode(nodeName, node) {
        this.nodes.set(nodeName, node);
    }
    
    /**
     * Get a registered node
     * @param {String} nodeName - Name of the node to retrieve
     * @returns {AudioNode|null} The audio node or null if not found
     */
    getNode(nodeName) {
        return this.nodes.get(nodeName) || null;
    }
    
    /**
     * Define an input connection point for this module
     * @param {String} inputName - Name of the input
     * @param {String|AudioNode} nodeName - Name of node or node instance to use as input
     */
    defineInput(inputName, nodeName) {
        const node = typeof nodeName === 'string' ? this.getNode(nodeName) : nodeName;
        
        if (!node) {
            throw new Error(`AudioModuleBase: Cannot define input '${inputName}' - node not found`);
        }
        
        this.inputs.set(inputName, node);
    }
    
    /**
     * Define an output connection point for this module
     * @param {String} outputName - Name of the output
     * @param {String|AudioNode} nodeName - Name of node or node instance to use as output
     */
    defineOutput(outputName, nodeName) {
        const node = typeof nodeName === 'string' ? this.getNode(nodeName) : nodeName;
        
        if (!node) {
            throw new Error(`AudioModuleBase: Cannot define output '${outputName}' - node not found`);
        }
        
        this.outputs.set(outputName, node);
    }
    
    /**
     * Get an input connection point
     * @param {String} inputName - Name of the input (default: 'input')
     * @returns {AudioNode|null} Input node or null if not found
     */
    getInput(inputName = 'input') {
        return this.inputs.get(inputName) || null;
    }
    
    /**
     * Get an output connection point
     * @param {String} outputName - Name of the output (default: 'output')
     * @returns {AudioNode|null} Output node or null if not found
     */
    getOutput(outputName = 'output') {
        return this.outputs.get(outputName) || null;
    }
    
    /**
     * Connect this module to another module or audio node
     * @param {AudioModuleBase|AudioNode} destination - Destination module or node
     * @param {String} outputName - Output name on this module (default: 'output')
     * @param {String} inputName - Input name on destination (if module) (default: 'input')
     */
    connect(destination, outputName = 'output', inputName = 'input') {
        const output = this.getOutput(outputName);
        
        if (!output) {
            throw new Error(`AudioModuleBase: Output '${outputName}' not found on module '${this.id}'`);
        }
        
        // Connect based on destination type
        if (destination instanceof AudioModuleBase) {
            const input = destination.getInput(inputName);
            
            if (!input) {
                throw new Error(`AudioModuleBase: Input '${inputName}' not found on module '${destination.id}'`);
            }
            
            output.connect(input);
        } else {
            // Assume AudioNode
            output.connect(destination);
        }
    }
    
    /**
     * Disconnect this module from a destination
     * @param {AudioModuleBase|AudioNode} destination - Destination to disconnect from
     * @param {String} outputName - Output name on this module (default: 'output')
     * @param {String} inputName - Input name on destination (if module) (default: 'input')
     */
    disconnect(destination = null, outputName = 'output', inputName = 'input') {
        const output = this.getOutput(outputName);
        
        if (!output) {
            throw new Error(`AudioModuleBase: Output '${outputName}' not found on module '${this.id}'`);
        }
        
        if (destination === null) {
            // Disconnect from everything
            output.disconnect();
        } else if (destination instanceof AudioModuleBase) {
            const input = destination.getInput(inputName);
            
            if (!input) {
                throw new Error(`AudioModuleBase: Input '${inputName}' not found on module '${destination.id}'`);
            }
            
            output.disconnect(input);
        } else {
            // Assume AudioNode
            output.disconnect(destination);
        }
    }
    
    /**
     * Set a parameter value
     * @param {String} paramId - ID of the parameter
     * @param {*} value - New parameter value
     * @param {Object} options - Options for setting the parameter
     * @returns {Boolean} Whether the parameter was changed
     */
    setParameter(paramId, value, options = {}) {
        return this.engine.parameters.setParameter(this.id, paramId, value, options);
    }
    
    /**
     * Get a parameter value
     * @param {String} paramId - ID of the parameter
     * @returns {*} Parameter value
     */
    getParameter(paramId) {
        return this.engine.parameters.getParameter(this.id, paramId);
    }
    
    /**
     * Get all parameters for this module
     * @returns {Object} Object with all parameter values
     */
    getAllParameters() {
        return this.engine.parameters.getAllParameters(this.id);
    }
    
    /**
     * Dispose of this module and free resources
     */
    dispose() {
        // Clean up parameter listeners
        for (const removeListener of this.parameterListeners.values()) {
            removeListener();
        }
        this.parameterListeners.clear();
        
        // Disconnect all nodes
        for (const node of this.nodes.values()) {
            try {
                node.disconnect();
            } catch (error) {
                // Ignore errors when disconnecting
            }
        }
        
        // Clear references
        this.nodes.clear();
        this.inputs.clear();
        this.outputs.clear();
        this.isInitialized = false;
        
        console.log(`AudioModuleBase: Module '${this.id}' disposed`);
    }
}
