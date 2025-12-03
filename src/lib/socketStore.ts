import { writable, get } from 'svelte/store'; // <--- Added 'get' here
import { chatStore } from './stores/chat';
import type { ChannelIdentity, Message } from './logic/types';

export const status = writable<'connected' | 'disconnected' | 'error'>('disconnected');

let socket: WebSocket | null = null;

export function connect() {
    socket = new WebSocket('ws://127.0.0.1:8000/ws');

    socket.onopen = () => {
        status.set('connected');
        // Initial system message
        const sysIdentity: ChannelIdentity = { 
            id: 'general', name: 'general', service: { id: 'sys', name: 'System'} 
        };
        
        chatStore.dispatchMessage(sysIdentity, {
            id: 'sys-1',
            author: 'System',
            content: 'Connected to backend.',
            timestamp: new Date()
        });
    };

    socket.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);
            
            if (payload.event === 'message') {
                const msgData = payload.message;
                const serviceData = payload.service || { name: 'Unknown', id: 'unknown' };
                
                // Construct the Identity Object
                const channelIdentity: ChannelIdentity = {
                    id: payload.channel_id || 'general',
                    name: payload.channel_name || payload.channel_id || 'general',
                    service: {
                        id: serviceData.id,
                        name: serviceData.name
                    }
                };

                const msg: Message = {
                    id: msgData.id,
                    author: msgData.author?.display_name || 'Unknown',
                    content: msgData.body,
                    timestamp: new Date(msgData.timestamp)
                };

                chatStore.dispatchMessage(channelIdentity, msg);
            }
        } catch (e) {
            console.error("Parse error", e);
        }
    };

    socket.onclose = () => status.set('disconnected');
    socket.onerror = () => status.set('error');
}

export function sendMessage(text: string) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        // Send raw text to backend
        // Note: You might want to wrap this in JSON later to include channel ID
        socket.send(text);
        
        const state = get(chatStore);
        const currentId = state.activeChannelId;
        const currentMeta = state.availableChannels.find(c => c.id === currentId);

        // Fallback if we somehow send before connected
        const identity = currentMeta || { 
            id: 'general', name: 'general', service: { id: 'sys', name: 'System'} 
        };

        chatStore.dispatchMessage(identity, {
            id: crypto.randomUUID(),
            author: 'Me',
            content: text,
            timestamp: new Date()
        });
    }
}
