export interface ServiceIdentity {
    id: string;
    name: string;
}

export interface ChannelIdentity {
    id: string;
    name: string;
    service: ServiceIdentity;
    isThread?: boolean;
    parentChannel?: ChannelIdentity;
    threadId?: string; // The ID of the parent message
    parentMessage?: Message;
}

export interface Message {
    id: string;
    author: string;
    content: string;
    timestamp: Date;
    reactions?: Any[];
    replyCount?: number;
}
