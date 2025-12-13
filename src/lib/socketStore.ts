// src/lib/socketStore.ts
import { get } from 'svelte/store';
import { chatStore } from './stores/chat';
import { NetworkService } from './logic/NetworkService';
import type { ChannelIdentity, UserIdentity, ServiceIdentity } from './logic/types';

// 1. INITIALIZE SERVICE
const NETWORK_URL = 'ws://127.0.0.1:4722/ws';
const service = new NetworkService(NETWORK_URL);

// 2. EXPORT STATUS (Linked to Service)
export const status = service.status;

// 3. INTERNAL STATE
let lastSyncedChannelId: string | null = null;

const loggerUser = { 
    id: 'system-logger', 
    name: 'Logger', 
    color: '#727169' 
};

// --- HELPERS ---

function logToSystem(payload: any) {
    const systemIdentity: ChannelIdentity = { 
        id: 'system', name: 'system', service: { id: 'internal', name: 'Solaria' } 
    };
    const content = "```json\n" + JSON.stringify(payload, null, 2) + "\n```";
    chatStore.dispatchMessage(systemIdentity, {
        id: crypto.randomUUID(),
        author: loggerUser,
        content: content,
        timestamp: new Date()
    });
}

// --- EVENT HANDLING (Business Logic) ---

// A. Lifecycle & Reconnection Logic
status.subscribe(s => {
    if (s === 'connected') {
        logToSystem("connected");
        // If we reconnect, the server lost our state. Force an update.
        const current = get(chatStore).activeChannel;
        if (current && current.id !== 'system') {
            sendChannelSwitch(current);
        }
    } else if (s === 'connecting') {
        logToSystem("connecting");
    }
});

