/**
 * ModuleRegistry.js - Module management and audio routing
 * 
 * Manages audio modules, their connections, and lifecycle.
 * Provides registry of available modules and their instances.
 */

import { AudioModuleBase } from './base/AudioModuleBase.js';

export class ModuleRegistry {
    /**
     * Creates a new ModuleRegistry instance
     * @param {AudioEngine} engine - Reference to the parent audio engine
     */
    constructor(engine) {
        this.engine = engine;
        
        // Module registries by type and id
        this.moduleTypes = new Map(); // Available module types
        this.moduleInstances = new Map(); // Active module instances
        
        // Track connected modules for audio graph management
        this.connections = new Map(); // Map of source -> [destinations]
        
        // Registry for backwards compatibility mappings
        this.backwardCompatMappings = new Map();
    }
    
    /**
     * Register a module type for future instantiation
     * @param {String} moduleType - Type name for the module
     * @param {Class} moduleClass - Class that implements the module (must extend AudioModuleBase)
     */
    registerModuleType(moduleType, moduleClass) {
        // Validate the module class extends AudioModuleBase
        if (!moduleClass.prototype instanceof AudioModuleBase) {
            throw new Error(`Module class must extend AudioModuleBase: ${moduleType}`);
        }
        
        this.moduleTypes.set(moduleType, moduleClass);
        console.log(`ModuleRegistry: Registered module type '${moduleType}'`);
    }
    
    /**
     * Create a new module instance
     * @param {String} moduleType - Type of module to create
     * @param {String} moduleId - Unique ID for this module instance
     * @param {Object} options - Options to pass to the module constructor
     * @returns {AudioModuleBase} The created module instance
     */
    createModule(moduleType, moduleId, options = {}) {
        // Check if module type is registered
        const ModuleClass = this.moduleTypes.get(moduleType);
        if (!ModuleClass) {
            throw new Error(`Unknown module type: ${moduleType}`);
        }
        
        // Check for duplicate module ID
        if (this.moduleInstances.has(moduleId)) {
            throw new Error(`Module with ID already exists: ${moduleId}`);
        }
        
        // Create the module instance
        const module = new ModuleClass(this.engine, moduleId, options);
        this.moduleInstances.set(moduleId, module);
        
        console.log(`ModuleRegistry: Created module '${moduleId}' of type '${moduleType}'`);
        return module;
    }
    
    /**
     * Get a module instance by ID
     * @param {String} moduleId - ID of the module to retrieve
     * @returns {AudioModuleBase} The module instance
     */
    getModule(moduleId) {
        const module = this.moduleInstances.get(moduleId);
        if (!module) {
            throw new Error(`Module not found: ${moduleId}`);
        }
        return module;
    }
    
    /**
     * Get all modules of a specific type
     * @param {String} moduleType - Type of modules to retrieve
     * @returns {Array<AudioModuleBase>} Array of matching module instances
     */
    getModulesByType(moduleType) {
        const modules = [];
        
        for (const module of this.moduleInstances.values()) {
            if (module.type === moduleType) {
                modules.push(module);
            }
        }
        
        return modules;
    }
    
    /**
     * Connect audio between two modules
     * @param {String|AudioModuleBase} sourceModule - Source module ID or instance
     * @param {String|AudioModuleBase} destModule - Destination module ID or instance
     * @param {String} outputName - Output name on source module (default: 'output')
     * @param {String} inputName - Input name on destination module (default: 'input')
     */
    connect(sourceModule, destModule, outputName = 'output', inputName = 'input') {
        // Resolve module references if strings were provided
        const source = typeof sourceModule === 'string' ? this.getModule(sourceModule) : sourceModule;
        const dest = typeof destModule === 'string' ? this.getModule(destModule) : destModule;
        
        // Get the actual audio nodes for connection
        const sourceNode = source.getOutput(outputName);
        const destNode = dest.getInput(inputName);
        
        if (!sourceNode || !destNode) {
            throw new Error(`Invalid connection: ${source.id}.${outputName} -> ${dest.id}.${inputName}`);
        }
        
        // Make the audio connection
        sourceNode.connect(destNode);
        
        // Track the connection for later management
        const connectionKey = `${source.id}.${outputName}`;
        const connectionValue = `${dest.id}.${inputName}`;
        
        if (!this.connections.has(connectionKey)) {
            this.connections.set(connectionKey, []);
        }
        
        this.connections.get(connectionKey).push(connectionValue);
        
        console.log(`ModuleRegistry: Connected ${source.id}.${outputName} -> ${dest.id}.${inputName}`);
    }
    
