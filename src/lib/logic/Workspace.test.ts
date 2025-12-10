import { describe, it, expect, beforeEach } from 'vitest';
import { Workspace } from './Workspace';
import type { ChannelIdentity, ServiceIdentity, Message } from './types';

describe('Workspace Logic', () => {
    let workspace: Workspace;

    beforeEach(() => {
        workspace = new Workspace();
    });

    it('initializes with a default system channel', () => {
        const channels = workspace.getChannelList();
        // FIX: The default channel is now 'system', not 'general'
        expect(channels[0].id).toBe('system');
        expect(channels[0].service.name).toBe('Solaria');
    });

    it('routes messages using structured Identity objects', () => {
        const slackService: ServiceIdentity = { id: 'slack_1', name: 'Slack Work' };
        const randomChannel: ChannelIdentity = { id: 'C123', name: 'random', service: slackService };
        
        // FIX: Author must be an object
        const msg: Message = { 
            id: 'm1', 
            author: { id: 'u1', name: 'User' }, 
            content: 'hi', 
            timestamp: new Date(),
            reactions: {} 
        };

        // 1. Dispatch using objects
        workspace.dispatchMessage(randomChannel, msg);
        
        // 2. Verify buffer creation
        const buf = workspace.getBuffer('C123');
        expect(buf?.messages).toHaveLength(1);
        
        // 3. Verify metadata storage
        const list = workspace.getChannelList();
        const entry = list.find(c => c.id === 'C123');
        
        expect(entry).toBeDefined();
        expect(entry?.name).toBe('random');
        expect(entry?.service.id).toBe('slack_1');
    });

    it('updates channel metadata if name changes', () => {
        const service: ServiceIdentity = { id: 's1', name: 'Matrix' };
        const msg: Message = { 
            id: '1', 
            author: { id: 'a', name: 'A' }, 
            content: 'x', 
            timestamp: new Date(),
            reactions: {} 
        };

        workspace.dispatchMessage({ id: 'room1', name: 'temp', service }, msg);
        workspace.dispatchMessage({ id: 'room1', name: 'Lobby', service }, msg);

        const channel = workspace.getChannelList().find(c => c.id === 'room1');
        expect(channel?.name).toBe('Lobby');
    });
});