// B. Inbound Message Routing
service.onEvent((payload) => {
    // logToSystem(payload["event"]); // Optional: verbose logging

    try {
        // 1. HANDSHAKE / IDENTITY
        if (payload.event === 'self_info') {
            const serviceId = payload.service?.id || 'unknown';
            const identity: UserIdentity = {
                ...payload.user,
                channelPrefix: payload.channel_prefix || '#' 
            };
            chatStore.setIdentity(serviceId, identity);
            logToSystem(`Identity established for ${serviceId}: ${payload.user.name}`);
        }

        // 2. CHANNEL LIST & HYDRATION
        else if (payload.event === 'channel_list') {
            const service = payload.service || { name: 'Unknown', id: 'unknown' };
            const rawChannels = Array.isArray(payload.channels) ? payload.channels : [];
            
            const channels: ChannelIdentity[] = [];
            const hydrationQueue: ChannelIdentity[] = [];

            rawChannels.forEach((c: any) => {
                const identity: ChannelIdentity = {
                    id: c.id,
                    name: c.name || c.id,
                    service: { id: service.id, name: service.name },
                    lastReadAt: c.last_read_at,
                    lastPostAt: c.last_post_at,
                    mass: c.mass !== undefined ? c.mass : 0,
                    starred: c.starred,
                    category: c.category
                };
                
                channels.push(identity);

                // Ingest Unread State
                if (c.unread || c.mentions > 0) {
                    chatStore.updateUnreadState(c.id, c.unread ? 1 : 0, c.mentions > 0);
                }

                // Hydration Candidates (Morning Paper)
                const isEgo = c.mentions > 0;
                const isSignal = c.starred && c.unread; 
                if (isEgo || isSignal) {
                    hydrationQueue.push(identity);
                }
            });

            chatStore.upsertChannels(channels);

            // Execute Hydration (Throttled)
            hydrationQueue.forEach((chan, i) => {
                setTimeout(() => {
                    console.log(`[Hydration] Fetching #${chan.name}`);
                    fetchHistory(chan);
                }, i * 200);
            });
        }

        // 3. USER LIST
        else if (payload.event === 'user_list') {
            const serviceId = payload.service?.id || 'unknown';
            const rawUsers = payload.users || [];
            
            const users: UserIdentity[] = rawUsers.map((u: any) => ({
                ...u,
                serviceId: serviceId
            }));
            chatStore.upsertUsers(users);
        }

        // 4. INCOMING MESSAGES
        else if (payload.event === 'message') {
            const msgData = payload.message;

            // CHECK: Is this an echo of my own message?
            // We check if we have a matching 'client_id' OR if we have the 'id' already
            if (msgData.clientId) {
                // Perfect Scenario: Server echoed our ID
                chatStore.handleAck(msgData.clientId, msgData.id, msgData.body);
                return; // Stop processing, we just swapped it.
            }
            
            // ... (rest of existing message dispatch logic) ...

            const serviceData = payload.service || { name: 'Unknown', id: 'unknown' };
            const threadId = payload.thread_id || msgData.thread_id;
            
            // 1. Capture the Parent ID before we overwrite targetId
            const parentChannelId = payload.channel_id || 'general';
            
            let targetId = parentChannelId;
            let isThread = false;

            // 2. Resolve Parent Channel Identity
            const state = get(chatStore);
            const knownParent = state.availableChannels.find(c => c.id === parentChannelId);
            
            // Fallback object if parent isn't in store yet
            const parentIdentity: ChannelIdentity = knownParent || {
                id: parentChannelId,
                name: payload.channel_name || parentChannelId,
                service: { id: serviceData.id, name: serviceData.name }
            };

            // 3. Handle Thread Routing
            if (threadId) {
                targetId = `thread_${threadId}`;
                isThread = true;
            }

            // 4. Construct the Final Identity
            const channelIdentity: ChannelIdentity = {
                id: targetId,
                name: isThread ? 'Thread' : parentIdentity.name,
                service: { id: serviceData.id, name: serviceData.name },
                isThread: isThread,
                starred: knownParent?.starred, 
                mass: knownParent?.mass,
                lastReadAt: knownParent?.lastReadAt,
                category: knownParent?.category,
                threadId: isThread ? threadId : undefined,
                parentChannel: isThread ? parentIdentity : undefined
            };

            chatStore.dispatchMessage(channelIdentity, {
                id: msgData.id,
                author: {
                    id: msgData.author?.id || 'unknown',
                    name: msgData.author?.display_name || 'Unknown',
                    color: msgData.author?.color
                },
                content: msgData.body,
                timestamp: new Date(msgData.timestamp),
                replyCount: msgData.replies?.count || 0,
                reactions: msgData.reactions || {},
                attachments: msgData.attachments || [] 
            });
        }
        
        // 5. UPDATES / DELETES
        else if (payload.event === 'message_update') {
            chatStore.updateMessage(payload.message.id, payload.message.body);
        }
        else if (payload.event === 'message_delete') {
            chatStore.removeMessage(payload.message_id);
        }
        else if (payload.event === 'message_ack') {
             chatStore.handleAck(payload.client_id, payload.real_id, payload.text);
        }
        // 6. THREAD SUBSCRIPTIONS
        else if (payload.event === 'thread_subscription_list') {
             const threadData = payload.thread_ids || []; 
             
             // 1. Register Participation (for Context Bucket)
             const idsOnly = threadData.map((t: any) => t.id);
             chatStore.hydrateParticipatedThreads(idsOnly);
             
             // 2. Fetch Unread Threads
             let fetchCount = 0;
             threadData.forEach((t: any) => {
                 // Check the flag we just fixed in the backend
                 if (t.unread && t.channel_id) {
                     const dummyChannel = { 
                         id: t.channel_id, 
                         name: 'unknown', 
                         service: { id: payload.service.id, name: '' } 
                     };
                     
                     console.log(`[Hydration] Fetching unread thread ${t.id} in ${t.channel_id}`);
                     fetchThread(dummyChannel, t.id, payload.service);
                     fetchCount++;
                 }
             });
        }


    } catch (e) {
        console.error("Socket Logic Error", e);
        logToSystem({ error: "Logic Failed", raw: payload });
    }
});


// --- EXPORTED ACTIONS (Controller) ---

export function connect() {
    service.connect();
}

export function sendChannelSwitch(channel: ChannelIdentity) {
    if (channel.service.id === 'internal') return;
    
    // Determine 'After' ID for sync
    const lastId = chatStore.getLastMessageId(channel);

    let payload: any;

    if (channel.isThread && channel.threadId && channel.parentChannel) {
        payload = {
            command: "fetch_thread",
            service_id: channel.service.id,
            channel_id: channel.parentChannel.id,
            thread_id: channel.threadId,
            after: lastId 
        };
    } else {
        payload = {
            command: "switch_channel",
            service_id: channel.service.id,
            channel_id: channel.id, 
            after: lastId 
        };
    }
    
    service.send(payload);
    lastSyncedChannelId = channel.id;
}

