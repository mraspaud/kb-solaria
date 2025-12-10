import type { KeymapConfig, Command } from './keymap';

export type CommandHandler = (cmd: Command) => void;

export class InputController {
    private config: KeymapConfig;
    private handler: CommandHandler;
    
    private lastKey: string = '';
    private lastKeyTime: number = 0;

    static resolveKey(e: KeyboardEvent, config: KeymapConfig): Command | null {
        let keyChar = e.key;
        
        // Normalize Modifiers (Simple implementation matching instance logic)
        let inputKey = keyChar;
        if (e.ctrlKey && keyChar !== 'Control') inputKey = `<C-${keyChar}>`;
        
        // Direct Lookup
        return config.bindings[inputKey] || null;
    }

    constructor(config: KeymapConfig, handler: CommandHandler) {
        this.config = config;
        this.handler = handler;
    }

    public handleKey(e: KeyboardEvent): void {
        const now = Date.now();
        let keyChar = e.key;

        // 1. Normalize Modifiers
        let inputKey = keyChar;
        if (e.ctrlKey && keyChar !== 'Control') inputKey = `<C-${keyChar}>`;
        
        // 2. Resolve Sequence Logic
        const isSequence = (now - this.lastKeyTime) < this.config.leaderTimeout;
        let executed = false;

        if (isSequence) {
            const prev = this.resolveAlias(this.lastKey);
            const curr = this.resolveAlias(inputKey);
            const sequenceKey = `${prev} ${curr}`;
            
            if (this.config.bindings[sequenceKey]) {
                e.preventDefault(); 
                e.stopPropagation();
                this.fire(this.config.bindings[sequenceKey]);
                this.resetSequence();
                executed = true;
            }
        }

        if (!executed) {
            // Check if this key starts a known sequence
            if (this.startsSequence(inputKey)) {
                e.preventDefault();
                this.lastKey = inputKey;
                this.lastKeyTime = now;
                return;
            }

            // Normal Execution
            if (this.config.bindings[inputKey]) {
                e.preventDefault();
                this.fire(this.config.bindings[inputKey]);
                this.resetSequence();
            } else {
                this.resetSequence();
            }
        }
    }

    private resolveAlias(key: string): string {
        if (key === this.config.leader) return '<Leader>';
        return key;
    }

    private startsSequence(key: string): boolean {
        const normalized = this.resolveAlias(key);
        return Object.keys(this.config.bindings).some(k => k.startsWith(normalized + ' '));
    }

    private fire(cmd: Command) {
        this.handler(cmd);
    }

    private resetSequence() {
        this.lastKey = '';
        this.lastKeyTime = 0;
    }
}
