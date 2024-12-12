import { Router } from 'express';
export interface UserProfile {
    handle: string;
    name: string;
    created: number;
    password: string;
    admin: boolean;
    enabled: boolean;
    salt: string;
}
export interface UserDirectories {
    extensions: string;
}
export interface User {
    profile: UserProfile;
    directories: UserDirectories;
}
// Extend the Express Request type
declare module 'express' {
    interface Request {
        user?: User;
    }
}
export interface PluginInfo {
    id: string;
    name: string;
    description: string;
}
export interface Plugin {
    init: (router: Router) => Promise<void>;
    exit: () => Promise<void>;
    info: PluginInfo;
}
