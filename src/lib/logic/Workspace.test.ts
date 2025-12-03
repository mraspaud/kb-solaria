import { describe, it, expect, beforeEach } from 'vitest';
import { Workspace } from './Workspace';
import type { ChannelIdentity, ServiceIdentity, Message } from './types';

describe('Workspace Logic', () => {
    let workspace: Workspace;

    // Helper to create dummy data
    const mockService: ServiceIdentity = { id: 's1', name: 'System' };
    const mockChannel: ChannelIdentity = { id: 'general', name: 'General', service: mockService };

    beforeEach(() => {
        workspace = new Workspace();
    });

    it('initializes with a default channel', () => {
        const channels = workspace.getChannelList();
        // We expect the workspace to auto-create a default 'general'
        expect(channels[0].id).toBe('general');
        expect(channels[0].service.name).toBe('System');
    });

    it('routes messages using structured Identity objects', () => {
        const slackService: ServiceIdentity = { id: 'slack_1', name: 'Slack Work' };
        const randomChannel: ChannelIdentity = { id: 'C123', name: 'random', service: slackService };
        
        const msg: Message = { id: 'm1', author: 'User', content: 'hi', timestamp: new Date() };

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
        const msg: Message = { id: '1', author: 'A', content: 'x', timestamp: new Date() };

        // First dispatch: Name is 'temp'
        workspace.dispatchMessage({ id: 'room1', name: 'temp', service }, msg);
        
        // Second dispatch: Name is 'Lobby'
        workspace.dispatchMessage({ id: 'room1', name: 'Lobby', service }, msg);

        const channel = workspace.getChannelList().find(c => c.id === 'room1');
        expect(channel?.name).toBe('Lobby');
    });
});
