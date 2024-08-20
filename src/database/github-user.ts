import { Table } from "../sqlite";
import { UserEntity } from "./user";

@Table('github_users', `
    id INTEGER PRIMARY KEY,
    login TEXT,
    avatar_url TEXT
`)
export class GitHubUser {
    id: number;
    login: string;
    avatar_url: string;

    public constructor() {
        this.id = 0;
        this.login = '';
        this.avatar_url = '';
    }

    public static create(id: number, login: string, avatar_url: string): GitHubUser {
        const user = new GitHubUser();
        user.id = id;
        user.login = login;
        user.avatar_url = avatar_url;
        return user;
    }

    public toUserEntity(): UserEntity {
        const user = new UserEntity();
        user.id = this.id;
        user.username = this.login;
        user.photo = this.avatar_url;
        return user;
    }
}