// Watch store for auto-switch
chatStore.subscribe(state => {
    const current = state.activeChannel;
    const connectionStatus = get(status); // Correctly get value from store

    // 1. Basic Validation
    if (!current || connectionStatus !== 'connected') return;

    // 2. Don't spam the server if we haven't actually moved
    if (current.id === lastSyncedChannelId) return;

    // 3. Send the command
    sendChannelSwitch(current);
});


export function fetchHistory(channel: ChannelIdentity) {
    service.send({
        command: "switch_channel",
        service_id: channel.service.id,
        channel_id: channel.id
    });
}

export function sendOpenPath(path: string) {
    service.send({
        command: "open_path",
        service_id: "internal", 
        path: path
    });
}

export function sendSaveToDownloads(path: string) {
    service.send({
        command: "save_to_downloads",
        service_id: "internal",
        path: path
    });
}

export function sendMessage(text: string) {
    const state = get(chatStore);
    const meta = state.activeChannel;
    
    // 1. Generate Nonce
    const tempId = crypto.randomUUID(); 
    const now = new Date();

    // 2. Optimistic Dispatch (Immediate UI update)
    chatStore.dispatchMessage(meta, {
        id: tempId,
        clientId: tempId,
        author: state.currentUser!, // Assert we have a user
        content: text,
        timestamp: now,
        status: 'pending',
        reactions: {}
    });

    // 3. Construct Payload
    let payload: any = {
        client_id: tempId, // <--- The Key
        body: text,
        service_id: meta.service.id,
    };

    if (meta.id.startsWith('thread_')) {
        payload.command = "post_reply";
        payload.channel_id = meta.parentChannel?.id;
        payload.thread_id = meta.threadId;
    } else {
        payload.command = "post_message";
        payload.channel_id = meta.id;
    }

    service.send(payload);
}

export function sendUpdate(id: string, newText: string) {
    const state = get(chatStore);
    const meta = state.activeChannel;
    
    const realChannelId = meta.id.startsWith('thread_') 
        ? meta.parentChannel?.id 
        : meta.id;

    if (!realChannelId) return;

    service.send({
        command: "message_update",
        service_id: meta.service.id,
        channel_id: realChannelId,
        message_id: id,
        body: newText
    });
    
    // Optimistic Update
    chatStore.updateMessage(id, newText);
}

export function sendDelete(id: string) {
    const state = get(chatStore);
    const meta = state.activeChannel;
    
    const realChannelId = meta.id.startsWith('thread_') 
        ? meta.parentChannel?.id 
        : meta.id;

    if (!realChannelId) return;

    service.send({
        command: "message_delete",
        service_id: meta.service.id,
        channel_id: realChannelId,
        message_id: id
    });
    
    // Optimistic Update
    chatStore.removeMessage(id);
}

export function fetchThread(channel: ChannelIdentity, threadId: string, serviceId: ServiceIdentity) {
    service.send({
        command: "fetch_thread",
        service_id: serviceId.id,
        channel_id: channel.id,
        thread_id: threadId
    });
}

export function sendReaction(msgId: string, emoji: string, action: 'add' | 'remove' = 'add') {
    const state = get(chatStore);
    const meta = state.activeChannel;
    const me = state.currentUser;

    if (!me) return;

    service.send({
        command: "react",
        service_id: meta.service.id,
        channel_id: meta.id.startsWith('thread_') ? meta.parentChannel?.id : meta.id,
        message_id: msgId,
        reaction: emoji,
        action: action
    });
    
    // OPTIMISTIC UPDATE
    chatStore.handleReaction(meta.id, msgId, emoji, me.id, action);
}

export function sendMarkRead(channelId: string, messageId: string, serviceId: string) {
    if (channelId === 'system' || serviceId === 'internal') return;
    service.send({
        command: "mark_read",
        service_id: serviceId,
        channel_id: channelId,
        message_id: messageId
    });
}

export function sendTyping(channelId: string, serviceId: string) {
    service.send({
        command: "typing",
        service_id: serviceId,
        channel_id: channelId
    });
}


