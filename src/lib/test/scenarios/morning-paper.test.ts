// src/lib/test/scenarios/morning-paper.test.ts
// Full end-to-end scenario: "The Morning Paper"
// Simulates a typical session where user processes overnight messages

import { describe, it, expect, beforeEach } from 'vitest';
import { TestHarness } from '../TestHarness';
import {
    createChannel,
    createMessage,
    createUser,
    createThreadChannel,
    resetIdCounter,
    fixtures
} from '../fixtures';

describe('Morning Paper - Full Session Simulation', () => {
    let harness: TestHarness;
    const service = { id: 'slack', name: 'Slack' };

    // Cast of characters
    let me: ReturnType<typeof createUser>;
    let alice: ReturnType<typeof createUser>;
    let bob: ReturnType<typeof createUser>;
    let charlie: ReturnType<typeof createUser>;

    // Channels
    let generalChannel: ReturnType<typeof createChannel>;
    let projectChannel: ReturnType<typeof createChannel>;  // starred
    let alertsChannel: ReturnType<typeof createChannel>;   // starred
    let randomChannel: ReturnType<typeof createChannel>;

    beforeEach(() => {
        resetIdCounter();
        harness = new TestHarness();

        // Setup users
        me = createUser('Me', 'slack');
        alice = createUser('Alice');
        bob = createUser('Bob');
        charlie = createUser('Charlie');

        // Setup channels - mix of starred and non-starred
        generalChannel = createChannel({
            name: 'general',
            service,
            starred: false,
            lastReadAt: Date.now() / 1000 - 28800 // Read 8 hours ago (overnight)
        });

        projectChannel = createChannel({
            name: 'project-alpha',
            service,
            starred: true,
            lastReadAt: Date.now() / 1000 - 28800
        });

        alertsChannel = createChannel({
            name: 'alerts-prod',
            service,
            starred: true,
            lastReadAt: Date.now() / 1000 - 28800
        });

        randomChannel = createChannel({
            name: 'random',
            service,
            starred: false,
            lastReadAt: Date.now() / 1000 - 28800
        });
    });

    it('processes a full morning of overnight messages', () => {
        // === SETUP: Overnight messages accumulated ===

        harness.bootstrap({
            identity: me,
            service,
            channels: [generalChannel, projectChannel, alertsChannel, randomChannel],
            participatedThreads: ['ongoing-discussion']
        });

        const baseTime = Date.now() - 25200000; // 7 hours ago

        // --- TRIAGE ITEMS (EGO + CONTEXT) ---

        // 1. Direct mention in #general (EGO -> Triage)
        const mentionMsg = createMessage({
            id: 'mention-1',
            author: alice,
            content: `Hey <@${me.id}>, can you review PR #123?`,
            sourceChannel: generalChannel,
            timestamp: new Date(baseTime)
        });

        // 2. Another mention in #random (EGO -> Triage)
        const mentionMsg2 = createMessage({
            id: 'mention-2',
            author: bob,
            content: `<@${me.id}> lunch today?`,
            sourceChannel: randomChannel,
            timestamp: new Date(baseTime + 1000)
        });

        // 3. Reply in a thread I participated in (CONTEXT -> Triage)
        const threadReply = createMessage({
            id: 'thread-reply-1',
            author: charlie,
            content: 'Good point, I updated the design doc',
            threadId: 'ongoing-discussion',
            sourceChannel: generalChannel,
            timestamp: new Date(baseTime + 2000)
        });

        // --- INBOX ITEMS (SIGNAL from starred channels) ---

        // 4. Update in starred #project-alpha (SIGNAL -> Inbox)
        const projectUpdate = createMessage({
            id: 'project-1',
            author: alice,
            content: 'Deployed v2.1 to staging',
            sourceChannel: projectChannel,
            timestamp: new Date(baseTime + 3000)
        });

        // 5. Another update in #project-alpha (SIGNAL -> Inbox)
        const projectUpdate2 = createMessage({
            id: 'project-2',
            author: bob,
            content: 'Tests passing, ready for prod',
            sourceChannel: projectChannel,
            timestamp: new Date(baseTime + 4000)
        });

        // 6. Alert in starred #alerts-prod (SIGNAL -> Inbox)
        const alertMsg = createMessage({
            id: 'alert-1',
            author: charlie,
            content: 'CPU spike on web-01, investigating',
            sourceChannel: alertsChannel,
            timestamp: new Date(baseTime + 5000)
        });

        // 7. Follow-up alert (SIGNAL -> Inbox)
        const alertMsg2 = createMessage({
            id: 'alert-2',
            author: charlie,
            content: 'Resolved - was a runaway query',
            sourceChannel: alertsChannel,
            timestamp: new Date(baseTime + 6000)
        });

        // Dispatch all messages (simulating overnight accumulation)
        harness.dispatchMessage(generalChannel, mentionMsg);
        harness.dispatchMessage(randomChannel, mentionMsg2);
        harness.dispatchMessage(generalChannel, threadReply);
        harness.dispatchMessage(projectChannel, projectUpdate);
        harness.dispatchMessage(projectChannel, projectUpdate2);
        harness.dispatchMessage(alertsChannel, alertMsg);
        harness.dispatchMessage(alertsChannel, alertMsg2);

        // === VERIFY INITIAL STATE ===
        // Triage: 2 mentions + 1 thread reply = 3
        // Inbox: 2 project + 2 alerts = 4
        expect(harness.virtualCounts.triage).toBe(3);
        expect(harness.virtualCounts.inbox).toBe(4);

        // === USER SESSION: Process Triage First ===

        // Step 1: Go to triage
        harness.switchChannel(fixtures.triageChannel);
        expect(harness.activeChannel.id).toBe('triage');

        // Step 2: Jump to first mention in #general, read it
        harness.switchChannel(generalChannel, { jumpTo: 'mention-1' });
        harness.markReadUpTo(generalChannel, mentionMsg);

        // Triage should now have 2 items (mention-2 and thread-reply-1)
        expect(harness.virtualCounts.triage).toBe(2);
        expect(harness.getBufferIds('triage')).not.toContain('mention-1');

        // Step 3: Jump to second mention in #random, read it
        harness.switchChannel(randomChannel, { jumpTo: 'mention-2' });
        harness.markReadUpTo(randomChannel, mentionMsg2);

        // Triage should now have 1 item (thread-reply-1)
        expect(harness.virtualCounts.triage).toBe(1);
        expect(harness.getBufferIds('triage')).toContain('thread-reply-1');

        // Step 4: Open the thread to read the reply
        const threadChannel = createThreadChannel('ongoing-discussion', generalChannel);
        harness.switchChannel(threadChannel);
        harness.dispatchMessage(threadChannel, threadReply);
        harness.jumpToBottom();
        harness.markReadUpTo(threadChannel, threadReply);

        // Triage should now be empty
        expect(harness.virtualCounts.triage).toBe(0);

        // === USER SESSION: Process Inbox ===

        // Step 5: Go to inbox
        harness.switchChannel(fixtures.inboxChannel);
        expect(harness.activeChannel.id).toBe('inbox');
        expect(harness.virtualCounts.inbox).toBe(4);

        // Step 6: Jump to #project-alpha, read to end
        harness.switchChannel(projectChannel);
        harness.jumpToBottom();
        harness.markReadUpTo(projectChannel, projectUpdate2);

        // Inbox should have 2 items left (alerts)
        expect(harness.virtualCounts.inbox).toBe(2);
        expect(harness.getBufferIds('inbox')).not.toContain('project-1');
        expect(harness.getBufferIds('inbox')).not.toContain('project-2');

        // Step 7: Jump to #alerts-prod, read to end
        harness.switchChannel(alertsChannel);
        harness.jumpToBottom();
        harness.markReadUpTo(alertsChannel, alertMsg2);

        // === FINAL STATE: Everything processed ===
        expect(harness.virtualCounts.triage).toBe(0);
        expect(harness.virtualCounts.inbox).toBe(0);
    });

    it('handles mixed message types arriving during session', () => {
        // Start with empty state
        harness.bootstrap({
            identity: me,
            service,
            channels: [generalChannel, projectChannel],
            participatedThreads: []
        });

        expect(harness.virtualCounts.triage).toBe(0);
        expect(harness.virtualCounts.inbox).toBe(0);

        // User is viewing #general
        harness.switchChannel(generalChannel);

        // A message arrives in starred #project-alpha while user is elsewhere
        const projectMsg = createMessage({
            id: 'live-project-1',
            author: alice,
            content: 'New feature merged!',
            sourceChannel: projectChannel,
            timestamp: new Date()
        });
        harness.dispatchMessage(projectChannel, projectMsg);

        // Should appear in inbox
        expect(harness.virtualCounts.inbox).toBe(1);

        // A mention arrives in #general (where user is)
        const mentionMsg = createMessage({
            id: 'live-mention-1',
            author: bob,
            content: `<@${me.id}> see above`,
            sourceChannel: generalChannel,
            timestamp: new Date(Date.now() + 1000)
        });
        harness.dispatchMessage(generalChannel, mentionMsg);

        // Should appear in triage
        expect(harness.virtualCounts.triage).toBe(1);

        // User reads current channel to end (clears mention)
        harness.jumpToBottom();
        harness.markReadUpTo(generalChannel, mentionMsg);

        // Triage cleared, inbox still has 1
        expect(harness.virtualCounts.triage).toBe(0);
        expect(harness.virtualCounts.inbox).toBe(1);

        // User goes to project channel
        harness.switchChannel(projectChannel);
        harness.jumpToBottom();
        harness.markReadUpTo(projectChannel, projectMsg);

        // All clear
        expect(harness.virtualCounts.triage).toBe(0);
        expect(harness.virtualCounts.inbox).toBe(0);
    });

    it('correctly handles thread that starts during session', () => {
        harness.bootstrap({
            identity: me,
            service,
            channels: [projectChannel],
            participatedThreads: []
        });

        // A new thread root arrives in starred channel
        const threadRoot = createMessage({
            id: 'new-thread-root',
            author: alice,
            content: 'Should we use Redis or Memcached?',
            sourceChannel: projectChannel,
            timestamp: new Date()
        });
        harness.dispatchMessage(projectChannel, threadRoot);

        // Goes to inbox (starred channel)
        expect(harness.virtualCounts.inbox).toBe(1);
        expect(harness.getBufferIds('inbox')).toContain('new-thread-root');

        // User opens the thread to participate
        harness.openThread(threadRoot);
        const threadChannel = harness.activeChannel;
        expect(threadChannel.isThread).toBe(true);

        // A reply arrives
        const reply = createMessage({
            id: 'thread-reply-new',
            author: bob,
            content: 'Redis for our use case',
            threadId: 'new-thread-root',
            sourceChannel: projectChannel,
            timestamp: new Date(Date.now() + 1000)
        });
        harness.dispatchMessage(threadChannel, reply);

        // User reads to end
        harness.jumpToBottom();
        harness.markReadUpTo(threadChannel, reply);

        // Go back
        harness.goBack();

        // Thread root should be purged from inbox
        expect(harness.virtualCounts.inbox).toBe(0);
        expect(harness.getBufferIds('inbox')).not.toContain('new-thread-root');
    });

    it('preserves unrelated items when processing specific channels', () => {
        harness.bootstrap({
            identity: me,
            service,
            channels: [generalChannel, projectChannel, alertsChannel],
            participatedThreads: ['old-thread']
        });

        // Mix of items in both triage and inbox
        const mention = createMessage({
            id: 'preserve-mention',
            author: alice,
            content: `<@${me.id}> question`,
            sourceChannel: generalChannel,
            timestamp: new Date()
        });

        const threadReply = createMessage({
            id: 'preserve-reply',
            author: bob,
            content: 'Thread update',
            threadId: 'old-thread',
            sourceChannel: generalChannel,
            timestamp: new Date(Date.now() + 1000)
        });

        const projectMsg = createMessage({
            id: 'preserve-project',
            author: charlie,
            content: 'Project news',
            sourceChannel: projectChannel,
            timestamp: new Date(Date.now() + 2000)
        });

        const alertMsg = createMessage({
            id: 'preserve-alert',
            author: alice,
            content: 'Alert!',
            sourceChannel: alertsChannel,
            timestamp: new Date(Date.now() + 3000)
        });

        harness.dispatchMessage(generalChannel, mention);
        harness.dispatchMessage(generalChannel, threadReply);
        harness.dispatchMessage(projectChannel, projectMsg);
        harness.dispatchMessage(alertsChannel, alertMsg);

        // Initial: 2 triage, 2 inbox
        expect(harness.virtualCounts.triage).toBe(2);
        expect(harness.virtualCounts.inbox).toBe(2);

        // Process ONLY #project-alpha
        harness.switchChannel(projectChannel);
        harness.jumpToBottom();
        harness.markReadUpTo(projectChannel, projectMsg);

        // Triage unchanged, inbox reduced by 1
        expect(harness.virtualCounts.triage).toBe(2);
        expect(harness.virtualCounts.inbox).toBe(1);
        expect(harness.getBufferIds('inbox')).toContain('preserve-alert');
        expect(harness.getBufferIds('inbox')).not.toContain('preserve-project');

        // Process ONLY the mention (not the thread reply)
        harness.switchChannel(generalChannel, { jumpTo: 'preserve-mention' });
        harness.markReadUpTo(generalChannel, mention);

        // Mention gone, thread reply still there
        expect(harness.virtualCounts.triage).toBe(1);
        expect(harness.getBufferIds('triage')).toContain('preserve-reply');
        expect(harness.getBufferIds('triage')).not.toContain('preserve-mention');
    });
});
