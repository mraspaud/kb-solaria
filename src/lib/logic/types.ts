export interface ServiceIdentity {
    id: string;
    name: string;
}

export interface UserIdentity {
    id: string;
    name: string;
    color?: string;
    serviceId?: string;
    channelPrefix?: string;
}

export type ChannelCategory = 'channel' | 'direct' | 'group';

export interface ChannelIdentity {
    id: string;
    name: string;
    service: ServiceIdentity;
    isThread?: boolean;
    parentChannel?: ChannelIdentity;
    threadId?: string;
    parentMessage?: Message;
    lastReadAt?: number;
    lastPostAt?: number;
    mass?: number;
    starred?: boolean;
    category?: ChannelCategory;
}

export interface Attachment {
    id: string;
    name: string;
    path: string;
    size?: number;
}

export interface Message {
    id: string;
    author: UserIdentity;
    content: string;
    timestamp: Date;
    reactions: Record<string, string[]>; 
    replyCount?: number;
    attachments?: Attachment[];
    bucket?: Bucket; 
    threadId?: string;
    sourceChannel?: ChannelIdentity;
}

export interface UnreadState {
    count: number;
    hasMention: boolean;
}

export enum Bucket {
    EGO = 'EGO',       // Direct DM, Mention
    CONTEXT = 'CONTEXT', // Thread reply where I participated
    SIGNAL = 'SIGNAL',   // Starred channel, passive monitor
    NOISE = 'NOISE'      // The rest
}
