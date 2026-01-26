// src/lib/logic/BucketAnalyzer.ts
import { type Message, type ChannelIdentity, type UserIdentity, Bucket } from './types';
import { toMs } from '../utils/time';

export class BucketAnalyzer {
    
    static classify(
        msg: Message, 
        channel: ChannelIdentity, 
        me: UserIdentity | undefined, 
        myThreads: Set<string>,
        threadReadAt?: number // <--- NEW PARAMETER
    ): Bucket {

        // 0. SELF GUARD
        if (me && msg.author.id === me.id) {
            return Bucket.NOISE;
        }

        // 1. HISTORY GUARD (Dual-State Logic)
        const msgTime = msg.timestamp.getTime();
        
        if (msg.threadId) {
            // A. THREAD REPLY: Check Thread Cursor
            // If we have a specific read time for this thread, use it.
            // If not, we assume it's unread (0). 
            // We do NOT fall back to channel.lastReadAt because reading the main channel 
            // does not mean you opened the thread.
            const threshold = toMs(threadReadAt);
            
            // Allow 2s buffer for clock skew
            if (msgTime <= threshold + 2000) {
                return Bucket.NOISE;
            }
        } else {
            // B. ROOT MESSAGE: Check Channel Cursor
            if (channel.lastReadAt) {
                const threshold = toMs(channel.lastReadAt);
                if (msgTime <= threshold + 2000) {
                    return Bucket.NOISE;
                }
            }
        }

        // 2. EGO CHECK (Mention/DM)
        if (me) {
            const contentLower = msg.content.toLowerCase();
            const nameLower = me.name.toLowerCase();
            // Simple robust check
            if (contentLower.includes(`@${nameLower}`) || (me.id && msg.content.includes(me.id))) {
                return Bucket.EGO;
            }
        }

        // 3. CONTEXT CHECK (My Threads)
        if (msg.threadId && myThreads.has(msg.threadId)) {
            return Bucket.CONTEXT;
        }

        // 4. DIRECT DM -> TRIAGE
        if (channel.category === 'direct') {
            return Bucket.EGO;
        }
        
        // 5. GROUP DM -> SIGNAL (Inbox)
        if (channel.category === 'group') {
            return Bucket.SIGNAL;
        }

        // 6. SIGNAL CHECK (Starred)
        if (channel.starred) {
            // If it's a thread reply I'm NOT in, strictly it's Noise, 
            // UNLESS I explicitly follow the thread (handled by myThreads above).
            // But if it's a root message in a starred channel, it's Signal.
            if (msg.threadId) {
                return Bucket.NOISE;
            }
            return Bucket.SIGNAL;
        }

        // 7. NOISE
        return Bucket.NOISE;
    }
}
