// src/lib/logic/Workspace.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Workspace } from './Workspace';
import type { ChannelIdentity, ServiceIdentity } from './types';

describe('Workspace Logic', () => {
    let workspace: Workspace;

    beforeEach(() => {
        workspace = new Workspace();
    });

    it('initializes with a default system channel', () => {
        const channels = workspace.getChannelList();
        expect(channels[0].id).toBe('system');
    });

    it('routes message IDs correctly', () => {
        const slackService: ServiceIdentity = { id: 'slack_1', name: 'Slack Work' };
        const randomChannel: ChannelIdentity = { id: 'C123', name: 'random', service: slackService };
        
        // 1. Dispatch ID
        workspace.dispatchMessageId(randomChannel, 'msg-001');

        // 2. Verify buffer creation
        const buf = workspace.getBuffer('C123');
        expect(buf?.messageIds).toHaveLength(1);
        expect(buf?.messageIds[0]).toBe('msg-001');

        // 3. Verify metadata storage
        const list = workspace.getChannelList();
        const entry = list.find(c => c.id === 'C123');
        expect(entry).toBeDefined();
        expect(entry?.name).toBe('random');
    });

    it('updates channel metadata if name changes', () => {
        const service: ServiceIdentity = { id: 's1', name: 'Matrix' };
        
        workspace.dispatchMessageId({ id: 'room1', name: 'temp', service }, 'm1');
        workspace.dispatchMessageId({ id: 'room1', name: 'Lobby', service }, 'm2');

        const channel = workspace.getChannelList().find(c => c.id === 'room1');
        expect(channel?.name).toBe('Lobby');
    });
});