    /**
     * Disconnect audio between two modules
     * @param {String|AudioModuleBase} sourceModule - Source module ID or instance
     * @param {String|AudioModuleBase} destModule - Destination module ID or instance
     * @param {String} outputName - Output name on source module (default: 'output')
     * @param {String} inputName - Input name on destination module (default: 'input')
     */
    disconnect(sourceModule, destModule, outputName = 'output', inputName = 'input') {
        // Resolve module references if strings were provided
        const source = typeof sourceModule === 'string' ? this.getModule(sourceModule) : sourceModule;
        const dest = typeof destModule === 'string' ? this.getModule(destModule) : destModule;
        
        // Get the actual audio nodes
        const sourceNode = source.getOutput(outputName);
        const destNode = dest.getInput(inputName);
        
        if (!sourceNode || !destNode) {
            throw new Error(`Invalid disconnection: ${source.id}.${outputName} -> ${dest.id}.${inputName}`);
        }
        
        // Disconnect the audio
        sourceNode.disconnect(destNode);
        
        // Update the connection tracking
        const connectionKey = `${source.id}.${outputName}`;
        const connectionValue = `${dest.id}.${inputName}`;
        
        if (this.connections.has(connectionKey)) {
            const connections = this.connections.get(connectionKey);
            const index = connections.indexOf(connectionValue);
            
            if (index !== -1) {
                connections.splice(index, 1);
                
                if (connections.length === 0) {
                    this.connections.delete(connectionKey);
                }
            }
        }
        
        console.log(`ModuleRegistry: Disconnected ${source.id}.${outputName} -> ${dest.id}.${inputName}`);
    }
    
    /**
     * Initialize all registered modules
     * @returns {Promise<Boolean>} Promise resolving to success state
     */
    async initializeModules() {
        const initPromises = [];
        
        // Initialize all modules
        for (const module of this.moduleInstances.values()) {
            initPromises.push(module.initialize());
        }
        
        // Wait for all modules to initialize
        try {
            await Promise.all(initPromises);
            console.log("ModuleRegistry: All modules initialized");
            return true;
        } catch (error) {
            console.error("ModuleRegistry: Error initializing modules:", error);
            return false;
        }
    }
    
    /**
     * Setup backward compatibility mappings for legacy parameters
     * @param {String} legacyParam - Legacy parameter name
     * @param {Object} mapping - Mapping to new parameter structure
     * @param {String} mapping.moduleId - Target module ID
     * @param {String} mapping.paramId - Target parameter ID within module
     * @param {Function} mapping.transform - Optional transform function
     */
    registerBackwardCompatMapping(legacyParam, mapping) {
        this.backwardCompatMappings.set(legacyParam, mapping);
    }
    
    /**
     * Get backward compatibility mapping for a legacy parameter
     * @param {String} legacyParam - Legacy parameter name
     * @returns {Object|null} Mapping object or null if not found
     */
    getBackwardCompatMapping(legacyParam) {
        return this.backwardCompatMappings.get(legacyParam) || null;
    }
    
    /**
     * Dispose of all modules and clear registry
     */
    dispose() {
        console.log("ModuleRegistry: Disposing all modules");
        
        // Dispose all module instances
        for (const module of this.moduleInstances.values()) {
            try {
                module.dispose();
            } catch (error) {
                console.error(`Error disposing module ${module.id}:`, error);
            }
        }
        
        // Clear all registries
        this.moduleInstances.clear();
        this.connections.clear();
        this.backwardCompatMappings.clear();
        
        console.log("ModuleRegistry: Disposed");
    }
}
