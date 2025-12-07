export interface ServiceIdentity {
    id: string;
    name: string;
}

export interface UserIdentity {
    id: string;
    name: string;
    color?: string; // Backend provides this for authors
    serviceId?: string;
}

export interface ChannelIdentity {
    id: string;
    name: string;
    service: ServiceIdentity;
    isThread?: boolean;
    parentChannel?: ChannelIdentity;
    threadId?: string;
    parentMessage?: Message;
    lastReadAt?: number;
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
}

export interface UnreadState {
    count: number;
    hasMention: boolean;
}
