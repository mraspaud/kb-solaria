export interface ServiceIdentity {
    id: string;
    name: string;
}

export interface ChannelIdentity {
    id: string;
    name: string;
    service: ServiceIdentity;
}

export interface Message {
    id: string;
    author: string;
    content: string;
    timestamp: Date;
}
