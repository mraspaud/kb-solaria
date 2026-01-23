import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/svelte';
import App from './App.svelte';

// Imports (These will be mocked)
import { connect, sendMarkRead, sendOpenPath } from './lib/socketStore';
import { chatStore } from './lib/stores/chat';

// --- MOCKS ---

// 1. Mock Socket Store
vi.mock('./lib/socketStore', () => ({
    status: { subscribe: (run: any) => { run('connected'); return () => {}; } },
    connect: vi.fn(),
    sendMessage: vi.fn(),
    sendUpdate: vi.fn(),
    sendDelete: vi.fn(),
    fetchThread: vi.fn(),
    fetchHistory: vi.fn(),
    sendOpenPath: vi.fn(),
    sendSaveToDownloads: vi.fn(),
    sendMarkRead: vi.fn(),
    sendReaction: vi.fn(),
}));

// 2. Mock Chat Store
vi.mock('./lib/stores/chat', () => {
    const { writable } = require('svelte/store');
    
    const mockChatState = {
        activeChannel: { id: 'system', name: 'system', service: { id: 'internal', name: 'Solaria' } },
        messages: [],
        cursorIndex: -1,
        currentUser: { id: 'me', name: 'Me' },
        unread: {},
        availableChannels: [],
        isAttached: true
    };

    const store = writable(mockChatState);
    
    return {
        chatStore: {
            subscribe: store.subscribe,
            set: store.set,
            update: store.update,

            // Viewport Ops
            moveCursor: vi.fn(),
            jumpToBottom: vi.fn(),
            detach: vi.fn(),
            updateUnreadMarkerHighWater: vi.fn(),

            // Logic Ops
            markReadUpTo: vi.fn(),
            switchChannel: vi.fn(),
            openThread: vi.fn(),
            goBack: vi.fn(),

            // Unread Ops
            clearUnreadMarker: vi.fn(),
            clearUnreadCount: vi.fn(),

            // Helper Ops
            isMyMessage: vi.fn(() => true),
            isChannelReadOnly: vi.fn(() => false),
        }
    };
});

// 3. Mock Inspector & HUD
vi.mock('./lib/stores/inspector', () => ({
    inspectorStore: { 
        subscribe: (run: any) => { run('IDLE'); return () => {}; },
        toggleLab: vi.fn()
    }
}));
vi.mock('./lib/stores/hud', () => ({
    hudStore: { subscribe: (run: any) => { run({ ego: 0, signal: 0 }); return () => {}; } }
}));

// 4. Mock Input Store
vi.mock('./lib/stores/input', () => ({
    inputEngine: { subscribe: (run: any) => { run({ raw: '', match: null }); return () => {}; } },
    users: { subscribe: (run: any) => { run([]); return () => {}; } },
    entityRegex: { subscribe: (run: any) => { run(null); return () => {}; } },
    ghostText: { subscribe: (run: any) => { run(''); return () => {}; } },
    attachments: { subscribe: (run: any) => { run([]); return () => {}; } },
    candidates: { subscribe: (run: any) => { run([]); return () => {}; } }
}));


describe('App Component', () => {
    beforeEach(() => {
        // --- JSDOM POLYFILLS ---
        
        // 1. ResizeObserver
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };

        // 2. Canvas Context (for StarMap)
        // @ts-ignore
        HTMLCanvasElement.prototype.getContext = () => ({
            scale: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            createRadialGradient: () => ({ addColorStop: vi.fn() }),
            fillText: vi.fn(),
        });

        // 3. Scrolling
        Element.prototype.scrollTo = vi.fn();
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.getBoundingClientRect = vi.fn(() => ({
            top: 0, bottom: 800, height: 800, left: 0, right: 800, width: 800, x: 0, y: 0, toJSON: () => {}
        }));
        
        vi.clearAllMocks();
    });

    it('renders the Cockpit layout', () => {
        render(App);
        expect(screen.getByText('NORMAL')).toBeInTheDocument();
        expect(screen.getByText(' system')).toBeInTheDocument();
    });

    it('connects to socket on mount', () => {
        render(App);
        expect(connect).toHaveBeenCalled();
    });

    it('opens ALL attachments when triggering OPEN_FILE (gf)', async () => {
        render(App);

        const multiFileMsg = {
            id: 'm1',
            content: 'files',
            author: { id: 'u1', name: 'User' },
            timestamp: new Date(),
            attachments: [
                { id: 'f1', name: 'A.pdf', path: '/tmp/A.pdf' },
                { id: 'f2', name: 'B.jpg', path: '/tmp/B.jpg' }
            ]
        };

        await act(() => {
            // @ts-ignore
            chatStore.set({
                activeChannel: { id: 'gen', name: 'general', service: { id: 's1', name: 'Slack' } },
                messages: [multiFileMsg],
                cursorIndex: 0,
                currentUser: { id: 'me', name: 'Me' },
                unread: {},
                availableChannels: [],
                isAttached: true
            });
        });

        vi.useFakeTimers();
        await fireEvent.keyDown(window, { key: 'g' });
        vi.advanceTimersByTime(100); 
        await fireEvent.keyDown(window, { key: 'f' });
        vi.useRealTimers();

        expect(sendOpenPath).toHaveBeenCalledTimes(2);
        expect(sendOpenPath).toHaveBeenCalledWith('/tmp/A.pdf');
        expect(sendOpenPath).toHaveBeenCalledWith('/tmp/B.jpg');
    });

    it('marks message as read IMMEDIATELY when jumping from Inbox', async () => {
        render(App);

        const inboxMsg = {
            id: 'm1',
            content: 'hello',
            sourceChannel: { id: 'C1', name: 'gen', service: { id: 's1', name: 'Slack' } },
            author: { id: 'u1', name: 'User' },
            timestamp: new Date()
        };

        await act(() => {
            // @ts-ignore
            chatStore.set({
                activeChannel: { id: 'inbox', name: 'inbox', service: { id: 'aggregation', name: 'Solaria' } },
                messages: [inboxMsg],
                cursorIndex: 0,
                currentUser: { id: 'me', name: 'Me' },
                unread: { 'C1': { count: 1, hasMention: true } },
                availableChannels: [],
                isAttached: true
            });
        });

        await fireEvent.keyDown(window, { key: 'Enter' });

        // 1. Verify Socket Call
        expect(sendMarkRead).toHaveBeenCalledWith('C1', 'm1', 's1');
        
        // 2. Verify Store Call
        expect(chatStore.markReadUpTo).toHaveBeenCalledWith(inboxMsg.sourceChannel, inboxMsg);
        
        // 3. Verify Navigation
        expect(chatStore.switchChannel).toHaveBeenCalledWith(inboxMsg.sourceChannel, { jumpTo: 'm1' });
    });
});
