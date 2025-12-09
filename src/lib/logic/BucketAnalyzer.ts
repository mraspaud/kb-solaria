import { type Message, type ChannelIdentity, type UserIdentity, Bucket } from './types';

export class BucketAnalyzer {
    
    static classify(
        msg: Message, 
        channel: ChannelIdentity, 
        me: UserIdentity | undefined, 
        myThreads: Set<string>
    ): Bucket {

        // --- 0. HISTORY GUARD (The Fix) ---
        // If the channel has a known "Last Read" time, and this message is OLDER than that,
        // it is history. We treat it as NOISE (archived), never EGO or SIGNAL.
        if (channel.lastReadAt) {
            // Convert to ms for comparison (msg.timestamp is Date)
            const msgTime = msg.timestamp.getTime();
            const readTime = channel.lastReadAt * 1000;
            
            // Allow a small 2s buffer for clock skew/network lag
            if (msgTime <= readTime + 2000) {
                return Bucket.NOISE;
            }
        }

        // 1. EGO CHECK (Case-Insensitive)
        if (me) {
            const contentLower = msg.content.toLowerCase();
            const nameLower = me.name.toLowerCase();
            const idMatch = me.id ? msg.content.includes(me.id) : false; // IDs are usually case-sensitive
            
            // Check for @Name or direct ID
            if (contentLower.includes(`@${nameLower}`) || idMatch) {
                return Bucket.EGO;
            }
        }

        // 2. CONTEXT CHECK
        if (msg.threadId && myThreads.has(msg.threadId)) {
            return Bucket.CONTEXT;
        }

        // 3. SIGNAL CHECK
        if ((channel as any).starred) {
            return Bucket.SIGNAL;
        }

        // 4. NOISE
        return Bucket.NOISE;
    }
}
