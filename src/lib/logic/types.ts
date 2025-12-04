export interface ServiceIdentity {
    id: string;
    name: string;
}

export interface UserIdentity {
    id: string;
    name: string;
    color?: string; // Backend provides this for authors
}

export interface ChannelIdentity {
    id: string;
    name: string;
    service: ServiceIdentity;
    isThread?: boolean;
    parentChannel?: ChannelIdentity;
    threadId?: string;
    parentMessage?: Message;
}

export interface Message {
    id: string;
    author: UserIdentity;
    content: string;
    timestamp: Date;
    reactions: Record<string, string[]>; 
    replyCount?: number;
}

export interface UnreadState {
    count: number;
    hasMention: boolean;
}
