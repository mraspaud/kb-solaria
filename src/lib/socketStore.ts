import { writable, get } from 'svelte/store';
import { chatStore } from './stores/chat';
import type { ChannelIdentity, Message, ServiceIdentity } from './logic/types'; // Ensure ServiceIdentity is imported

export const status = writable<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let lastSyncedChannelId: string | null = null; // Track this to avoid duplicate sends

// Helper to log debug events
function logToSystem(payload: any) {
    const systemIdentity: ChannelIdentity = { 
        id: 'system', name: 'system', service: { id: 'internal', name: 'Solaria' } 
    };

    // Format the payload as a nice JSON code block
    const content = "```json\n" + JSON.stringify(payload, null, 2) + "\n```";
    
    chatStore.dispatchMessage(systemIdentity, {
        id: crypto.randomUUID(),
        author: 'Logger',
        content: content,
        timestamp: new Date()
    });
}

export function sendChannelSwitch(channel: ChannelIdentity) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    // Don't send updates for internal system channels
    if (channel.service.id === 'internal') return;

    let payload: any;

    // CHECK: Is this a thread?
    // We check for the flag AND the existence of the threadId/parentChannel
    if (channel.isThread && channel.threadId && channel.parentChannel) {
        
        payload = {
            command: "fetch_thread",
            service_id: channel.service.id,
            
            // For a thread, the 'channel_id' context is usually the Parent Channel
            channel_id: channel.parentChannel.id,
            
            // The specific message we are threading on
            thread_id: channel.threadId
        };

    } else {
        // Default: Regular Channel Switch
        payload = {
            command: "switch_channel",
            service_id: channel.service.id,
            channel_id: channel.id
        };
    }
    socket.send(JSON.stringify(payload));
    lastSyncedChannelId = channel.id; // Mark as synced
}

// --- AUTOMATIC SYNC SUBSCRIPTION ---
// This watches the chatStore. Whenever the user moves, we tell the backend.
chatStore.subscribe(state => {
    const current = state.activeChannel;

    // 1. Basic Validation
    if (!current || !socket || socket.readyState !== WebSocket.OPEN) return;

    // 2. Don't spam the server if we haven't actually moved
    if (current.id === lastSyncedChannelId) return;

    // 3. Send the command
    sendChannelSwitch(current);
});



export function connect() {
    if (socket?.readyState === WebSocket.CONNECTING || socket?.readyState === WebSocket.OPEN) return;

    status.set('connecting');
    logToSystem("connecting");
    clearTimeout(reconnectTimer);

    socket = new WebSocket('ws://127.0.0.1:8000/ws');

    socket.onopen = () => {
        status.set('connected');
        logToSystem("connected");

        // If we reconnect, the server lost our state. Force an update.
        const current = get(chatStore).activeChannel;
        if (current && current.id !== 'system') {
            sendChannelSwitch(current);
        }
    };

    socket.onmessage = (event) => {
        try {
            
            logToSystem("received");
            const payload = JSON.parse(event.data);
            
            logToSystem(payload["event"]);
            // ----------------------

            // 1. HANDLE CHANNEL LIST
            if (payload.event === 'channel_list') {
                const service = payload.service || { name: 'Unknown', id: 'unknown' };
                
                // Ensure channels is an array
                const rawChannels = Array.isArray(payload.channels) ? payload.channels : [];
                
                const channels: ChannelIdentity[] = rawChannels.map((c: any) => ({
                    id: c.id,
                    name: c.name || c.id,
                    service: { id: service.id, name: service.name },
                }));
                
                chatStore.upsertChannels(channels);
                
                const currentState = get(chatStore);
            }

            // 2. INCOMING MESSAGE
            else if (payload.event === 'message') {
                const msgData = payload.message;
                const serviceData = payload.service || { name: 'Unknown', id: 'unknown' };
                const threadId = payload.thread_id || msgData.thread_id;
                
                let targetId = payload.channel_id || 'general';
                let isThread = false;
                
                if (threadId) {
                    targetId = `thread_${threadId}`;
                    isThread = true;
                }

                const channelIdentity: ChannelIdentity = {
                    id: targetId,
                    name: payload.channel_name || payload.channel_id,
                    service: { id: serviceData.id, name: serviceData.name },
                    isThread: isThread
                };
                let reply_count = 0;
                if (msgData.replies !== undefined) {
                    reply_count = msgData.replies.count;
                }
                chatStore.dispatchMessage(channelIdentity, {
                    id: msgData.id,
                    author: msgData.author?.display_name || 'Unknown',
                    content: msgData.body,
                    timestamp: new Date(msgData.timestamp),
                    replyCount: reply_count
                });
            }
            
            // 3. UPDATES & DELETES
            else if (payload.event === 'message_update') {
                chatStore.updateMessage(payload.message.id, payload.message.body);
            }
            else if (payload.event === 'message_delete') {
                chatStore.removeMessage(payload.message_id);
            }

        } catch (e) {
            console.error("Parse error", e);
            // Optional: Log parse errors to system too
            logToSystem({ error: "Parse Failed", raw: event.data });
        }
    };

    socket.onclose = () => {
        status.set('disconnected');
        socket = null;
        reconnectTimer = setTimeout(connect, 3000);
    };

    socket.onerror = () => {
        status.set('error');
        if (socket) socket.close();
    };
}

// --- OUTGOING COMMANDS (Unchanged) ---
export function sendMessage(text: string) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const state = get(chatStore);
        const meta = state.activeChannel;
        
        let payload: any = {};

        if (meta.id.startsWith('thread_')) {
            payload = {
                command: "post_reply",
                service: meta?.service,
                channel: meta?.parentChannel,
                thread_id: meta?.threadId,
                body: text
            };
        } else {
            payload = {
                command: "post_message",
                service_id: meta?.service.id || 'unknown',
                channel_id: meta?.id || 'general',
                body: text
            };
        }

        socket.send(JSON.stringify(payload));
    }
}

export function sendUpdate(id: string, newText: string) {
    const state = get(chatStore);
    const meta = state.activeChannel;
    
    const payload = {
        command: "message_update",
        channel: meta,
        message_id: id,
        message: { body: newText }
    };
    socket?.send(JSON.stringify(payload));
    
    chatStore.updateMessage(id, newText);
}

export function sendDelete(id: string) {
    const state = get(chatStore);
    const meta = state.activeChannel;

    const payload = {
        command: "message_delete",
        channel: meta,
        message_id: id
    };
    socket?.send(JSON.stringify(payload));
    
    chatStore.removeMessage(id);
}

export function fetchThread(channel: ChannelIdentity, threadId: string, service: ServiceIdentity) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
            command: "fetch_thread",
            service: service,
            channel: channel,
            thread_id: threadId
        };
        socket.send(JSON.stringify(payload));
    }
}
