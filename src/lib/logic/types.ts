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
    clientId?: string;
    status?: 'pending' | 'sent' | 'failed';
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

export interface NormalizedState {
    entities: {
        messages: Map<string, Message>;
    };

    buffers: Map<string, string[]>;
}

export interface ChatState extends NormalizedState {
    activeChannel: ChannelIdentity;
    availableChannels: ChannelIdentity[];
    // DEPRECATED: We are moving to 'entities.messages' and 'buffers'
    messages: Message[]; 
    cursorIndex: number;
    isAttached: boolean;
    unread: Record<string, UnreadState>;
    identities: Record<string, UserIdentity>;
    currentUser: UserIdentity | null;
    users: Map<string, UserIdentity>;
    participatedThreads: Set<string>;
    virtualCounts: { triage: number; inbox: number; };
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
